import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STORAGE_KEYS } from '@verbweaver/shared'

export type Theme = 'light' | 'dark' | 'high-contrast' | 'colorblind' | 'custom'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  customVars?: Record<string, string>
  setCustomVars: (vars: Record<string, string>) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      customVars: {},
      setCustomVars: (vars) => set({ customVars: vars }),
    }),
    {
      name: STORAGE_KEYS.THEME,
    }
  )
) 