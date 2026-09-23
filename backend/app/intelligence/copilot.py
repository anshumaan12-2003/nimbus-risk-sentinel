import logging
from typing import Dict, Any, Optional
from app.config import settings
try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

logger = logging.getLogger(__name__)

# Fallback mock responses if API is not configured or fails
MOCK_EXPLANATION = """
### What is the risk?
This misconfiguration means that your resource is publicly accessible from the internet. Attackers can exploit this to extract sensitive data or hijack the resource.

### How to fix it?
You should restrict the access control list (ACL) or security group to only allow traffic from trusted IP addresses or internal VPC networks.
"""

MOCK_REMEDIATION = """
```bash
# AWS CLI Remediation
aws ec2 revoke-security-group-ingress \\
    --group-id sg-1234567890 \\
    --protocol tcp \\
    --port 22 \\
    --cidr 0.0.0.0/0
```
"""


class SecurityCopilot:
    def __init__(self):
        self.api_key = settings.AI_API_KEY
        self.provider = settings.AI_PROVIDER.lower()
        if self.provider == "gemini" and self.api_key and genai:
            self.client = genai.Client(api_key=self.api_key)
        else:
            self.client = None
            logger.warning("AI Copilot is not fully configured. Using mock responses.")

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
        MODELS = list(dict.fromkeys([settings.AI_MODEL, 'gemini-flash-latest', 'gemini-flash-lite-latest']))
        for model_candidate in MODELS:
            try:
                response = self.client.models.generate_content(
                    model=model_candidate,
                    contents=prompt,
                    config=types.GenerateContentConfig(temperature=0.3)
                )
                return response.text
            except Exception as model_err:
                logger.warning(f"Failed with {model_candidate}: {model_err}")
        logger.error("All Gemini models failed, returning mock explanation")
        return self._offline(finding)

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
        MODELS = list(dict.fromkeys([settings.AI_MODEL, 'gemini-flash-latest', 'gemini-flash-lite-latest']))
        for model_candidate in MODELS:
            try:
                response = self.client.models.generate_content(
                    model=model_candidate,
                    contents=prompt,
                    config=types.GenerateContentConfig(temperature=0.1)
                )
                return response.text
            except Exception as model_err:
                logger.warning(f"Failed with {model_candidate}: {model_err}")
        logger.error("All Gemini models failed, returning stored scanner command")
        return f"```bash\n{finding.get('remediation_cmd') or '# No stored remediation command for this rule'}\n```"


    def chat(self, question: str, history: list, context: str, fallback: str) -> tuple[str, bool]:
        """Free-form Q&A grounded in the account's real posture. Returns (answer, ai_used)."""
        if not self.client:
            return fallback, False
        convo = "\n".join(f"{m.get('role', 'user').upper()}: {m.get('text', '')[:2000]}" for m in history[-8:])
        prompt = f"""You are the security copilot inside Nimbus Risk Sentinel, a CSPM for AWS.
Answer using ONLY the account data below. If the data does not contain the answer, say so plainly.
Never invent resource names, account ids, counts or findings. Prefer concrete next steps and
AWS CLI / Terraform snippets when asked. Use short Markdown.

=== ACCOUNT DATA (latest completed scan) ===
{context}

=== CONVERSATION SO FAR ===
{convo}

USER: {question}
ASSISTANT:"""
        for model in list(dict.fromkeys([settings.AI_MODEL, 'gemini-flash-latest', 'gemini-flash-lite-latest'])):
            try:
                r = self.client.models.generate_content(model=model, contents=prompt,
                                                        config=types.GenerateContentConfig(temperature=0.2))
                return r.text, True
            except Exception as e:
                logger.warning(f"chat failed with {model}: {e}")
        return fallback, False


copilot_engine = SecurityCopilot()
