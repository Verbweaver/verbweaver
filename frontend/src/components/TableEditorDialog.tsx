import React from 'react'
import { X } from 'lucide-react'
import TableEditor from './TableEditor'

interface TableEditorDialogProps {
  isOpen: boolean
  title?: string
  varName: string
  value: {
    columns: string[]
    types?: Record<string, { type: 'string' | 'number' | 'boolean' | 'enum', enum?: Array<string | number | boolean> }>
    rows: Array<Record<string, any>>
  }
  onChange: (val: any) => void
  onClose: () => void
  isElectron: boolean
}

export default function TableEditorDialog({ isOpen, title, varName, value, onChange, onClose, isElectron }: TableEditorDialogProps) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onKeyDownCapture={(e)=>e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background border rounded-lg shadow-lg w-full max-w-5xl max-h-[85vh] flex flex-col" onKeyDownCapture={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">{title || `Edit Table: ${varName}`}</h2>
            <p className="text-sm text-muted-foreground">Use CSV for bulk edits. Columns can be added, removed, renamed and reordered.</p>
          </div>
          <button className="p-1 hover:bg-accent rounded-md" onClick={onClose} aria-label="Close"><X className="w-4 h-4"/></button>
        </div>
        <div className="flex-1 overflow-auto">
          <TableEditor varName={varName} value={value} onChange={onChange} isElectron={isElectron} />
        </div>
        <div className="flex justify-end gap-2 p-4 border-t">
          <button className="px-3 py-2 border rounded" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}


