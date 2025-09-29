import React, { useEffect, useState } from 'react'
import { Save, Info } from 'lucide-react'
import { useProjectStore } from '../../store/projectStore'
import { projectsApi } from '../../api/projects'
import { useAuthStore } from '../../services/auth'
import { gitApi } from '../../api/gitApi'

type IntervalUnit = 'seconds' | 'minutes' | 'hours'

interface CollaborationSettings {
  autoPull?: { enabled: boolean; interval: number; unit: IntervalUnit }
  autoPush?: { enabled: boolean; interval: number; unit: IntervalUnit }
}

export default function CollaborationSettingsPage() {
  const { currentProject } = useProjectStore()
  const [settings, setSettings] = useState<CollaborationSettings>({
    autoPull: { enabled: false, interval: 5, unit: 'minutes' },
    autoPush: { enabled: false, interval: 5, unit: 'minutes' }
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!currentProject) return
      setIsLoading(true)
      setError(null)
      try {
        const isElectron = typeof window !== 'undefined' && (window as any).electronAPI
        let collab: CollaborationSettings = { autoPull: { enabled: false, interval: 5, unit: 'minutes' }, autoPush: { enabled: false, interval: 5, unit: 'minutes' } }
        if (isElectron) {
          // Electron: read from per-user preferences
          try {
            const prefs = await (window as any).electronAPI.getPreferences()
            if (prefs && prefs.collaboration) collab = { ...(prefs.collaboration as any) }
          } catch {}
        } else {
          // Web: merge project defaults with per-user overrides
          const proj = await projectsApi.getProjectSettings(currentProject.id)
          const projectCollab = (proj?.collaboration || {}) as CollaborationSettings
          let userCollab: CollaborationSettings | null = null
          try {
            const res = await fetch(`${location.origin}/api/v1/users/me/preferences`, { headers: { 'Authorization': `Bearer ${useAuthStore.getState().accessToken}` } })
            if (res.ok) {
              const data = await res.json()
              userCollab = (data?.preferences?.collaboration || null) as any
            }
          } catch {}
          collab = { ...projectCollab, ...(userCollab || {}) }
        }
        setSettings({
          autoPull: {
            enabled: collab?.autoPull?.enabled ?? false,
            interval: collab?.autoPull?.interval ?? 5,
            unit: (collab?.autoPull?.unit as IntervalUnit) || 'minutes'
          },
          autoPush: {
            enabled: collab?.autoPush?.enabled ?? false,
            interval: collab?.autoPush?.interval ?? 5,
            unit: (collab?.autoPush?.unit as IntervalUnit) || 'minutes'
          }
        })
      } catch (e) {
        setError('Failed to load collaboration settings')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [currentProject?.id])

  const persist = async () => {
    if (!currentProject) return
    setIsSaving(true)
    setError(null)
    setSuccess(null)
    try {
      // Save per-user override (Electron and Web)
      if (!(typeof window !== 'undefined' && (window as any).electronAPI)) {
        await fetch(`${location.origin}/api/v1/users/me/preferences`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${useAuthStore.getState().accessToken}`
          },
          body: JSON.stringify({ collaboration: settings })
        })
      } else {
        // Electron: persist to per-user preferences
        try {
          const prefs = await (window as any).electronAPI.getPreferences()
          await (window as any).electronAPI.setPreferences({ ...(prefs || {}), collaboration: settings })
        } catch (e) {
          throw e
        }
      }
      setSuccess('Collaboration settings saved')
      // Restart schedulers to apply changes immediately
      try { await (useProjectStore.getState().startCollaborationSchedulers)() } catch {}
    } catch (e) {
      setError('Failed to save collaboration settings')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Collaboration</h2>
        <p className="text-sm text-muted-foreground mt-1">Configure automatic pull and push to keep collaborators in sync.</p>
      </div>

      {error && (
        <div className="p-3 border border-destructive/30 rounded text-destructive text-sm">{error}</div>
      )}
      {success && (
        <div className="p-3 border border-green-500/30 rounded text-green-500 text-sm">{success}</div>
      )}

      <div className="space-y-6">
        <section className="p-4 border border-border rounded-lg">
          <h3 className="text-md font-medium mb-2">Automatic Pull</h3>
          <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1"><Info className="w-3 h-3"/> Periodically run git pull to fetch and merge remote changes.</p>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!settings.autoPull?.enabled}
              onChange={(e)=> setSettings(s => ({...s, autoPull: { ...(s.autoPull||{interval:5,unit:'minutes'}), enabled: e.target.checked }}))}
            /> Enable automatic pull
          </label>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm">Every</span>
            <input
              type="number"
              min={1}
              className="w-20 px-2 py-1 border border-border rounded bg-background text-sm"
              value={settings.autoPull?.interval || 1}
              onChange={(e)=> setSettings(s => ({...s, autoPull: { ...(s.autoPull||{enabled:false,unit:'minutes'}), interval: Math.max(1, parseInt(e.target.value||'1', 10)) }}))}
              disabled={!settings.autoPull?.enabled}
            />
            <select
              className="px-2 py-1 border border-border rounded bg-background text-sm"
              value={settings.autoPull?.unit || 'minutes'}
              onChange={(e)=> setSettings(s => ({...s, autoPull: { ...(s.autoPull||{enabled:false,interval:5}), unit: e.target.value as IntervalUnit }}))}
              disabled={!settings.autoPull?.enabled}
            >
              <option value="seconds">seconds</option>
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
            </select>
          </div>
        </section>

        <section className="p-4 border border-border rounded-lg">
          <h3 className="text-md font-medium mb-2">Automatic Push</h3>
          <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1"><Info className="w-3 h-3"/> Periodically run git push to upload local commits.</p>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!settings.autoPush?.enabled}
              onChange={(e)=> setSettings(s => ({...s, autoPush: { ...(s.autoPush||{interval:5,unit:'minutes'}), enabled: e.target.checked }}))}
            /> Enable automatic push
          </label>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm">Every</span>
            <input
              type="number"
              min={1}
              className="w-20 px-2 py-1 border border-border rounded bg-background text-sm"
              value={settings.autoPush?.interval || 1}
              onChange={(e)=> setSettings(s => ({...s, autoPush: { ...(s.autoPush||{enabled:false,unit:'minutes'}), interval: Math.max(1, parseInt(e.target.value||'1', 10)) }}))}
              disabled={!settings.autoPush?.enabled}
            />
            <select
              className="px-2 py-1 border border-border rounded bg-background text-sm"
              value={settings.autoPush?.unit || 'minutes'}
              onChange={(e)=> setSettings(s => ({...s, autoPush: { ...(s.autoPush||{enabled:false,interval:5}), unit: e.target.value as IntervalUnit }}))}
              disabled={!settings.autoPush?.enabled}
            >
              <option value="seconds">seconds</option>
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
            </select>
          </div>
        </section>

        <div className="flex justify-end">
          <button onClick={persist} disabled={isSaving || !currentProject} className="px-3 py-2 rounded bg-primary text-primary-foreground text-sm flex items-center gap-2">
            <Save className="w-4 h-4" /> {isSaving ? 'Saving…' : 'Save Collaboration Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}


