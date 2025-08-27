import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { Save, FileText, Plus, Minus, X, Eye, HelpCircle, Trash2, Paperclip, ChevronDown, ChevronRight, Link as LinkIcon, Type, Copy, Unlink, ListTodo } from 'lucide-react'
import { editorApi } from '../api/editorApi'
import { useProjectStore } from '../store/projectStore'
import { useEditorStore } from '../store/editorStore'
import { useThemeStore } from '../store/themeStore'
import { useTabStore } from '../store/tabStore'
import EditorSidebar from '../components/editor/EditorSidebar'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import toast from 'react-hot-toast'
import { EDITOR_DEFAULT_FONT_SIZE, STORAGE_KEYS } from '@verbweaver/shared'
import ConfirmDialog from '../components/ConfirmDialog'
import { useNodeStore } from '../store/nodeStore'
import { FileStorage, StoredFile } from '../utils/fileStorage'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import SharedCreateLinkModal from '../components/common/CreateLinkModal'

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

function EditorView() {
  const { nodeId, filePath } = useParams()
  const navigate = useNavigate()
  const { currentProject, currentProjectPath } = useProjectStore()
  const { theme } = useThemeStore()
  const { deleteNode } = useNodeStore()
  const { 
    currentFile, 
    openFiles, 
    loadFile, 
    saveFile, 
    closeFile,
    updateFileContent 
  } = useEditorStore()
  const { updateTab, findEditorTab } = useTabStore()
  
  const [content, setContent] = useState('')
  const [isModified, setIsModified] = useState(false)
  const [fontSize, setFontSize] = useState(EDITOR_DEFAULT_FONT_SIZE)
  const [isPreview, setIsPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [localFilePath, setLocalFilePath] = useState<string | null>(null)
  const [localFileName, setLocalFileName] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<{ open: boolean }>({ open: false })
  const [attachOpen, setAttachOpen] = useState(false)
  const [trackingBusy, setTrackingBusy] = useState(false)
  const [navConfirmOpen, setNavConfirmOpen] = useState(false)
  const [navTargetPath, setNavTargetPath] = useState<string | null>(null)
  const [removeLinkOpen, setRemoveLinkOpen] = useState(false)
  const [removeLinkTarget, setRemoveLinkTarget] = useState<string | null>(null)
  const [removeLinksOpen, setRemoveLinksOpen] = useState(false)
  const [removeLinksSelected, setRemoveLinksSelected] = useState<Set<string>>(new Set())
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const decorationIdsRef = useRef<string[]>([])
  const decorationHrefMapRef = useRef<Map<string, string>>(new Map())
  const updateLinkDecorationsRef = useRef<null | (() => void)>(null)
  const linkMouseHandlerRef = useRef<any>(null)
  // Refs to avoid stale closures inside Monaco event handlers
  const resolvedNodePathRef = useRef<string | null>(null)
  const isModifiedRef = useRef<boolean>(false)
  const pendingAnchorRef = useRef<string | null>(null)
  // Defer assignments to avoid temporal dead zone; effects below are defined after variables
  const navigateToRelRef = useRef<(p: string) => void>()
  const scheduleDecorationRefresh = useCallback(() => {
    // Immediate attempt
    try { updateLinkDecorationsRef.current?.() } catch {}
    // Re-attempt on next tick
    setTimeout(() => {
      try { updateLinkDecorationsRef.current?.() } catch {}
    }, 50)
  }, [])
  const [linksExpanded, setLinksExpanded] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EDITOR_LINKS_EXPANDED)
      return raw === 'true'
    } catch { return false }
  })
  const [createLinkOpen, setCreateLinkOpen] = useState(false)

  // Robust YAML frontmatter detection (handles BOM and leading blank lines)
  const FRONTMATTER_RE = /^\uFEFF?(?:\s*\r?\n)*---\s*[\r\n][\s\S]*?[\r\n]---\s*(?:[\r\n]|$)/
  // Keep the latest detected frontmatter so we can re-inject it when hiding metadata during edits
  const frontmatterRef = useRef<string>('')
  useEffect(() => {
    try {
      const match = (content || '').match(FRONTMATTER_RE)
      frontmatterRef.current = match ? match[0] : ''
    } catch {
      frontmatterRef.current = ''
    }
  }, [content])

  // Resolve current node path (project-relative in Electron; API path in web)
  const resolvedNodePath = useMemo(() => {
    if (isElectron) {
      const abs = localFilePath || (filePath ? (() => { try { return decodeURIComponent(filePath) } catch { return filePath } })() : null)
      if (!abs) return null
      if (currentProjectPath && abs.replace(/\\/g,'/').startsWith(currentProjectPath.replace(/\\/g,'/') + '/')) {
        return abs.replace(/\\/g,'/').slice(currentProjectPath.replace(/\\/g,'/').length + 1)
      }
      return abs
    }
    if (currentFile) {
      return (currentFile as any).path || currentFile.id
    }
    return null
  }, [isElectron, localFilePath, filePath, currentProjectPath, currentFile])

  // Get live tracked state from store
  const trackedState = useNodeStore((s) => {
    if (!resolvedNodePath) return null as null | boolean
    const n = s.nodes.get(resolvedNodePath)
    if (!n || n.isDirectory) return null
    return (n.metadata as any)?.task?.tracked !== false
  })

  // Resolve linked nodes (soft links) for the current node
  const linkedNodes = useNodeStore((s) => {
    if (!resolvedNodePath) return [] as Array<{ path: string; name: string; title: string }>
    const node = s.nodes.get(resolvedNodePath)
    if (!node) return []
    const linkIds: string[] = Array.isArray(node.metadata?.links) ? node.metadata.links : []
    const results: Array<{ path: string; name: string; title: string }> = []
    if (linkIds.length === 0) return results
    for (const other of s.nodes.values()) {
      if (!other.isDirectory && linkIds.includes(other.metadata?.id)) {
        results.push({ path: other.path, name: other.name, title: other.metadata?.title || other.name })
      }
    }
    // De-duplicate by path
    const uniq = new Map<string, { path: string; name: string; title: string }>()
    results.forEach(r => uniq.set(r.path, r))
    return Array.from(uniq.values()).sort((a, b) => a.title.localeCompare(b.title))
  })

  // Ensure nodes are loaded (fix Links panel empty on Linux when Editor opens first)
  const { loadNodes, nodes: allNodes } = useNodeStore()
  useEffect(() => {
    const ensureNodes = async () => {
      try {
        if ((allNodes?.size || 0) === 0) {
          await loadNodes()
        }
      } catch {}
    }
    ensureNodes()
  }, [loadNodes])

  const openEditorForPath = useCallback((projectRelativePath: string) => {
    if (isElectron && currentProjectPath) {
      const abs = `${currentProjectPath.replace(/\\/g,'/')}/${projectRelativePath.replace(/\\/g,'/')}`
      navigate(`/editor/${encodeURIComponent(abs)}`)
    } else {
      navigate(`/editor/${encodeURIComponent(projectRelativePath)}`)
    }
  }, [navigate, currentProjectPath])

  // Now that dependencies exist, wire ref-updaters
  useEffect(() => { resolvedNodePathRef.current = resolvedNodePath }, [resolvedNodePath])
  useEffect(() => { isModifiedRef.current = isModified }, [isModified])
  useEffect(() => {
    const navigateFn = (projectRelativePath: string) => {
      if (isModifiedRef.current) {
        setNavTargetPath(projectRelativePath)
        setNavConfirmOpen(true)
      } else {
        openEditorForPath(projectRelativePath)
      }
    }
    navigateToRelRef.current = navigateFn
  }, [openEditorForPath])

  // Default expand Links when there are links and no saved preference yet
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EDITOR_LINKS_EXPANDED)
      if (raw === null && linkedNodes.length > 0) {
        setLinksExpanded(true)
        localStorage.setItem(STORAGE_KEYS.EDITOR_LINKS_EXPANDED, 'true')
      }
    } catch {}
  }, [linkedNodes.length])

  const resolveRelativePath = useCallback((baseProjectRelativePath: string, rawHref: string) => {
    // Split anchor if present
    const [hrefPathRaw, anchorRaw] = rawHref.split('#', 2)
    const hrefPath = hrefPathRaw || ''
    const normalize = (baseFileRel: string, rel: string) => {
      const base = baseFileRel.replace(/\\/g,'/').replace(/\/$/, '')
      const parts = base.split('/')
      // remove filename
      parts.pop()
      const segs = rel.replace(/\\/g,'/').split('/')
      for (const s of segs) {
        if (s === '' || s === '.') continue
        if (s === '..') { if (parts.length > 0) parts.pop(); continue }
        parts.push(s)
      }
      return parts.join('/')
    }
    let projectRel: string
    if (hrefPath.startsWith('/')) {
      projectRel = hrefPath.replace(/^\/+/, '') // absolute repo-relative
    } else if (hrefPath === '' && anchorRaw) {
      // pure anchor link
      projectRel = baseProjectRelativePath
    } else {
      projectRel = normalize(baseProjectRelativePath, hrefPath)
    }
    return { path: projectRel, anchor: anchorRaw || null }
  }, [])

  const requestNavigateTo = useCallback((projectRelativePath: string) => {
    if (isModified) {
      setNavTargetPath(projectRelativePath)
      setNavConfirmOpen(true)
    } else {
      openEditorForPath(projectRelativePath)
    }
  }, [isModified, openEditorForPath])

  // Refresh the current editor content from source-of-truth (after metadata changes like links)
  const refreshCurrentEditorContent = useCallback(async () => {
    try {
      if (isElectron && (localFilePath || filePath) && window.electronAPI) {
        const abs = localFilePath || (filePath ? (() => { try { return decodeURIComponent(filePath) } catch { return filePath } })() : null)
        if (abs) {
          const latest = await window.electronAPI.readFile(abs)
          setContent(latest)
          setIsModified(false)
        }
      } else if (!isElectron && currentProject && resolvedNodePath) {
        try {
          const file = await editorApi.getFile(currentProject.id, resolvedNodePath)
          if (file?.content !== undefined) {
            setContent(file.content)
            setIsModified(false)
          }
        } catch {}
      }
    } catch {}
  }, [isElectron, localFilePath, filePath, currentProject, resolvedNodePath])

  // Handle clicks on links inside preview HTML
  const handlePreviewClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    let el = e.target as HTMLElement | null
    while (el && el.tagName !== 'A') {
      el = el.parentElement
    }
    if (!el || el.tagName !== 'A') return
    const anchor = el as HTMLAnchorElement
    const rawHref = anchor.getAttribute('href') || ''
    if (!rawHref) return
    // External or hash/mailto links: allow default
    const lower = rawHref.toLowerCase()
    if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:')) {
      return
    }
    // For pure anchor (#section) in preview, let browser handle default scrolling
    if (rawHref.startsWith('#')) return
    e.preventDefault()
    if (!resolvedNodePath) return
    const { path: projectRel, anchor: anchorName } = resolveRelativePath(resolvedNodePath, rawHref)
    pendingAnchorRef.current = anchorName
    requestNavigateTo(projectRel)
  }, [resolvedNodePath, resolveRelativePath, requestNavigateTo])

  // Persisted preference: hide YAML frontmatter in editor and preview
  interface EditorPrefsState { hideMetadata: boolean; setHideMetadata: (v: boolean) => void }
  const useEditorPrefs = create<EditorPrefsState>()(
    persist(
      (set) => ({ hideMetadata: false, setHideMetadata: (v) => set({ hideMetadata: v }) }),
      { name: STORAGE_KEYS.EDITOR_HIDE_METADATA }
    )
  )
  const { hideMetadata, setHideMetadata } = useEditorPrefs()

  // Inject underline style for markdown links in editor
  useEffect(() => {
    const id = 'vw-md-link-style'
    if (!document.getElementById(id)) {
      const style = document.createElement('style')
      style.id = id
      style.textContent = `.monaco-md-link { text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }`
      document.head.appendChild(style)
    }
  }, [])

  // Load file when filePath changes (web) or in Electron
  useEffect(() => {
    const loadContent = async () => {
      if (isElectron && filePath && window.electronAPI) {
        // For Electron, load file directly from filesystem
        try {
          const decodedPath = decodeURIComponent(filePath)
          
          // Check if we have unsaved content for this file
          const tab = findEditorTab(decodedPath)
          const hasUnsavedContent = tab?.metadata?.isModified && tab?.metadata?.unsavedContent
          
          if (hasUnsavedContent && tab.metadata?.unsavedContent) {
            // Restore unsaved content
            setContent(tab.metadata.unsavedContent)
            setLocalFilePath(decodedPath)
            setLocalFileName(decodedPath.split(/[/\\]/).pop() || 'Unknown')
            setIsModified(true)
          } else {
            // Load from file
            const fileContent = await window.electronAPI.readFile(decodedPath)
            setContent(fileContent)
            setLocalFilePath(decodedPath)
            setLocalFileName(decodedPath.split(/[/\\]/).pop() || 'Unknown')
            setIsModified(false)
          }
          
          try { console.debug('[Editor] loaded content (electron), scheduling decoration refresh') } catch {}
          // Ensure decorations after content set
          setTimeout(() => updateLinkDecorationsRef.current?.(), 0)
          setTimeout(() => updateLinkDecorationsRef.current?.(), 50)
        } catch (error) {
          toast.error('Failed to load file')
          navigate('/editor')
        }
      } else if (!isElectron && filePath && currentProject) {
        // For web version, use the API with path from route
        const decoded = decodeURIComponent(filePath)
        
        // Check if we have unsaved content for this file
        const tab = findEditorTab(decoded)
        const hasUnsavedContent = tab?.metadata?.isModified && tab?.metadata?.unsavedContent
        
        if (hasUnsavedContent && tab.metadata?.unsavedContent) {
          // Restore unsaved content
          setContent(tab.metadata.unsavedContent)
          setIsModified(true)
        } else {
          // Load from API
          loadFile(currentProject.id, decoded)
            .then((file) => {
              setContent(file.content)
              setIsModified(false)
              try { console.debug('[Editor] loaded content (web), scheduling decoration refresh') } catch {}
              setTimeout(() => updateLinkDecorationsRef.current?.(), 0)
              setTimeout(() => updateLinkDecorationsRef.current?.(), 50)
            })
            .catch(() => {
              toast.error('Failed to load file')
              navigate('/editor')
            })
        }
      }
    }
    
    loadContent()
  }, [filePath, currentProject, loadFile, navigate, findEditorTab])

  // Default open: if no file specified, try to open README.md in project root
  useEffect(() => {
    const tryOpenReadme = async () => {
      if (!currentProject) return
      // Only when no file is open/targeted
      const noTarget = !filePath && !currentFile && !localFilePath
      if (!noTarget) return
      try {
        if (isElectron && window.electronAPI && currentProjectPath) {
          const items = await window.electronAPI.readDirectory(currentProjectPath)
          const readme = (items || []).find((it: any) => it.type === 'file' && it.name?.toLowerCase() === 'readme.md')
          if (readme) {
            const abs = `${currentProjectPath}/${readme.name}`.replace(/\\/g, '/').replace(/\//g, '/')
            navigate(`/editor/${encodeURIComponent(abs)}`)
            // Schedule decoration refresh post-navigation
            setTimeout(() => updateLinkDecorationsRef.current?.(), 0)
            setTimeout(() => updateLinkDecorationsRef.current?.(), 50)
          }
        } else if (!isElectron && currentProject) {
          // Fetch root listing via editor API
          const tree = await editorApi.getFileTree(currentProject.id)
          const readme = (Array.isArray(tree) ? tree : []).find((n: any) => n?.name?.toLowerCase?.() === 'readme.md')
          if (readme && readme.path) {
            navigate(`/editor/${encodeURIComponent(readme.path)}`)
            setTimeout(() => updateLinkDecorationsRef.current?.(), 0)
            setTimeout(() => updateLinkDecorationsRef.current?.(), 50)
          }
        }
      } catch (e) {
        // ignore, fallback to empty state
      }
    }
    tryOpenReadme()
  }, [currentProject, currentProjectPath, filePath, currentFile, localFilePath, navigate])

  // Update tab modified state and save unsaved content
  useEffect(() => {
    if (localFilePath) {
      const tab = findEditorTab(localFilePath)
      if (tab) {
        updateTab(tab.id, {
          metadata: { 
            ...tab.metadata, 
            isModified,
            unsavedContent: isModified ? content : undefined
          }
        })
      }
    }
  }, [isModified, content, localFilePath, findEditorTab, updateTab])

  // Handle content changes
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setContent(value)
      setIsModified(true)
      if (isPreview) setPreviewHtml('')
      if (!isElectron && currentFile) {
        updateFileContent(currentFile.id, value)
      }
    }
  }, [currentFile, updateFileContent])

  // Markdown formatting helpers
  const applyWrap = useCallback((prefix: string, suffix: string) => {
    const editor = editorRef.current
    if (!editor) return
    const model = editor.getModel?.()
    const sel = editor.getSelection?.()
    if (!model || !sel) return
    const selectedText = model.getValueInRange(sel)
    const replacement = `${prefix}${selectedText}${suffix}`
    editor.executeEdits('markdown-wrap', [
      { range: sel, text: replacement, forceMoveMarkers: true }
    ])
    if (!selectedText) {
      const pos = sel.getStartPosition()
      const newPos = { lineNumber: pos.lineNumber, column: pos.column + prefix.length }
      editor.setPosition(newPos)
    }
    editor.focus()
  }, [])

  const applyLink = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const model = editor.getModel?.()
    const sel = editor.getSelection?.()
    if (!model || !sel) return
    const selectedText = model.getValueInRange(sel)
    const label = selectedText || 'link-text'
    const replacement = `[${label}]()`
    editor.executeEdits('markdown-link', [
      { range: sel, text: replacement, forceMoveMarkers: true }
    ])
    const start = sel.getStartPosition()
    const newPos = { lineNumber: start.lineNumber, column: start.column + label.length + 3 }
    editor.setPosition(newPos)
    editor.focus()
  }, [])

  // Save file
  const handleSave = useCallback(async () => {
    if (isModified) {
      try {
        if (isElectron && localFilePath && window.electronAPI) {
          // For Electron, save directly to filesystem
          await window.electronAPI.writeFile(localFilePath, content)
          setIsModified(false)
          // Clear unsaved content from tab metadata
          const tab = findEditorTab(localFilePath)
          if (tab) {
            updateTab(tab.id, {
              metadata: { 
                ...tab.metadata, 
                isModified: false,
                unsavedContent: undefined
              }
            })
          }
          toast.success('File saved')
        } else if (currentFile && currentProject) {
          // For web version, use the API
          await saveFile(currentProject.id, currentFile.id, content)
          setIsModified(false)
          // Clear unsaved content from tab metadata
          const tab = findEditorTab(currentFile.id)
          if (tab) {
            updateTab(tab.id, {
              metadata: { 
                ...tab.metadata, 
                isModified: false,
                unsavedContent: undefined
              }
            })
          }
          toast.success('File saved')
        }
      } catch (error) {
        toast.error('Failed to save file')
      }
    }
  }, [currentFile, currentProject, content, isModified, saveFile, localFilePath, findEditorTab, updateTab])

  const handleDuplicate = useCallback(async () => {
    try {
      // Resolve project-relative node path and absolute path
      let projectRel: string | null = null
      let absPath: string | null = null
      if (isElectron && (filePath || localFilePath) && currentProjectPath) {
        const abs = (localFilePath || (filePath ? decodeURIComponent(filePath) : null)) as string | null
        if (!abs) return
        absPath = abs
        const normProject = currentProjectPath.replace(/\\/g, '/').replace(/\/$/, '')
        const normFile = abs.replace(/\\/g, '/')
        projectRel = normFile.startsWith(normProject + '/') ? normFile.substring(normProject.length + 1) : normFile
      } else if (!isElectron && currentFile && currentProject) {
        projectRel = (currentFile as any).path || currentFile.id
      }
      if (!projectRel) {
        toast.error('Could not resolve file to duplicate')
        return
      }

      // Ensure nodes are loaded and get node
      let store = useNodeStore.getState()
      if (!store.nodes.get(projectRel)) {
        try { await store.loadNodes() } catch {}
        store = useNodeStore.getState()
      }
      const node = store.nodes.get(projectRel)
      if (!node || node.isDirectory) {
        toast.error('Open a node file to duplicate')
        return
      }

      // Build new metadata: new id, title with " - Copy"
      const sourceMeta: any = node.metadata || {}
      const newId = `${sourceMeta.id || ''}_${Date.now()}`
      const newTitle = `${sourceMeta.title || node.name} - Copy`

      // Compute new filename in same folder with _copy
      const parts = projectRel.split('/')
      const filename = parts.pop() as string
      const dot = filename.lastIndexOf('.')
      const base = dot > 0 ? filename.slice(0, dot) : filename
      const ext = dot > 0 ? filename.slice(dot) : ''
      const newFilename = `${base}_copy${ext}`
      const newProjectRel = [...parts, newFilename].join('/')

      // Read original content from disk/API
      let originalContent = content
      try {
        if (isElectron && absPath && window.electronAPI) {
          originalContent = await window.electronAPI.readFile(absPath)
        } else if (!isElectron && currentProject) {
          const file = await editorApi.getFile(currentProject.id, projectRel)
          originalContent = file.content
        }
      } catch {}

      // Update frontmatter (YAML) in content: replace id and title
      const updatedContent = (() => {
        // Replace id and title keys in YAML frontmatter if present
        try {
          const fmMatch = originalContent.match(/^---\s*[\s\S]*?\n---\s*\n?/)
          if (!fmMatch) return originalContent
          const header = fmMatch[0]
          let body = originalContent.slice(header.length)
          let newHeader = header
          if (/\nid:\s*/.test(newHeader)) newHeader = newHeader.replace(/\nid:\s*.*/i, `\nid: ${newId}`)
          else newHeader = newHeader.replace(/^---\s*/, `---\nid: ${newId}\n`)
          if (/\ntitle:\s*/.test(newHeader)) newHeader = newHeader.replace(/\ntitle:\s*.*/i, `\ntitle: ${newTitle}`)
          else newHeader = newHeader.replace(/^---\s*/, `---\ntitle: ${newTitle}\n`)
          return newHeader + body
        } catch {
          return originalContent
        }
      })()

      // Write new file
      if (isElectron && window.electronAPI && currentProjectPath) {
        const newAbs = `${currentProjectPath.replace(/\\/g,'/')}/${newProjectRel}`
        const parentDir = newAbs.split('/').slice(0, -1).join('/')
        try { await window.electronAPI.createDirectory(parentDir) } catch {}
        await window.electronAPI.writeFile(newAbs, updatedContent)
      } else if (!isElectron && currentProject) {
        await editorApi.createFile(currentProject.id, newProjectRel, updatedContent)
      }

      // Refresh nodes and file tree, open new file
      try { await useNodeStore.getState().loadNodes() } catch {}
      window.dispatchEvent(new Event('refresh-file-tree'))
      openEditorForPath(newProjectRel)
      toast.success('File duplicated')
    } catch (e) {
      console.error('Duplicate failed', e)
      toast.error('Failed to duplicate file')
    }
  }, [content, currentFile, currentProject, currentProjectPath, filePath, localFilePath, openEditorForPath])

  // After navigation, if an anchor was requested, scroll to it in the editor
  useEffect(() => {
    if (!editorRef.current) return
    const anchor = pendingAnchorRef.current
    if (!anchor) return
    // Give editor time to render
    const id = setTimeout(() => {
      scrollToAnchorInEditor(anchor)
      pendingAnchorRef.current = null
    }, 100)
    return () => clearTimeout(id)
  }, [resolvedNodePath])

  function scrollToAnchorInEditor(anchorName: string) {
    const ed = editorRef.current
    const model = ed?.getModel?.()
    if (!ed || !model) return
    const total = model.getLineCount()
    const anchorLower = anchorName.toLowerCase()
    // Heuristic: match markdown headings that include the anchor slug
    // Common anchors: github-style, lowercase, spaces->-, remove punctuation. We'll try simple contains first.
    for (let line = 1; line <= total; line++) {
      const text = model.getLineContent(line)
      if (/^\s*#/.test(text) && text.toLowerCase().includes(anchorLower)) {
        ed.revealLineInCenter(line)
        ed.setPosition({ lineNumber: line, column: 1 })
        ed.focus()
        return
      }
    }
  }

  // Attachment picker
  useEffect(() => {
    if (attachOpen) {
      const input = document.getElementById('editor-attach-input') as HTMLInputElement | null
      input?.click()
      setAttachOpen(false)
    }
  }, [attachOpen])

  // Ensure link decorations update after content is loaded or preview toggled
  useEffect(() => {
    // Fire after content changes settle
    const id = setTimeout(() => {
      try { console.log('[Editor] effect: content/preview change -> refresh link decorations (0ms)') } catch {}
      updateLinkDecorationsRef.current?.()
      setTimeout(() => {
        try { console.log('[Editor] effect: second refresh (50ms)') } catch {}
        updateLinkDecorationsRef.current?.()
      }, 50)
    }, 0)
    return () => clearTimeout(id)
  }, [content, isPreview])

  // Fetch preview when in preview mode
  useEffect(() => {
    const fetchPreview = async () => {
      if (!isPreview) return
      const filename = localFileName || currentFile?.name || ''
      if (!filename.endsWith('.md')) return
             try {
         const source = hideMetadata ? (content || '').replace(FRONTMATTER_RE, '') : content
         // Compute project-relative file path for resource resolution
         let projectRel: string | undefined
         if (isElectron && localFilePath && currentProjectPath) {
           const normProject = currentProjectPath.replace(/\\/g,'/').replace(/\/$/, '')
           const normFile = localFilePath.replace(/\\/g,'/')
           projectRel = normFile.startsWith(normProject + '/') ? normFile.substring(normProject.length + 1) : undefined
         } else if (!isElectron && currentFile) {
           projectRel = (currentFile as any).path || currentFile.id
         }
         const html = await editorApi.previewMarkdown(source, currentProjectPath || undefined, projectRel)
         setPreviewHtml(html)
       } catch (e) {
         console.error('preview failed', e)
       }
    }
    const id = setTimeout(fetchPreview, 400)
    return () => clearTimeout(id)
  }, [isPreview, content, localFileName, currentFile, hideMetadata])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  // Close file
  const handleCloseFile = useCallback(() => {
    if (currentFile) {
      closeFile(currentFile.id)
      const remainingFiles = openFiles.filter(f => f.id !== currentFile.id)
      if (remainingFiles.length > 0) {
        navigate(`/editor/${remainingFiles[0].id}`)
      } else {
        navigate('/editor')
      }
    }
  }, [currentFile, openFiles, closeFile, navigate])

  const increaseFontSize = () => {
    setFontSize((prev: number) => Math.min(prev + 2, 32))
  }

  const decreaseFontSize = () => {
    setFontSize((prev: number) => Math.max(prev - 2, 10))
  }

  if (!currentProject) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">No Project Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a project to start editing
          </p>
        </div>
      </div>
    )
  }

  if (!isElectron && !currentFile && !filePath) {
    return (
      <div className="h-full flex">
        <EditorSidebar />
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="text-center">
            <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No File Open</h2>
            <p className="text-muted-foreground">
              Select a file from the sidebar to start editing
            </p>
          </div>
        </div>
      </div>
    )
  }

  const displayFileName = isElectron ? localFileName : currentFile?.name

  const handleRequestDelete = useCallback(() => {
    setConfirmState({ open: true })
  }, [])

  const resolveDeletePath = (): string | null => {
    // Electron: use route filePath if present; compute relative to project if possible
    if (isElectron && filePath) {
      const decoded = (() => { try { return decodeURIComponent(filePath) } catch { return filePath } })()
      if (currentProjectPath) {
        const normProject = currentProjectPath.replace(/\\/g, '/').replace(/\/$/, '')
        const normFile = decoded.replace(/\\/g, '/')
        if (normFile.startsWith(normProject + '/')) {
          return normFile.substring(normProject.length + 1)
        }
      }
      return decoded
    }
    // Electron: fallback to localFilePath if set
    if (isElectron && localFilePath) {
      if (currentProjectPath) {
        const normProject = currentProjectPath.replace(/\\/g, '/').replace(/\/$/, '')
        const normFile = localFilePath.replace(/\\/g, '/')
        if (normFile.startsWith(normProject + '/')) {
          return normFile.substring(normProject.length + 1)
        }
      }
      return localFilePath
    }
    // Web: prefer API-provided path, else route param, else id
    if (!isElectron && currentFile && (currentFile as any).path) {
      return (currentFile as any).path as string
    }
    if (!isElectron && filePath) {
      try {
        return decodeURIComponent(filePath)
      } catch {
        return filePath
      }
    }
    if (!isElectron && currentFile) {
      return (currentFile.id || '').toString()
    }
    return null
  }

  const handleConfirmDelete = useCallback(async () => {
    const path = resolveDeletePath()
    console.log('[Editor] Delete requested. Resolved path =', path, {
      isElectron,
      routeFilePath: filePath,
      editorCurrentFile: currentFile,
      localFilePath,
      currentProjectPath,
    })
    if (!path) {
      toast.error('Could not resolve path for deletion.')
      setConfirmState({ open: false })
      return
    }
    try {
      console.log('[Editor] Calling deleteNode with path:', path)
      await deleteNode(path)
      // Notify the file tree to refresh
      window.dispatchEvent(new Event('refresh-file-tree'))
      // Close the file/tab and navigate away
      if (currentFile) {
        handleCloseFile()
      } else {
        navigate('/editor')
      }
    } catch (e) {
      // Error toast handled by store
      console.error('[Editor] deleteNode failed:', e)
    } finally {
      setConfirmState({ open: false })
    }
  }, [deleteNode, currentFile, handleCloseFile, navigate])

  return (
    <div className="h-full flex flex-col">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4" />
          <span className="font-medium">{displayFileName || 'Untitled'}</span>
          {isModified && <span className="text-xs text-muted-foreground">(modified)</span>}
        </div>
        
                 <div className="flex items-center gap-2">
            {/* Formatting reference (Pandoc manual) */}
            <button
              onClick={() => window.open('https://pandoc.org/MANUAL.html#pandocs-markdown', '_blank')}
              className="p-1.5 rounded hover:bg-accent"
              title="Formatting guidelines (Pandoc Markdown)"
            >
              <Type className="w-4 h-4" />
            </button>

            {/* Editor user guide in Help view */}
            <button
              onClick={() => {
                // Route to Help with doc filter to open Editor guide
                navigate('/help?doc=editor.md')
              }}
              className="p-1.5 rounded hover:bg-accent"
              title="Open Editor User Guide"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            {/* Divider after documentation buttons */}
            <div className="mx-2 h-4 w-px bg-border" />

            {/* Create Link */}
            <button
              onClick={() => setCreateLinkOpen(true)}
              className="p-1.5 rounded hover:bg-accent"
              title="Create link (Ctrl+Shift+L)"
              disabled={!resolvedNodePath}
            >
              <LinkIcon className="w-4 h-4" />
            </button>
            {/* Remove Link(s) – adjacent to Create */}
            <button
              onClick={() => setRemoveLinksOpen(true)}
              className="p-1.5 rounded hover:bg-accent"
              title="Remove link(s)"
              disabled={!resolvedNodePath}
            >
              <Unlink className="w-4 h-4" />
            </button>

            {/* See Task */}
            <button
              onClick={() => {
                const current = resolvedNodePathRef.current
                if (current) navigate(`/tasks/${encodeURIComponent(current)}`)
              }}
              className="p-1.5 rounded hover:bg-accent"
              title="See Task"
              disabled={!resolvedNodePath}
            >
              <ListTodo className="w-4 h-4" />
            </button>

          
           <button
             onClick={() => setIsPreview(prev => !prev)}
             disabled={! (localFileName || currentFile?.name || '').endsWith('.md') }
             className={`p-1.5 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed ${
               isPreview ? 'bg-accent border border-primary' : ''
             }`}
             title="Toggle preview"
           >
             <Eye className="w-4 h-4" />
           </button>

          <button
            onClick={() => setAttachOpen(true)}
            className="p-1.5 rounded hover:bg-accent"
            title="Attach files"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Toggle task tracking */}
          <button
            onClick={async () => {
              if (!filePath && !localFilePath) return
              setTrackingBusy(true)
              try {
                // Resolve project-relative node path
                let nodePath: string | null = null
                if (isElectron) {
                  const abs = localFilePath || (filePath ? decodeURIComponent(filePath) : null)
                  if (!abs) return
                  if (currentProjectPath && abs.replace(/\\/g,'/').startsWith(currentProjectPath.replace(/\\/g,'/') + '/')) {
                    nodePath = abs.replace(/\\/g,'/').slice(currentProjectPath.replace(/\\/g,'/').length + 1)
                  } else {
                    nodePath = abs
                  }
                } else if (currentFile) {
                  nodePath = (currentFile as any).path || currentFile.id
                }
                if (!nodePath) return

                // Ensure nodes are loaded
                let store = useNodeStore.getState()
                if (!store.nodes.get(nodePath)) {
                  try { await store.loadNodes() } catch {}
                  store = useNodeStore.getState()
                }
                const node = store.nodes.get(nodePath)
                if (!node || node.isDirectory) return

                const prevTracked = (node.metadata as any)?.task?.tracked !== false
                const nextTracked = !prevTracked
                const nextTask = { ...(node.metadata as any).task, tracked: nextTracked }
                await store.updateNode(nodePath, { metadata: { task: nextTask } as any })
                toast.success(nextTracked ? 'Tracking as Task' : 'Stopped tracking as Task')

                // If content shown is this file in Electron, refresh editor to reflect frontmatter change
                if (isElectron && window.electronAPI) {
                  const abs = localFilePath || (filePath ? decodeURIComponent(filePath) : null)
                  if (abs) {
                    try {
                      const latest = await window.electronAPI.readFile(abs)
                      setContent(latest)
                      setIsModified(false)
                    } catch {}
                  }
                }
              } finally {
                setTrackingBusy(false)
              }
            }}
            className={`p-1.5 rounded hover:bg-accent ${trackingBusy ? 'opacity-60 pointer-events-none' : ''}`}
            title="Toggle tracking as Task"
          >
            <span className="inline-flex items-center gap-1 text-xs">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`w-4 h-4 ${trackedState ? 'text-green-500' : 'text-muted-foreground/60'}`}
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {trackedState ? 'Task On' : 'Task Off'}
            </span>
          </button>

            <label className="flex items-center gap-1 text-xs border-l pl-2 ml-1 cursor-pointer" title="Hide YAML metadata">
              <input
                type="checkbox"
                className="accent-primary"
                checked={hideMetadata}
                onChange={(e) => setHideMetadata(e.target.checked)}
              />
              Hide Metadata
            </label>

          <button
            onClick={handleSave}
            disabled={!isModified}
            className="p-1.5 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save (Ctrl+S)"
          >
            <Save className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-1 border-l pl-2 ml-1">
            <button
              onClick={decreaseFontSize}
              className="p-1.5 rounded hover:bg-accent"
              title="Decrease font size"
              disabled={fontSize <= 10}
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="text-xs px-1 min-w-[2rem] text-center">{fontSize}</span>
            <button
              onClick={increaseFontSize}
              className="p-1.5 rounded hover:bg-accent"
              title="Increase font size"
              disabled={fontSize >= 32}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <button
            onClick={handleDuplicate}
            className="p-1.5 rounded hover:bg-accent ml-1"
            title="Duplicate file"
            disabled={!displayFileName}
          >
            <Copy className="w-4 h-4" />
          </button>

          <button
            onClick={handleCloseFile}
            className="p-1.5 rounded hover:bg-accent ml-2"
            title="Close file"
          >
            <X className="w-4 h-4" />
          </button>
          {/* Delete Node */}
          <button
            onClick={handleRequestDelete}
            className="p-1.5 rounded hover:bg-accent ml-1"
            title="Delete node"
            disabled={!displayFileName}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor Content */}
      <PanelGroup direction="horizontal" className="flex-1">
        <Panel defaultSize={20} minSize={15} maxSize={30}>
          <EditorSidebar />
        </Panel>
        
        <PanelResizeHandle className="w-1 bg-border hover:bg-primary/20 transition-colors" />
        
        <Panel defaultSize={80}>
          {isPreview ? (
            <div
              className="h-full w-full overflow-auto bg-background p-4"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
              onClick={handlePreviewClick}
            />
          ) : (
            <Editor
            value={hideMetadata ? ((content || '').replace(FRONTMATTER_RE, '')) : content}
            onChange={(value) => {
              if (value === undefined) return
              if (hideMetadata) {
                const header = frontmatterRef.current || ''
                handleEditorChange(header + value)
              } else {
                handleEditorChange(value)
              }
            }}
            language="markdown"
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            options={{
              fontSize,
              wordWrap: 'on',
              minimap: { enabled: false },
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
                          insertSpaces: true,
                // Ensure Ctrl/Cmd is free for link navigation from first render
                multiCursorModifier: 'alt',
              }}
              onMount={(editorInstance, monaco) => {
                editorRef.current = editorInstance
                monacoRef.current = monaco
                // Avoid Ctrl/Cmd creating multi-cursors so we can use it for link navigation
                try { editorInstance.updateOptions({ multiCursorModifier: 'alt' }) } catch {}
                // Register Monaco-level keybindings to ensure shortcuts work when editor has focus
                try {
                  editorInstance.addAction({
                    id: 'vw-bold',
                    label: 'Bold',
                    keybindings: [(monaco as any).KeyMod.CtrlCmd | (monaco as any).KeyCode.KeyB],
                    run: () => applyWrap('**', '**'),
                  })
                  editorInstance.addAction({
                    id: 'vw-italic',
                    label: 'Italic',
                    keybindings: [(monaco as any).KeyMod.CtrlCmd | (monaco as any).KeyCode.KeyI],
                    run: () => applyWrap('*', '*'),
                  })
                  editorInstance.addAction({
                    id: 'vw-link',
                    label: 'Insert Link',
                    keybindings: [(monaco as any).KeyMod.CtrlCmd | (monaco as any).KeyCode.KeyK],
                    run: () => applyLink(),
                  })
                  editorInstance.addAction({
                    id: 'vw-open-create-link-modal',
                    label: 'Create Link',
                    keybindings: [
                      (monaco as any).KeyMod.CtrlCmd | (monaco as any).KeyMod.Shift | (monaco as any).KeyCode.KeyL,
                    ],
                    run: () => setCreateLinkOpen(true),
                  })
                  editorInstance.addAction({
                    id: 'vw-toggle-preview',
                    label: 'Toggle Preview',
                    keybindings: [(monaco as any).KeyMod.CtrlCmd | (monaco as any).KeyCode.KeyP],
                    run: () => setIsPreview((prev) => !prev),
                  })
                  editorInstance.addAction({
                    id: 'vw-go-compiler',
                    label: 'Go to Compiler',
                    keybindings: [
                      (monaco as any).KeyMod.CtrlCmd | (monaco as any).KeyMod.Alt | (monaco as any).KeyCode.KeyC,
                    ],
                    run: () => navigate('/compiler'),
                  })
                } catch {}
                // Decorations for relative markdown links
                const updateLinkDecorations = () => {
                  const ed = editorRef.current
                  const mc = monacoRef.current
                  if (!ed || !mc) return
                  const model = ed.getModel()
                  if (!model) return
                  const newDecs: any[] = []
                  const hrefs: string[] = []
                  const lineCount = model.getLineCount()
                  for (let line = 1; line <= lineCount; line++) {
                    const lineText = model.getLineContent(line)
                    const regex = /\[[^\]]*\]\(([^)]+)\)/g
                    let match: RegExpExecArray | null
                    while ((match = regex.exec(lineText))) {
                      const href = match[1] || ''
                      const lower = href.toLowerCase()
                      if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:') || lower.startsWith('#')) {
                        continue
                      }
                      const startColumn = match.index + 1
                      const endColumn = match.index + match[0].length + 1
                      newDecs.push({
                        range: new (mc as any).Range(line, startColumn, line, endColumn),
                        options: {
                          inlineClassName: 'monaco-md-link',
                          hoverMessage: [{ value: 'Ctrl/Cmd+Click to open link' }],
                        },
                      })
                      hrefs.push(href)
                    }
                  }
                  decorationIdsRef.current = ed.deltaDecorations(decorationIdsRef.current, newDecs)
                  decorationHrefMapRef.current.clear()
                  decorationIdsRef.current.forEach((id: string, idx: number) => {
                    const href = hrefs[idx]
                    if (href) decorationHrefMapRef.current.set(id, href)
                  })
                  // Debug: report counts
                  try { console.log('[Editor] Link decorations updated', { decCount: decorationIdsRef.current.length }) } catch {}
                }
                // Initial decorations (may be empty on first mount)
                try { console.log('[Editor] onMount: applying link decorations') } catch {}
                updateLinkDecorations()
                // Expose to external effects
                updateLinkDecorationsRef.current = updateLinkDecorations
                // Re-apply shortly after mount to catch async content set
                setTimeout(() => updateLinkDecorations(), 0)
                setTimeout(() => updateLinkDecorations(), 50)
                const subContent = editorInstance.onDidChangeModelContent(() => updateLinkDecorations())
                const subModel = editorInstance.onDidChangeModel(() => updateLinkDecorations())

                const attachLinkHandler = () => {
                  try { linkMouseHandlerRef.current?.dispose?.() } catch {}
                  linkMouseHandlerRef.current = editorInstance.onMouseDown((e: any) => {
                  const isModifiedClick = e.event.ctrlKey || e.event.metaKey
                  if (!isModifiedClick) return
                  // Fallback: use model to find markdown link under mouse
                  const bx = e?.event?.browserEvent?.clientX
                  const by = e?.event?.browserEvent?.clientY
                  const hoverTarget = (typeof editorInstance.getTargetAtClientPoint === 'function') ? editorInstance.getTargetAtClientPoint(bx, by) : null
                  const pos = hoverTarget?.position || e.target.position || editorInstance.getPosition()
                  const model = editorInstance.getModel()
                  if (!model || !pos) return
                  // Prefer decoration hit-test at position
                  const RangeCtor = (monaco as any).Range
                  const pointRange = new RangeCtor(pos.lineNumber, pos.column, pos.lineNumber, pos.column)
                  const decsAt = model.getDecorationsInRange ? model.getDecorationsInRange(pointRange) : []
                  let foundHref: string | null = null
                  for (const d of decsAt || []) {
                    const href = decorationHrefMapRef.current.get(d.id)
                    if (href) { foundHref = href; break }
                  }
                  // Fallback: regex on the line
                  if (!foundHref) {
                    const lineText = model.getLineContent(pos.lineNumber)
                    const regex = /\[[^\]]*\]\(([^)]+)\)/g
                    let match: RegExpExecArray | null
                    while ((match = regex.exec(lineText))) {
                      const start = match.index
                      const end = regex.lastIndex
                      if (pos.column >= start + 1 && pos.column <= end) {
                        foundHref = match[1]
                        break
                      }
                    }
                  }
                  if (!foundHref) return
                  const lower = foundHref.toLowerCase()
                  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:') || lower.startsWith('#')) {
                    // Pure anchor (#section) in edit mode: scroll in current editor
                    if (foundHref.startsWith('#')) {
                      const anchorName = foundHref.slice(1)
                      scrollToAnchorInEditor(anchorName)
                    }
                    return
                  }
                  e.event.preventDefault()
                  e.event.stopPropagation()
                    const basePath = resolvedNodePathRef.current
                    if (!basePath) return
                  const { path: projectRel, anchor: anchorName } = resolveRelativePath(basePath, foundHref)
                  pendingAnchorRef.current = anchorName
                  navigateToRelRef.current?.(projectRel)
                  })
                }
                attachLinkHandler()
                // Re-attach handler on model changes (some Monaco flows detach listeners)
                editorInstance.onDidChangeModel(() => attachLinkHandler())

                // Clean up
                editorInstance.onDidDispose(() => {
                  try { editorInstance.deltaDecorations(decorationIdsRef.current, []) } catch {}
                  try { linkMouseHandlerRef.current?.dispose?.() } catch {}
                  try { subContent?.dispose?.() } catch {}
                  try { subModel?.dispose?.() } catch {}
                })
              }}
            />
          )}
        </Panel>
      </PanelGroup>
      {/* Linked nodes list */}
      <div className="border-t border-border px-4 py-2 bg-muted/40">
        <button
          className="flex items-center gap-1 text-xs hover:underline"
          onClick={() => setLinksExpanded(v => { const next = !v; try { localStorage.setItem(STORAGE_KEYS.EDITOR_LINKS_EXPANDED, String(next)) } catch {}; return next })}
        >
          {linksExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Links ({linkedNodes.length})
        </button>
        {linksExpanded && linkedNodes.length > 0 && (
          <ul className="mt-2 space-y-2">
            {linkedNodes.map((ln) => (
              <li key={ln.path} className="flex items-center justify-between border border-border rounded px-2 py-1 bg-background">
                <button
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  onClick={() => openEditorForPath(ln.path)}
                  title={ln.path}
                >
                  <LinkIcon className="w-3 h-3" />
                  {ln.title}
                </button>
                <div className="ml-2 flex items-center gap-1">
                  <button
                    className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent"
                    onClick={() => navigate(`/tasks/${encodeURIComponent(ln.path)}`)}
                    title="Open Task"
                  >Open Task</button>
                  <button
                    className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent"
                    onClick={() => navigate(`/graph?focus=${encodeURIComponent(ln.path)}`)}
                    title="Open Graph"
                  >Open Graph</button>
                  <button
                    className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent text-destructive"
                    onClick={() => { setRemoveLinkTarget(ln.path); setRemoveLinkOpen(true) }}
                    title="Remove Link"
                  >Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {linksExpanded && linkedNodes.length === 0 && (
          <div className="text-xs text-muted-foreground mt-2">No links</div>
        )}
      </div>
      {createLinkOpen && resolvedNodePath && (
        <SharedCreateLinkModal
          currentNodePath={resolvedNodePath}
          onClose={() => setCreateLinkOpen(false)}
          onLinkCreated={() => {
            try { useNodeStore.getState().loadNodes() } catch {}
            setLinksExpanded(true)
            try { localStorage.setItem(STORAGE_KEYS.EDITOR_LINKS_EXPANDED, 'true') } catch {}
            // Refresh current editor content to show updated frontmatter
            refreshCurrentEditorContent()
          }}
        />
      )}
      {/* Confirm Delete Dialog */}
      <ConfirmDialog
      isOpen={confirmState.open}
      title="Delete node"
      message={`Are you sure you want to delete "${displayFileName || 'this file'}"? This action cannot be undone.`}
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={handleConfirmDelete}
      onCancel={() => setConfirmState({ open: false })}
      />

      {/* Unsaved changes confirm before navigation */}
      <ConfirmDialog
        isOpen={navConfirmOpen}
        title="Unsaved changes"
        message="You have unsaved changes. Do you want to proceed without saving?"
        confirmLabel="Proceed"
        cancelLabel="Cancel"
        onConfirm={() => {
          setNavConfirmOpen(false)
          if (navTargetPath) {
            openEditorForPath(navTargetPath)
            setNavTargetPath(null)
          }
        }}
        onCancel={() => {
          setNavConfirmOpen(false)
          setNavTargetPath(null)
        }}
      />

      {/* Remove link confirmation */}
      <ConfirmDialog
        isOpen={removeLinkOpen}
        title="Remove link"
        message="Are you sure you want to remove this link?"
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={async () => {
          setRemoveLinkOpen(false)
          try {
            const store = useNodeStore.getState()
            const current = resolvedNodePathRef.current
            const target = removeLinkTarget
            setRemoveLinkTarget(null)
            if (!current || !target) return
            await store.removeSoftLink(current, target)
            try { await store.loadNodes() } catch {}
            setLinksExpanded(true)
            // Refresh editor content to reflect updated metadata
            await refreshCurrentEditorContent()
          } catch {}
        }}
        onCancel={() => { setRemoveLinkOpen(false); setRemoveLinkTarget(null) }}
      />

      {/* Bulk remove links dialog */}
      {removeLinksOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setRemoveLinksOpen(false)}>
          <div className="bg-background border border-border rounded-lg w-[520px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Remove links</h3>
              <button className="p-1.5 rounded hover:bg-accent" onClick={() => setRemoveLinksOpen(false)}><X className="w-4 h-4"/></button>
            </div>
            <div className="p-4">
              <p className="text-sm text-muted-foreground mb-2">Select links to remove from this node:</p>
              <div className="max-h-64 overflow-auto border border-border rounded">
                <ul>
                  {linkedNodes.length === 0 && (
                    <li className="px-3 py-2 text-sm text-muted-foreground">No links</li>
                  )}
                  {linkedNodes.map(ln => (
                    <li key={ln.path} className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0">
                      <input
                        type="checkbox"
                        checked={removeLinksSelected.has(ln.path)}
                        onChange={(e) => {
                          setRemoveLinksSelected(prev => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(ln.path); else next.delete(ln.path)
                            return next
                          })
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{ln.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{ln.path}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <button className="px-4 py-2 border border-input rounded hover:bg-accent" onClick={() => { setRemoveLinksOpen(false); setRemoveLinksSelected(new Set()) }}>Cancel</button>
              <button
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 disabled:opacity-50"
                disabled={removeLinksSelected.size === 0}
                onClick={async () => {
                  try {
                    const store = useNodeStore.getState()
                    const current = resolvedNodePathRef.current
                    if (!current) return
                    // Remove links sequentially
                    for (const p of Array.from(removeLinksSelected)) {
                      await store.removeSoftLink(current, p)
                    }
                    try { await store.loadNodes() } catch {}
                    setLinksExpanded(true)
                    await refreshCurrentEditorContent()
                  } finally {
                    setRemoveLinksOpen(false)
                    setRemoveLinksSelected(new Set())
                  }
                }}
              >Remove selected</button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for attachments */}
      <input
        id="editor-attach-input"
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={async (e) => {
          const files = e.target.files
          if (!files) return
          try {
            // Determine the node path in project-relative form
            let nodePath: string | null = null
            if (isElectron && filePath) {
              const decoded = (() => { try { return decodeURIComponent(filePath) } catch { return filePath } })()
              if (currentProjectPath) {
                const normProject = currentProjectPath.replace(/\\/g, '/').replace(/\/$/, '')
                const normFile = decoded.replace(/\\/g, '/')
                if (normFile.startsWith(normProject + '/')) {
                  nodePath = normFile.substring(normProject.length + 1)
                } else {
                  nodePath = decoded
                }
              } else {
                nodePath = decoded
              }
            } else if (!isElectron && currentFile) {
              nodePath = (currentFile as any).path || currentFile.id
            }
            if (!nodePath) return

            // Ensure the node is present in the store (Editor may open before nodes are loaded)
            let store = useNodeStore.getState()
            if (!store.nodes.get(nodePath)) {
              try { await store.loadNodes() } catch {}
              // Re-read fresh state after async load
              store = useNodeStore.getState()
            }
            if (!store.nodes.get(nodePath)) {
              toast.error('This file is not a Node (or nodes not loaded). Open a node under nodes/ to attach files.')
              return
            }

            const uploaded: StoredFile[] = []
            for (const f of Array.from(files)) {
              const sf = await FileStorage.uploadFile(f, nodePath)
              if (sf) uploaded.push(sf)
            }

            await store.updateNode(nodePath, {
              metadata: {
                task: {
                  ...((store.nodes.get(nodePath)?.metadata as any)?.task || {}),
                  files: [
                    ...((((store.nodes.get(nodePath)?.metadata as any)?.task || {}).files) || []),
                    ...uploaded,
                  ],
                } as any,
              },
            })
            toast.success('Files attached')

            // Refresh Editor content so updated frontmatter is visible immediately
            if (isElectron && window.electronAPI) {
              try {
                // Prefer the already-known absolute localFilePath if available
                let absolute: string | null = localFilePath
                if (!absolute && filePath) {
                  const decoded = (() => { try { return decodeURIComponent(filePath) } catch { return filePath } })()
                  absolute = decoded
                }
                if (absolute) {
                  const latest = await window.electronAPI.readFile(absolute)
                  setContent(latest)
                  setIsModified(false)
                }
              } catch (e) {
                console.warn('Failed to refresh editor content after attachments:', e)
              }
            }
          } catch (err) {
            console.error('Attach files failed', err)
            toast.error('Failed to attach files')
          } finally {
            const input = document.getElementById('editor-attach-input') as HTMLInputElement | null
            if (input) input.value = ''
          }
        }}
      />
    </div>
  )
}

export default EditorView 