import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronDown, FileText, Folder, Plus } from 'lucide-react'
import { useProjectStore } from '../../store/projectStore'
import { editorApi } from '../../api/editorApi'
import clsx from 'clsx'
import FileCreateDialog from './FileCreateDialog'
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
  const { addEditorTab } = useTabStore()

  useEffect(() => {
    if (currentProject) {
      loadFileTree()
    }
  }, [currentProject, currentProjectPath])

  const loadFileTree = async () => {
    if (!currentProject) return
    
    setIsLoading(true)
    try {
      if (isElectron && currentProjectPath && window.electronAPI) {
        // For Electron, read the actual project structure
        const rootItems = await window.electronAPI.readDirectory(currentProjectPath)
        
        // Convert to FileNode format and filter for relevant directories/files
        const tree: FileNode[] = rootItems
          .filter(item => {
            // Show specific directories and markdown files
            if (item.type === 'directory') {
              return ['nodes', 'tasks', 'docs', 'templates'].includes(item.name)
            }
            return item.name.endsWith('.md')
          })
          .map(item => ({
            id: item.path,
            name: item.name,
            path: item.path,
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
        const tree = await editorApi.getFileTree(currentProject.id)
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

  const loadDirectoryContents = async (node: FileNode) => {
    if (!isElectron || !window.electronAPI || node.loaded) return
    
    try {
      const items = await window.electronAPI.readDirectory(node.path)
      
      // Convert to FileNode format
      const children: FileNode[] = items
        .filter(item => {
          // Show all directories and markdown files
          return item.type === 'directory' || item.name.endsWith('.md')
        })
        .map(item => ({
          id: item.path,
          name: item.name,
          path: item.path,
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
      // Create or switch to editor tab
      addEditorTab(node.path, node.name)
      navigate(`/editor/${encodeURIComponent(node.path)}`)
    } else {
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
      }
    } catch (error) {
      console.error('Failed to create file:', error)
      alert('Failed to create file: ' + error)
    }
  }

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedDirs.has(node.path)
    const Icon = node.type === 'directory' ? Folder : FileText
    const ChevronIcon = isExpanded ? ChevronDown : ChevronRight

    return (
      <div key={node.id}>
        <button
          onClick={() => handleFileClick(node)}
          className={clsx(
            'w-full flex items-center gap-1 px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground',
            'transition-colors'
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {node.type === 'directory' && (
            <ChevronIcon className="w-3 h-3 flex-shrink-0" />
          )}
          <Icon className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
        
        {node.type === 'directory' && isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
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
        <h3 className="text-sm font-semibold">Files</h3>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="p-1 rounded hover:bg-accent"
          title="New file"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading...</div>
        ) : fileTree.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No files</div>
        ) : (
          fileTree.map(node => renderNode(node))
        )}
      </div>

      {/* File Create Dialog */}
      <FileCreateDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={handleCreateFile}
      />
    </div>
  )
}

export default EditorSidebar 