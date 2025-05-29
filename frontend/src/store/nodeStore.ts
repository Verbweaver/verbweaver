import { create } from 'zustand'
import { NodeType, TaskState, MarkdownMetadata, GraphNode } from '@verbweaver/shared'
import toast from 'react-hot-toast'
import { useProjectStore } from './projectStore'
import * as yaml from 'js-yaml'

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

// Helper function to join paths safely in the frontend
function joinPaths(...parts: string[]): string {
  // Filter out empty parts and normalize slashes
  const cleanParts = parts.filter(Boolean).map(part => 
    part.replace(/^[\/\\]+|[\/\\]+$/g, '').replace(/\\/g, '/')
  );
  return cleanParts.join('/');
}

interface NodeState {
  nodes: Map<string, VerbweaverNode>  // Map of path -> node
  isLoading: boolean
  error: string | null
  
  // Core operations
  loadNodes: () => Promise<void>
  getNode: (path: string) => VerbweaverNode | undefined
  getNodesByFilter: (filter: NodeFilter) => VerbweaverNode[]
  
  // CRUD operations
  createNode: (parentPath: string, name: string, type: NodeType, initialMetadata?: Partial<MarkdownMetadata>, initialContent?: string) => Promise<VerbweaverNode>
  updateNode: (path: string, updates: { metadata?: Partial<MarkdownMetadata>, content?: string }) => Promise<void>
  deleteNode: (path: string) => Promise<void>
  moveNode: (oldPath: string, newPath: string) => Promise<void>
  
  // Task operations
  updateTaskStatus: (path: string, status: TaskState) => Promise<void>
  
  // Link operations
  createSoftLink: (sourcePath: string, targetPath: string) => Promise<void>
  removeSoftLink: (sourcePath: string, targetPath: string) => Promise<void>
  
  // File watching
  watchForChanges: () => void
  stopWatching: () => void
}

// Define VerbweaverNode interface
interface VerbweaverNode {
  path: string
  name: string
  isDirectory: boolean
  isMarkdown: boolean
  metadata: MarkdownMetadata
  content: string | null
  hardLinks: {
    parent: string | null
    children: string[]
  }
  softLinks: string[]
  hasTask: boolean
  taskStatus?: TaskState
}

// Define NodeFilter interface
interface NodeFilter {
  type?: NodeType
  tags?: string[]
  taskStatus?: TaskState
  hasTask?: boolean
  directory?: string
  searchTerm?: string
}

// Helper function to parse YAML front matter
function parseMarkdownWithFrontMatter(content: string): { metadata: any, content: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (match) {
    try {
      const metadata = yaml.load(match[1]) as any;
      return { metadata, content: match[2] };
    } catch (e) {
      console.error('Failed to parse YAML front matter:', e);
    }
  }
  return { metadata: {}, content };
}

// Helper function to stringify content with YAML front matter
function stringifyMarkdownWithFrontMatter(metadata: any, content: string): string {
  const yamlStr = yaml.dump(metadata, { indent: 2, lineWidth: -1 });
  return `---\n${yamlStr}---\n${content}`;
}

// Helper to generate a unique ID
function generateId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Helper to sanitize filename
function sanitizeFilename(name: string): string {
  // Remove or replace invalid characters
  return name.replace(/[<>:"/\\|?*]/g, '-').trim();
}

// Helper to load a node from file (Electron only)
async function loadNodeFromFile(filePath: string, isDirectory: boolean): Promise<VerbweaverNode | null> {
  if (!isElectron || !window.electronAPI) return null;
  
  const { currentProjectPath } = useProjectStore.getState();
  if (!currentProjectPath) {
    console.error('No project path set in loadNodeFromFile');
    return null;
  }

  // Normalize the file path to use forward slashes
  const normalizedPath = filePath.replace(/\\/g, '/');
  const name = normalizedPath.split('/').pop() || '';
  const isMarkdown = name.endsWith('.md');
  const metadataPath = isMarkdown ? normalizedPath : `${normalizedPath}.metadata.md`;
  
  let metadata: MarkdownMetadata = {
    id: generateId(),
    title: name.replace(/\.md$/, ''),
    type: isDirectory ? 'folder' : 'file'
  };
  
  let content: string | null = null;
  
  try {
    // Resolve absolute paths for file operations
    const absolutePath = normalizedPath.startsWith(currentProjectPath) 
      ? normalizedPath 
      : joinPaths(currentProjectPath, normalizedPath);
    
    const absoluteMetadataPath = metadataPath.startsWith(currentProjectPath)
      ? metadataPath
      : joinPaths(currentProjectPath, metadataPath);

    if (isMarkdown && !isDirectory) {
      // Read Markdown file with front matter
      const fileContent = await window.electronAPI.readFile(absolutePath);
      const parsed = parseMarkdownWithFrontMatter(fileContent);
      // Preserve the ID from the file if it exists, otherwise use the generated one
      metadata = { 
        id: parsed.metadata.id || metadata.id,
        title: parsed.metadata.title || name.replace(/\.md$/, ''),
        type: parsed.metadata.type || (isDirectory ? 'folder' : 'file'),
        ...parsed.metadata 
      };
      content = parsed.content;
    } else if (!isDirectory) {
      // Check for .metadata.md file
      try {
        const metadataContent = await window.electronAPI.readFile(absoluteMetadataPath);
        const parsed = parseMarkdownWithFrontMatter(metadataContent);
        // Preserve the ID from the file if it exists
        metadata = { 
          id: parsed.metadata.id || metadata.id,
          title: parsed.metadata.title || name.replace(/\.md$/, ''),
          type: parsed.metadata.type || (isDirectory ? 'folder' : 'file'),
          ...parsed.metadata 
        };
      } catch (e) {
        // No metadata file, use defaults
      }
    }
  } catch (error) {
    console.error(`Failed to read file ${normalizedPath}:`, error);
  }
  
  // Build hard links - properly calculate parent
  const parent = normalizedPath.includes('/') ? normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) : null;
  let children: string[] = [];
  
  if (isDirectory) {
    try {
      const absoluteDirPath = normalizedPath.startsWith(currentProjectPath)
        ? normalizedPath
        : joinPaths(currentProjectPath, normalizedPath);
      const dirContents = await window.electronAPI.readDirectory(absoluteDirPath);
      children = dirContents.map(item => joinPaths(normalizedPath, item.name).replace(/\\/g, '/'));
    } catch (error) {
      console.error(`Failed to read directory ${normalizedPath}:`, error);
    }
  }
  
  return {
    path: normalizedPath,
    name,
    isDirectory,
    isMarkdown,
    metadata,
    content,
    hardLinks: { parent, children },
    softLinks: metadata.links || [],
    hasTask: !!metadata.task,
    taskStatus: metadata.task?.status
  };
}

export const useNodeStore = create<NodeState>((set, get) => ({
  nodes: new Map(),
  isLoading: false,
  error: null,

  loadNodes: async () => {
    const { currentProject, currentProjectPath } = useProjectStore.getState();
    if (!currentProject && !currentProjectPath) {
      console.log('[NodeStore] No project selected');
      return;
    }

    console.log('[NodeStore] Loading nodes for project:', currentProjectPath || currentProject?.id);
    set({ isLoading: true, error: null });

    try {
      if (isElectron && currentProjectPath && window.electronAPI) {
        // Electron: Read files from filesystem
        const files = await window.electronAPI.readProjectFiles(currentProjectPath);
        console.log('[NodeStore] All files found:', files.map(f => f.path));
        const nodes = new Map<string, VerbweaverNode>();
        
        for (const file of files) {
          // Only process files within the nodes/ directory
          // Normalize path separators for cross-platform compatibility
          const normalizedPath = file.path.replace(/\\/g, '/');
          if (!normalizedPath.startsWith('nodes/') && normalizedPath !== 'nodes') {
            console.log('[NodeStore] Skipping file outside nodes/:', file.path);
            continue;
          }
          
          console.log('[NodeStore] Processing node file:', file.path);
          const node = await loadNodeFromFile(file.path, file.isDirectory);
          if (node) {
            nodes.set(node.path, node);
          }
        }
        
        console.log('[NodeStore] Loaded nodes:', Array.from(nodes.keys()));
        set({ nodes, isLoading: false });
      } else if (currentProject) {
        // Web: Fetch from API
        const response = await fetch(`/api/projects/${currentProject.id}/nodes`);
        const data = await response.json();
        
        const nodes = new Map<string, VerbweaverNode>();
        for (const node of data.nodes) {
          nodes.set(node.path, node);
        }
        
        set({ nodes, isLoading: false });
      }
    } catch (error) {
      console.error('[NodeStore] Failed to load nodes:', error);
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  getNode: (path: string) => {
    return get().nodes.get(path);
  },

  getNodesByFilter: (filter: NodeFilter) => {
    const nodes = Array.from(get().nodes.values());
    
    return nodes.filter(node => {
      if (filter.type && node.metadata.type !== filter.type) return false;
      if (filter.hasTask !== undefined && node.hasTask !== filter.hasTask) return false;
      if (filter.taskStatus && node.taskStatus !== filter.taskStatus) return false;
      if (filter.tags && filter.tags.length > 0) {
        const nodeTags = node.metadata.tags || [];
        if (!filter.tags.some(tag => nodeTags.includes(tag))) return false;
      }
      if (filter.directory && !node.path.startsWith(filter.directory)) return false;
      if (filter.searchTerm) {
        const searchLower = filter.searchTerm.toLowerCase();
        const inTitle = node.metadata.title.toLowerCase().includes(searchLower);
        const inContent = node.content?.toLowerCase().includes(searchLower) || false;
        if (!inTitle && !inContent) return false;
      }
      return true;
    });
  },

  createNode: async (parentPath: string, name: string, type: NodeType, initialMetadata?: Partial<MarkdownMetadata>, initialContent?: string) => {
    const { currentProjectPath } = useProjectStore.getState();
    if (!currentProjectPath && isElectron) {
      throw new Error('No project path set');
    }

    const sanitizedName = sanitizeFilename(name);
    const filename = sanitizedName.endsWith('.md') ? sanitizedName : `${sanitizedName}.md`;
    const relativePath = parentPath ? `${parentPath}/${filename}` : filename;
    
    const metadata: MarkdownMetadata = {
      id: generateId(),
      title: sanitizedName.replace(/\.md$/, ''),
      type,
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      ...initialMetadata
    };
    
    const content = initialContent || `# ${metadata.title}\n\n`;
    const fileContent = stringifyMarkdownWithFrontMatter(metadata, content);
    
    try {
      if (isElectron && window.electronAPI && currentProjectPath) {
        // Build absolute path for Electron
        const absolutePath = joinPaths(currentProjectPath, relativePath);
        await window.electronAPI.writeFile(absolutePath, fileContent);
      } else if (!isElectron) {
        // Web API call
        await fetch(`/api/projects/${useProjectStore.getState().currentProject?.id}/nodes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: relativePath, metadata, content })
        });
      }
      
      // Create the node object
      const node: VerbweaverNode = {
        path: relativePath,
        name: filename,
        isDirectory: false,
        isMarkdown: true,
        metadata,
        content,
        hardLinks: { parent: parentPath || null, children: [] },
        softLinks: metadata.links || [],
        hasTask: !!metadata.task,
        taskStatus: metadata.task?.status
      };
      
      // Update the store
      set(state => ({
        nodes: new Map(state.nodes).set(relativePath, node)
      }));
      
      toast.success(`Created ${metadata.title}`);
      return node;
    } catch (error) {
      toast.error('Failed to create node');
      throw error;
    }
  },

  updateNode: async (path: string, updates: { metadata?: Partial<MarkdownMetadata>, content?: string }) => {
    const { currentProjectPath } = useProjectStore.getState();
    const node = get().nodes.get(path);
    if (!node) throw new Error('Node not found');
    
    const updatedMetadata = {
      ...node.metadata,
      ...updates.metadata,
      modified: new Date().toISOString()
    };
    
    const updatedContent = updates.content !== undefined ? updates.content : node.content;
    
    if (node.isMarkdown && updatedContent !== null) {
      const fileContent = stringifyMarkdownWithFrontMatter(updatedMetadata, updatedContent);
      
      try {
        if (isElectron && window.electronAPI && currentProjectPath) {
          // Build absolute path for Electron
          const absolutePath = path.startsWith(currentProjectPath) ? path : joinPaths(currentProjectPath, path);
          await window.electronAPI.writeFile(absolutePath, fileContent);
        } else if (!isElectron) {
          await fetch(`/api/projects/${useProjectStore.getState().currentProject?.id}/nodes/${encodeURIComponent(path)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ metadata: updatedMetadata, content: updatedContent })
          });
        }
        
        // Update the store
        const updatedNode: VerbweaverNode = {
          ...node,
          metadata: updatedMetadata,
          content: updatedContent,
          softLinks: updatedMetadata.links || [],
          hasTask: !!updatedMetadata.task,
          taskStatus: updatedMetadata.task?.status
        };
        
        set(state => ({
          nodes: new Map(state.nodes).set(path, updatedNode)
        }));
        
      } catch (error) {
        toast.error('Failed to update node');
        throw error;
      }
    } else {
      // Non-markdown file: update .metadata.md file
      const metadataPath = `${path}.metadata.md`;
      const metadataContent = stringifyMarkdownWithFrontMatter(updatedMetadata, '');
      
      try {
        if (isElectron && window.electronAPI && currentProjectPath) {
          // Build absolute path for Electron
          const absoluteMetadataPath = joinPaths(currentProjectPath, metadataPath);
          await window.electronAPI.writeFile(absoluteMetadataPath, metadataContent);
        } else if (!isElectron) {
          await fetch(`/api/projects/${useProjectStore.getState().currentProject?.id}/nodes/${encodeURIComponent(path)}/metadata`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ metadata: updatedMetadata })
          });
        }
        
        // Update the store
        const updatedNode: VerbweaverNode = {
          ...node,
          metadata: updatedMetadata,
          softLinks: updatedMetadata.links || [],
          hasTask: !!updatedMetadata.task,
          taskStatus: updatedMetadata.task?.status
        };
        
        set(state => ({
          nodes: new Map(state.nodes).set(path, updatedNode)
        }));
        
      } catch (error) {
        toast.error('Failed to update node metadata');
        throw error;
      }
    }
  },

  deleteNode: async (path: string) => {
    const { currentProjectPath } = useProjectStore.getState();
    
    try {
      if (isElectron && window.electronAPI && currentProjectPath) {
        // Build absolute path for Electron
        const absolutePath = path.startsWith(currentProjectPath) ? path : joinPaths(currentProjectPath, path);
        await window.electronAPI.deleteFile(absolutePath);
        // Also try to delete metadata file if it exists
        try {
          const absoluteMetadataPath = joinPaths(currentProjectPath, `${path}.metadata.md`);
          await window.electronAPI.deleteFile(absoluteMetadataPath);
        } catch (e) {
          // Ignore error if metadata file doesn't exist
        }
      } else if (!isElectron) {
        await fetch(`/api/projects/${useProjectStore.getState().currentProject?.id}/nodes/${encodeURIComponent(path)}`, {
          method: 'DELETE'
        });
      }
      
      // Remove from store
      set(state => {
        const newNodes = new Map(state.nodes);
        newNodes.delete(path);
        return { nodes: newNodes };
      });
      
      toast.success('Node deleted');
    } catch (error) {
      toast.error('Failed to delete node');
      throw error;
    }
  },

  moveNode: async (oldPath: string, newPath: string) => {
    // Implementation for moving/renaming nodes
    // This would involve file system operations and updating all references
    toast('Move operation not yet implemented');
  },

  updateTaskStatus: async (path: string, status: TaskState) => {
    const node = get().nodes.get(path);
    if (!node) throw new Error('Node not found');
    
    await get().updateNode(path, {
      metadata: {
        task: {
          ...node.metadata.task,
          status,
          completedDate: status === 'done' ? new Date().toISOString() : undefined
        }
      }
    });
  },

  createSoftLink: async (sourcePath: string, targetPath: string) => {
    const sourceNode = get().nodes.get(sourcePath);
    const targetNode = get().nodes.get(targetPath);
    
    if (!sourceNode || !targetNode) throw new Error('Node not found');
    
    const updatedLinks = [...(sourceNode.metadata.links || [])];
    if (!updatedLinks.includes(targetNode.metadata.id)) {
      updatedLinks.push(targetNode.metadata.id);
      
      await get().updateNode(sourcePath, {
        metadata: { links: updatedLinks }
      });
    }
  },

  removeSoftLink: async (sourcePath: string, targetPath: string) => {
    const sourceNode = get().nodes.get(sourcePath);
    const targetNode = get().nodes.get(targetPath);
    
    if (!sourceNode || !targetNode) throw new Error('Node not found');
    
    const updatedLinks = (sourceNode.metadata.links || []).filter(id => id !== targetNode.metadata.id);
    
    await get().updateNode(sourcePath, {
      metadata: { links: updatedLinks }
    });
  },

  watchForChanges: () => {
    // Set up file watching
    if (isElectron && window.electronAPI?.watchProject) {
      // Use Electron's file watching API
      window.electronAPI.watchProject((event: any) => {
        if (event.type === 'change') {
          // Reload the affected node
          get().loadNodes();
        }
      });
    } else {
      // Use WebSocket for web version
      // Implementation depends on backend WebSocket setup
    }
  },

  stopWatching: () => {
    // Clean up file watching
    if (isElectron && window.electronAPI?.unwatchProject) {
      window.electronAPI.unwatchProject();
    }
  }
})) 