import React, { useEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Save, Plus, Trash2, RefreshCcw, Download, Upload } from 'lucide-react'
import { useProjectStore } from '../../store/projectStore'
import { apiClient } from '../../api/client'
import toast from 'react-hot-toast'

// Admin-only for web; desktop allows local editing freely
const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI

type TemplateItem = { path: string; name: string }

export default function TemplatesSettingsPage() {
  const { currentProject } = useProjectStore()
  const [items, setItems] = useState<TemplateItem[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [desktopDir, setDesktopDir] = useState<string | null>(null)

  const listDesktopTemplates = async (root: string): Promise<TemplateItem[]> => {
    // Recursively list *.md under root
    const results: TemplateItem[] = []
    const walk = async (sub: string) => {
      const dir = `${root.replace(/\\/g,'/')}/${sub}`.replace(/\/+$/,'')
      try {
        const entries = await (window as any).electronAPI.readDirectory(dir)
        for (const ent of entries || []) {
          if (ent.name.startsWith('.')) continue
          const rel = sub ? `${sub}/${ent.name}` : ent.name
          if (ent.type === 'directory') {
            await walk(rel)
          } else if (ent.type === 'file' && ent.name.toLowerCase().endsWith('.md')) {
            results.push({ path: rel.replace(/\\/g,'/'), name: ent.name })
          }
        }
      } catch {}
    }
    await walk('')
    // Stable sort
    results.sort((a,b) => a.path.localeCompare(b.path))
    return results
  }

  const ensureDesktopDefaults = async (base: string) => {
    const root = base.replace(/\\/g,'/')
    const mk = (p: string) => (window as any).electronAPI.createDirectory(p)
    const write = (p: string, t: string) => (window as any).electronAPI.writeFile(p, t)
    const exists = async (p: string) => {
      try { await (window as any).electronAPI.readFile(p); return true } catch { return false }
    }
    await mk(root)
    await mk(`${root}/project`)
    await mk(`${root}/templates`)
    await mk(`${root}/templates/nodes`)
    const fmts = ['markdown','html','pdf','docx','epub','odt']
    for (const f of fmts) await mk(`${root}/templates/compiler/${f}`)
    // README template
    const readmePath = `${root}/project/README.md`
    if (!(await exists(readmePath))) {
      const readme = `# {{ PROJECT_NAME }}\n\nWelcome to your Verbweaver project.\n\n## Getting Started\n\nProject description: {{ PROJECT_DESCRIPTION }}\n\nVerbweaver organizes ideas and tasks as Markdown files under the \`nodes/\` folder. Each node can be a task; task fields live in YAML frontmatter.\n\n`
      await write(readmePath, readme)
    }
    // Node templates defaults
    const emptyNode = `---\ntitle: Empty\ntype: node\ndescription: A blank starting point.\n---\n\n# $title$\n\nStart your content here.\n`
    if (!(await exists(`${root}/templates/nodes/Empty.md`))) await write(`${root}/templates/nodes/Empty.md`, emptyNode)

    // Simple/Academic/Technical-report compiler templates (markdown) with schema-driven variables
    const simpleMd = `---\n` +
`title: $title$\n` +
`author: $author$\n` +
`date: $date$\n` +
`variables:\n` +
`  toc:\n` +
`    type: boolean\n` +
`    description: Include a generated table of contents at the top.\n` +
`nodeVariables:\n` +
`  cvss:\n` +
`    type: number\n` +
`    description: Optional CVSS base score if present on a node's metadata.\n` +
`    path: metadata.cvss\n` +
`---\n\n` +
`# $title$\n\n` +
`$if(toc)$\n` +
`## Table of Contents\n` +
`$toc$\n` +
`$endif$\n\n` +
`$for(nodes)$\n` +
`## $nodes.title$\n\n` +
`$nodes.content$\n\n` +
`$if(nodes.vars)$\n` +
`### Variables\n` +
`$for(nodes.vars)$\n` +
`- $it.key$: $it.value$\n` +
`$endfor$\n` +
`$endif$\n\n` +
`$endfor$\n`

    const academicMd = `---\n` +
`title: $title$\n` +
`author: $author$\n` +
`date: $date$\n` +
`variables:\n` +
`  toc:\n` +
`    type: boolean\n` +
`    description: Include a generated table of contents.\n` +
`  includeMetadata:\n` +
`    type: boolean\n` +
`    description: Show each node's metadata under its content.\n` +
`nodeVariables:\n` +
`  cvss_vector:\n` +
`    type: string\n` +
`    description: Optional CVSS v3 vector from node metadata.\n` +
`    path: metadata.cvss_vector\n` +
`  cvss:\n` +
`    type: number\n` +
`    description: Optional CVSS base score from node metadata.\n` +
`    path: metadata.cvss\n` +
`---\n\n` +
`# $title$\n\n` +
`$if(toc)$\n` +
`## Table of Contents\n` +
`$toc$\n` +
`$endif$\n\n` +
`$for(nodes)$\n` +
`## $nodes.title$\n\n` +
`$nodes.content$\n\n` +
`$if(nodes.vars)$\n` +
`### Variables\n` +
`$for(nodes.vars)$\n` +
`- **$it.key$:** $it.value$\n` +
`$endfor$\n` +
`$endif$\n\n` +
`$if(includeMetadata)$\n` +
`$if(nodes.metadata)$\n` +
`### Metadata\n` +
`$for(nodes.metadata)$\n` +
`- **$it.key$:** $it.value$\n` +
`$endfor$\n` +
`$endif$\n` +
`$endif$\n\n` +
`$if(nodes.attachments)$\n` +
`### Attachments\n` +
`$for(nodes.attachments)$\n` +
`- $it.name$ ($it.size$)\n` +
`$endfor$\n` +
`$endif$\n\n` +
`$endfor$\n`

    const technicalMd = `---\n` +
`title: $title$\n` +
`author: $author$\n` +
`date: $date$\n` +
`summary: $summary$\n` +
`variables:\n` +
`  toc:\n` +
`    type: boolean\n` +
`    description: Include a generated table of contents.\n` +
`  summary:\n` +
`    type: string\n` +
`    description: Executive summary paragraph.\n` +
`  changelog:\n` +
`    type: array\n` +
`    item:\n` +
`      type: object\n` +
`      fields:\n` +
`        date: { type: string }\n` +
`        version: { type: string }\n` +
`        author: { type: string }\n` +
`        note: { type: string }\n` +
`  stakeholders:\n` +
`    type: array\n` +
`    item:\n` +
`      type: object\n` +
`      fields:\n` +
`        name: { type: string }\n` +
`        role: { type: string }\n` +
`        contact: { type: string }\n` +
`  raci:\n` +
`    type: array\n` +
`    item:\n` +
`      type: object\n` +
`      fields:\n` +
`        task: { type: string }\n` +
`        r: { type: string }\n` +
`        a: { type: string }\n` +
`        c: { type: string }\n` +
`        i: { type: string }\n` +
`nodeVariables:\n` +
`  appendix:\n` +
`    type: boolean\n` +
`    label: Appendix\n` +
`    description: Treat this node as an appendix section\n` +
`    path: metadata.appendix\n` +
`    default: false\n` +
`  cvss_vector:\n` +
`    type: string\n` +
`    description: Optional CVSS v3 vector string from node metadata.\n` +
`    path: metadata.cvss_vector\n` +
`  cvss:\n` +
`    type: number\n` +
`    description: Optional CVSS base score from node metadata.\n` +
`    path: metadata.cvss\n` +
`---\n\n` +
`# $title$\n\n` +
`$if(toc)$\n` +
`## Table of Contents\n` +
`$toc$\n` +
`$endif$\n\n` +
`## Executive Summary\n\n` +
`$summary$\n\n` +
`## Document Changelog\n\n` +
`| Date | Version | Author | Change |\n` +
`|------|---------|--------|--------|\n` +
`$for(changelog)$\n` +
`| $it.date$ | $it.version$ | $it.author$ | $it.note$ |\n` +
`$endfor$\n\n` +
`## Stakeholder Registry\n\n` +
`| Name | Role | Contact |\n` +
`|------|------|---------|\n` +
`$for(stakeholders)$\n` +
`| $it.name$ | $it.role$ | $it.contact$ |\n` +
`$endfor$\n\n` +
`## RACI Matrix\n\n` +
`| Task | R | A | C | I |\n` +
`|------|---|---|---|---|\n` +
`$for(raci)$\n` +
`| $it.task$ | $it.r$ | $it.a$ | $it.c$ | $it.i$ |\n` +
`$endfor$\n\n` +
`$for(nodes)$\n` +
`$ifnot(nodes.vars.appendix)$\n` +
`## $nodes.title$\n\n` +
`$nodes.content$\n` +
`$endif$\n` +
`$endfor$\n\n` +
`$if(nodes)$\n` +
`## Appendices\n` +
`$for(nodes)$\n` +
`$if(nodes.vars.appendix)$\n` +
`### $nodes.title$\n\n` +
`$nodes.content$\n` +
`$endif$\n` +
`$endfor$\n` +
`$endif$\n`
    for (const f of fmts) {
      const baseFmt = `${root}/templates/compiler/${f}`
      if (!(await exists(`${baseFmt}/simple.md`))) await write(`${baseFmt}/simple.md`, simpleMd)
      if (!(await exists(`${baseFmt}/academic.md`))) await write(`${baseFmt}/academic.md`, academicMd)
      if (!(await exists(`${baseFmt}/technical-report.md`))) await write(`${baseFmt}/technical-report.md`, technicalMd)
    }
  }

  const loadList = async () => {
    setLoading(true)
    try {
      if (isElectron) {
        let base = await (window as any).electronAPI.getStoreValue('globalTemplatesDir')
        if (!base || base === '/templates' || base === 'templates') {
          // Default to userData/templates
          const userData = (await (window as any).electronAPI.getStoreValue('userDataPath')) || ''
          if (!userData) {
            // As a last resort, do nothing to avoid showing "/templates"
            console.warn('[Templates] Could not resolve userData path; skip default base')
          } else {
            base = `${String(userData).replace(/\\/g,'/')}/templates`
            await (window as any).electronAPI.setStoreValue('globalTemplatesDir', base)
          }
        }
        if (base) {
          setDesktopDir(base)
          await ensureDesktopDefaults(base)
          const files = await listDesktopTemplates(base)
          setItems(files)
        } else {
          setItems([])
        }
      } else {
        const res = await apiClient.get('/templates/global')
        setItems(res.data.templates || [])
      }
    } catch (e) {
      toast.error('Failed to load templates (admin only)')
    } finally {
      setLoading(false)
    }
  }

  const loadFile = async (relPath: string) => {
    setLoading(true)
    try {
      if (isElectron) {
        const base = await (window as any).electronAPI.getStoreValue('globalTemplatesDir')
        if (!base) throw new Error('No desktop templates directory configured')
        const abs = `${base.replace(/\\/g,'/')}/${relPath}`
        const text = await (window as any).electronAPI.readFile(abs)
        setContent(text || '')
        setActivePath(relPath)
        setDirty(false)
      } else {
        const res = await apiClient.get(`/templates/global/${encodeURIComponent(relPath)}`)
        setContent(res.data.content || '')
        setActivePath(relPath)
        setDirty(false)
      }
    } catch (e) {
      toast.error('Failed to load template')
    } finally {
      setLoading(false)
    }
  }

  const saveFile = async () => {
    if (!activePath) return
    setLoading(true)
    try {
      if (isElectron) {
        const base = await (window as any).electronAPI.getStoreValue('globalTemplatesDir')
        if (!base) throw new Error('No desktop templates directory configured')
        const abs = `${base.replace(/\\/g,'/')}/${activePath}`
        await (window as any).electronAPI.createDirectory(abs.split('/').slice(0,-1).join('/'))
        await (window as any).electronAPI.writeFile(abs, content)
        toast.success('Saved')
        setDirty(false)
      } else {
        await apiClient.put(`/templates/global/${encodeURIComponent(activePath)}`, { content })
        toast.success('Saved')
        setDirty(false)
        loadList()
      }
    } catch (e) {
      toast.error('Save failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadList() }, [])

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Templates</h2>
      <p className="text-sm text-muted-foreground mb-2">Global templates used when creating new projects. In the web app, only admins can edit.</p>
      {isElectron && (
        <div className="text-xs bg-accent/40 border border-border rounded p-2 mb-3 flex items-center gap-2">
          <span className="font-medium">Folder:</span>
          <span className="truncate" title={desktopDir || 'Not set'}>{desktopDir || 'Not set'}</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="px-2 py-0.5 border rounded"
              title="Open folder"
              disabled={!desktopDir}
              onClick={async () => {
                if (!desktopDir) return
                const api = (window as any).electronAPI
                try {
                  if (api?.showItemInFolder) {
                    await api.showItemInFolder(desktopDir)
                    return
                  }
                } catch {}
                try {
                  if (api?.openExternal) {
                    const url = `file://${desktopDir.replace(/\\/g,'/')}`
                    await api.openExternal(url)
                    return
                  }
                } catch {}
                try {
                  if (api?.openPath) {
                    await api.openPath(desktopDir)
                    return
                  }
                } catch {}
                toast.error('Unable to open folder')
              }}
            >Open</button>
            <button
              className="px-2 py-0.5 border rounded"
              title="Copy path"
              disabled={!desktopDir}
              onClick={async () => {
                if (!desktopDir) return
                if (navigator?.clipboard?.writeText) {
                  await navigator.clipboard.writeText(desktopDir)
                  toast.success('Path copied to clipboard')
                } else {
                  const ta = document.createElement('textarea')
                  ta.value = desktopDir
                  ta.style.position = 'fixed'
                  ta.style.opacity = '0'
                  document.body.appendChild(ta)
                  ta.focus()
                  ta.select()
                  try { document.execCommand('copy') } catch {}
                  document.body.removeChild(ta)
                  toast.success('Path copied to clipboard')
                }
              }}
            >Copy</button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-4 border rounded p-2 h-[60vh] overflow-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Files</span>
            <div className="flex items-center gap-2">
              {isElectron && (
                <button className="text-xs px-2 py-1 border rounded" title="Choose a folder on your computer where Verbweaver will store and read global templates for desktop. These templates are used to seed new projects." onClick={async () => {
                  const sel = await (window as any).electronAPI.openDirectory()
                  if (sel && sel.filePaths && sel.filePaths[0]) {
                    const base = sel.filePaths[0]
                    await (window as any).electronAPI.setStoreValue('globalTemplatesDir', base)
                    setDesktopDir(base)
                    await ensureDesktopDefaults(base)
                    await loadList()
                  }
                }}>Choose Folder</button>
              )}
              <button className="text-xs px-2 py-1 border rounded" onClick={loadList}><RefreshCcw className="w-3 h-3 inline"/> Refresh</button>
            </div>
          </div>
          <ul className="text-sm">
            {items.map((t) => (
              <li key={t.path}>
                <button className={`w-full text-left px-2 py-1 rounded hover:bg-accent ${activePath===t.path?'bg-accent':''}`} onClick={() => loadFile(t.path)}>
                  {t.path}
                </button>
              </li>
            ))}
            {items.length === 0 && (
              <li className="text-xs text-muted-foreground px-2 py-1">{isElectron ? 'No templates found. Use Choose Folder to select or create a templates directory.' : 'No templates available.'}</li>
            )}
          </ul>
        </div>
        <div className="col-span-8 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <button className="px-2 py-1 border rounded disabled:opacity-50" disabled={!activePath || !dirty} onClick={saveFile}><Save className="w-4 h-4 inline"/> Save</button>
            <div className="ml-auto text-xs text-muted-foreground">{activePath || 'Select a template'}</div>
          </div>
          <div className="flex-1 border rounded overflow-hidden">
            <Editor
              value={content}
              onChange={(v) => { setContent(v || ''); setDirty(true) }}
              language="markdown"
              theme="vs-dark"
              options={{ wordWrap: 'on', minimap: { enabled: false } }}
            />
          </div>
        </div>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        Tips:
        <ul className="list-disc ml-4">
          <li>Project README supports {'{{ PROJECT_NAME }}'} and {'{{ PROJECT_DESCRIPTION }}'} variables.</li>
          <li>Compiler templates use Pandoc variables and conditionals.</li>
        </ul>
      </div>
    </div>
  )
}


