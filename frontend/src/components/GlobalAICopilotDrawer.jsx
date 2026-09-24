import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { ArrowUp, RotateCcw, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Sheet, SheetContent, Button, Kbd } from '@/components/ds'
import { useSentinelStore } from '@/store/sentinelStore'
import { api, apiError } from '@/api/nimbus'

const SUGGESTIONS = [
  'What should I fix first?',
  'Summarise my risk for a manager',
  'How do I turn on MFA for the root account?',
  'Which crown jewels are reachable from the internet?',
]

const MARKDOWN = 'text-sm leading-6 text-fg [&_a]:text-accent-text [&_a]:underline [&_code]:rounded-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_h1]:text-md [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_p]:my-1.5 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-line [&_pre]:bg-surface-2 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_ul]:list-disc'

export default function GlobalAICopilotDrawer() {
  const { globalCopilotOpen, closeGlobalCopilot } = useSentinelStore()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, loading])

  const send = async (text = input) => {
    const question = text.trim()
    if (!question || loading) return
    setMessages(m => [...m, { role: 'user', text: question }])
    setInput('')
    setLoading(true)
    try {
      // The server grounds the answer in the latest scan (findings, score, attack paths).
      const history = messages.map(m => ({ role: m.role, text: m.text }))
      const res = await api.post('/copilot/chat', { question, history })
      setMessages(m => [...m, { role: 'assistant', text: res.data.answer, ai: res.data.ai }])
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', text: apiError(err), error: true }])
    } finally {
      setLoading(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  return (
    <Sheet open={globalCopilotOpen} onOpenChange={(o) => { if (!o) closeGlobalCopilot() }}>
      <SheetContent
        width={520}
        title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-accent-text" /> Copilot</span>}
        description="Answers from your latest scan. It explains and suggests — it never changes AWS."
        headerExtra={messages.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-2 -ml-2" onClick={() => setMessages([])}><RotateCcw /> New conversation</Button>
        )}
        footer={
          <form className="w-full" onSubmit={(e) => { e.preventDefault(); send() }}>
            <div className="flex items-end gap-2 rounded-lg border border-line-strong bg-surface p-1.5 focus-within:border-accent focus-within:shadow-[var(--ring)]">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                rows={1}
                placeholder="Ask about your findings, a rule, or a fix…"
                aria-label="Message Copilot"
                className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-fg placeholder:text-fg-3 focus:outline-none"
              />
              <Button type="submit" variant="primary" size="icon" disabled={!input.trim() || loading} aria-label="Send"><ArrowUp /></Button>
            </div>
            <p className="mt-1.5 px-1 text-2xs text-fg-3"><Kbd>Enter</Kbd> to send · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> for a new line</p>
          </form>
        }
      >
        <div className="grid gap-5 p-5">
          {messages.length === 0 && (
            <div className="grid gap-4 py-4">
              <div className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-text"><Sparkles className="size-5" /></div>
              <div>
                <p className="text-lg font-semibold text-fg">What do you want to know?</p>
                <p className="mt-1 text-sm text-fg-2">Copilot reads your latest scan — findings, risk score and attack paths — and answers in plain language.</p>
              </div>
              <div className="grid gap-2">
                {SUGGESTIONS.map(s => (
                  <button key={s} type="button" onClick={() => send(s)}
                          className="rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-sm text-fg transition-colors hover:border-line-strong hover:bg-surface-2">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => m.role === 'user' ? (
            <div key={i} className="ml-10 justify-self-end rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-accent-fg">{m.text}</div>
          ) : (
            <div key={i} className="grid animate-rise-in gap-1.5">
              <div className={cn(MARKDOWN, m.error && 'rounded-md border border-crit-line bg-crit-soft px-3 py-2 text-crit-text')}>
                {m.error ? `Copilot couldn’t answer: ${m.text}` : <ReactMarkdown>{m.text}</ReactMarkdown>}
              </div>
              {m.ai === false && <p className="text-2xs text-fg-3">Built from scan data only — add AI_API_KEY in backend/.env for fuller answers.</p>}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-1.5 py-1" aria-label="Copilot is thinking">
              {[0, 1, 2].map(i => <span key={i} className="size-1.5 animate-pulse rounded-full bg-fg-3" style={{ animationDelay: `${i * 150}ms` }} />)}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
