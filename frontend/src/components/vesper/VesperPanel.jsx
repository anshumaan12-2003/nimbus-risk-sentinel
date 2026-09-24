import { useNavigate } from 'react-router-dom'
import { Maximize2 } from 'lucide-react'
import { Button, Sheet, SheetContent, Tooltip } from '@/components/ds'
import { useSentinelStore } from '@/store/sentinelStore'
import VesperMark from './VesperMark'
import { VesperComposer, VesperHistory, VesperMessages, VesperTitle } from './VesperChat'
import { useVesper } from './useVesper'

/* Vesper in a side panel (⌘J from anywhere). Full screen on phones, like every sheet. */
export default function VesperPanel() {
  const { vesperOpen, closeVesper } = useSentinelStore()
  const navigate = useNavigate()
  const v = useVesper()
  const go = (to) => { closeVesper(); navigate(to) }
  return (
    <Sheet open={vesperOpen} onOpenChange={(o) => { if (!o) closeVesper() }}>
      <SheetContent
        width={560}
        title={<span className="flex items-center gap-2"><VesperMark size={22} thinking={v.streaming} /> Vesper</span>}
        description="Knows your latest scan · never changes AWS"
        headerExtra={
          <div className="mt-2 -ml-2 flex items-center gap-1">
            <VesperHistory v={v} />
            <Tooltip content="Open as a full page">
              <Button variant="ghost" size="icon-sm" aria-label="Open as a full page" onClick={() => go('/vesper')}><Maximize2 /></Button>
            </Tooltip>
          </div>
        }
        footer={<VesperComposer v={v} />}
      >
        {v.messages.length > 0 && <div className="border-b border-line px-5 py-2 text-sm text-fg-2"><VesperTitle v={v} /></div>}
        <VesperMessages v={v} onNavigate={go} />
      </SheetContent>
    </Sheet>
  )
}
