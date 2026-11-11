import { useLocation } from 'react-router-dom'
import { NavTabs } from '@/components/ds'

/* Attack paths and the breach simulator draw the same graph: one sidebar entry, two views.
   Each keeps its own URL so links like /simulator?entry=… still work. */
export default function AttackTabs() {
  const sim = useLocation().pathname.startsWith('/simulator')
  return <NavTabs label="Attack path views" items={[
    { to: '/topology', label: 'Attack paths', active: !sim },
    { to: '/simulator', label: 'Breach simulator', active: sim },
  ]} />
}
