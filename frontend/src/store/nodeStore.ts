import { create } from 'zustand'
import { NodeType, TaskState, MarkdownMetadata, GraphNode } from '@verbweaver/shared'
import toast from 'react-hot-toast'
import { useProjectStore } from './projectStore'
import * as yaml from 'js-yaml'
import { getApiUrl } from '@verbweaver/shared'
import { apiClient } from '../api/client'

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
    // readProjectFiles returns relative paths, so always join with currentProjectPath
    const absolutePath = joinPaths(currentProjectPath, normalizedPath);
    const absoluteMetadataPath = joinPaths(currentProjectPath, metadataPath);

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
      const absoluteDirPath = joinPaths(currentProjectPath, normalizedPath);
      const dirContents = await window.electronAPI.readDirectory(absoluteDirPath);
      children = dirContents.map(item => joinPaths(normalizedPath, item.name).replace(/\\/g, '/'));
    } catch (error) {
      console.error(`Failed to read directory ${normalizedPath}:`, error);
    }
  }
  
  const tracked = (metadata as any)?.task?.tracked !== false
  return {
    path: normalizedPath,
    name,
    isDirectory,
    isMarkdown,
    metadata,
    content,
    hardLinks: { parent, children },
    softLinks: metadata.links || [],
    hasTask: !isDirectory && tracked,
    taskStatus: (metadata as any).task?.status
  };
}

const API_BASE = getApiUrl();

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
        
        // Keep track of which directories we've already processed
        const processedDirectories = new Set<string>();
        
        for (const file of files) {
          // Only process files within the nodes/ directory
          // Normalize path separators for cross-platform compatibility
          const normalizedPath = file.path.replace(/\\/g, '/');
          if (!normalizedPath.startsWith('nodes/') && normalizedPath !== 'nodes' &&
              !normalizedPath.startsWith('uploads/') && normalizedPath !== 'uploads') {
            console.log('[NodeStore] Skipping file outside nodes/:', file.path);
            continue;
          }
          
          // Skip .metadata.md files - they're handled with their parent files
          if (normalizedPath.endsWith('.metadata.md')) {
            console.log('[NodeStore] Skipping metadata file:', file.path);
            continue;
          }
          
          // For directories, check if we've already processed this path
          if (file.isDirectory) {
            if (processedDirectories.has(normalizedPath)) {
              console.log('[NodeStore] Skipping already processed directory:', file.path);
              continue;
            }
            processedDirectories.add(normalizedPath);
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
        const response = await apiClient.get(`/projects/${currentProject.id}/nodes`);
        const data = response.data;
        
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
        await apiClient.post(`/projects/${useProjectStore.getState().currentProject?.id}/nodes`, { path: relativePath, metadata, content });
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
        hasTask: (metadata as any)?.task?.tracked !== false,
        taskStatus: (metadata as any).task?.status
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
          await apiClient.put(`/projects/${useProjectStore.getState().currentProject?.id}/nodes/${encodeURIComponent(path)}`, { metadata: updatedMetadata, content: updatedContent });
        }
        
        // Update the store
        const updatedNode: VerbweaverNode = {
          ...node,
          metadata: updatedMetadata,
          content: updatedContent,
          softLinks: updatedMetadata.links || [],
          hasTask: !node.isDirectory && ((updatedMetadata as any)?.task?.tracked !== false),
          taskStatus: (updatedMetadata as any).task?.status
        };
        
        set(state => ({
          nodes: new Map(state.nodes).set(path, updatedNode)
        }));
        
      } catch (error) {
        toast.error('Failed to update node');
        throw error;
      }
    } else if (!node.isDirectory) {
      // Non-markdown file (but not a directory): update .metadata.md file
      const metadataPath = `${path}.metadata.md`;
      const metadataContent = stringifyMarkdownWithFrontMatter(updatedMetadata, '');
      
      try {
        if (isElectron && window.electronAPI && currentProjectPath) {
          // Build absolute path for Electron
          const absoluteMetadataPath = joinPaths(currentProjectPath, metadataPath);
          await window.electronAPI.writeFile(absoluteMetadataPath, metadataContent);
        } else if (!isElectron) {
          await apiClient.put(`/projects/${useProjectStore.getState().currentProject?.id}/nodes/${encodeURIComponent(path)}/metadata`, { metadata: updatedMetadata });
        }
        
        // Update the store
        const updatedNode: VerbweaverNode = {
          ...node,
          metadata: updatedMetadata,
          softLinks: updatedMetadata.links || [],
          hasTask: !node.isDirectory && ((updatedMetadata as any)?.task?.tracked !== false),
          taskStatus: (updatedMetadata as any).task?.status
        };
        
        set(state => ({
          nodes: new Map(state.nodes).set(path, updatedNode)
        }));
        
      } catch (error) {
        toast.error('Failed to update node metadata');
        throw error;
      }
    } else {
      // For directories, just update the store without creating metadata files
      const updatedNode: VerbweaverNode = {
        ...node,
        metadata: updatedMetadata,
        softLinks: updatedMetadata.links || [],
        hasTask: !node.isDirectory && ((updatedMetadata as any)?.task?.tracked !== false),
        taskStatus: (updatedMetadata as any).task?.status
      };
      
      set(state => ({
        nodes: new Map(state.nodes).set(path, updatedNode)
      }));
    }
  },

  deleteNode: async (path: string) => {
    const { currentProjectPath } = useProjectStore.getState();
    
    try {
      if (isElectron && window.electronAPI && currentProjectPath) {
        // Prefer dedicated Node deletion handler that also cleans backlinks
        if (window.electronAPI.deleteNodeFile) {
          await window.electronAPI.deleteNodeFile(path);
        } else {
          // Fallback to raw file delete (no backlink cleanup)
          const absolutePath = path.startsWith(currentProjectPath) ? path : joinPaths(currentProjectPath, path);
          await window.electronAPI.deleteFile(absolutePath);
        }
      } else if (!isElectron) {
        await apiClient.delete(`/projects/${useProjectStore.getState().currentProject?.id}/nodes/${encodeURIComponent(path)}`);
      }
      
      // Remove from store and strip backlinks locally for immediate UI consistency
      const deletedNode = get().nodes.get(path);
      const deletedId = deletedNode?.metadata?.id;
      set(state => {
        const newNodes = new Map(state.nodes);
        newNodes.delete(path);
        if (deletedId) {
          for (const [nodePath, node] of newNodes) {
            const links = Array.isArray(node.metadata?.links) ? node.metadata.links : [];
            if (links.includes(deletedId)) {
              const filtered = links.filter((id: string) => id !== deletedId);
              const updated = {
                ...node,
                metadata: {
                  ...node.metadata,
                  links: filtered,
                },
                softLinks: filtered,
              } as any;
              newNodes.set(nodePath, updated);
            }
          }
        }
        return { nodes: newNodes } as any;
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
    
    const sourceId = sourceNode.metadata.id;
    const targetId = targetNode.metadata.id;
    
    // Add link from source to target
    const sourceLinks = [...(sourceNode.metadata.links || [])];
    if (!sourceLinks.includes(targetId)) {
      sourceLinks.push(targetId);
      await get().updateNode(sourcePath, {
        metadata: { links: sourceLinks }
      });
    }
    
    // Add link from target to source
    const targetLinks = [...(targetNode.metadata.links || [])];
    if (!targetLinks.includes(sourceId)) {
      targetLinks.push(sourceId);
      await get().updateNode(targetPath, {
        metadata: { links: targetLinks }
      });
    }
  },

  removeSoftLink: async (sourcePath: string, targetPath: string) => {
    const sourceNode = get().nodes.get(sourcePath);
    const targetNode = get().nodes.get(targetPath);
    
    if (!sourceNode || !targetNode) throw new Error('Node not found');
    
    // Create edge ID using node IDs instead of paths to avoid URL encoding issues
    // Use a delimiter that won't appear in node IDs
    const edgeId = `soft_${sourceNode.metadata.id}_${targetNode.metadata.id}`;
    
    // Get current project
    const { currentProject } = useProjectStore.getState();
    if (!currentProject) throw new Error('No project selected');
    
    try {
      // Call the backend API to remove the edge
      await apiClient.delete(`/projects/${currentProject.id}/edges/${edgeId}`);
      
      // Update local state using the existing updateNode function to preserve all metadata
      const sourceId = sourceNode.metadata.id;
      const targetId = targetNode.metadata.id;
      
      // Remove link from source node
      const updatedSourceLinks = (sourceNode.metadata.links || []).filter(id => id !== targetId);
      await get().updateNode(sourcePath, {
        metadata: { links: updatedSourceLinks }
      });
      
      // Remove link from target node
      const updatedTargetLinks = (targetNode.metadata.links || []).filter(id => id !== sourceId);
      await get().updateNode(targetPath, {
        metadata: { links: updatedTargetLinks }
      });
    } catch (error) {
      console.error('Failed to remove soft link:', error);
      throw error;
    }
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