import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronDown, FileText, Folder, Plus } from 'lucide-react'
import { useProjectStore } from '../../store/projectStore'
import { editorApi } from '../../api/editorApi'
import clsx from 'clsx'

interface FileNode {
  id: string
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

function EditorSidebar() {
  const navigate = useNavigate()
  const { currentProject } = useProjectStore()
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (currentProject) {
      loadFileTree()
    }
  }, [currentProject])

  const loadFileTree = async () => {
    if (!currentProject) return
    
    setIsLoading(true)
    try {
      const tree = await editorApi.getFileTree(currentProject.id)
      setFileTree(tree)
    } catch (error) {
      console.error('Failed to load file tree:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleDirectory = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleFileClick = (node: FileNode) => {
    if (node.type === 'file') {
      navigate(`/editor/${node.id}`)
    } else {
      toggleDirectory(node.path)
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
          onClick={() => {/* TODO: Create new file */}}
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
    </div>
  )
}

export default EditorSidebar 