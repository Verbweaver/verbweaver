/**
 * Shared type definitions for Verbweaver
 */

import { VIEWS, TASK_STATES, NODE_TYPES, LINK_TYPES, EXPORT_FORMATS, THEMES, AUTH_PROVIDERS } from './constants';

// Base types
export type ViewType = typeof VIEWS[keyof typeof VIEWS];
export type TaskState = typeof TASK_STATES[keyof typeof TASK_STATES];
export type NodeType = typeof NODE_TYPES[keyof typeof NODE_TYPES];
export type LinkType = typeof LINK_TYPES[keyof typeof LINK_TYPES];
export type ExportFormat = typeof EXPORT_FORMATS[keyof typeof EXPORT_FORMATS];
export type Theme = typeof THEMES[keyof typeof THEMES];
export type AuthProvider = typeof AUTH_PROVIDERS[keyof typeof AUTH_PROVIDERS];

// Markdown metadata format
export interface MarkdownMetadata {
  id: string;
  title: string;
  type: NodeType;
  tags?: string[];
  links?: string[];
  task?: TaskMetadata;
  created?: string;
  modified?: string;
  author?: string;
  [key: string]: any; // Allow custom metadata
}

// Task metadata
export interface TaskMetadata {
  status: TaskState;
  assignee?: string;
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string;
  completedDate?: string;
  estimatedHours?: number;
  actualHours?: number;
  comments?: Comment[];
}

// Comment type for tasks
export interface Comment {
  id: string;
  author: string;
  content: string;
  timestamp: string;
  attachments?: Attachment[];
}

// Attachment type
export interface Attachment {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  url: string;
}

// Node representation in the graph
export interface GraphNode {
  id: string;
  type: NodeType;
  title: string;
  metadata: MarkdownMetadata;
  position?: { x: number; y: number };
  style?: {
    color?: string;
    backgroundColor?: string;
    borderColor?: string;
  };
}

// Position in 2D space
export interface Position {
  x: number;
  y: number;
}

// Node styling
export interface NodeStyle {
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  shape?: 'circle' | 'square' | 'diamond' | 'hexagon';
  size?: number;
}

// Edge/Link representation
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: LinkType;
  label?: string;
  style?: {
    stroke?: string;
    strokeWidth?: number;
    animated?: boolean;
  };
}

// Edge styling
export interface EdgeStyle {
  color?: string;
  width?: number;
  style?: 'solid' | 'dashed' | 'dotted';
  animated?: boolean;
  arrowShape?: 'triangle' | 'circle' | 'square' | 'none';
}

// Project configuration
export interface ProjectConfig {
  id: string;
  name: string;
  description?: string;
  gitRepository: GitConfig;
  created: string;
  modified: string;
  settings?: ProjectSettings;
}

// Git configuration
export interface GitConfig {
  type: 'local' | 'remote';
  path?: string;
  url?: string;
  branch?: string;
  credentials?: GitCredentials;
  autoPush?: boolean;
}

// Git credentials
export interface GitCredentials {
  username?: string;
  password?: string;
  sshKey?: string;
  token?: string;
}

// Project settings
export interface ProjectSettings {
  theme?: Theme;
  graphSettings?: GraphSettings;
  editorSettings?: EditorSettings;
  compilerSettings?: CompilerSettings;
}

// Graph settings
export interface GraphSettings {
  layout?: 'force' | 'hierarchical' | 'circular' | 'grid';
  nodeDefaults?: NodeStyle;
  edgeDefaults?: EdgeStyle;
  showLabels?: boolean;
  showMinimap?: boolean;
  physics?: boolean;
}

// Editor settings
export interface EditorSettings {
  fontSize?: number;
  fontFamily?: string;
  tabSize?: number;
  wordWrap?: boolean;
  theme?: string;
  autoSave?: boolean;
  autoSaveInterval?: number;
}

// Compiler settings
export interface CompilerSettings {
  defaultFormat?: ExportFormat;
  includeMetadata?: boolean;
  includeComments?: boolean;
  pageSize?: 'A4' | 'Letter' | 'Legal';
  margins?: Margins;
}

// Margins for documents
export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// User profile (web version)
export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  provider: AuthProvider;
  created: string;
  lastLogin: string;
  preferences?: UserPreferences;
}

// User preferences
export interface UserPreferences {
  theme: Theme;
  language?: string;
  defaultProjectPath?: string;
  recentProjects?: string[];
  sidebarWidth?: number;
  shortcuts?: KeyboardShortcuts;
}

// Keyboard shortcuts
export interface KeyboardShortcuts {
  [action: string]: string;
}

// Template definition
export interface Template {
  id: string;
  name: string;
  description?: string;
  type: 'graph' | 'node' | 'project';
  content: any; // JSON content varies by template type
  author?: string;
  version?: string;
  tags?: string[];
}

// File tree item
export interface FileTreeItem {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeItem[];
  metadata?: MarkdownMetadata;
}

// Version control types
export interface Commit {
  hash: string;
  message: string;
  author: string;
  email: string;
  timestamp: string;
  files: string[];
}

export interface FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'delete' | 'context';
  content: string;
  lineNumber?: number;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

// WebSocket event types
export interface WsEvent {
  type: 'file-changed' | 'git-updated' | 'project-updated' | 'user-joined' | 'user-left';
  data: any;
  timestamp: string;
}

// Export options
export interface ExportOptions {
  format: ExportFormat;
  nodes: string[]; // Node IDs to include
  includeChildren?: boolean;
  template?: string;
  metadata?: ExportMetadata;
}

export interface ExportMetadata {
  title?: string;
  author?: string;
  date?: string;
  copyright?: string;
  [key: string]: any;
}

// Task types are now in types/index.ts 