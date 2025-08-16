import { useState, useEffect, useCallback } from 'react'
import { FileDown, FileText, Book, Package, Globe, Code, Loader2, FileType, AlertTriangle } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { EXPORT_FORMATS } from '@verbweaver/shared'
import toast from 'react-hot-toast'
import { api } from '../services/auth'
import { compilerApi } from '../api/compilerApi'
import NodeSelector from '../components/NodeSelector'
import NodeOrderingPanel from '../components/NodeOrderingPanel'
import { editorApi } from '../api/editorApi'
import Tooltip from '../components/ui/Tooltip'

interface ExportFormat {
  id: string
  name: string
  icon: any
  description: string
  extension: string
}

const exportFormats: ExportFormat[] = [
  {
    id: 'markdown',
    name: 'Markdown',
    icon: Code,
    description: 'Plain text with formatting',
    extension: '.md'
  },
  {
    id: 'html',
    name: 'HTML',
    icon: Globe,
    description: 'Web page format',
    extension: '.html'
  },
  {
    id: 'pdf',
    name: 'PDF',
    icon: FileText,
    description: 'Portable Document Format',
    extension: '.pdf'
  },
  {
    id: 'docx',
    name: 'Word Document',
    icon: FileText,
    description: 'Microsoft Word format',
    extension: '.docx'
  },
  {
    id: 'odt',
    name: 'OpenDocument',
    icon: FileText,
    description: 'Open Document Text',
    extension: '.odt'
  },
  {
    id: 'epub',
    name: 'EPUB',
    icon: Book,
    description: 'Electronic publication',
    extension: '.epub'
  },
  {
    id: 'mobi',
    name: 'MOBI',
    icon: Book,
    description: 'Kindle format',
    extension: '.mobi'
  }
]

interface CompileOptions {
  includeMetadata: boolean
  includeToc: boolean
  includeIndex: boolean
  includeBibliography: boolean
  embedUploadedFiles: boolean
  pageSize: 'A4' | 'Letter' | 'A5'
  fontSize: 'small' | 'medium' | 'large'
  margins: 'narrow' | 'normal' | 'wide'
  lineSpacing: 'single' | '1.5' | 'double'
}

interface Template {
  name: string
  path: string
  format: string
}

interface CustomVariable {
  name: string
  value: string
}

function CompilerView() {
  const { currentProject } = useProjectStore()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [selectedNodes, setSelectedNodes] = useState<string[]>([])
  const [dependencies, setDependencies] = useState<Array<{
    name: string;
    available: boolean;
    version?: string;
    installUrl?: string;
    installInstructions?: string;
  }>>([])
  const [checkingDependencies, setCheckingDependencies] = useState(false)
  const [orderedNodes, setOrderedNodes] = useState<string[]>([])
  const [selectedFormat, setSelectedFormat] = useState<string>('markdown')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [availableTemplates, setAvailableTemplates] = useState<Template[]>([])
  const [customVariables, setCustomVariables] = useState<CustomVariable[]>([])
  const [templateSchema, setTemplateSchema] = useState<any | null>(null)
  const [nodeVariables, setNodeVariables] = useState<Record<string, Record<string, any>>>({})
  const [advancedMode, setAdvancedMode] = useState<boolean>(false)
  const [isPrefillingNodeVars, setIsPrefillingNodeVars] = useState<boolean>(false)
  const [docVars, setDocVars] = useState<Record<string, any>>({})
  const [docVarErrors, setDocVarErrors] = useState<Record<string, string>>({})
  const [templateMessages, setTemplateMessages] = useState<string[]>([])
  const [isCompiling, setIsCompiling] = useState(false)
  const [compileProgress, setCompileProgress] = useState(0)
  const [options, setOptions] = useState<CompileOptions>({
    includeMetadata: true,
    includeToc: true,
    includeIndex: false,
    includeBibliography: false,
    embedUploadedFiles: true,
    pageSize: 'A4',
    fontSize: 'medium',
    margins: 'normal',
    lineSpacing: '1.5'
  })

  // Stable callbacks to avoid re-running child effects on every render
  const handleOrderChange = useCallback((paths: string[]) => {
    setOrderedNodes(paths)
  }, [])

  const handleRemoveNodes = useCallback((removed: string[]) => {
    if (removed.length === 0) return
    setSelectedNodes(prev => prev.filter(p => !removed.includes(p)))
  }, [])

  useEffect(() => {
    if (currentProject) {
      setTitle(currentProject.name)
    }
  }, [currentProject])

  // Load templates when format changes
  useEffect(() => {
    if (currentProject) {
      loadTemplates(selectedFormat)
    }
  }, [currentProject, selectedFormat])

  // Check dependencies on mount (desktop only)
  useEffect(() => {
    const checkDependencies = async () => {
      const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined;
      if (isElectron) {
        try {
          setCheckingDependencies(true);
          const deps = await (window as any).electronAPI.checkDependencies();
          setDependencies(deps);
        } catch (error) {
          console.error('Failed to check dependencies:', error);
        } finally {
          setCheckingDependencies(false);
        }
      }
    };
    
    checkDependencies();
  }, []);

  const loadTemplates = async (format: string) => {
    if (!currentProject) return
    
    try {
      const templates = await compilerApi.getTemplates(currentProject.id, format)
      setAvailableTemplates(templates)
      
      // Reset template selection if current template is not available for this format
      if (selectedTemplate && !templates.find(t => t.path === selectedTemplate)) {
        setSelectedTemplate('')
        setCustomVariables([])
      }
    } catch (error) {
      console.error('Failed to load templates:', error)
    }
  }

  const handleTemplateChange = async (templatePath: string) => {
    setSelectedTemplate(templatePath)
    
    if (templatePath && currentProject) {
      try {
        const templateContent: any = await compilerApi.getTemplateContent(currentProject.id, templatePath)
        const schema = (templateContent && (templateContent as any).schema) || null
        setTemplateSchema(schema)
        setTemplateMessages(Array.isArray((templateContent as any).messages) ? (templateContent as any).messages : [])
        if (templateContent.custom_variables.length > 0) {
          setCustomVariables(
            templateContent.custom_variables.map((name: string) => ({ name, value: '' }))
          )
        } else {
          setCustomVariables([])
        }
        // Initialize docVars from schema.variables
        if (schema && schema.variables) {
          const initDocVars: Record<string, any> = {}
          Object.keys(schema.variables).forEach((k) => {
            const def = schema.variables[k] || {}
            if (def.type === 'array') initDocVars[k] = Array.isArray(def.default) ? [...def.default] : []
            else if (def.type === 'number') initDocVars[k] = typeof def.default === 'number' ? def.default : ''
            else if (def.type === 'boolean') initDocVars[k] = typeof def.default === 'boolean' ? def.default : false
            else initDocVars[k] = def.default ?? ''
          })
          setDocVars(initDocVars)
        } else {
          setDocVars({})
        }
        // Initialize nodeVariables grid from schema.nodeVariables if present
        const nv = ((templateContent as any).schema && (templateContent as any).schema.nodeVariables) || {}
        if (Object.keys(nv).length > 0 && orderedNodes.length > 0) {
          const init: Record<string, Record<string, any>> = {}
          for (const p of orderedNodes) init[p] = {}
          setNodeVariables(init)
        } else {
          setNodeVariables({})
        }
      } catch (error) {
        console.error('Failed to load template content:', error)
        setCustomVariables([])
        setTemplateSchema(null)
      }
    } else {
      setCustomVariables([])
      setTemplateSchema(null)
      setTemplateMessages([])
      setNodeVariables({})
      setDocVars({})
    }
  }

  // Prefill nodeVariables from node frontmatter based on schema.nodeVariables.path
  useEffect(() => {
    const prefill = async () => {
      if (!currentProject || !templateSchema || !templateSchema.nodeVariables) return
      const nvDefs = templateSchema.nodeVariables as Record<string, any>
      const varNames = Object.keys(nvDefs)
      if (varNames.length === 0 || orderedNodes.length === 0) return
      try {
        setIsPrefillingNodeVars(true)
        const updates: Record<string, Record<string, any>> = { ...(nodeVariables || {}) }

        // Build a best-effort resolver over the nodes/ tree to handle minor path mismatches
        const normalize = (s: string) => s.replace(/\\/g, '/');
        const slugify = (name: string) => {
          const idx = name.lastIndexOf('.')
          const base = idx >= 0 ? name.slice(0, idx) : name
          const ext = idx >= 0 ? name.slice(idx) : ''
          const s = base.toLowerCase().replace(/[ _]+/g, '-').replace(/-+/g, '-')
          return `${s}${ext.toLowerCase()}`
        }
        const flatten = (items: any[], prefix: string): string[] => {
          const out: string[] = []
          for (const it of items || []) {
            const rel = prefix ? `${prefix}/${it.name}` : it.name
            if (it.type === 'directory') out.push(...flatten(it.children || [], rel))
            else if (it.type === 'file') out.push(rel)
          }
          return out
        }
        let indexBySlug: Record<string, string> = {}
        try {
          const tree = await editorApi.getFileTree(currentProject.id, 'nodes')
          const all = flatten(tree, '').map(p => normalize(`nodes/${p}`))
          indexBySlug = Object.fromEntries(all.map(p => [slugify(p.split('/').pop() || p), p]))
        } catch {}

        await Promise.all(orderedNodes.map(async (p) => {
          const tryRead = async (pathAttempt: string) => {
            const file = await editorApi.getFile(currentProject.id, pathAttempt)
            const meta = file?.metadata || {}
            updates[p] = updates[p] || {}
            for (const k of varNames) {
              if (updates[p][k] !== undefined && updates[p][k] !== '') continue
              const pathExpr = nvDefs[k]?.path as string | undefined
              if (!pathExpr) continue
              const parts = pathExpr.split('.')
              let cur: any = meta
              for (const part of parts) { if (cur && typeof cur === 'object' && part in cur) cur = cur[part]; else { cur = undefined; break } }
              if (cur !== undefined) updates[p][k] = cur
            }
          }
          try {
            await tryRead(normalize(p))
          } catch {
            // Fallback by slug
            const name = (normalize(p).split('/').pop() || '').trim()
            const candidate = indexBySlug[slugify(name)]
            if (candidate) {
              try { await tryRead(candidate) } catch {}
            }
          }
        }))
        setNodeVariables(updates)
      } finally {
        setIsPrefillingNodeVars(false)
      }
    }
    prefill()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, JSON.stringify(templateSchema?.nodeVariables || {}), JSON.stringify(orderedNodes)])

  // CSV helpers for per-node grid
  const exportNodeVarsCsv = () => {
    if (!templateSchema || !templateSchema.nodeVariables) return
    const headers = ['node', ...Object.keys(templateSchema.nodeVariables)]
    const rows = orderedNodes.map(p => {
      const rowVals = [p, ...Object.keys(templateSchema.nodeVariables).map(k => {
        const v = nodeVariables[p]?.[k]
        if (v === undefined || v === null) return ''
        const s = String(v)
        return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g,'""') + '"' : s
      })]
      return rowVals.join(',')
    })
    const csv = headers.join(',') + '\n' + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'node-variables.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const importNodeVarsCsv = async (file: File) => {
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(Boolean)
    if (lines.length === 0) return
    const header = parseCsvLine(lines[0])
    const nodeIdx = header.indexOf('node')
    if (nodeIdx === -1) return toast.error('CSV must include a "node" column')
    const varHeaders = header.filter(h => h !== 'node')
    const updates: Record<string, Record<string, any>> = { ...(nodeVariables || {}) }
    for (let i=1;i<lines.length;i++) {
      const cols = parseCsvLine(lines[i])
      const nodePath = cols[nodeIdx]
      if (!nodePath) continue
      updates[nodePath] = updates[nodePath] || {}
      varHeaders.forEach((vh) => {
        const idx = header.indexOf(vh)
        if (idx >= 0 && cols[idx] !== undefined) updates[nodePath][vh] = cols[idx]
      })
    }
    setNodeVariables(updates)
  }

  function parseCsvLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i=0;i<line.length;i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"') {
          if (line[i+1] === '"') { current += '"'; i++ } else { inQuotes = false }
        } else { current += ch }
      } else {
        if (ch === ',') { result.push(current); current = '' }
        else if (ch === '"') { inQuotes = true }
        else { current += ch }
      }
    }
    result.push(current)
    return result
  }

  // Validation for schema-driven document variables
  function validateDocVars(schema: any, values: Record<string, any>): Record<string, string> {
    const errors: Record<string, string> = {}
    if (!schema || !schema.variables) return errors
    Object.entries<any>(schema.variables).forEach(([key, def]) => {
      const v = values[key]
      if (def?.required && (v === undefined || v === '' || v === null || (Array.isArray(v) && v.length === 0))) {
        errors[key] = 'This field is required.'
        return
      }
      if (def?.type === 'number') {
        if (v !== '' && v !== undefined) {
          const n = Number(v)
          if (Number.isNaN(n)) errors[key] = 'Must be a number.'
          if (errors[key]) return
          if (typeof def.min === 'number' && n < def.min) errors[key] = `Must be ≥ ${def.min}.`
          if (typeof def.max === 'number' && n > def.max) errors[key] = `Must be ≤ ${def.max}.`
        }
      }
      if (Array.isArray(def?.enum)) {
        if (v !== '' && v !== undefined && !def.enum.includes(v)) {
          errors[key] = 'Invalid value.'
        }
      }
      if (def?.type === 'array' && def?.item?.type === 'object') {
        const rows = Array.isArray(v) ? v : []
        const fields = Object.keys(def.item.fields || {})
        rows.forEach((row: any, idx: number) => {
          fields.forEach((f) => {
            const cell = row?.[f]
            const req = def.item.fields[f]?.required
            if (req && (cell === undefined || cell === '')) {
              errors[key] = `Row ${idx + 1}: ${f} is required.`
            }
          })
        })
      }
    })
    return errors
  }

  useEffect(() => {
    setDocVarErrors(validateDocVars(templateSchema, docVars))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(docVars), JSON.stringify(templateSchema?.variables || {})])

  // Helpers for schema-driven document array (object) editors
  function exportDocArrayCsv(varName: string) {
    if (!templateSchema?.variables?.[varName]) return
    const def = templateSchema.variables[varName]
    if (!(def?.type === 'array' && def?.item?.type === 'object')) return
    const fields: string[] = Object.keys(def.item.fields || {})
    const headers = fields
    const rows = Array.isArray(docVars[varName]) ? docVars[varName] : []
    const dataRows = rows.map((row: any) => fields.map((f) => {
      const v = row?.[f]
      if (v === undefined || v === null) return ''
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g,'""') + '"' : s
    }).join(','))
    const csv = headers.join(',') + '\n' + dataRows.join('\n')
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

  async function importDocArrayCsv(varName: string, file: File) {
    if (!templateSchema?.variables?.[varName]) return
    const def = templateSchema.variables[varName]
    if (!(def?.type === 'array' && def?.item?.type === 'object')) return
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(Boolean)
    if (lines.length === 0) return
    const header = parseCsvLine(lines[0])
    const fields: string[] = Object.keys(def.item.fields || {})
    // Map header names to field keys; allow label match or key match
    const mapIdx: number[] = fields.map((f) => {
      const lbl = def.item.fields[f]?.label
      let idx = header.indexOf(f)
      if (idx === -1 && lbl) idx = header.indexOf(String(lbl))
      return idx
    })
    const rows: any[] = []
    for (let i=1;i<lines.length;i++) {
      const cols = parseCsvLine(lines[i])
      const obj: any = {}
      fields.forEach((f, fi) => {
        const idx = mapIdx[fi]
        if (idx >= 0 && cols[idx] !== undefined) obj[f] = cols[idx]
      })
      rows.push(obj)
    }
    setDocVars(prev => ({ ...prev, [varName]: rows }))
  }

  function addDocArrayRow(varName: string) {
    const def = templateSchema?.variables?.[varName]
    const fields: string[] = Object.keys(def?.item?.fields || {})
    const empty: any = {}
    fields.forEach(f => empty[f] = '')
    const current = Array.isArray(docVars[varName]) ? docVars[varName] : []
    setDocVars(prev => ({ ...prev, [varName]: [...current, empty] }))
  }

  function removeDocArrayRow(varName: string, index: number) {
    const current = Array.isArray(docVars[varName]) ? [...docVars[varName]] : []
    current.splice(index, 1)
    setDocVars(prev => ({ ...prev, [varName]: current }))
  }

  // Small badge renderer
  function Badges({ def }: { def: any }) {
    const badges: string[] = []
    if (def?.compute) badges.push('computed')
    if (def?.required) badges.push('required')
    if (Array.isArray(def?.enum)) badges.push('enum')
    return (
      <span className="ml-2 space-x-1">
        {badges.map((b) => {
          const help = b === 'computed' ? 'Value is derived at compile time' : b === 'required' ? 'This field must be provided' : b === 'enum' ? 'Choose from predefined options' : ''
          return (
            <Tooltip key={b} content={help}>
              <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground border border-border align-middle">
                {b}
              </span>
            </Tooltip>
          )
        })}
      </span>
    )
  }

  const handleCustomVariableChange = (index: number, value: string) => {
    const newVariables = [...customVariables]
    newVariables[index].value = value
    setCustomVariables(newVariables)
  }

  const handleCompile = async () => {
    if (!currentProject) return
    
    if (orderedNodes.length === 0) {
      toast.error('Please select files to export')
      return
    }

    setIsCompiling(true)
    setCompileProgress(0)

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setCompileProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return prev
          }
          return prev + 10
        })
      }, 500)

      // Prepare custom variables (schema-driven docVars merged with legacy inputs)
      const customVars: Record<string, any> = {}
      // 1) Schema variables: normalize by type
      if (templateSchema && templateSchema.variables) {
        Object.entries<any>(templateSchema.variables).forEach(([key, def]) => {
          let v = docVars[key]
          if (def?.type === 'number' && v !== '' && v !== undefined) {
            const n = Number(v); if (!Number.isNaN(n)) v = n
          }
          if (v !== undefined && v !== '') customVars[key] = v
        })
      }
      // 2) Legacy customVariables (fallback/extra), with optional JSON parsing
      customVariables.forEach(variable => {
        if (variable.value && variable.value.trim()) {
          const parsed = (() => { if (!advancedMode) return variable.value; try { return JSON.parse(variable.value) } catch { return variable.value } })()
          customVars[variable.name] = parsed
        }
      })

      const response = await api.post(`/compiler/${currentProject.id}/compile`, {
        nodes: orderedNodes,
        format: selectedFormat,
        template: selectedTemplate || undefined,
        custom_variables: Object.keys(customVars).length > 0 ? customVars : undefined,
        node_variables: Object.keys(nodeVariables).length > 0 ? nodeVariables : undefined,
        options: {
          title,
          author,
          ...options
        }
      }, {
        responseType: 'blob'
      })

      clearInterval(progressInterval)
      setCompileProgress(100)

      // Download the file
      const blob = new Blob([response.data])
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      const format = exportFormats.find(f => f.id === selectedFormat)
      a.href = url
      a.download = `${title || 'document'}${format?.extension || '.md'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      setTimeout(() => {
        setIsCompiling(false)
        setCompileProgress(0)
      }, 1000)

      toast.success('Export completed successfully')
    } catch (error) {
      console.error('Compile error:', error)
      setIsCompiling(false)
      setCompileProgress(0)
      toast.error('Failed to compile document')
    }
  }

  const updateOption = <K extends keyof CompileOptions>(key: K, value: CompileOptions[K]) => {
    setOptions(prev => ({ ...prev, [key]: value }))
  }

  if (!currentProject) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">No Project Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a project to export documents
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex bg-background">
      {/* Left Panel - File Selection */}
          <div className="w-1/3 border-r border-border">
        <NodeSelector
          selectedNodes={selectedNodes}
          onSelectionChange={setSelectedNodes}
          showFolders={false}
        />
      </div>

      {/* Middle Panel - File Ordering */}
          <div className="w-1/3 border-r border-border">
        <NodeOrderingPanel
          selectedNodes={selectedNodes}
          onOrderChange={handleOrderChange}
          onRemoveNodes={handleRemoveNodes}
        />
      </div>

      {/* Right Panel - Export Settings */}
      <div className="flex-1 flex flex-col">
        <div className="p-6 space-y-6 overflow-y-auto h-full">
          <div>
            <h1 className="text-2xl font-bold mb-2">Export Document</h1>
            <p className="text-muted-foreground">
              Configure and export your project as a document
            </p>
          </div>

          {/* Dependency Warning */}
          {dependencies.some(dep => !dep.available) && (
            <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-1">
                    Missing Dependencies
                  </h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                    Some export formats require additional software to be installed on your system.
                  </p>
                  <div className="space-y-2">
                    {dependencies.filter(dep => !dep.available).map((dep) => (
                      <div key={dep.name} className="flex items-center justify-between">
                        <span className="text-sm font-medium">{dep.name}</span>
                        {dep.installUrl && (
                          <button
                            onClick={() => {
                              const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined;
                              if (isElectron) {
                                (window as any).electronAPI.openInstallUrl(dep.installUrl!);
                              } else {
                                window.open(dep.installUrl, '_blank');
                              }
                            }}
                            className="text-xs text-amber-700 dark:text-amber-300 hover:underline"
                          >
                            Install
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Document Info */}
          <div className="space-y-4">
            <h3 className="font-semibold">Document Information</h3>
            
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background"
                placeholder="Document title"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Author</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background"
                placeholder="Author name"
              />
            </div>
          </div>

          {/* Export Format */}
          <div className="space-y-4">
            <h3 className="font-semibold">Export Format</h3>
            
            <div className="grid grid-cols-2 gap-3">
              {exportFormats.map((format) => (
                <button
                  key={format.id}
                  onClick={() => setSelectedFormat(format.id)}
                  className={`flex items-center gap-3 p-3 border rounded-md transition-colors ${
                    selectedFormat === format.id
                      ? 'border-primary bg-primary/10'
                      : 'border-input hover:bg-accent'
                  }`}
                >
                  <format.icon className="w-5 h-5" />
                  <div className="text-left">
                    <div className="text-sm font-medium">{format.name}</div>
                    <div className="text-xs text-muted-foreground">{format.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Template Selection */}
          {availableTemplates.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Template</h3>
              
              <div className="space-y-3">
                <label className="block text-sm font-medium mb-1">Select Template</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                >
                  <option value="">No template (use default)</option>
                  {availableTemplates.map((template) => (
                    <option key={template.path} value={template.path}>
                      {template.name}
                    </option>
                  ))}
                </select>

                {/* Surface validation warnings from schema validation */}
                {templateMessages.length > 0 && (
                  <div className="text-xs text-amber-600 bg-amber-100/50 border border-amber-200 rounded p-2 space-y-1">
                    <div className="font-medium">Template validation</div>
                    <ul className="list-disc ml-5">
                      {templateMessages.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Custom Variables */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Custom Variables</h4>
                {/* Schema-driven document variables */}
                {templateSchema && templateSchema.variables && (
                  <div className="space-y-2">
                    {Object.entries<any>(templateSchema.variables).map(([key, def]) => (
                      <div key={key} className="space-y-1">
                        <div className="text-xs font-medium flex items-center">
                          <span>{def?.label || key}</span><Badges def={def} />
                        </div>
                        {def?.type === 'number' ? (
                          <div>
                            <input type="number" className={`w-full px-2 py-1 border rounded bg-background text-sm ${docVarErrors[key] ? 'border-destructive' : 'border-input'}`} value={docVars[key] ?? ''} onChange={(e)=>setDocVars(prev=>({ ...prev, [key]: e.target.value }))} />
                            {docVarErrors[key] && <div className="text-[10px] text-destructive mt-1">{docVarErrors[key]}</div>}
                          </div>
                        ) : def?.type === 'boolean' ? (
                          <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="rounded" checked={!!docVars[key]} onChange={(e)=>setDocVars(prev=>({ ...prev, [key]: e.target.checked }))} /> <span>{def?.description || ''}</span></label>
                        ) : def?.type === 'array' && def?.item?.type === 'object' ? (
                          <div className="border rounded">
                            <div className="flex items-center gap-2 p-2 text-xs">
                              <button className="px-2 py-1 border rounded" onClick={()=>addDocArrayRow(key)}>Add Row</button>
                              <button className="px-2 py-1 border rounded" onClick={()=>exportDocArrayCsv(key)}>Export CSV</button>
                              <label className="px-2 py-1 border rounded cursor-pointer">
                                Import CSV
                                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; if (f) importDocArrayCsv(key, f) }} />
                              </label>
                            </div>
                            <div className="overflow-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-accent">
                                    {Object.keys(def.item.fields || {}).map((f: string) => (
                                      <th key={f} className="text-left px-2 py-1">{def.item.fields[f]?.label || f}</th>
                                    ))}
                                    <th className="px-2 py-1" />
                                  </tr>
                                </thead>
                                <tbody>
                                  {(Array.isArray(docVars[key]) ? docVars[key] : []).map((row: any, idx: number) => (
                                    <tr key={idx} className="border-t">
                                      {Object.keys(def.item.fields || {}).map((f: string) => (
                                        <td key={f} className="px-2 py-1">
                                          <input type="text" className="w-full px-1 py-1 border border-input rounded bg-background" value={row?.[f] ?? ''} onChange={(e)=>{
                                            const next = Array.isArray(docVars[key]) ? [...docVars[key]] : []
                                            const obj = { ...(next[idx] || {}) }
                                            obj[f] = e.target.value
                                            next[idx] = obj
                                            setDocVars(prev=>({ ...prev, [key]: next }))
                                          }} />
                                        </td>
                                      ))}
                                      <td className="px-2 py-1 text-right">
                                        <button className="px-2 py-1 border rounded" onClick={()=>removeDocArrayRow(key, idx)}>Remove</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {docVarErrors[key] && <div className="text-[10px] text-destructive mt-1 px-2">{docVarErrors[key]}</div>}
                          </div>
                        ) : (
                          <div>
                            {Array.isArray(def?.enum) ? (
                              <select className={`w-full px-2 py-1 border rounded bg-background text-sm ${docVarErrors[key] ? 'border-destructive' : 'border-input'}`} value={docVars[key] ?? ''} onChange={(e)=>setDocVars(prev=>({ ...prev, [key]: e.target.value }))}>
                                <option value="">(select)</option>
                                {def.enum.map((opt: any) => (
                                  <option key={String(opt)} value={String(opt)}>{String(opt)}</option>
                                ))}
                              </select>
                            ) : (
                              <input type="text" className={`w-full px-2 py-1 border rounded bg-background text-sm ${docVarErrors[key] ? 'border-destructive' : 'border-input'}`} value={docVars[key] ?? ''} onChange={(e)=>setDocVars(prev=>({ ...prev, [key]: e.target.value }))} />
                            )}
                            {docVarErrors[key] && <div className="text-[10px] text-destructive mt-1">{docVarErrors[key]}</div>}
                          </div>
                        )}
                        {def?.description && <div className="text-[10px] text-muted-foreground" title={def.description}>{def.description}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Legacy ad-hoc variables + Advanced JSON mode */}
                {customVariables.length > 0 && (
                  <div className="space-y-2 mt-2">
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" className="rounded" checked={advancedMode} onChange={(e)=>setAdvancedMode(e.target.checked)} />
                      Advanced (JSON allowed)
                    </label>
                    {customVariables.map((variable, index) => (
                      <div key={index}>
                        <label className="block text-xs font-medium mb-1">{variable.name}</label>
                        <input type="text" value={variable.value} onChange={(e) => handleCustomVariableChange(index, e.target.value)} className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm" placeholder={`Enter value for ${variable.name}`} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Options */}
          {/* Node Variables Grid (schema-driven minimal) */}
          {templateSchema && templateSchema.nodeVariables && Object.keys(templateSchema.nodeVariables).length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold">Per-Node Variables</h3>
              <div className="flex gap-2 text-xs">
                <button className="px-2 py-1 border rounded" onClick={exportNodeVarsCsv}>Export CSV</button>
                <label className="px-2 py-1 border rounded cursor-pointer">
                  Import CSV
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; if (f) importNodeVarsCsv(f) }} />
                </label>
                {isPrefillingNodeVars && <span className="text-muted-foreground">Prefilling from frontmatter…</span>}
              </div>
              <div className="overflow-auto border rounded">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-accent">
                      <th className="text-left px-2 py-1">Node</th>
                      {Object.keys(templateSchema.nodeVariables).map((k) => (
                      <th key={k} className="text-left px-2 py-1">
                        <div className="flex items-center">
                          <span>{templateSchema.nodeVariables[k]?.label || k}</span>
                          <Badges def={templateSchema.nodeVariables[k]} />
                        </div>
                      </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orderedNodes.map((p) => (
                      <tr key={p} className="border-t">
                        <td className="px-2 py-1 align-top text-xs break-all">{p}</td>
                        {Object.keys(templateSchema.nodeVariables).map((k) => (
                          <td key={k} className="px-2 py-1">
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-input rounded bg-background text-xs"
                              value={nodeVariables[p]?.[k] ?? ''}
                              onChange={(e) => setNodeVariables(prev => ({
                                ...prev,
                                [p]: { ...(prev[p]||{}), [k]: e.target.value }
                              }))}
                              placeholder={templateSchema.nodeVariables[k]?.path ? `from ${templateSchema.nodeVariables[k].path}` : ''}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">Leave blank to use values from node frontmatter if defined by the template schema.</p>
            </div>
          )}

          {/* Options */}
          <div className="space-y-4">
            <h3 className="font-semibold">Options</h3>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={options.includeMetadata}
                onChange={(e) => updateOption('includeMetadata', e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Include metadata</span>
            </label>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={options.includeToc}
                onChange={(e) => updateOption('includeToc', e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Include table of contents</span>
            </label>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={options.embedUploadedFiles}
                onChange={(e) => updateOption('embedUploadedFiles', e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Embed uploaded files (if supported by format)</span>
            </label>
          </div>

          {/* Compile Button and Progress */}
          <div className="space-y-4">
            <button
              onClick={handleCompile}
              disabled={isCompiling || orderedNodes.length === 0}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
            >
              {isCompiling ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Compiling...
                </>
              ) : (
                <>
                  <FileDown className="h-5 w-5" />
                  Compile and Download
                </>
              )}
            </button>

            {isCompiling && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{compileProgress}%</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${compileProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default CompilerView