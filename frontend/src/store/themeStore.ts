import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Theme, THEMES, STORAGE_KEYS } from '@verbweaver/shared'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: THEMES.LIGHT,
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: STORAGE_KEYS.THEME,
    }
  )
) 