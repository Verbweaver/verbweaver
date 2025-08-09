import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { Save, FileText, Plus, Minus, X, Eye, HelpCircle, Trash2, Paperclip } from 'lucide-react'
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

  // Persisted preference: hide YAML frontmatter in editor and preview
  interface EditorPrefsState { hideMetadata: boolean; setHideMetadata: (v: boolean) => void }
  const useEditorPrefs = create<EditorPrefsState>()(
    persist(
      (set) => ({ hideMetadata: false, setHideMetadata: (v) => set({ hideMetadata: v }) }),
      { name: STORAGE_KEYS.EDITOR_HIDE_METADATA }
    )
  )
  const { hideMetadata, setHideMetadata } = useEditorPrefs()

  // Load file when filePath changes (web) or in Electron
  useEffect(() => {
    const loadContent = async () => {
      if (isElectron && filePath && window.electronAPI) {
        // For Electron, load file directly from filesystem
        try {
          const decodedPath = decodeURIComponent(filePath)
          const fileContent = await window.electronAPI.readFile(decodedPath)
          setContent(fileContent)
          setLocalFilePath(decodedPath)
          setLocalFileName(decodedPath.split(/[/\\]/).pop() || 'Unknown')
          setIsModified(false)
        } catch (error) {
          toast.error('Failed to load file')
          navigate('/editor')
        }
      } else if (!isElectron && filePath && currentProject) {
        // For web version, use the API with path from route
        const decoded = decodeURIComponent(filePath)
        loadFile(currentProject.id, decoded)
          .then((file) => {
            setContent(file.content)
            setIsModified(false)
          })
          .catch(() => {
            toast.error('Failed to load file')
            navigate('/editor')
          })
      }
    }
    
    loadContent()
  }, [filePath, currentProject, loadFile, navigate])

  // Update tab modified state
  useEffect(() => {
    if (localFilePath) {
      const tab = findEditorTab(localFilePath)
      if (tab) {
        updateTab(tab.id, {
          metadata: { ...tab.metadata, isModified }
        })
      }
    }
  }, [isModified, localFilePath, findEditorTab, updateTab])

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

  // Save file
  const handleSave = useCallback(async () => {
    if (isModified) {
      try {
        if (isElectron && localFilePath && window.electronAPI) {
          // For Electron, save directly to filesystem
          await window.electronAPI.writeFile(localFilePath, content)
          setIsModified(false)
          toast.success('File saved')
        } else if (currentFile && currentProject) {
          // For web version, use the API
          await saveFile(currentProject.id, currentFile.id, content)
          setIsModified(false)
          toast.success('File saved')
        }
      } catch (error) {
        toast.error('Failed to save file')
      }
    }
  }, [currentFile, currentProject, content, isModified, saveFile, localFilePath])

  // Attachment picker
  useEffect(() => {
    if (attachOpen) {
      const input = document.getElementById('editor-attach-input') as HTMLInputElement | null
      input?.click()
      setAttachOpen(false)
    }
  }, [attachOpen])

  // Fetch preview when in preview mode
  useEffect(() => {
    const fetchPreview = async () => {
      if (!isPreview) return
      const filename = localFileName || currentFile?.name || ''
      if (!filename.endsWith('.md')) return
             try {
         const source = hideMetadata ? content.replace(/^---\s*[\s\S]*?\n---\s*\n?/, '') : content
         const html = await editorApi.previewMarkdown(source, currentProjectPath || undefined)
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
    setFontSize(prev => Math.min(prev + 2, 32))
  }

  const decreaseFontSize = () => {
    setFontSize(prev => Math.max(prev - 2, 10))
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
           <button
             onClick={() => window.open('https://pandoc.org/MANUAL.html#pandocs-markdown', '_blank')}
             className="p-1.5 rounded hover:bg-accent"
             title="Formatting guidelines - Pandocs Markdown"
           >
             <HelpCircle className="w-4 h-4" />
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
              <span
                className={`inline-block w-2 h-2 rounded-full ${trackedState ? 'bg-green-500' : 'bg-muted-foreground/40'}`}
              />
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
            <div className="h-full w-full overflow-auto bg-background p-4" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          ) : (
            <Editor
            value={hideMetadata ? content.replace(/^---\s*[\s\S]*?\n---\s*\n?/, '') : content}
            onChange={handleEditorChange}
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
              }}
            />
          )}
        </Panel>
      </PanelGroup>
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