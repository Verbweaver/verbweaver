import React, { useEffect, useState } from 'react';
import { useThemeStore, Theme } from '../../store/themeStore'; // Adjusted path

const AppearanceSettingsPage: React.FC = () => {
  const { theme, setTheme } = useThemeStore();
  const [customVars, setCustomVars] = useState<Record<string, string>>({})

  const readVars = () => {
    const root = document.documentElement
    const get = (name: string) => getComputedStyle(root).getPropertyValue(name).trim()
    return {
      background: get('--background'),
      foreground: get('--foreground'),
      primary: get('--primary'),
      primaryForeground: get('--primary-foreground'),
      secondary: get('--secondary'),
      secondaryForeground: get('--secondary-foreground'),
      accent: get('--accent'),
      accentForeground: get('--accent-foreground'),
      muted: get('--muted'),
      mutedForeground: get('--muted-foreground'),
      border: get('--border'),
      input: get('--input'),
      ring: get('--ring'),
      card: get('--card'),
      cardForeground: get('--card-foreground'),
      popover: get('--popover'),
      popoverForeground: get('--popover-foreground'),
    } as const
  }

  const [themeVars, setThemeVars] = useState(readVars())

  // Refresh variables after theme changes (wait for DOM class update)
  useEffect(() => {
    let raf1 = 0, raf2 = 0
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setThemeVars(readVars()))
    })
    return () => { if (raf1) cancelAnimationFrame(raf1); if (raf2) cancelAnimationFrame(raf2) }
  }, [theme])

  // Also update if the documentElement class changes (e.g., other code toggles classes)
  useEffect(() => {
    const target = document.documentElement
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          setThemeVars(readVars())
          break
        }
      }
    })
    observer.observe(target, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  // Reset or load custom values when theme changes so inputs reflect the active theme
  useEffect(() => {
    if (theme === 'custom') {
      const persisted = useThemeStore.getState().customVars || {}
      setCustomVars(persisted)
    } else {
      setCustomVars({})
    }
  }, [theme])

  // The values shown in the inputs: the active theme's colours with any unsaved edits on top
  const effectiveVars: Record<string, string> = { ...themeVars, ...customVars }

  const [importStatus, setImportStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null)

  const onEditVar = (key: string, val: string) => {
    setCustomVars(prev => ({ ...prev, [key]: val }))
  }

  const applyCustom = () => {
    // Persist every colour, not only the edited ones: the Custom theme has no CSS of its own,
    // so anything missing would fall back to the Light colours.
    // Persist first, then switch theme so App effect applies exactly those values
    const next = { ...effectiveVars }
    useThemeStore.getState().setCustomVars(next)
    setTheme('custom')
  }

  const exportTheme = () => {
    // Every colour of the current theme, including unsaved edits, so the file can restore it
    const data = {
      name: theme,
      variables: { ...effectiveVars },
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'verbweaver-theme.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const importTheme = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files && input.files[0]
      if (!file) return
      setImportStatus(null)
      let parsed: { variables?: unknown } | null
      try {
        parsed = JSON.parse(await file.text())
      } catch {
        setImportStatus({ kind: 'error', message: `"${file.name}" isn't a theme file. The theme wasn't changed.` })
        return
      }
      const vars = (parsed && parsed.variables && typeof parsed.variables === 'object') ? parsed.variables as Record<string, unknown> : {}
      // Basic sanitize: keep only known keys
      const allowed = new Set(Object.keys(readVars()))
      const imported: Record<string,string> = {}
      Object.entries(vars).forEach(([k,v]) => {
        if (allowed.has(k) && typeof v === 'string' && v.trim()) imported[k] = v.trim()
      })
      if (Object.keys(imported).length === 0) {
        setImportStatus({ kind: 'error', message: `"${file.name}" has no theme colours. The theme wasn't changed.` })
        return
      }
      // Fill any colours the file leaves out from the current theme, so Custom is complete
      const next = { ...effectiveVars, ...imported }
      setCustomVars(next)
      // Persist and apply as custom
      useThemeStore.getState().setCustomVars(next)
      setTheme('custom')
      setImportStatus({ kind: 'ok', message: 'Theme imported.' })
    }
    input.click()
  }

  return (
    <div className="bg-card p-6 rounded-lg shadow-sm border space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4 text-foreground">Appearance</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="theme-select" className="block text-sm font-medium mb-2 text-foreground">Theme</label>
            <select
              id="theme-select"
              value={theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
              className="w-full p-2 border rounded-md bg-background text-foreground border-border focus:ring-primary focus:border-primary"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="high-contrast">High Contrast</option>
              <option value="colorblind">Colorblind Friendly</option>
              <option value="custom">Custom</option>
            </select>
            <p className="text-sm text-muted-foreground mt-1">
              Choose a color theme for the interface. The colorblind theme uses colors optimized for deuteranopia.
            </p>
          </div>
          <div className="border rounded-md p-3">
            <h3 className="text-sm font-medium mb-2 text-foreground">Current theme color codes (HSL triplets)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(themeVars).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded border border-border" data-testid={`swatch-${k}`} style={{ backgroundColor: `hsl(${effectiveVars[k]})` }} />
                  <label htmlFor={`theme-var-${k}`} className="w-44 text-sm text-muted-foreground capitalize">{k.replace(/([A-Z])/g,' $1')}</label>
                  <input
                    id={`theme-var-${k}`}
                    className="flex-1 px-2 py-1 text-sm rounded border border-input bg-background"
                    placeholder="e.g. 217 91% 60%"
                    value={customVars[k] ?? v}
                    onChange={(e)=> onEditVar(k, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <button onClick={applyCustom} className="px-3 py-1.5 rounded bg-primary text-primary-foreground">Save as Custom</button>
              <button onClick={exportTheme} className="px-3 py-1.5 rounded border border-border">Export Theme</button>
              <button onClick={importTheme} className="px-3 py-1.5 rounded border border-border">Import Theme</button>
              <span className="text-xs text-muted-foreground">Export saves every colour of the current theme as JSON (HSL triplets). Import loads one as the Custom theme.</span>
            </div>
            {importStatus && (
              <p role={importStatus.kind === 'error' ? 'alert' : 'status'}
                 className={`mt-2 text-sm ${importStatus.kind === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                {importStatus.message}
              </p>
            )}
          </div>
        </div>
      </div>

      
    </div>
  );
};

export default AppearanceSettingsPage; 