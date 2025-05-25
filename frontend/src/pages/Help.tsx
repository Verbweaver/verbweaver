import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder } from 'lucide-react';

interface DocFile {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: DocFile[];
}

export default function Help() {
  const [docFiles, setDocFiles] = useState<DocFile[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [docContent, setDocContent] = useState<string>('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load documentation structure
    loadDocumentationStructure();
  }, []);

  const loadDocumentationStructure = async () => {
    // For now, create a mock structure
    // In a real implementation, this would read from the docs folder
    const mockDocs: DocFile[] = [
      {
        name: 'Getting Started',
        path: 'getting-started.md',
        type: 'file'
      },
      {
        name: 'User Guide',
        path: 'user-guide',
        type: 'directory',
        children: [
          { name: 'Creating Projects', path: 'user-guide/creating-projects.md', type: 'file' },
          { name: 'Using the Graph View', path: 'user-guide/graph-view.md', type: 'file' },
          { name: 'Editor Features', path: 'user-guide/editor.md', type: 'file' },
          { name: 'Task Management', path: 'user-guide/tasks.md', type: 'file' },
          { name: 'Version Control', path: 'user-guide/version-control.md', type: 'file' },
          { name: 'Compiling Documents', path: 'user-guide/compiler.md', type: 'file' }
        ]
      },
      {
        name: 'API Reference',
        path: 'api',
        type: 'directory',
        children: [
          { name: 'Projects API', path: 'api/projects.md', type: 'file' },
          { name: 'Authentication', path: 'api/auth.md', type: 'file' },
          { name: 'Git Integration', path: 'api/git.md', type: 'file' }
        ]
      },
      {
        name: 'Troubleshooting',
        path: 'troubleshooting.md',
        type: 'file'
      }
    ];

    setDocFiles(mockDocs);
    
    // Load the first document by default
    if (mockDocs.length > 0) {
      const firstFile = mockDocs[0];
      if (firstFile.type === 'file') {
        setSelectedDoc(firstFile.path);
        loadDocContent(firstFile.path);
      }
    }
  };

  const loadDocContent = async (docPath: string) => {
    // For now, show placeholder content
    // In a real implementation, this would read the actual markdown file
    const placeholderContent = `# ${docPath.replace('.md', '').replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}

Welcome to the Verbweaver documentation!

## Overview

Verbweaver is a writing and design platform that thinks in relationships (graphs). It is intended for writers, artists, engineers, developers, analysts and anyone else who want to design things while linking every idea together to its related ideas.

## Key Features

- **Graph-based Organization**: Visualize relationships between your ideas and content
- **Markdown Support**: All content is backed by Markdown for formatting
- **Git Integration**: Version control for all your projects
- **Task Management**: Turn your ideas into manageable tasks
- **Multi-format Export**: Compile your work into various formats

## Getting Help

If you need additional assistance:

1. Check the troubleshooting section
2. Review the user guide for detailed instructions
3. Consult the API reference for technical details

---

*This is placeholder documentation. The actual documentation would be loaded from the docs folder.*`;

    setDocContent(placeholderContent);
  };

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const renderDocTree = (docs: DocFile[], level = 0) => {
    return docs.map((doc) => (
      <div key={doc.path} style={{ marginLeft: `${level * 16}px` }}>
        {doc.type === 'directory' ? (
          <div>
            <button
              onClick={() => toggleFolder(doc.path)}
              className="flex items-center gap-2 py-1 px-2 hover:bg-accent rounded-md w-full text-left"
            >
              {expandedFolders.has(doc.path) ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <Folder className="w-4 h-4" />
              <span className="text-sm">{doc.name}</span>
            </button>
            {expandedFolders.has(doc.path) && doc.children && (
              <div className="ml-4">
                {renderDocTree(doc.children, level + 1)}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => {
              setSelectedDoc(doc.path);
              loadDocContent(doc.path);
            }}
            className={`flex items-center gap-2 py-1 px-2 hover:bg-accent rounded-md w-full text-left ${
              selectedDoc === doc.path ? 'bg-primary text-primary-foreground' : ''
            }`}
          >
            <FileText className="w-4 h-4" />
            <span className="text-sm">{doc.name}</span>
          </button>
        )}
      </div>
    ));
  };

  return (
    <div className="h-full flex">
      {/* Documentation Tree */}
      <div className="w-80 border-r border-border bg-muted/30 p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Documentation</h2>
        <div className="space-y-1">
          {renderDocTree(docFiles)}
        </div>
      </div>

      {/* Documentation Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {docContent ? (
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <pre className="whitespace-pre-wrap font-sans">{docContent}</pre>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-4" />
              <p>Select a documentation file to view its content</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 