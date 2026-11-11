import { FlaskConical } from 'lucide-react'
import { useAuth } from '@/auth/authStore'

/* Shown on the hosted demo (server DEMO_MODE): the account is fake and resets, so say so up front. */
export default function DemoBanner() {
  const demo = useAuth(s => s.info?.demo_mode)
  if (!demo) return null
  return (
    <div role="note" className="flex items-center gap-2 border-b border-accent-line bg-accent-soft px-4 py-2 text-xs text-accent-text sm:px-6 lg:px-8">
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <p><span className="font-semibold">Demo account.</span> A fake AWS account with planted problems. Changes reset whenever the demo restarts, and nothing touches real AWS.</p>
    </div>
  )
}
