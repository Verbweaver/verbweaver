import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronDown, FileText, Folder, Plus, FolderPlus, GripVertical, RefreshCcw, Upload, FolderOpen, Search, X as CloseIcon, Pencil } from 'lucide-react'
import { useProjectStore } from '../../store/projectStore'
import { editorApi } from '../../api/editorApi'
import { TemplateSelectionDialog } from '../TemplateSelectionDialog'
import { FolderCreateDialog } from '../FolderCreateDialog'
import { templatesApi } from '../../api/templates'
import { createNodeFromTemplateDesktop } from '../../api/desktop-templates'
import { apiClient } from '../../api/client'
import clsx from 'clsx'
import FileCreateDialog from './FileCreateDialog'
import { PromptDialog } from '../PromptDialog'
import toast from 'react-hot-toast'
import { useTabStore } from '../../store/tabStore'

interface FileNode {
  id: string
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  loaded?: boolean // Track if directory contents have been loaded
}

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

function EditorSidebar() {
  const navigate = useNavigate()
  const { currentProject, currentProjectPath } = useProjectStore()
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)
  const [showFolderDialog, setShowFolderDialog] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState<string>('nodes') // Track selected folder
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null) // Track selected file or folder
  const [draggedNode, setDraggedNode] = useState<FileNode | null>(null)
  const [dragOverNode, setDragOverNode] = useState<string | null>(null)
  const { addEditorTab } = useTabStore()
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findRegex, setFindRegex] = useState(false)
  const [findCase, setFindCase] = useState(false)
  const [findResults, setFindResults] = useState<Map<string, number>>(new Map())
  const [isSearching, setIsSearching] = useState(false)
  const findInputRef = useRef<HTMLInputElement | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<FileNode | null>(null)

  useEffect(() => {
    if (currentProject) {
      loadFileTree()
    }
  }, [currentProject, currentProjectPath])

  // Listen for external refresh events (e.g., after deletion from Editor)
  useEffect(() => {
    const handleRefresh = () => {
      loadFileTree()
    }
    window.addEventListener('refresh-file-tree', handleRefresh as EventListener)
    return () => window.removeEventListener('refresh-file-tree', handleRefresh as EventListener)
  }, [])

  const loadFileTree = async () => {
    if (!currentProject) return
    
    setIsLoading(true)
    try {
      if (isElectron && currentProjectPath && window.electronAPI && !findOpen) {
        // For Electron, read the actual project structure
        const rootItems = await window.electronAPI.readDirectory(currentProjectPath)
        
        // Convert to FileNode format and filter for relevant directories/files
        const tree: FileNode[] = rootItems
          .filter(item => {
            // Skip .gitkeep files as they are not actual nodes
            if (item.name === '.gitkeep') return false
            
            // Show specific directories (including uploads) and markdown files at the root of the project
            if (item.type === 'directory') {
              return ['nodes', 'docs', 'templates', 'uploads'].includes(item.name)
            }
            return item.name.endsWith('.md') // Also show root markdown files (like README.md)
          })
          .map(item => ({
            id: item.path,
            name: item.name,
            path: item.name, // Use relative path from project root
            type: item.type,
            children: item.type === 'directory' ? [] : undefined,
            loaded: false
          }))
          .sort((a, b) => {
            // Directories first, then files
            if (a.type !== b.type) {
              return a.type === 'directory' ? -1 : 1
            }
            return a.name.localeCompare(b.name)
          })
        
        setFileTree(tree)
      } else {
        // For web version, use the API
        const apiTree = await editorApi.getFileTree(currentProject.id)
        // Transform API response to match local FileNode interface
        const transformNode = (node: any): FileNode => ({
          id: node.path,
          name: node.name,
          path: node.path,
          type: node.type,
          children: node.children ? node.children.map(transformNode) : undefined,
          loaded: true // API returns fully loaded tree
        })
        const tree = apiTree.map(transformNode)
        setFileTree(tree)
      }
    } catch (error) {
      console.error('Failed to load file tree:', error)
      // Set empty tree on error
      setFileTree([])
    } finally {
      setIsLoading(false)
    }
  }

  // When enabling find, ensure we load the full tree via API for comprehensive filtering
  useEffect(() => {
    if (findOpen && currentProject) {
      // Ensure we have a full tree available (web/API already loads full tree)
      if (isElectron) {
        loadFileTree()
      }
    }
  }, [findOpen, currentProject, isElectron])

  // Debounced search in backend (web) or simple read in Electron using backend as well for consistency
  useEffect(() => {
    let cancelled = false
    const doSearch = async () => {
      if (!currentProject || !findOpen) return
      const q = findQuery
      if (!q) {
        setFindResults(new Map())
        return
      }
      setIsSearching(true)
      try {
        // Always use backend API; it respects .gitignore and skips binaries
        const data = await editorApi.searchFiles(String(currentProject.id), {
          query: q,
          regex: findRegex,
          caseSensitive: findCase,
        })
        if (cancelled) return
        const map = new Map<string, number>()
        for (const item of data.results || []) {
          map.set(item.path, item.count || 0)
        }
        setFindResults(map)
        // Auto-expand only ancestors of matched files; collapse unrelated
        const next = new Set<string>()
        if (map.size > 0) {
          for (const relPath of map.keys()) {
            const parts = relPath.split('/')
            let acc = ''
            for (let i = 0; i < parts.length - 1; i++) {
              acc = acc ? `${acc}/${parts[i]}` : parts[i]
              next.add(acc)
            }
          }
        } else {
          // Fallback: expand ancestors of filename matches so users see immediate feedback
          const test = (name: string) => {
            try {
              if (findRegex) {
                const flags = findCase ? '' : 'i'
                const re = new RegExp(q, flags)
                return re.test(name)
              }
              const hay = findCase ? name : name.toLowerCase()
              const needle = findCase ? q : q.toLowerCase()
              return hay.includes(needle)
            } catch {
              return false
            }
          }
          // DFS over current tree
          const visit = (node: FileNode, ancestors: string[]) => {
            const isNameMatch = test(node.name)
            const isFile = node.type === 'file'
            if (isNameMatch && isFile) {
              for (const a of ancestors) next.add(a)
            }
            if (node.children && node.children.length > 0) {
              for (const child of node.children) {
                visit(child, node.type === 'directory' ? [...ancestors, node.path] : ancestors)
              }
            }
          }
          for (const root of fileTree) visit(root, [])
        }
        setExpandedDirs(next)
      } catch (e) {
        console.error('Search failed', e)
      } finally {
        if (!cancelled) setIsSearching(false)
      }
    }

    const handle = setTimeout(doSearch, 300)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [currentProject, findOpen, findQuery, findRegex, findCase, fileTree])

  // Focus input when opening find
  useEffect(() => {
    if (findOpen) {
      setTimeout(() => findInputRef.current?.focus(), 0)
    }
  }, [findOpen])

  const loadDirectoryContents = async (node: FileNode) => {
    if (!isElectron || !window.electronAPI || node.loaded || !currentProjectPath) return
    
    try {
      // Don't concatenate if node.path is already absolute
      const absolutePath = node.path.startsWith(currentProjectPath) 
        ? node.path 
        : `${currentProjectPath}/${node.path}`
      const items = await window.electronAPI.readDirectory(absolutePath)
      
      // Convert to FileNode format
        const children: FileNode[] = items
          .filter(item => {
            // Skip .gitkeep files as they are not actual nodes
            if (item.name === '.gitkeep') return false
            
            // Show all directories and markdown files and also non-markdown under uploads
            if (item.type === 'directory') return true
            if (node.path.startsWith('uploads')) return true
            return item.name.endsWith('.md')
          })
        .map(item => ({
          id: `${node.path}/${item.name}`,
          name: item.name,
          path: `${node.path}/${item.name}`, // Use relative path
          type: item.type,
          children: item.type === 'directory' ? [] : undefined,
          loaded: false
        }))
        .sort((a, b) => {
          // Directories first, then files
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1
          }
          return a.name.localeCompare(b.name)
        })
      
      // Update the file tree
      setFileTree(prevTree => {
        const updateNode = (nodes: FileNode[]): FileNode[] => {
          return nodes.map(n => {
            if (n.path === node.path) {
              return { ...n, children, loaded: true }
            }
            if (n.children) {
              return { ...n, children: updateNode(n.children) }
            }
            return n
          })
        }
        return updateNode(prevTree)
      })
    } catch (error) {
      console.error('Failed to load directory contents:', error)
    }
  }

  const toggleDirectory = async (node: FileNode) => {
    const isExpanded = expandedDirs.has(node.path)
    
    if (!isExpanded && !node.loaded) {
      // Load directory contents if not already loaded
      await loadDirectoryContents(node)
    }
    
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(node.path)) {
        next.delete(node.path)
      } else {
        next.add(node.path)
      }
      return next
    })
  }

  const handleFileClick = async (node: FileNode) => {
    if (node.type === 'file') {
      setSelectedNode(node)
      // Create or switch to editor tab
      const absolutePath = node.path.startsWith(currentProjectPath!) 
        ? node.path 
        : `${currentProjectPath}/${node.path}`
      addEditorTab(absolutePath, node.name)
      navigate(`/editor/${encodeURIComponent(absolutePath)}`)
    } else {
      // Set selected folder when a directory is clicked (use relative path)
      setSelectedFolder(node.path)
      setSelectedNode(node)
      await toggleDirectory(node)
    }
  }

  const handleCreateFile = async (fileName: string) => {
    if (!currentProject) return
    
    try {
      if (isElectron && currentProjectPath && window.electronAPI) {
        // For Electron, create the file in the nodes directory
        const filePath = `${currentProjectPath}/nodes/${fileName}`
        const initialContent = `# ${fileName.replace('.md', '').replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}

<!-- 
Verbweaver Metadata
Type: document
Created: ${new Date().toISOString()}
Tags: []
-->

## Overview

Start writing your content here...

## Sections

### Section 1

Content for section 1.

### Section 2

Content for section 2.

## Related Links

- [[Related Node 1]]
- [[Related Node 2]]

## Notes

Add any additional notes or references here.
`
        
        // Write the file using Electron API
        await window.electronAPI.writeFile(filePath, initialContent)
        
        // Reload the file tree
        await loadFileTree()
        
        // Optionally navigate to the new file
        // Since we don't have a proper ID system for local files yet,
        // we'll just show a success message
        toast?.success?.(`File "${fileName}" created successfully`) || 
          alert(`File "${fileName}" created successfully`)
      } else {
        // For web version, use the API
        await editorApi.createFile(currentProject.id, `nodes/${fileName}`, '# New File\n\nContent goes here...')
        // Reload the file tree
        await loadFileTree()
        toast?.success?.(`File "${fileName}" created successfully`) || 
          alert(`File "${fileName}" created successfully`)
      }
    } catch (error) {
      console.error('Failed to create file:', error)
      alert('Failed to create file: ' + error)
    }
  }

  const handleCreateFolder = async (folderName: string) => {
    if (!folderName || !currentProject) return
    
    try {
      if (isElectron && currentProjectPath && window.electronAPI) {
        // In Electron mode, create a folder by creating a hidden file inside it
        const dummyFilePath = `${currentProjectPath}/${selectedFolder}/${folderName}/.gitkeep`
        await window.electronAPI.writeFile(dummyFilePath, '')
        
        // Reload the file tree
        await loadFileTree()
        toast.success('Folder created')
      } else if (!isElectron && currentProject.id) {
        // Web mode - use API
        await apiClient.post(`/projects/${currentProject.id}/folders`, {
          parent_path: selectedFolder,
          folder_name: folderName
        })
        
        // Reload the file tree
        await loadFileTree()
        toast.success('Folder created')
      }
    } catch (error) {
      console.error('Failed to create folder:', error)
      toast.error('Failed to create folder')
    }
  }

  const handleTemplateSelected = async (templatePath: string, nodeName: string, parentPath: string) => {
    if (!currentProject) return
    
    const targetParentPath = parentPath || selectedFolder || 'nodes'
    const metadataForNewNode: Record<string, any> = {}
    
    try {
      let response
      if (window.electronAPI && currentProjectPath) {
        // Desktop path: use IPC helper
        response = await createNodeFromTemplateDesktop(
          templatePath,
          nodeName,
          targetParentPath,
          metadataForNewNode
        )
      } else if (!window.electronAPI && currentProject?.id) {
        // Web path: convert template path to name
        const templateName = templatePath
          .replace(/^templates\//, '')
          .replace(/\.md$/, '')
        response = await templatesApi.createNodeFromTemplate(currentProject.id.toString(), {
          template_name: templateName,
          node_name: nodeName,
          parent_path: targetParentPath,
          initial_metadata: metadataForNewNode,
        })
      } else {
        toast.error('Project context not available for creating node')
        return
      }
      // Refresh files to show new node
      await loadFileTree()
      toast.success('Node created from template')
    } catch (error: any) {
      console.error('Failed to create node from template:', error)
      toast.error(error?.message || 'Failed to create node')
    }
  }

  const handleDragStart = useCallback((e: React.DragEvent, node: FileNode) => {
    setDraggedNode(node)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, node: FileNode) => {
    e.preventDefault()
    if (node.type === 'directory' && draggedNode && node.path !== draggedNode.path) {
      e.dataTransfer.dropEffect = 'move'
      setDragOverNode(node.path)
    }
  }, [draggedNode])

  const handleDragLeave = useCallback(() => {
    setDragOverNode(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, targetNode: FileNode) => {
    e.preventDefault()
    setDragOverNode(null)

    if (!draggedNode || targetNode.type !== 'directory' || targetNode.path === draggedNode.path) {
      return
    }

    // Check if we're trying to move a folder into its own child
    if (draggedNode.type === 'directory' && targetNode.path.startsWith(draggedNode.path + '/')) {
      toast.error('Cannot move a folder into its own subfolder')
      return
    }

    try {
      if (isElectron && window.electronAPI && currentProjectPath) {
        // Calculate new path
        const oldPath = draggedNode.path
        const newPath = `${targetNode.path}/${draggedNode.name}`
        
        // Move the file/folder using the new IPC handler
        await window.electronAPI.moveFile(oldPath, newPath)
        
        await loadFileTree()
        toast.success(`Moved ${draggedNode.name} to ${targetNode.name}`)
      } else if (!isElectron && currentProject) {
        // For web version, use API to move the file
        const oldPath = draggedNode.path
        const newPath = `${targetNode.path}/${draggedNode.name}`
        
        await apiClient.post(`/projects/${currentProject.id}/move`, {
          old_path: oldPath,
          new_path: newPath
        })
        
        await loadFileTree()
        toast.success(`Moved ${draggedNode.name} to ${targetNode.name}`)
      }
    } catch (error) {
      console.error('Failed to move file:', error)
      toast.error('Failed to move file')
    } finally {
      setDraggedNode(null)
    }
  }, [draggedNode, currentProject, currentProjectPath, isElectron, loadFileTree])

  const highlightName = (name: string): JSX.Element => {
    const q = findQuery
    if (!findOpen || !q) return <>{name}</>
    try {
      if (findRegex) {
        const flags = findCase ? 'g' : 'gi'
        const re = new RegExp(q, flags)
        const parts: Array<string | JSX.Element> = []
        let lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = re.exec(name)) !== null) {
          if (m.index > lastIndex) parts.push(name.slice(lastIndex, m.index))
          parts.push(<span className="bg-yellow-200 dark:bg-yellow-700/60" key={m.index}>{name.slice(m.index, re.lastIndex)}</span>)
          lastIndex = re.lastIndex
          if (m.index === re.lastIndex) re.lastIndex++
        }
        if (lastIndex < name.length) parts.push(name.slice(lastIndex))
        return <>{parts}</>
      } else {
        const hay = findCase ? name : name.toLowerCase()
        const needle = findCase ? q : q.toLowerCase()
        const idx = hay.indexOf(needle)
        if (idx === -1) return <>{name}</>
        return <>
          {name.slice(0, idx)}
          <span className="bg-yellow-200 dark:bg-yellow-700/60">{name.slice(idx, idx + needle.length)}</span>
          {name.slice(idx + needle.length)}
        </>
      }
    } catch {
      return <>{name}</>
    }
  }

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedDirs.has(node.path)
    const isSelected = selectedNode?.path === node.path || (node.type === 'directory' && node.path === selectedFolder)
    const isDragOver = dragOverNode === node.path
    const Icon = node.type === 'directory' ? Folder : FileText
    const ChevronIcon = isExpanded ? ChevronDown : ChevronRight

    // Filter when find is active: show directories that are ancestors of matches or any matching files; hide unrelated leaves
    if (findOpen && findResults.size > 0) {
      const isMatch = node.type === 'file' && findResults.has(node.path)
      const isAncestor = node.type === 'directory' && Array.from(findResults.keys()).some(p => p.startsWith(node.path + '/'))
      if (!isMatch && !isAncestor) {
        return null
      }
    }

    return (
      <div key={node.id}>
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, node)}
          onDragOver={(e) => handleDragOver(e, node)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node)}
          className={clsx(
            'flex items-center group',
            isDragOver && 'bg-accent/30'
          )}
        >
          <div className="opacity-0 group-hover:opacity-100 transition-opacity p-1 cursor-move">
            <GripVertical className="w-3 h-3 text-muted-foreground" />
          </div>
          <button
            onClick={() => handleFileClick(node)}
            className={clsx(
              'flex-1 flex items-center gap-1 px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground',
              'transition-colors',
              isSelected && 'bg-accent/50'
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {node.type === 'directory' && (
              <ChevronIcon className="w-3 h-3 flex-shrink-0" />
            )}
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{highlightName(node.name)}</span>
            {node.type === 'file' && findOpen && findResults.has(node.path) && (
              <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-accent text-accent-foreground">{findResults.get(node.path)}</span>
            )}
          </button>
        </div>
        
        {node.type === 'directory' && isExpanded && node.children && (
          <div>
            {node.children.map(child => (
              <div key={child.path}>
                {renderNode(child, depth + 1)}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (!currentProject) {
    return (
      <div className="h-full bg-muted/30 border-r border-border p-4">
        <p className="text-sm text-muted-foreground">No project selected</p>
      </div>
    )
  }

  return (
    <div className="h-full bg-muted/30 border-r border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold">Files</h3>
          {selectedFolder && selectedFolder !== 'nodes' && (
            <p className="text-xs text-muted-foreground">in {selectedFolder}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFindOpen(v => !v)}
            className={clsx("p-1 rounded hover:bg-accent", findOpen && "bg-accent")}
            title="Find in Files"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={async () => {
              if (!isElectron || !window.electronAPI || !currentProjectPath) return
              const api: any = window.electronAPI
              try { if (api?.openPath) { await api.openPath(currentProjectPath); return } } catch {}
              try { if (api?.openExternal) { const url = `file://${currentProjectPath.replace(/\\/g,'/')}`; await api.openExternal(url); return } } catch {}
              try { if (api?.showItemInFolder) { await api.showItemInFolder(currentProjectPath); return } } catch {}
              toast.error('Unable to open folder')
            }}
            className="p-1 rounded hover:bg-accent"
            title={currentProjectPath ? 'Open project folder' : 'No project path'}
            disabled={!currentProjectPath}
          >
            <FolderOpen className="w-4 h-4" />
          </button>
          <button
            onClick={loadFileTree}
            className="p-1 rounded hover:bg-accent"
            title="Refresh files"
          >
            <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              // Prefer explicitly selected node (file or folder). Fallback to selectedFolder.
              if (selectedNode) {
                setRenameTarget(selectedNode)
              } else {
                const folderNode: FileNode | null = selectedFolder ? { id: selectedFolder, name: selectedFolder.split('/').pop() || selectedFolder, path: selectedFolder, type: 'directory' } : null
                setRenameTarget(folderNode)
              }
              setRenameOpen(true)
            }}
            className="p-1 rounded hover:bg-accent"
            title={selectedNode ? `Rename ${selectedNode.name}` : (selectedFolder ? `Rename ${selectedFolder}` : 'Rename')}
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={async () => {
              // Create hidden input on the fly for upload
              const input = document.createElement('input')
              input.type = 'file'
              input.multiple = true
              input.style.display = 'none'
              document.body.appendChild(input)
              input.onchange = async (e: any) => {
                const files = input.files
                if (!files) { document.body.removeChild(input); return }
                try {
                  const { FileStorage } = await import('../../utils/fileStorage')
                  const uploaded: any[] = []
                  for (const f of Array.from(files)) {
                    const sf = await FileStorage.uploadFile(f, 'upload')
                    if (sf) uploaded.push(sf)
                  }
                  // For each uploaded file, create a metadata .md with tracked=false
                  if (isElectron && window.electronAPI && currentProjectPath) {
                    for (const sf of uploaded) {
                      const rel = sf.path.replace(/\\/g,'/').startsWith(currentProjectPath.replace(/\\/g,'/') + '/')
                        ? sf.path.replace(/\\/g,'/').slice(currentProjectPath.replace(/\\/g,'/').length + 1)
                        : sf.path
                      const absMeta = `${currentProjectPath}/${rel}.metadata.md`
                      const meta = `---\nid: upload-${Date.now()}-${Math.random().toString(36).slice(2)}\ntitle: ${sf.originalName}\ntype: file\ntask:\n  tracked: false\n---\n`
                      await window.electronAPI.writeFile(absMeta, meta)
                    }
                  }
                  await loadFileTree()
                  // Also refresh nodes so Graph/Tasks pick them up
                  try { (await import('../../store/nodeStore')).useNodeStore.getState().loadNodes() } catch {}
                  toast.success('File(s) uploaded')
                } catch (err) {
                  console.error('Upload failed', err)
                  toast.error('Failed to upload files')
                } finally {
                  document.body.removeChild(input)
                }
              }
              input.click()
            }}
            className="p-1 rounded hover:bg-accent"
            title="Upload file(s)"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowFolderDialog(true)}
            className="p-1 rounded hover:bg-accent"
            title={`Create folder in ${selectedFolder}`}
          >
            <FolderPlus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowTemplateDialog(true)}
            className="p-1 rounded hover:bg-accent"
            title={`Create node in ${selectedFolder}`}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Find Bar */}
      {findOpen && (
        <div className="p-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <input
              ref={findInputRef}
              type="text"
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              placeholder="Find in files..."
              className="flex-1 text-sm px-2 py-1 border border-input rounded bg-background"
            />
            {isSearching && <span className="text-xs text-muted-foreground">Searching...</span>}
            <button
              onClick={() => setFindOpen(false)}
              className="p-1 rounded hover:bg-accent"
              title="Close Find"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={findCase} onChange={(e)=>setFindCase(e.target.checked)} />
              Case sensitive
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={findRegex} onChange={(e)=>setFindRegex(e.target.checked)} />
              Regex
            </label>
          </div>
        </div>
      )}

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading...</div>
        ) : fileTree.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No files</div>
        ) : (
          fileTree.map(node => (
            <div key={node.path}>
              {renderNode(node)}
            </div>
          ))
        )}
      </div>

      {/* File Create Dialog */}
      <FileCreateDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={handleCreateFile}
      />

      {/* Folder Create Dialog */}
      <FolderCreateDialog
        isOpen={showFolderDialog}
        onClose={() => setShowFolderDialog(false)}
        onCreate={handleCreateFolder}
      />

      {/* Template Selection Dialog */}
      <TemplateSelectionDialog
        isOpen={showTemplateDialog}
        onClose={() => setShowTemplateDialog(false)}
        onSelectTemplate={handleTemplateSelected}
        parentPath={selectedFolder}
      />

      {/* Rename Dialog */}
      <PromptDialog
        isOpen={renameOpen}
        onCancel={() => setRenameOpen(false)}
        title={renameTarget?.type === 'directory' ? 'Rename Folder' : 'Rename File'}
        label={renameTarget?.type === 'directory' ? 'New folder name' : 'New file name'}
        defaultValue={renameTarget?.name || ''}
        placeholder={renameTarget?.type === 'directory' ? 'folder-name' : 'file-name.md'}
        confirmLabel="Rename"
        validate={(v)=>{
          if (!v) return 'Name is required'
          if (/[/\\]/.test(v)) return 'Name cannot contain / or \\'
          return null
        }}
        onConfirm={async (newName) => {
          if (!renameTarget) { setRenameOpen(false); return }
          try {
            if (isElectron && window.electronAPI && currentProjectPath) {
              const oldPath = renameTarget.path
              const parent = oldPath.includes('/') ? oldPath.slice(0, oldPath.lastIndexOf('/')) : ''
              const newPath = parent ? `${parent}/${newName}` : newName
              await window.electronAPI.moveFile(oldPath, newPath)
              // If renaming the selected folder, update selectedFolder
              if (renameTarget.type === 'directory' && selectedFolder === oldPath) {
                setSelectedFolder(newPath)
              }
              if (selectedNode?.path === oldPath) {
                setSelectedNode({ ...renameTarget, name: newName, path: newPath })
              }
            } else if (!isElectron && currentProject) {
              const oldPath = renameTarget.path
              const parent = oldPath.includes('/') ? oldPath.slice(0, oldPath.lastIndexOf('/')) : ''
              const newPath = parent ? `${parent}/${newName}` : newName
              await apiClient.post(`/projects/${currentProject.id}/move`, { old_path: oldPath, new_path: newPath })
              if (renameTarget.type === 'directory' && selectedFolder === oldPath) {
                setSelectedFolder(newPath)
              }
              if (selectedNode?.path === oldPath) {
                setSelectedNode({ ...renameTarget, name: newName, path: newPath })
              }
            }
            await loadFileTree()
            toast.success('Renamed successfully')
          } catch (e) {
            console.error('Rename failed', e)
            toast.error('Failed to rename')
          } finally {
            setRenameOpen(false)
          }
        }}
      />
    </div>
  )
}

export default EditorSidebar 