import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface PromptDialogProps {
  isOpen: boolean
  title?: string
  label?: string
  message?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  validate?: (value: string) => string | null
  onConfirm: (value: string) => void | Promise<void>
  onCancel: () => void
}

export function PromptDialog({
  isOpen,
  title = 'Enter Value',
  label,
  message,
  defaultValue = '',
  placeholder,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  validate,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState<string>(defaultValue)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue)
      setError(null)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isOpen, defaultValue])

  if (!isOpen) return null

  const handleConfirm = () => {
    const trimmed = value.trim()
    const err = validate ? validate(trimmed) : null
    if (err) { setError(err); return }
    onConfirm(trimmed)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onKeyDownCapture={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-background border rounded-lg shadow-lg w-full max-w-md" onKeyDownCapture={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onCancel} className="p-1 hover:bg-accent rounded-md transition-colors" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          {message && <p className="text-sm text-foreground mb-2">{message}</p>}
          {label && <label className="text-sm font-medium block mb-1">{label}</label>}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e)=>{ setValue(e.target.value); if (error) setError(null) }}
            placeholder={placeholder}
            className="w-full px-3 py-2 border rounded-md bg-background"
            onKeyDown={(e)=>{ if (e.key === 'Enter') { e.preventDefault(); handleConfirm() }}}
          />
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onCancel} className="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors">
            {cancelLabel}
          </button>
          <button onClick={handleConfirm} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PromptDialog


