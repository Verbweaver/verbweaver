import { useEffect, useRef, useState } from 'react'
import { desktopTemplatesApi } from '../../api/desktop-templates'
import { templatesApi, Template } from '../../api/templates'
import { useProjectStore } from '../../store/projectStore'
import { Plus, Trash2, Edit, Link, Folder, FolderPlus, Loader2 } from 'lucide-react'

interface NodeContextMenuProps {
  x: number
  y: number
  nodeId?: string
  isFolder?: boolean
  onCreateNode: (type: string, position?: { x: number; y: number }) => void
  onDeleteNode: (nodeId: string) => void
  onCreateChildNode?: (parentPath: string) => void
  onClose: () => void
}

function NodeContextMenu({ x, y, nodeId, isFolder, onCreateNode, onDeleteNode, onCreateChildNode, onClose }: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const { currentProject, currentProjectPath } = useProjectStore()
  const [templates, setTemplates] = useState<Template[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Load templates when menu opens and no nodeId (creating new node)
  useEffect(() => {
    // Only attempt to load templates if we are creating a new node (no nodeId)
    // And if we have the necessary project information for the current environment.
    if (!nodeId) {
      if (window.electronAPI && currentProjectPath) {
        // Desktop: requires currentProjectPath
        loadTemplates();
      } else if (!window.electronAPI && currentProject?.id) {
        // Web: requires currentProject.id
        loadTemplates();
      }
    }
  }, [nodeId, currentProject, currentProjectPath]);

  const loadTemplates = async () => {
    // This initial check is redundant due to the useEffect logic but kept for safety.
    if ((window.electronAPI && !currentProjectPath) && (!window.electronAPI && !currentProject?.id)) {
      console.warn("loadTemplates called without necessary project context.");
      return;
    }
    
    setIsLoading(true);
    try {
      let templateList: Template[];
      
      if (window.electronAPI && currentProjectPath) {
        // Desktop: use local filesystem API
        console.log('Loading templates from desktop API:', currentProjectPath);
        templateList = await desktopTemplatesApi.listTemplates(currentProjectPath);
      } else if (!window.electronAPI && currentProject?.id) {
        // Web: use REST API
        console.log('Loading templates from REST API:', currentProject.id);
        templateList = await templatesApi.listTemplates(currentProject.id);
      } else {
        console.error('No project selected or invalid project state:', { 
          isElectron: !!window.electronAPI, 
          currentProjectPath, 
          currentProjectId: currentProject?.id 
        });
        // Do not throw an error here, let it be handled by showing "No templates available"
        setTemplates([]); // Ensure templates is empty
        setIsLoading(false);
        return;
      }
      
      setTemplates(templateList);
    } catch (error) {
      console.error('Failed to load templates:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      ref={menuRef}
      className="fixed bg-popover border border-border rounded-md shadow-lg py-1 z-50 min-w-[150px]"
      style={{ left: x, top: y }}
    >
      {!nodeId && (
        <>
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Create</div>
          <button
            onClick={() => onCreateNode('folder')}
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
          >
            <FolderPlus className="w-3 h-3" />
            Folder
          </button>
          <div className="h-px bg-border my-1" />
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">From Template</div>
          {isLoading ? (
            <div className="px-3 py-2 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No templates available</div>
          ) : (
            templates.map((template) => (
              <button
                key={template.path}
                onClick={() => onCreateNode('node')}
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
              >
                <Plus className="w-3 h-3" />
                {template.metadata.title}
              </button>
            ))
          )}
        </>
      )}
      
      {nodeId && (
        <>
          {isFolder && onCreateChildNode && (
            <>
              <button
                onClick={() => onCreateChildNode(nodeId)}
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
              >
                <Plus className="w-3 h-3" />
                Create Node in Folder
              </button>
              <div className="h-px bg-border my-1" />
            </>
          )}
          
          <button
            onClick={() => {
              // TODO: Open in editor
              onClose()
            }}
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
          >
            <Edit className="w-3 h-3" />
            Edit
          </button>
          
          <button
            onClick={() => {
              // TODO: Create link
              onClose()
            }}
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
          >
            <Link className="w-3 h-3" />
            Create Link
          </button>
          
          <div className="h-px bg-border my-1" />
          
          <button
            onClick={() => onDeleteNode(nodeId)}
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-destructive hover:text-destructive-foreground flex items-center gap-2"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        </>
      )}
    </div>
  )
}

export default NodeContextMenu 