import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STORAGE_KEYS } from '@verbweaver/shared'

<<<<<<< HEAD
export type Theme = 'light' | 'dark' | 'high-contrast' | 'colorblind'
=======
export type Theme = 'light' | 'dark' | 'high-contrast' | 'colorblind' | 'custom'
>>>>>>> release-testing

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
<<<<<<< HEAD
=======
  customVars?: Record<string, string>
  setCustomVars: (vars: Record<string, string>) => void
>>>>>>> release-testing
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
<<<<<<< HEAD
=======
      customVars: {},
      setCustomVars: (vars) => set({ customVars: vars }),
>>>>>>> release-testing
    }),
    {
      name: STORAGE_KEYS.THEME,
    }
  )
) 