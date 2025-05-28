import { useState, useEffect, useCallback } from 'react';
import { FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import '../styles/markdown.css';
import { DocFile } from '../../../desktop/src/preload';
import { getApiUrl } from '@verbweaver/shared';
import axios from 'axios';
import React from 'react';

const API_URL = getApiUrl();
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

export default function Help() {
  const [docFiles, setDocFiles] = useState<DocFile[]>([]);
  const [selectedDocPath, setSelectedDocPath] = useState<string | null>(null);
  const [docContent, setDocContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadDocumentationStructure = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setDocFiles([]);
    try {
      let files: DocFile[] = [];
      if (isElectron && window.electronAPI?.listDocs) {
        files = await window.electronAPI.listDocs();
      } else {
        const response = await axios.get<DocFile[]>(`${API_URL}/docs`);
        files = response.data;
      }
      setDocFiles(files);
      if (files.length > 0 && files[0].type === 'file') {
        setSelectedDocPath(files[0].path);
      } else if (files.length === 0) {
        setError('No documentation files found.');
      }
    } catch (e: any) {
      console.error('Failed to load documentation structure:', e);
      const errorMsg = e.response?.data?.detail || e.message || 'Failed to load documentation structure.';
      setError(errorMsg);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadDocumentationStructure();
  }, [loadDocumentationStructure]);

  const loadDocContent = useCallback(async (docPath: string | null) => {
    if (!docPath) {
      setDocContent('');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      let content = '';
      if (isElectron && window.electronAPI?.readDocContent) {
        content = await window.electronAPI.readDocContent(docPath);
      } else {
        const response = await axios.get(`${API_URL}/docs/${docPath}`, { responseType: 'text' });
        content = response.data;
      }
      setDocContent(content);
    } catch (e: any) {
      console.error(`Error loading documentation content for ${docPath}:`, e);
      const errorMsg = e.response?.data?.detail || e.message || `Failed to load content for ${docPath}.`;
      setError(errorMsg);
      setDocContent('');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (selectedDocPath) {
      loadDocContent(selectedDocPath);
    }
  }, [selectedDocPath, loadDocContent]);

  if (isLoading && docFiles.length === 0 && !error) {
    return <div className="p-6 text-center">Loading documentation...</div>;
  }

  return (
    <div className="h-full flex">
      <div className="w-64 md:w-80 border-r border-border bg-muted/30 p-4 overflow-y-auto flex-shrink-0">
        <h2 className="text-lg font-semibold mb-4">Documentation</h2>
        {isLoading && docFiles.length === 0 && <p className="text-sm text-muted-foreground">Loading list...</p>}
        {!isLoading && error && docFiles.length === 0 && (
            <p className="text-sm text-red-500">{error}</p>
        )}
        {!isLoading && !error && docFiles.length === 0 && (
            <p className="text-sm text-muted-foreground">No documents found.</p>
        )}
        <div className="space-y-1">
          {docFiles.map((doc) => (
            <button
              key={doc.path}
              onClick={() => setSelectedDocPath(doc.path)}
              className={`flex items-center gap-2 py-1.5 px-2.5 hover:bg-accent rounded-md w-full text-left transition-colors duration-100 ease-in-out ${
                selectedDocPath === doc.path ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
              title={doc.name}
            >
              <FileText className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm truncate">{doc.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        {isLoading && !docContent && (
          <div className="flex justify-center items-center h-full">
            <p className="text-muted-foreground">Loading content...</p>
          </div>
        )}
        {!isLoading && error && !docContent && (
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <h2 className="text-red-600 font-semibold">Error Loading Document</h2>
            <p className="text-red-500">{error}</p>
          </div>
        )}
        {!isLoading && !error && docContent && (
          <div className="prose prose-slate dark:prose-invert max-w-none prose-sm md:prose-base">
            <ReactMarkdown
              remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
              rehypePlugins={[rehypeHighlight]}
              components={{ 
                a: ({ node, href, children, ...props }) => {
                  if (href && !href.startsWith('http') && !href.startsWith('#')) {
                    const cleanedHref = href.replace(/^\.?\//, '');
                    const targetFile = docFiles.find(f => f.path.toLowerCase() === cleanedHref.toLowerCase());
                    if (targetFile) {
                      return (
                        <a
                          {...props}
                          href={targetFile.path}
                          onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                            e.preventDefault();
                            setSelectedDocPath(targetFile.path);
                          }}
                          className="text-primary hover:underline cursor-pointer"
                        >
                          {children}
                        </a>
                      );
                    }
                    console.warn('Could not find target for internal link:', href, 'Cleaned:', cleanedHref);
                    return <span className="text-muted-foreground" title={`Unresolved link: ${href}`}>{children}</span>;
                  }
                  return (
                    <a {...props} href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {children}
                    </a>
                  );
                },
                p: ({ children, ...props }) => {
                  const hasBlockCode = React.Children.toArray(children).some(
                    child =>
                      React.isValidElement(child) &&
                      child.type === 'code' &&
                      !child.props.inline
                  );
                  const hasPre = React.Children.toArray(children).some(
                    child =>
                      React.isValidElement(child) &&
                      child.type === 'pre'
                  );
                  if (hasBlockCode || hasPre) {
                    return <>{children}</>;
                  }
                  return <p {...props}>{children}</p>;
                },
                code: ({ node, inline, className, children, ...props }: any) => {
                  if (inline) {
                    return (
                      <code {...props} className="bg-muted px-1 py-0.5 rounded text-sm font-normal">
                        {children}
                      </code>
                    );
                  }
                  return (
                    <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                      <code {...props} className={className}>
                        {children}
                      </code>
                    </pre>
                  );
                },
              }}
            >
              {docContent}
            </ReactMarkdown>
          </div>
        )}
        {!isLoading && !error && !docContent && (
            <div className="flex justify-center items-center h-full">
                <p className="text-muted-foreground">Select a document to view its content, or no content available.</p>
            </div>
        )}
      </div>
    </div>
  );
} 