import React, { useMemo } from 'react'
import toast from 'react-hot-toast'

type ColumnType = 'string' | 'number' | 'boolean' | 'enum'

interface ColumnTypeDef {
  type: ColumnType
  enum?: Array<string | number | boolean>
}

interface TableValue {
  columns: string[]
  types?: Record<string, ColumnTypeDef>
  rows: Array<Record<string, any>>
}

interface TableEditorProps {
  varName: string
  value: TableValue
  onChange: (val: TableValue) => void
  isElectron: boolean
}

const MAX_WEB_COLUMNS = 256
const MAX_WEB_CELL_LEN = 2000

export default function TableEditor({ varName, value, onChange, isElectron }: TableEditorProps) {
  const columns = Array.isArray(value?.columns) && value.columns.length > 0 ? value.columns : ['Task']
  const types = (value && typeof value.types === 'object') ? value.types! : {}
  const rows = Array.isArray(value?.rows) ? value.rows : []

  const isWebLimited = useMemo(() => !isElectron, [isElectron])

  const update = (next: Partial<TableValue>) => {
    onChange({ columns, types, rows, ...next })
  }

  const addColumn = () => {
    if (isWebLimited && columns.length >= MAX_WEB_COLUMNS) {
      toast.error(`Web limit: maximum ${MAX_WEB_COLUMNS} columns`)
      return
    }
    const base = 'Column'
    let name = base
    let i = 1
    const existing = new Set(columns)
    while (existing.has(name)) {
      name = `${base} ${i++}`
    }
    update({ columns: [...columns, name] })
  }

  const removeColumn = (idx: number) => {
    const col = columns[idx]
    const newCols = columns.filter((_, i) => i !== idx)
    const newTypes = { ...types }
    delete newTypes[col]
    const newRows = rows.map(r => {
      const { [col]: _removed, ...rest } = r
      return rest
    })
    update({ columns: newCols, types: newTypes, rows: newRows })
  }

  const renameColumn = (idx: number, newNameRaw: string) => {
    const newName = newNameRaw.trim()
    if (!newName) return
    const old = columns[idx]
    if (old === newName) return
    if (columns.some((c, i) => i !== idx && c === newName)) {
      toast.error('Column name already exists')
      return
    }
    const newCols = [...columns]
    newCols[idx] = newName
    const newTypes: Record<string, ColumnTypeDef> = {}
    Object.keys(types).forEach(k => {
      newTypes[k === old ? newName : k] = types[k]
    })
    const newRows = rows.map(r => {
      if (old in r) {
        const { [old]: val, ...rest } = r
        return { ...rest, [newName]: val }
      }
      return r
    })
    update({ columns: newCols, types: newTypes, rows: newRows })
  }

  const moveColumn = (idx: number, dir: -1 | 1) => {
    const to = idx + dir
    if (to < 0 || to >= columns.length) return
    const newCols = [...columns]
    const tmp = newCols[idx]
    newCols[idx] = newCols[to]
    newCols[to] = tmp
    update({ columns: newCols })
  }

  const setColumnType = (col: string, def: ColumnTypeDef) => {
    update({ types: { ...types, [col]: def } })
  }

  const addRow = () => {
    update({ rows: [...rows, {}] })
  }

  const removeRow = (i: number) => {
    const next = [...rows]
    next.splice(i, 1)
    update({ rows: next })
  }

  const setCell = (rowIdx: number, col: string, raw: any) => {
    const typeDef: ColumnTypeDef = types[col] || { type: 'string' }
    let val: any = raw
    if (typeDef.type === 'number') {
      if (val === '' || val === null || val === undefined) val = ''
      else if (!Number.isNaN(Number(val))) val = Number(val)
      else return // ignore invalid numeric input
    } else if (typeDef.type === 'boolean') {
      val = !!val
    } else if (typeDef.type === 'enum') {
      // keep as-is; select enforces values
    } else {
      // string
      if (typeof val !== 'string') val = String(val ?? '')
      if (isWebLimited && val.length > MAX_WEB_CELL_LEN) {
        toast.error(`Web limit: cell text must be ≤ ${MAX_WEB_CELL_LEN} characters`)
        return
      }
    }
    const next = [...rows]
    const r = { ...(next[rowIdx] || {}) }
    r[col] = val
    next[rowIdx] = r
    update({ rows: next })
  }

  const exportCsv = () => {
    const header = columns.join(',')
    const lines = rows.map(r => columns.map(c => {
      const v = r?.[c]
      const s = v === undefined || v === null ? '' : String(v)
      return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s
    }).join(','))
    const csv = header + '\n' + lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${varName}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const importCsv = async (file: File) => {
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(Boolean)
    if (lines.length === 0) return
    const parseLine = (line: string): string[] => {
      const out: string[] = []
      let cur = ''
      let inQ = false
      for (let i=0;i<line.length;i++) {
        const ch = line[i]
        if (inQ) {
          if (ch === '"') {
            if (line[i+1] === '"') { cur += '"'; i++ } else { inQ = false }
          } else { cur += ch }
        } else {
          if (ch === ',') { out.push(cur); cur = '' }
          else if (ch === '"') { inQ = true }
          else { cur += ch }
        }
      }
      out.push(cur)
      return out
    }
    const headerCols = parseLine(lines[0]).map(s => s.trim()).filter(Boolean)
    if (isWebLimited && headerCols.length > MAX_WEB_COLUMNS) {
      toast.error(`Web limit: CSV has ${headerCols.length} columns; maximum is ${MAX_WEB_COLUMNS}`)
      return
    }
    const newRows: Array<Record<string, any>> = []
    for (let i=1;i<lines.length;i++) {
      const cells = parseLine(lines[i])
      const obj: Record<string, any> = {}
      headerCols.forEach((c, ci) => {
        obj[c] = cells[ci] ?? ''
        if (isWebLimited && typeof obj[c] === 'string' && obj[c].length > MAX_WEB_CELL_LEN) {
          obj[c] = (obj[c] as string).slice(0, MAX_WEB_CELL_LEN)
        }
      })
      newRows.push(obj)
    }
    update({ columns: headerCols, rows: newRows })
  }

  return (
    <div className="p-2 space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <button className="px-2 py-1 border rounded" onClick={addColumn}>Add Column</button>
        <button className="px-2 py-1 border rounded" onClick={addRow}>Add Row</button>
        <button className="px-2 py-1 border rounded" onClick={exportCsv}>Export CSV</button>
        <label className="px-2 py-1 border rounded cursor-pointer">
          Import CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; if (f) importCsv(f) }} />
        </label>
        {isWebLimited && <span className="text-muted-foreground">Web limits: ≤ {MAX_WEB_COLUMNS} columns, ≤ {MAX_WEB_CELL_LEN} chars/cell</span>}
      </div>

      <div className="overflow-auto border rounded">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-accent">
              {columns.map((c, idx) => (
                <th key={`col-${idx}`} className="px-2 py-1 align-top">
                  <div className="flex items-center gap-2">
                    <input className="px-1 py-0.5 border border-input rounded bg-background" value={c} onChange={(e)=>renameColumn(idx, e.target.value)} />
                    <button className="px-1 py-0.5 border rounded" onClick={()=>moveColumn(idx,-1)}>↑</button>
                    <button className="px-1 py-0.5 border rounded" onClick={()=>moveColumn(idx,1)}>↓</button>
                    <button className="px-1 py-0.5 border rounded" onClick={()=>removeColumn(idx)}>Remove</button>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <select className="px-1 py-0.5 border border-input rounded bg-background" value={(types[c]?.type)||'string'} onChange={(e)=>{
                      const t = e.target.value as ColumnType
                      if (t === 'enum') setColumnType(c, { type: 'enum', enum: Array.isArray(types[c]?.enum) ? types[c]!.enum : [] })
                      else setColumnType(c, { type: t })
                    }}>
                      <option value="string">string</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                      <option value="enum">enum</option>
                    </select>
                    {(types[c]?.type) === 'enum' && (
                      <input className="flex-1 px-1 py-0.5 border border-input rounded bg-background" placeholder="enum values (comma separated)" value={(types[c]?.enum||[]).join(', ')} onChange={(e)=>{
                        const list = e.target.value.split(',').map(s=>s.trim()).filter(s=>s.length>0)
                        setColumnType(c, { type: 'enum', enum: list })
                      }} />
                    )}
                  </div>
                </th>
              ))}
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-t">
                {columns.map((c, ci) => {
                  const t = types[c]?.type || 'string'
                  const v = row?.[c]
                  return (
                    <td key={`cell-${ri}-${ci}`} className="px-2 py-1">
                      {t === 'boolean' ? (
                        <label className="inline-flex items-center gap-2">
                          <input type="checkbox" className="rounded" checked={!!v} onChange={(e)=>setCell(ri, c, e.target.checked)} />
                        </label>
                      ) : t === 'number' ? (
                        <input type="number" className="w-full px-1 py-1 border border-input rounded bg-background" value={v ?? ''} onChange={(e)=>setCell(ri, c, e.target.value)} />
                      ) : t === 'enum' ? (
                        <select className="w-full px-1 py-1 border border-input rounded bg-background" value={v ?? ''} onChange={(e)=>setCell(ri, c, e.target.value)}>
                          <option value=""></option>
                          {(types[c]?.enum||[]).map((opt, oi) => (
                            <option key={oi} value={String(opt)}>{String(opt)}</option>
                          ))}
                        </select>
                      ) : (
                        <input type="text" className="w-full px-1 py-1 border border-input rounded bg-background" value={v ?? ''} onChange={(e)=>setCell(ri, c, e.target.value)} />
                      )}
                    </td>
                  )
                })}
                <td className="px-2 py-1 text-right">
                  <button className="px-2 py-1 border rounded" onClick={()=>removeRow(ri)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


