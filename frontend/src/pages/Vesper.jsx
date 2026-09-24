import { useNavigate } from 'react-router-dom'
import VesperMark from '@/components/vesper/VesperMark'
import { VesperComposer, VesperHistory, VesperMessages, VesperTitle } from '@/components/vesper/VesperChat'
import { useVesper } from '@/components/vesper/useVesper'

/* Vesper as a full page, for longer conversations. Same conversation as the ⌘J panel. */
export default function Vesper() {
  const navigate = useNavigate()
  const v = useVesper()
  return (
    <div className="mx-auto grid h-[calc(100dvh-3.25rem)] w-full max-w-[860px] grid-rows-[auto_1fr_auto] px-4 sm:px-6">
      <header className="flex flex-wrap items-center gap-3 border-b border-line py-4">
        <VesperMark size={34} thinking={v.streaming} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold tracking-[-0.03em] text-fg">Vesper</h1>
          <VesperTitle v={v} className="text-sm text-fg-2" />
        </div>
        <VesperHistory v={v} />
      </header>
      <div className="min-h-0 overflow-y-auto"><VesperMessages v={v} onNavigate={navigate} /></div>
      <div className="border-t border-line py-3"><VesperComposer v={v} /></div>
    </div>
  )
}
