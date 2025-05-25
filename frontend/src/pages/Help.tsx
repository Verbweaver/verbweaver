import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import '../styles/markdown.css';

interface DocFile {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: DocFile[];
}

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

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
    // Create structure based on actual docs folder
    const actualDocs: DocFile[] = [
      {
        name: 'Getting Started',
        path: 'getting-started.md',
        type: 'file'
      },
      {
        name: 'Desktop Guide',
        path: 'desktop-guide.md',
        type: 'file'
      },
      {
        name: 'Desktop Quick Reference',
        path: 'desktop-quick-reference.md',
        type: 'file'
      },
      {
        name: 'Architecture',
        path: 'architecture.md',
        type: 'file'
      },
      {
        name: 'API Reference',
        path: 'api-reference.md',
        type: 'file'
      },
      {
        name: 'Security Checklist',
        path: 'security-checklist.md',
        type: 'file'
      },
      {
        name: 'README',
        path: '../README.md',
        type: 'file'
      }
    ];

    setDocFiles(actualDocs);
    
    // Load the first document by default
    if (actualDocs.length > 0) {
      const firstFile = actualDocs[0];
      if (firstFile.type === 'file') {
        setSelectedDoc(firstFile.path);
        loadDocContent(firstFile.path);
      }
    }
  };

  const loadDocContent = async (docPath: string) => {
    try {
      if (isElectron && window.electronAPI) {
        // For Electron, read the actual file from the docs folder
        // Need to go up from desktop folder to root docs folder
        const docsPath = `../docs/${docPath}`;
        const content = await window.electronAPI.readFile(docsPath);
        setDocContent(content || 'Failed to load documentation content.');
      } else {
        // For web version, we'd need to fetch from a docs API endpoint
        // For now, show a message about desktop-only feature
        setDocContent(`# ${docPath.replace('.md', '').replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}

This documentation is available in the desktop version of Verbweaver.

To view the full documentation, please use the desktop application.

## Available Documentation

The following documentation files are available in the desktop version:

- Getting Started Guide
- Desktop User Guide  
- Desktop Quick Reference
- Architecture Overview
- API Reference
- Security Checklist
- Project README

---

*Documentation viewing is optimized for the desktop application where files can be read directly from the local filesystem.*`);
      }
    } catch (error) {
      console.error('Error loading documentation:', error);
      setDocContent(`# Error Loading Documentation

Failed to load the documentation file: ${docPath}

Please ensure the documentation files are available in the docs folder.

## Troubleshooting

1. Check that the docs folder exists in your Verbweaver installation
2. Verify that the documentation files are present
3. Ensure you have proper file permissions

If the problem persists, please check the application logs for more details.`);
    }
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
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                // Custom link renderer to handle relative links
                a: ({ node, href, children, ...props }) => {
                  // Handle relative links
                  if (href && !href.startsWith('http') && !href.startsWith('#')) {
                    return (
                      <a
                        {...props}
                        href={href}
                        onClick={(e) => {
                          e.preventDefault();
                          // Handle internal navigation if needed
                          console.log('Internal link clicked:', href);
                        }}
                        className="text-primary hover:underline cursor-pointer"
                      >
                        {children}
                      </a>
                    );
                  }
                  // External links open in new tab
                  return (
                    <a
                      {...props}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {children}
                    </a>
                  );
                },
                // Custom code block renderer
                pre: ({ children, ...props }) => (
                  <pre {...props} className="bg-muted p-4 rounded-lg overflow-x-auto">
                    {children}
                  </pre>
                ),
                // Custom inline code renderer
                code: ({ node, inline, className, children, ...props }: any) => {
                  if (inline) {
                    return (
                      <code {...props} className="bg-muted px-1 py-0.5 rounded text-sm">
                        {children}
                      </code>
                    );
                  }
                  return <code {...props} className={className}>{children}</code>;
                },
                // Tables with proper styling
                table: ({ children, ...props }) => (
                  <div className="overflow-x-auto my-4">
                    <table {...props} className="min-w-full divide-y divide-border">
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children, ...props }) => (
                  <th {...props} className="px-4 py-2 bg-muted font-semibold text-left">
                    {children}
                  </th>
                ),
                td: ({ children, ...props }) => (
                  <td {...props} className="px-4 py-2 border-t border-border">
                    {children}
                  </td>
                ),
                // Blockquotes with better styling
                blockquote: ({ children, ...props }) => (
                  <blockquote {...props} className="border-l-4 border-primary pl-4 my-4 italic">
                    {children}
                  </blockquote>
                ),
                // Lists with proper spacing
                ul: ({ children, ...props }) => (
                  <ul {...props} className="list-disc list-inside space-y-2 my-4">
                    {children}
                  </ul>
                ),
                ol: ({ children, ...props }) => (
                  <ol {...props} className="list-decimal list-inside space-y-2 my-4">
                    {children}
                  </ol>
                ),
                // Headings with proper spacing
                h1: ({ children, ...props }) => (
                  <h1 {...props} className="text-3xl font-bold mt-8 mb-4">
                    {children}
                  </h1>
                ),
                h2: ({ children, ...props }) => (
                  <h2 {...props} className="text-2xl font-semibold mt-6 mb-3">
                    {children}
                  </h2>
                ),
                h3: ({ children, ...props }) => (
                  <h3 {...props} className="text-xl font-semibold mt-4 mb-2">
                    {children}
                  </h3>
                ),
              }}
            >
              {docContent}
            </ReactMarkdown>
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