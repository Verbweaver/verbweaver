/**
 * Shared constants for Verbweaver
 * All constant values should be defined here to ensure consistency across platforms
 */

// Application metadata
export const APP_NAME = 'Verbweaver';
export const APP_VERSION = '1.0.0';
export const APP_DESCRIPTION = 'A writing and design platform that thinks in relationships';

// API configuration
export const API_BASE_URL = 'http://localhost:8000';
export const API_VERSION = 'v1';
export const API_TIMEOUT = 30000; // 30 seconds

// Git configuration
export const GIT_DEFAULT_BRANCH = 'main';
export const GIT_CHECK_INTERVAL = 1000; // 1 second
export const GIT_AUTHOR_NAME = 'Verbweaver User';
export const GIT_AUTHOR_EMAIL = 'user@verbweaver.app';

// File system configuration
export const PROJECT_CONFIG_FILE = '.verbweaver/config.json';
export const METADATA_FILE_SUFFIX = '.metadata.md';
export const TEMPLATES_FOLDER = 'templates';
export const DOCS_FOLDER = 'docs';

// UI configuration
export const SIDEBAR_WIDTH_DEFAULT = 240;
export const SIDEBAR_WIDTH_MIN = 180;
export const SIDEBAR_WIDTH_MAX = 400;
export const TAB_HEIGHT = 36;
export const DEFAULT_VIEW = 'graph';

// Views
export const VIEWS = {
  GRAPH: 'graph',
  THREADS: 'threads',
  EDITOR: 'editor',
  VERSION_CONTROL: 'version-control',
  COMPILER: 'compiler',
} as const;

// Task states
export const TASK_STATES = {
  TODO: 'todo',
  IN_PROGRESS: 'in-progress',
  REVIEW: 'review',
  DONE: 'done',
  ARCHIVED: 'archived',
} as const;

// Node types
export const NODE_TYPES = {
  FILE: 'file',
  DIRECTORY: 'directory',
  TASK: 'task',
  NOTE: 'note',
  CHAPTER: 'chapter',
  CHARACTER: 'character',
  LOCATION: 'location',
  SCENE: 'scene',
  CUSTOM: 'custom',
} as const;

// Link types
export const LINK_TYPES = {
  HARD: 'hard',
  SOFT: 'soft',
  REFERENCE: 'reference',
  DEPENDENCY: 'dependency',
} as const;

// Editor configuration
export const EDITOR_DEFAULT_FONT_SIZE = 14;
export const EDITOR_MIN_FONT_SIZE = 10;
export const EDITOR_MAX_FONT_SIZE = 24;
export const EDITOR_TAB_SIZE = 2;
export const EDITOR_WORD_WRAP = true;

// Graph configuration
export const GRAPH_NODE_SIZE = 50;
export const GRAPH_EDGE_WIDTH = 2;
export const GRAPH_ANIMATION_DURATION = 300;
export const GRAPH_ZOOM_MIN = 0.1;
export const GRAPH_ZOOM_MAX = 4;
export const GRAPH_ZOOM_STEP = 0.1;

// Compiler formats
export const EXPORT_FORMATS = {
  PDF: 'pdf',
  DOCX: 'docx',
  ODT: 'odt',
  EPUB: 'epub',
  MOBI: 'mobi',
  HTML: 'html',
  MARKDOWN: 'markdown',
} as const;

// Theme configuration
export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  HIGH_CONTRAST: 'high-contrast',
  COLORBLIND: 'colorblind',
} as const;

// Authentication providers (web only)
export const AUTH_PROVIDERS = {
  EMAIL: 'email',
  GOOGLE: 'google',
  GITHUB: 'github',
} as const;

// Storage keys
export const STORAGE_KEYS = {
  USER_PREFERENCES: 'verbweaver_preferences',
  RECENT_PROJECTS: 'verbweaver_recent_projects',
  ACTIVE_PROJECT: 'verbweaver_active_project',
  THEME: 'verbweaver_theme',
  SIDEBAR_WIDTH: 'verbweaver_sidebar_width',
} as const;

// Regex patterns
export const PATTERNS = {
  MARKDOWN_LINK: /\[([^\]]+)\]\(([^)]+)\)/g,
  WIKI_LINK: /\[\[([^\]]+)\]\]/g,
  FRONTMATTER: /^---\n([\s\S]*?)\n---/,
  NODE_ID: /^[a-zA-Z0-9-_]+$/,
} as const;

// Error messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  GIT_ERROR: 'Git operation failed. Please check your repository.',
  FILE_NOT_FOUND: 'File not found.',
  INVALID_PROJECT: 'Invalid project configuration.',
  AUTHENTICATION_REQUIRED: 'Authentication required.',
  PERMISSION_DENIED: 'Permission denied.',
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  PROJECT_CREATED: 'Project created successfully.',
  FILE_SAVED: 'File saved successfully.',
  CHANGES_COMMITTED: 'Changes committed successfully.',
  EXPORT_COMPLETE: 'Export completed successfully.',
} as const; 