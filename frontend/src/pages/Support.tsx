import React from 'react'
import { Bug, Mail, HeartHandshake, MessageSquare } from 'lucide-react'

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined

function openExternal(url: string) {
  try {
    if (isElectron && (window as any).electronAPI?.openExternal) {
      ;(window as any).electronAPI.openExternal(url)
      return
    }
  } catch {}
  window.open(url, '_blank', 'noopener,noreferrer')
}

export default function Support() {
  return (
    <div className="h-full overflow-y-auto p-6 md:p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Support</h1>
      <p className="text-muted-foreground mb-6">How can we help? Quick links below.</p>

      <div className="space-y-4">
        <div className="border border-border rounded-lg p-4 flex items-start gap-3 bg-muted/20">
          <Bug className="w-5 h-5 mt-0.5" />
          <div className="flex-1">
            <h2 className="font-semibold">Report a Bug</h2>
            <p className="text-sm text-muted-foreground mb-2">Found an issue? Let us know.</p>
            <button
              onClick={() => openExternal('https://github.com/Verbweaver/verbweaver/issues')}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm"
            >
              Open GitHub Issues
            </button>
          </div>
        </div>

        <div className="border border-border rounded-lg p-4 flex items-start gap-3 bg-muted/20">
          <Mail className="w-5 h-5 mt-0.5" />
          <div className="flex-1">
            <h2 className="font-semibold">Contact the Developer</h2>
            <p className="text-sm text-muted-foreground mb-2">Questions or feedback? Reach out.</p>
            <button
              onClick={() => openExternal('https://github.com/Verbweaver/verbweaver/issues')}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm"
            >
              Open Contact Form
            </button>
          </div>
        </div>

        <div className="border border-border rounded-lg p-4 flex items-start gap-3 bg-muted/20">
          <HeartHandshake className="w-5 h-5 mt-0.5" />
          <div className="flex-1">
            <h2 className="font-semibold">Donate to Support Development</h2>
            <p className="text-sm text-muted-foreground mb-2">Verbweaver is free; donations help cover costs.</p>
            <button
              onClick={() => openExternal('https://verbweaver.design/donate')}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm"
            >
              Visit Donate Page
            </button>
          </div>
        </div>

        <div className="border border-border rounded-lg p-4 flex items-start gap-3 bg-muted/20">
          <MessageSquare className="w-5 h-5 mt-0.5" />
          <div className="flex-1">
            <h2 className="font-semibold">Join the Discord</h2>
            <p className="text-sm text-muted-foreground mb-2">Connect with the community and the devs.</p>
            <button
              onClick={() => openExternal('https://discord.gg/77W3ZN5sNv')}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm"
            >
              Join Discord
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


