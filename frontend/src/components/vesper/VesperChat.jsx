import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { ArrowUp, Check, Copy, History, Pencil, Plus, RotateCcw, Square, ThumbsDown, ThumbsUp, Trash2, Waypoints } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useUser } from '@/auth/authStore'
import { useSentinelStore } from '@/store/sentinelStore'
import { Button, Kbd, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, TimeAgo, Tooltip } from '@/components/ds'
import VesperMark from './VesperMark'
import { SLASH, followUps, linkCitations } from './useVesper'

const MARKDOWN = 'text-sm leading-6 text-fg [&_a]:text-accent-text [&_a]:underline [&_code]:rounded-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_h1]:text-md [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_p]:my-1.5 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-line [&_pre]:bg-surface-2 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_ul]:list-disc'
const SEV_CHIP = {
  CRITICAL: 'border-crit-line bg-crit-soft text-crit-text', HIGH: 'border-high-line bg-high-soft text-high-text',
  MEDIUM: 'border-med-line bg-med-soft text-med-text', LOW: 'border-low-line bg-low-soft text-low-text',
}
const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }

/* A rule id in an answer, as a chip coloured by the finding's severity. Opens that finding. */
function Citation({ rule, v, onNavigate }) {
  const matches = v.byRule.get(rule) || []
  const top = matches[0]
  const to = matches.length === 1 ? `/findings/${top.id}` : `/findings?q=${encodeURIComponent(rule)}`
  return (
    <button type="button" onClick={() => onNavigate(to)}
            title={top ? `${top.title}${matches.length > 1 ? ` (+${matches.length - 1} more)` : ''}` : `Search findings for ${rule}`}
            className={cn('mx-0.5 inline-flex items-center rounded-sm border px-1.5 align-baseline font-mono text-xs leading-5 no-underline transition-colors hover:brightness-95',
              SEV_CHIP[top?.severity] || 'border-line bg-muted text-fg-2')}>
      {rule}
    </button>
  )
}

function Answer({ m, v, last, onNavigate }) {
  const [copied, setCopied] = useState(false)
  const components = useMemo(() => ({
    a: ({ href = '', children }) => href.startsWith('#cite-')
      ? <Citation rule={href.slice(6)} v={v} onNavigate={onNavigate} />
      : <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>,
  }), [v, onNavigate])
  const copy = async () => {
    try { await navigator.clipboard.writeText(m.text); setCopied(true); setTimeout(() => setCopied(false), 1400) } catch { /* selectable anyway */ }
  }
  const top = m.citations?.[0]
  return (
    <div className="grid animate-rise-in gap-2">
      <div className="flex items-center gap-2 text-xs text-fg-3">
        <VesperMark size={18} thinking={m.streaming} />
        <span className="font-medium text-fg-2">Vesper</span>
        {m.streaming && <span>is writing…</span>}
      </div>
      {m.text
        ? <div className={MARKDOWN}><ReactMarkdown components={components}>{linkCitations(m.text)}</ReactMarkdown></div>
        : m.streaming && <div className="flex gap-1.5 py-1" aria-hidden>{[0, 1, 2].map(i => <span key={i} className="size-1.5 animate-pulse rounded-full bg-fg-3" style={{ animationDelay: `${i * 150}ms` }} />)}</div>}
      {m.failed && <p className="rounded-md border border-crit-line bg-crit-soft px-3 py-2 text-sm text-crit-text">{m.failed}</p>}
      {m.stopped && <p className="text-xs text-fg-3">Stopped.</p>}

      {!m.streaming && m.text && (
        <>
          {top && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => onNavigate((v.byRule.get(top) || []).length === 1 ? `/findings/${v.byRule.get(top)[0].id}` : `/findings?q=${top}`)}>
                Open {top} to fix it
              </Button>
              <Button size="sm" onClick={() => onNavigate('/topology')}><Waypoints /> Attack paths</Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-fg-3">
            {m.scanAt && <span className="mr-1">Based on the scan from <TimeAgo value={m.scanAt} />{m.ai === false && ' · scan facts only (AI is off)'}</span>}
            <span className="ml-auto flex items-center">
              <Tooltip content={copied ? 'Copied' : 'Copy answer'}><Button variant="ghost" size="icon-sm" aria-label="Copy answer" onClick={copy}>{copied ? <Check /> : <Copy />}</Button></Tooltip>
              {last && <Tooltip content="Ask again"><Button variant="ghost" size="icon-sm" aria-label="Ask again" onClick={v.regenerate}><RotateCcw /></Button></Tooltip>}
              {m.id && <>
                <Tooltip content="Helpful"><Button variant="ghost" size="icon-sm" aria-label="Helpful" aria-pressed={m.rating === 1}
                  className={cn(m.rating === 1 && 'text-low-text')} onClick={() => v.rate(m.id, m.rating === 1 ? 0 : 1)}><ThumbsUp /></Button></Tooltip>
                <Tooltip content="Not helpful"><Button variant="ghost" size="icon-sm" aria-label="Not helpful" aria-pressed={m.rating === -1}
                  className={cn(m.rating === -1 && 'text-crit-text')} onClick={() => v.rate(m.id, m.rating === -1 ? 0 : -1)}><ThumbsDown /></Button></Tooltip>
              </>}
            </span>
          </div>
          {last && (
            <div className="flex flex-wrap gap-2" aria-label="Suggested follow-ups">
              {followUps(m.citations).map(q => (
                <button key={q} type="button" onClick={() => v.send(q)}
                        className="rounded-full border border-dashed border-line-strong px-3 py-1 text-xs text-fg-2 transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-accent-text">
                  {q}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function VesperMessages({ v, onNavigate }) {
  const user = useUser()
  const endRef = useRef(null)
  const lastText = v.messages[v.messages.length - 1]?.text
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [v.messages.length, lastText])

  if (!v.messages.length) {
    const first = user?.name?.split(' ')[0]
    const f = v.openFinding
    const suggestions = f
      ? [`Explain ${f.rule_id} in plain language`, `How do I fix ${f.rule_id} safely?`, `What could an attacker do with ${f.rule_id}?`, 'What should I fix first?']
      : ['What should I fix first?', 'Summarise my risk for a manager', 'Which findings are reachable from the internet?', 'How do I turn on MFA for the root account?']
    return (
      <div className="grid gap-5 px-5 py-8">
        <VesperMark size={44} />
        <div>
          <p className="font-display text-2xl font-bold tracking-[-0.03em] text-fg">{greeting()}{first ? `, ${first}` : ''}.</p>
          <p className="mt-1 max-w-[46ch] text-sm text-fg-2">
            I'm Vesper. I read your latest scan (findings, risk and what's exposed) and answer in plain language.
            I can't change AWS: fixes go through a request and a second person's approval.
          </p>
        </div>
        <div className="grid gap-2">
          {suggestions.map(s => (
            <button key={s} type="button" onClick={() => v.send(s)}
                    className="rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-sm text-fg transition-colors hover:border-accent-line hover:bg-accent-soft">
              {s}
            </button>
          ))}
        </div>
        <p className="text-xs text-fg-3">Tip: type <Kbd>/</Kbd> for shortcuts like <span className="font-mono">/fix</span> and <span className="font-mono">/report</span>.</p>
      </div>
    )
  }
  const lastAssistant = v.messages.map(m => m.role).lastIndexOf('assistant')
  return (
    <div className="grid gap-6 px-5 py-5" role="log" aria-label="Conversation with Vesper">
      {v.messages.map((m, i) => m.role === 'user'
        ? <div key={i} className="ml-10 max-w-[85%] justify-self-end rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm whitespace-pre-wrap text-accent-fg">{m.text}</div>
        : <Answer key={m.id || i} m={m} v={v} last={i === lastAssistant} onNavigate={onNavigate} />)}
      <p className="sr-only" aria-live="polite">{v.streaming ? 'Vesper is writing an answer.' : v.messages.length ? 'Answer ready.' : ''}</p>
      <div ref={endRef} />
    </div>
  )
}

export function VesperComposer({ v, autoFocus = true }) {
  const [input, setInput] = useState('')
  const [pick, setPick] = useState(0)
  const ref = useRef(null)
  const takeDraft = useSentinelStore(s => s.takeVesperDraft)
  const draft = useSentinelStore(s => s.vesperDraft)
  useEffect(() => { if (draft) { const d = takeDraft(); if (d) setInput(d) } }, [draft, takeDraft])
  useEffect(() => { if (autoFocus) ref.current?.focus() }, [autoFocus, v.streaming])
  useEffect(() => {   // grow with the text, up to 10 lines
    const el = ref.current; if (!el) return
    el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [input])

  const slash = input.startsWith('/') && !input.includes(' ') ? SLASH.filter(s => s.cmd.startsWith(input.toLowerCase())) : []
  const apply = (s) => { setInput(s.prompt(v.focus)); setPick(0); ref.current?.focus() }
  const submit = () => { if (!input.trim() || v.streaming) return; v.send(input); setInput('') }

  return (
    <form className="relative w-full" onSubmit={e => { e.preventDefault(); submit() }}>
      {slash.length > 0 && (
        <div role="listbox" aria-label="Shortcuts" className="absolute inset-x-0 bottom-full mb-2 overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-popover">
          {slash.map((s, i) => (
            <button key={s.cmd} type="button" role="option" aria-selected={i === pick} onMouseDown={e => { e.preventDefault(); apply(s) }}
                    className={cn('flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm', i === pick ? 'bg-muted text-fg' : 'text-fg-2')}>
              <span className="w-16 font-mono text-xs text-accent-text">{s.cmd}</span>{s.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-surface p-1.5 shadow-raised focus-within:border-accent focus-within:shadow-[var(--ring)]">
        <textarea
          ref={ref}
          value={input}
          onChange={e => { setInput(e.target.value); setPick(0) }}
          onKeyDown={e => {
            if (slash.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setPick(p => (p + 1) % slash.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setPick(p => (p - 1 + slash.length) % slash.length); return }
              if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); apply(slash[pick]); return }
            }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
          }}
          rows={1}
          placeholder={v.openFinding ? `Ask about ${v.openFinding.rule_id}, or anything else…` : 'Ask about your findings, a rule, or a fix…'}
          aria-label="Message Vesper"
          className="max-h-56 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-fg placeholder:text-fg-3 focus:outline-none"
        />
        {v.streaming
          ? <Button type="button" size="icon" onClick={v.stop} aria-label="Stop writing"><Square className="fill-current" /></Button>
          : <Button type="submit" variant="primary" size="icon" disabled={!input.trim()} aria-label="Send"><ArrowUp /></Button>}
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 px-1 text-2xs text-fg-3">
        <span className="hidden sm:inline"><Kbd>Enter</Kbd> send · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> new line · <Kbd>/</Kbd> shortcuts</span>
        {v.page && <span className="ml-auto">Looking at: {v.page.label}{v.openFinding ? ` › ${v.openFinding.rule_id}` : ''}</span>}
      </p>
    </form>
  )
}

/* Past conversations, newest first; open, rename (via the title) or delete. */
export function VesperHistory({ v }) {
  const list = v.conversations.data || []
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={v.newConversation} disabled={!v.messages.length}><Plus /> New</Button>
      <Menu>
        <MenuTrigger asChild><Button variant="ghost" size="sm"><History /> History</Button></MenuTrigger>
        <MenuContent align="start" className="w-80">
          <MenuLabel>Your conversations (only you can see them)</MenuLabel>
          {list.length === 0 && <p className="px-2.5 py-2 text-sm text-fg-3">No saved conversations yet.</p>}
          {list.slice(0, 20).map(c => (
            <div key={c.id} className="group flex items-center">
              <MenuItem className="min-w-0 flex-1" onSelect={() => v.openConversation(c.id)}>
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate', c.id === v.convoId && 'font-medium text-fg')}>{c.title}</span>
                  <span className="text-2xs text-fg-3"><TimeAgo value={c.updated_at} /> · {c.messages} messages</span>
                </span>
              </MenuItem>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete "${c.title}"`} className="mr-1 opacity-60 hover:text-crit-text group-hover:opacity-100"
                      onClick={() => v.remove(c.id)}><Trash2 /></Button>
            </div>
          ))}
          {list.length > 0 && <><MenuSeparator /><p className="px-2.5 py-1.5 text-2xs text-fg-3">Stored on your Breachpath server, not with Google.</p></>}
        </MenuContent>
      </Menu>
    </div>
  )
}

/* The conversation title; click to rename. */
export function VesperTitle({ v, className }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  if (!v.convoId || !v.title) return <span className={className}>New conversation</span>
  if (editing) {
    return (
      <form className={className} onSubmit={e => { e.preventDefault(); v.rename(draft); setEditing(false) }}>
        <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => setEditing(false)} maxLength={120}
               aria-label="Conversation title" className="w-full rounded-md border border-accent bg-surface px-2 py-0.5 text-sm text-fg focus:outline-none" />
      </form>
    )
  }
  return (
    <button type="button" onClick={() => { setDraft(v.title); setEditing(true) }} title="Rename"
            className={cn('group flex min-w-0 items-center gap-1.5 text-left', className)}>
      <span className="truncate">{v.title}</span><Pencil className="size-3 shrink-0 opacity-0 group-hover:opacity-60" />
    </button>
  )
}
