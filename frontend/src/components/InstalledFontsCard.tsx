import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Type } from 'lucide-react'
import { HELP_DOCS } from '@verbweaver/shared'
import { Button } from './ui/Button'
import { compilerApi } from '../api/compilerApi'
import { useOpenHelp } from '../hooks/useOpenHelp'

/** Lists the fonts that exports can use, with a link to the guide on installing more (#52). */
export default function InstalledFontsCard() {
  const [fonts, setFonts] = useState<string[] | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const openHelp = useOpenHelp()

  const load = async (refresh: boolean) => {
    setLoading(true)
    setError(false)
    try {
      setFonts(await compilerApi.getFonts(refresh))
    } catch (e) {
      console.error('Failed to load installed fonts:', e)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(false) }, [])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (fonts ?? []).filter(f => !q || f.toLowerCase().includes(q))
  }, [fonts, query])

  return (
    <div className="space-y-3" data-testid="installed-fonts">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-md font-medium text-foreground flex items-center gap-2">
            <Type className="w-4 h-4" />
            Fonts{fonts ? ` (${fonts.length})` : ''}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Fonts installed on this computer. You can use them in exported documents.{' '}
            <button type="button" className="underline hover:text-foreground" onClick={() => openHelp(HELP_DOCS.FONTS)}>
              How to install more fonts
            </button>
          </p>
        </div>
        <Button
          onClick={() => load(true)}
          disabled={loading}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">Couldn't load the list of fonts.</p>}
      {fonts && (
        <>
          <input
            type="search"
            aria-label="Search fonts"
            placeholder="Search fonts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full px-3 py-1.5 border border-input rounded bg-background text-sm"
          />
          <ul className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {shown.map((font) => (
              <li key={font} className="px-3 py-1.5 text-sm flex items-center justify-between gap-4">
                <span className="truncate">{font}</span>
                {/* Sample in the font itself; symbol fonts show their symbols here */}
                <span className="text-muted-foreground truncate" style={{ fontFamily: `'${font}', sans-serif` }} aria-hidden="true">
                  The quick brown fox
                </span>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">No fonts found.</li>
            )}
          </ul>
        </>
      )}
    </div>
  )
}
