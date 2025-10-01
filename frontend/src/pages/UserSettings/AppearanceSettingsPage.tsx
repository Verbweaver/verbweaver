import React, { useEffect, useMemo, useState } from 'react';
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

  const onEditVar = (key: string, val: string) => {
    setCustomVars(prev => ({ ...prev, [key]: val }))
  }

  const applyCustom = () => {
    // Persist first, then switch theme so App effect applies exactly those values
    const next = { ...customVars }
    useThemeStore.getState().setCustomVars(next)
    setTheme('custom' as Theme as any)
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
                  <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: k.toLowerCase().includes('foreground') ? `hsl(${themeVars[k.replace('Foreground','') as keyof typeof themeVars] || v})` : `hsl(${v})` }} />
                  <label className="w-44 text-sm text-muted-foreground capitalize">{k.replace(/([A-Z])/g,' $1')}</label>
                  <input
                    className="flex-1 px-2 py-1 text-sm rounded border border-input bg-background"
                    placeholder="e.g. 217 91% 60%"
                    value={customVars[k] ?? v}
                    onChange={(e)=> onEditVar(k, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={applyCustom} className="px-3 py-1.5 rounded bg-primary text-primary-foreground">Save as Custom</button>
              <span className="text-xs text-muted-foreground">Edits apply to this device. Original themes remain selectable.</span>
            </div>
          </div>
        </div>
      </div>

      
    </div>
  );
};

export default AppearanceSettingsPage; 