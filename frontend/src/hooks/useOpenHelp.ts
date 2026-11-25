import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { HelpDoc } from '@verbweaver/shared'
import { useTabStore } from '../store/tabStore'

/**
 * Open the Help view on a specific guide, optionally scrolled to a section
 * (the slug of one of its headings). Activates the existing Help tab (or
 * creates one, as the sidebar Help link does) so the tab bar matches the page,
 * then navigates through the router so it works with both Hash and Browser routers.
 */
export function useOpenHelp() {
  const navigate = useNavigate()
  const openViewTab = useTabStore(s => s.openViewTab)

  return useCallback((doc: HelpDoc, section?: string) => {
    const params = new URLSearchParams({ doc })
    if (section) params.set('section', section)
    navigate(openViewTab('help', `/help?${params.toString()}`, 'Help', { override: true }))
  }, [openViewTab, navigate])
}
