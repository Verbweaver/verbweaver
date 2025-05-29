import { useState } from 'react'
import { Shuffle, ArrowDown, ArrowRight, ArrowUp, ArrowLeft } from 'lucide-react'
import { LayoutDirection } from '../../utils/graphLayout'
import clsx from 'clsx'

interface LayoutControlsProps {
  onLayout: (direction: LayoutDirection | 'expanded') => void
}

export default function LayoutControls({ onLayout }: LayoutControlsProps) {
  const [isOpen, setIsOpen] = useState(false)

  const layoutOptions: { direction: LayoutDirection | 'expanded'; icon: React.ReactNode; label: string }[] = [
    { direction: 'TB', icon: <ArrowDown className="w-4 h-4" />, label: 'Top to Bottom' },
    { direction: 'BT', icon: <ArrowUp className="w-4 h-4" />, label: 'Bottom to Top' },
    { direction: 'LR', icon: <ArrowRight className="w-4 h-4" />, label: 'Left to Right' },
    { direction: 'RL', icon: <ArrowLeft className="w-4 h-4" />, label: 'Right to Left' },
    { direction: 'expanded', icon: <span className="text-xs">⟷</span>, label: 'Expanded' },
  ]

  return (
    <div className="absolute top-[10px] right-[10px] z-10">
      <div className={clsx(
        "bg-background border border-border rounded-md shadow-lg transition-all",
        isOpen ? "w-48" : "w-10"
      )}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-accent rounded-md transition-colors w-full"
          title="Layout Options"
        >
          <Shuffle className="w-5 h-5" />
        </button>
        
        {isOpen && (
          <div className="p-2 border-t border-border space-y-1">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Straighten Layout
            </div>
            {layoutOptions.map(({ direction, icon, label }) => (
              <button
                key={direction}
                onClick={() => {
                  onLayout(direction)
                  setIsOpen(false)
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded transition-colors"
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
} 