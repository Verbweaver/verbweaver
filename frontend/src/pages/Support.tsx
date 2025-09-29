import React, { useEffect, useState } from 'react'
import { Bug, Mail, HeartHandshake, MessageSquare, RefreshCcw } from 'lucide-react'

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
  const [version, setVersion] = useState<string>('')
  const [checking, setChecking] = useState<boolean>(false)

  useEffect(() => {
    let mounted = true
    const loadVersion = async () => {
      try {
        if (isElectron && (window as any).electronAPI?.getAppVersion) {
          const v = await (window as any).electronAPI.getAppVersion()
          if (mounted) setVersion(v || '')
        } else {
          if (mounted) setVersion('Web build')
        }
      } catch {
        if (mounted) setVersion('Unknown')
      }
    }
    loadVersion()
    return () => { mounted = false }
  }, [])

  const handleCheckUpdates = async () => {
    try {
      setChecking(true)
      if (isElectron && (window as any).electronAPI?.checkForUpdates) {
        const res = await (window as any).electronAPI.checkForUpdates()
        if (res?.error) {
          alert('Update check failed: ' + res.error)
        } else if (res?.updateAvailable) {
          alert(`Update available: ${res.version}. It will download in the background and prompt to restart when ready.`)
        } else {
          const v = version ? ` (${version})` : ''
          alert(`You are running the latest version${v}.`)
        }
      } else {
        // Web fallback: open Releases page
        openExternal('https://github.com/Verbweaver/verbweaver/releases')
      }
    } catch (e: any) {
      alert('Update check failed: ' + String(e))
    } finally {
      setChecking(false)
    }
  }
  return (
    <div className="h-full overflow-y-auto p-6 md:p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Support</h1>
      <p className="text-muted-foreground mb-6">How can we help? Quick links below.</p>

      {/* App info and updates */}
      <div className="border border-border rounded-lg p-4 mb-6 bg-muted/10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Application</h2>
            <p className="text-sm text-muted-foreground">Version: {version || 'Loading...'}</p>
          </div>
          <button
            onClick={handleCheckUpdates}
            disabled={checking}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm disabled:opacity-70"
            title={isElectron ? 'Check for updates' : 'Opens Releases page'}
          >
            <RefreshCcw className="w-4 h-4" />
            {checking ? 'Checking…' : 'Check for Updates'}
          </button>
        </div>
      </div>

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


