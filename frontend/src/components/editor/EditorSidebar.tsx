import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronDown, FileText, Folder, Plus, FolderPlus, GripVertical } from 'lucide-react'
import { useProjectStore } from '../../store/projectStore'
import { editorApi } from '../../api/editorApi'
import { TemplateSelectionDialog } from '../TemplateSelectionDialog'
import { FolderCreateDialog } from '../FolderCreateDialog'
import { templatesApi } from '../../api/templates'
import { apiClient } from '../../api/client'
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
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)
  const [showFolderDialog, setShowFolderDialog] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState<string>('nodes') // Track selected folder
  const [draggedNode, setDraggedNode] = useState<FileNode | null>(null)
  const [dragOverNode, setDragOverNode] = useState<string | null>(null)
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
            // Show specific directories and markdown files at the root of the project
            if (item.type === 'directory') {
              return ['nodes', 'docs', 'templates'].includes(item.name); // Removed 'tasks'
            }
            return item.name.endsWith('.md'); // Also show root markdown files (like README.md)
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
          // Show all directories and markdown files
          return item.type === 'directory' || item.name.endsWith('.md')
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
      // Create or switch to editor tab
      const absolutePath = node.path.startsWith(currentProjectPath!) 
        ? node.path 
        : `${currentProjectPath}/${node.path}`
      addEditorTab(absolutePath, node.name)
      navigate(`/editor/${encodeURIComponent(absolutePath)}`)
    } else {
      // Set selected folder when a directory is clicked (use relative path)
      setSelectedFolder(node.path)
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
    
    try {
      // Extract template name from path (e.g., "templates/MyTemplate.md" -> "MyTemplate")
      const templateName = templatePath
        .replace(/^templates\//, '')
        .replace(/\.md$/, '');

      console.log('Creating node with:', {
        projectId: currentProject.id,
        templateName,
        nodeName,
        parentPath: parentPath || 'nodes'
      });

      await templatesApi.createNodeFromTemplate(currentProject.id.toString(), {
        template_name: templateName,
        node_name: nodeName,
        parent_path: parentPath || 'nodes'
      });
      
      // Reload the file tree
      await loadFileTree();
      toast.success('Node created');
    } catch (error: any) {
      console.error('Failed to create node:', error);
      const errorDetail = error.response?.data?.detail || error.message;
      toast.error(`Failed to create node: ${errorDetail}`);
    }
  };

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

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedDirs.has(node.path)
    const isSelected = node.type === 'directory' && node.path === selectedFolder
    const isDragOver = dragOverNode === node.path
    const Icon = node.type === 'directory' ? Folder : FileText
    const ChevronIcon = isExpanded ? ChevronDown : ChevronRight

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
            <span className="truncate">{node.name}</span>
          </button>
        </div>
        
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
        <div>
          <h3 className="text-sm font-semibold">Files</h3>
          {selectedFolder && selectedFolder !== 'nodes' && (
            <p className="text-xs text-muted-foreground">in {selectedFolder}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
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
    </div>
  )
}

export default EditorSidebar 