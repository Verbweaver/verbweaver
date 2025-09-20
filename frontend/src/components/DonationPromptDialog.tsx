import React from 'react'
import { X, HeartHandshake } from 'lucide-react'

interface DonationPromptDialogProps {
  isOpen: boolean
  onDonate: () => void
  onClose: () => void
}

export default function DonationPromptDialog({ isOpen, onDonate, onClose }: DonationPromptDialogProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onKeyDownCapture={(e)=>e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background border rounded-lg shadow-lg w-full max-w-lg" onKeyDownCapture={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <HeartHandshake className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Support Verbweaver</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded-md transition-colors" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-foreground">It seems you have used Verbweaver several times. We hope you are enjoying using it!</p>
          <p className="text-sm text-foreground">If you are, please consider donating to support its development. Verbweaver is free to use and will remain so, but it is not free for us to develop. Your donations pay for the costs incurred by running our website, publishing to app stores, and owning a business.</p>
          <p className="text-sm text-muted-foreground">We don't want to annoy you, so this is the only time we will prompt you like this.</p>
          <p className="text-sm text-foreground">Have a great day!</p>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors">Close</button>
          <button onClick={onDonate} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">Donate</button>
        </div>
      </div>
    </div>
  )
}


