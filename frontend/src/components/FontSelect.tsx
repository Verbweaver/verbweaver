import type { InstalledFonts } from '../api/compilerApi'

interface FontSelectProps {
  label: string
  ariaLabel: string
  value: string
  onChange: (font: string) => void
  /** Installed fonts; null while loading or if they couldn't be loaded */
  fonts: InstalledFonts | null
  /** Text of the '' choice, e.g. "Template default" */
  emptyLabel: string
  /** Exporting to PDF: warn about fonts installed only as variable fonts */
  forPdf: boolean
  onOpenHelp: () => void
}

/** A font picker for the Compiler (#52): installed fonts, with warnings for risky choices. */
export default function FontSelect({ label, ariaLabel, value, onChange, fonts, emptyLabel, forPdf, onOpenHelp }: FontSelectProps) {
  const list = fonts?.fonts ?? []
  const variableOnly = new Set(fonts?.variableOnly ?? [])
  const notInstalled = Boolean(value && fonts && !list.includes(value))
  const risky = Boolean(value && forPdf && variableOnly.has(value))
  const name = (font: string) => (forPdf && variableOnly.has(font) ? `${font} (variable font)` : font)

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-3">
        <span className="text-sm w-28">{label}</span>
        <select
          aria-label={ariaLabel}
          className="px-2 py-1 border border-input rounded bg-background text-sm max-w-[14rem]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{emptyLabel}</option>
          {value && !list.includes(value) && (
            <option value={value}>{fonts ? `${value} (not installed)` : value}</option>
          )}
          {list.map((font) => (
            <option key={font} value={font}>{name(font)}</option>
          ))}
        </select>
      </label>
      {(notInstalled || risky) && (
        <p className="text-xs text-amber-600 dark:text-amber-400" role="alert">
          {notInstalled
            ? `"${value}" isn't installed on this computer, so the export may fail or use another font.`
            : `"${value}" is only installed as a "variable" font, which PDF export can't always use.`}{' '}
          <button type="button" className="underline" onClick={onOpenHelp}>
            {notInstalled ? 'How to install fonts' : 'More about fonts'}
          </button>
        </p>
      )}
    </div>
  )
}
