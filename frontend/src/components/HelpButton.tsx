import { HelpCircle } from 'lucide-react'
import type { HelpDoc } from '@verbweaver/shared'
import { useOpenHelp } from '../hooks/useOpenHelp'

/** Icon button that opens the Help view on the guide for the current page, optionally at a section. */
export default function HelpButton({ doc, label, section }: { doc: HelpDoc; label: string; section?: string }) {
  const openHelp = useOpenHelp()
  return (
    <button
      type="button"
      onClick={() => openHelp(doc, section)}
      className="p-1.5 rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      title={`Open ${label} User Guide`}
      aria-label={`Open ${label} User Guide`}
    >
      <HelpCircle className="w-5 h-5" />
    </button>
  )
}
