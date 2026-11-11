import logging
from typing import Dict, Any
from app.config import settings
try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

logger = logging.getLogger(__name__)


class SecurityCopilot:
    def __init__(self):
        self.api_key = settings.AI_API_KEY
        self.provider = settings.AI_PROVIDER.lower()
        if self.provider == "gemini" and self.api_key and genai:
            self.client = genai.Client(api_key=self.api_key)
        else:
            self.client = None
            logger.warning("Vesper has no AI_API_KEY (or the Gemini SDK is missing): answering from scan facts only.")

    @staticmethod
    def _models() -> list[str]:
        """The configured model first, then fallbacks; each is tried once."""
        return list(dict.fromkeys([settings.AI_MODEL, 'gemini-flash-latest', 'gemini-flash-lite-latest']))

    def _generate(self, prompt: str, temperature: float, what: str) -> str | None:
        """One-shot answer from the first model that works, or None when all fail."""
        for model in self._models():
            try:
                return self.client.models.generate_content(
                    model=model, contents=prompt, config=types.GenerateContentConfig(temperature=temperature)).text
            except Exception as e:
                logger.warning(f"{what} failed with {model}: {e}")
        logger.error(f"All Gemini models failed for {what}")
        return None

    def explain_finding(self, finding: Dict[str, Any]) -> str:
        if not self.client:
            return self._offline(finding)

        prompt = f"""
        You are an elite Cloud Security Engineer.
        Analyze this cloud security finding and explain the risk to a non-technical manager in 2-3 short paragraphs.
        
        Finding Title: {finding.get('title')}
        Rule ID: {finding.get('rule_id')}
        Severity: {finding.get('severity')}
        Resource: {finding.get('resource_id')}
        Region: {finding.get('region')}
        Scanner description: {finding.get('description')}
        Scanner recommendation: {finding.get('recommendation')}

        Only use the facts above; do not invent resource names, account ids or data contents.
        Provide the response in Markdown format with headers like '### The Risk'.
        """
        return self._generate(prompt, 0.3, "explain") or self._offline(finding)

    @staticmethod
    def _offline(finding: Dict[str, Any]) -> str:
        return ("> AI Copilot offline (no AI_API_KEY or model error) — showing scanner output.\n\n"
                f"### The Risk\n{finding.get('description') or 'n/a'}\n\n"
                f"### How to fix it\n{finding.get('recommendation') or 'n/a'}")

    def generate_remediation_script(self, finding: Dict[str, Any], format: str = "cli") -> str:
        if not self.client:
            return f"```bash\n{finding.get('remediation_cmd') or '# No stored remediation command for this rule'}\n```"

        prompt = f"""
        You are an elite Cloud Security Engineer.
        Generate the exact {'Terraform' if format == 'terraform' else 'AWS CLI'} code needed to fix this security finding.
        
        Finding Title: {finding.get('title')}
        Rule ID: {finding.get('rule_id')}
        Resource: {finding.get('resource_id')}
        
        Only return the code block, no other conversational text.
        """
        return (self._generate(prompt, 0.1, "remediation script")
                or f"```bash\n{finding.get('remediation_cmd') or '# No stored remediation command for this rule'}\n```")


    # ─── Vesper: streaming, grounded chat ─────────────────────────────────────
    VESPER_PROMPT = """You are Vesper, the assistant inside Breachpath Cloud Recon, a cloud security tool for AWS.
Voice: calm, plain-spoken and specific, like a senior engineer who is on the reader's side. No hype,
no filler, no apologies. Short Markdown: a direct answer first, then detail only if it helps.

Rules:
- Use ONLY the account data below. If it doesn't contain the answer, say so plainly.
- Never invent resource names, account ids, counts or findings.
- Whenever you mention a finding, cite its rule id in square brackets, e.g. [RDS-001].
- You cannot change AWS. To fix something, the reader opens the finding and requests the fix, which a
  second person approves. Say so when a fix comes up; give CLI / Terraform only as a reference.

=== ACCOUNT DATA (latest completed scan) ===
{context}

=== CONVERSATION SO FAR ===
{convo}

USER: {question}
VESPER:"""

    def chat_stream(self, question: str, history: list, context: str, fallback: str):
        """Yields {"ai": bool} once, then {"delta": text} pieces. Falls back to the factual summary when
        AI is off or every model fails before producing anything."""
        convo = "\n".join(f"{m.get('role', 'user').upper()}: {m.get('text', '')[:2000]}" for m in history[-8:])
        if self.client:
            prompt = self.VESPER_PROMPT.format(context=context, convo=convo or "(none)", question=question)
            for model in self._models():
                sent = False
                try:
                    stream = self.client.models.generate_content_stream(
                        model=model, contents=prompt, config=types.GenerateContentConfig(temperature=0.2))
                    for chunk in stream:
                        text = getattr(chunk, "text", None)
                        if not text:
                            continue
                        if not sent:
                            yield {"ai": True}
                            sent = True
                        yield {"delta": text}
                    if sent:
                        return
                except Exception as e:
                    logger.warning(f"Vesper stream failed with {model}: {e}")
                    if sent:   # already streaming: say it stopped rather than switching model mid-answer
                        yield {"delta": "\n\n_The answer was cut off by a model error. Ask again to retry._"}
                        return
        yield {"ai": False}
        words = fallback.split(" ")
        for i in range(0, len(words), 4):
            yield {"delta": " ".join(words[i:i + 4]) + (" " if i + 4 < len(words) else "")}


copilot_engine = SecurityCopilot()
