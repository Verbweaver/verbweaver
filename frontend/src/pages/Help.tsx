import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTabStore } from '../store/tabStore';
import { FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';
import '../styles/hljs-dark.css';
import '../styles/markdown.css';
// Local DocFile type to avoid importing Electron preload from the frontend build
type DocFile = {
  name: string;
  path: string;
  title?: string; // first H1 of the doc, else the file name
  type: 'file' | 'directory';
  children?: DocFile[];
};
import { getApiUrl } from '@verbweaver/shared';
import axios from 'axios';
import React from 'react';
import ImageViewer from '../components/help/ImageViewer';

const API_URL = (() => {
  try { return getApiUrl(); } catch { return ''; }
})();
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

// GitHub-style heading slug ("Mind Map" -> "mind-map") so `?section=` and `#anchor` links can target headings.
const slugify = (text: string) =>
  text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');

const textOf = (children: React.ReactNode): string =>
  React.Children.toArray(children)
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : React.isValidElement<{ children?: React.ReactNode }>(c) ? textOf(c.props.children) : ''))
    .join('');

type HelpScroll = { doc: string; section: string | null; top: number };

const scrollToSection = (id: string, behavior: ScrollBehavior = 'smooth') => {
  document.getElementById(id)?.scrollIntoView({ behavior, block: 'start' });
};

const heading = (Tag: 'h1' | 'h2' | 'h3' | 'h4') =>
  function Heading(allProps: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) {
    const { children, ...props } = allProps;
    delete props.node; // react-markdown's AST node; not a DOM attribute
    return <Tag id={slugify(textOf(children))} {...props}>{children}</Tag>;
  };
const headingComponents = { h1: heading('h1'), h2: heading('h2'), h3: heading('h3'), h4: heading('h4') };

// Docs reference screenshots as `images/<name>`; returns <name>, or null for any other src
const docImageName = (src?: string): string | null => {
  const match = /^(?:\.\/)?images\/([^/\\]+)$/.exec(src || '');
  return match ? match[1] : null;
};

// Images live in docs/images: loaded over IPC on desktop, from the docs API on web
function DocImage({ src, alt, title }: { src?: string; alt?: string; title?: string }) {
  const name = docImageName(src);
  const [dataUrl, setDataUrl] = useState<{ name: string; url: string } | null>(null);
  const [failedName, setFailedName] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);

  useEffect(() => {
    if (!name || !isElectron || !window.electronAPI?.readDocImage) return;
    let cancelled = false;
    window.electronAPI.readDocImage(name)
      .then((url) => { if (!cancelled) setDataUrl({ name, url }); })
      .catch(() => { if (!cancelled) setFailedName(name); });
    return () => { cancelled = true; };
  }, [name]);

  const resolved = !name
    ? src
    : isElectron
      ? (dataUrl?.name === name ? dataUrl.url : undefined)
      : `${API_URL}/docs/images/${encodeURIComponent(name)}`;

  if (name && failedName === name) {
    return <span className="text-muted-foreground italic">[Image unavailable: {alt || name}]</span>;
  }
  if (!resolved) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setViewing(true)}
        className="block p-0 border-0 bg-transparent cursor-zoom-in"
        title={title || 'Click to enlarge'}
        aria-label={`Enlarge image${alt ? `: ${alt}` : ''}`}
      >
        <img
          src={resolved}
          alt={alt || ''}
          onError={() => setFailedName(name)}
          className="rounded-md border border-border shadow-sm max-w-full h-auto hover:opacity-90 transition-opacity"
        />
      </button>
      {viewing && <ImageViewer src={resolved} alt={alt || ''} onClose={() => setViewing(false)} />}
    </>
  );
}

export default function Help() {
  const [docFiles, setDocFiles] = useState<DocFile[]>([]);
  const [selectedDocPath, setSelectedDocPath] = useState<string | null>(null);
  const [docContent, setDocContent] = useState<string>('');
  const [loadedDocPath, setLoadedDocPath] = useState<string | null>(null);
  const [findQuery, setFindQuery] = useState<string>('');
  const [findIndex, setFindIndex] = useState<number>(0);
  const [findCount, setFindCount] = useState<number>(0);
  const [showFind, setShowFind] = useState<boolean>(false);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // The open page lives in the URL (?doc=, plus ?section= for a heading), so the Help tab
  // remembers it and returns to it when you switch back (#163)
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDoc = searchParams.get('doc');

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
      if (files.length === 0) setError('No documentation files found.');
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

  // Show the page named in the URL, else the first page
  useEffect(() => {
    if (docFiles.length === 0) return;
    const match = requestedDoc
      ? docFiles.find(f => f.type === 'file' && f.path.toLowerCase() === requestedDoc.toLowerCase())
      : undefined;
    if (match) setSelectedDocPath(match.path);
    else if (docFiles[0].type === 'file') setSelectedDocPath(docFiles[0].path);
  }, [docFiles, requestedDoc]);

  // Open a page (and optionally a heading in it) by putting it in the URL
  const openDoc = useCallback((docPath: string, section?: string) => {
    const params: Record<string, string> = { doc: docPath };
    if (section) params.section = section;
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  // Name the Help tab after the open page, e.g. "Help - Graph View" (#163)
  const selectedDoc = docFiles.find(f => f.path === selectedDocPath);
  const selectedTitle = selectedDoc ? selectedDoc.title || selectedDoc.name : undefined;
  useEffect(() => {
    if (!selectedTitle) return;
    const { tabs, activeTabId, updateTab } = useTabStore.getState();
    const tab = tabs.find(t => t.id === activeTabId && t.type === 'help');
    const title = `Help - ${selectedTitle}`;
    if (tab && tab.title !== title) updateTab(tab.id, { title });
  }, [selectedTitle]);

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
      setLoadedDocPath(docPath);
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

  // Each Help tab remembers how far down its page you scrolled, so switching tabs (or restarting)
  // brings you back to the same place. The position is saved with the page and section it belongs to.
  const requestedSection = searchParams.get('section');
  const helpTabId = useTabStore(s => {
    const tab = s.tabs.find(t => t.id === s.activeTabId);
    return tab?.type === 'help' ? tab.id : null;
  });
  const helpTabIdRef = useRef(helpTabId);
  const selectedDocRef = useRef(selectedDocPath);
  selectedDocRef.current = selectedDocPath;
  const pendingRestore = useRef<HelpScroll | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const shownDocRef = useRef<string | null>(null);
  useEffect(() => {
    helpTabIdRef.current = helpTabId;
    window.clearTimeout(saveTimer.current);
    const tab = useTabStore.getState().tabs.find(t => t.id === helpTabId);
    pendingRestore.current = (tab?.metadata?.helpScroll as HelpScroll | undefined) ?? null;
  }, [helpTabId]);
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const handleDocScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    const doc = selectedDocPath;
    const section = requestedSection;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const tabId = helpTabIdRef.current;
      // Skip scrolls from a page that has since been replaced, and the page's own jumps while its
      // saved place is still to be restored
      if (!tabId || !doc || doc !== selectedDocRef.current) return;
      if (pendingRestore.current?.doc === doc) return;
      pendingRestore.current = null;
      useTabStore.getState().updateTabMetadata(tabId, prev => ({ ...prev, helpScroll: { doc, section, top } }));
    }, 250);
  };

  // Once the page is shown, return to the saved place, or else to the requested section
  // (e.g. /help?doc=graph-view.md&section=group)
  useEffect(() => {
    if (isLoading || !docContent || !selectedDocPath || loadedDocPath !== selectedDocPath) return;
    const container = document.getElementById('help-doc-container');
    // While switching tabs the previous page can still be on screen; wait for the saved one
    const saved = pendingRestore.current;
    let restore: number | null = null;
    if (saved && saved.doc === selectedDocPath) {
      pendingRestore.current = null;
      if ((saved.section ?? null) === requestedSection) restore = saved.top;
    }
    // A newly opened page starts at the top
    const isNewPage = shownDocRef.current !== selectedDocPath;
    shownDocRef.current = selectedDocPath;
    if (restore === null && !requestedSection) {
      if (isNewPage && container) container.scrollTop = 0;
      return;
    }
    const content = container?.querySelector('.prose');
    let done = false;
    const jump = () => {
      if (done) return;
      if (restore !== null) { if (container) container.scrollTop = restore; }
      else if (requestedSection) scrollToSection(requestedSection, 'auto');
    };
    const frame = requestAnimationFrame(jump);
    // Images load after the text and push the section down; keep it in view while the content
    // settles, until the reader scrolls or clicks, or a few seconds pass
    const observer = content ? new ResizeObserver(jump) : null;
    if (content) observer!.observe(content);
    const stop = () => { done = true; observer?.disconnect(); };
    const timer = window.setTimeout(stop, 5000);
    const userEvents = ['wheel', 'touchstart', 'mousedown', 'keydown'] as const;
    userEvents.forEach((type) => container?.addEventListener(type, stop, { once: true }));
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      stop();
      userEvents.forEach((type) => container?.removeEventListener(type, stop));
    };
  }, [requestedSection, isLoading, docContent, selectedDocPath, loadedDocPath]);

  // Basic Ctrl+F handling within this view (client-side search in rendered text)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCtrlF = (e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F');
      if (isCtrlF) {
        e.preventDefault();
        setShowFind(true);
        setTimeout(() => findInputRef.current?.focus(), 0);
        return;
      }
      if (showFind && e.key === 'Escape') {
        e.preventDefault();
        setShowFind(false);
        return;
      }
      if (!showFind) return;
      if (findQuery && e.key === 'F3') {
        e.preventDefault();
        const next = e.shiftKey ? findIndex - 1 : findIndex + 1;
        setFindIndex(next);
        setTimeout(() => highlightMatch(findQuery, next), 0);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [findQuery, findIndex, docContent, showFind]);

  const highlightMatch = (q: string, index: number) => {
    try {
      const container = document.querySelector('#help-doc-container');
      if (!container) return;
      // Clear previous (unwrap highlight spans)
      container.querySelectorAll('.help-find-hit').forEach((n) => {
        const span = n as HTMLElement
        const parent = span.parentNode
        if (!parent) return
        while (span.firstChild) parent.insertBefore(span.firstChild, span)
        parent.removeChild(span)
      })
      const text = container.textContent || '';
      const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = [...text.matchAll(pattern)].map(m => ({ start: m.index || 0, end: (m.index || 0) + (m[0]?.length || 0) }));
      setFindCount(matches.length);
      if (matches.length === 0) return;
      const idx = ((index % matches.length) + matches.length) % matches.length;
      // crude scroll to selection by walking text nodes
      let pos = 0;
      const target = matches[idx];
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let node: any;
      while ((node = walker.nextNode())) {
        const nextPos = pos + node.textContent.length;
        if (target.start >= pos && target.start < nextPos) {
          const range = document.createRange()
          range.setStart(node, target.start - pos)
          range.setEnd(node, Math.min(target.end - pos, node.textContent.length))
          const span = document.createElement('span')
          span.className = 'help-find-hit'
          span.style.background = 'rgba(255, 213, 0, 0.45)'
          range.surroundContents(span)
          span.scrollIntoView({ behavior: 'smooth', block: 'center' })
          break;
        }
        pos = nextPos;
      }
      // Restore focus to input (typing should continue seamlessly)
      try { findInputRef.current?.focus() } catch {}
    } catch {}
  };

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
              onClick={() => openDoc(doc.path)}
              className={`flex items-center gap-2 py-1.5 px-2.5 hover:bg-accent rounded-md w-full text-left transition-colors duration-100 ease-in-out ${
                selectedDocPath === doc.path ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
              title={doc.name}
            >
              <FileText className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm truncate">{doc.title || doc.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto relative" id="help-doc-container" onScroll={handleDocScroll}>
        {showFind && (
          <div className="absolute top-2 right-2 z-10 bg-background border border-border rounded shadow p-2 flex items-center gap-2">
            <input
              ref={findInputRef}
              value={findQuery}
              onChange={(e)=>{ setFindQuery(e.target.value); setFindIndex(0); setTimeout(()=>highlightMatch(e.target.value, 0),0); }}
              onKeyDown={(e)=>{
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const next = (e.shiftKey ? findIndex - 1 : findIndex + 1);
                  setFindIndex(next);
                  setTimeout(()=>highlightMatch(findQuery, next),0);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowFind(false);
                }
              }}
              className="px-2 py-1 border border-input rounded bg-background text-sm w-56"
              placeholder="Find in document"
            />
            <span className="text-xs text-muted-foreground w-12 text-right">{findCount > 0 ? `${((findIndex%findCount)+findCount)%findCount + 1}/${findCount}` : '0/0'}</span>
            <button className="text-xs px-2 py-1 border rounded hover:bg-accent" onClick={()=>{ const next = findIndex - 1; setFindIndex(next); setTimeout(()=>highlightMatch(findQuery, next),0); }}>Prev</button>
            <button className="text-xs px-2 py-1 border rounded hover:bg-accent" onClick={()=>{ const next = findIndex + 1; setFindIndex(next); setTimeout(()=>highlightMatch(findQuery, next),0); }}>Next</button>
            <button className="text-xs px-2 py-1 border rounded hover:bg-accent" onClick={()=> setShowFind(false)}>Close</button>
          </div>
        )}
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
                ...headingComponents,
                img: ({ src, alt, title }) => <DocImage src={typeof src === 'string' ? src : undefined} alt={alt} title={title} />,
                pre: ({ children, ...props }: any) => (
                  <pre {...props} className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                    {children}
                  </pre>
                ),
                a: ({ node, href, children, ...props }) => {
                  if (href && href.startsWith('#')) {
                    return (
                      <a
                        {...props}
                        href={href}
                        onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                          e.preventDefault();
                          scrollToSection(decodeURIComponent(href.slice(1)));
                        }}
                        className="text-primary hover:underline cursor-pointer"
                      >
                        {children}
                      </a>
                    );
                  }
                  if (href && !href.startsWith('http') && !href.startsWith('#')) {
                    const [docHref, anchor = ''] = href.split('#');
                    const cleanedHref = docHref.replace(/^\.?\//, '');
                    const targetFile = docFiles.find(f => f.path.toLowerCase() === cleanedHref.toLowerCase());
                    if (targetFile) {
                      return (
                        <a
                          {...props}
                          href={targetFile.path}
                          onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                            e.preventDefault();
                            openDoc(targetFile.path, decodeURIComponent(anchor));
                          }}
                          className="text-primary hover:underline cursor-pointer"
                        >
                          {children}
                        </a>
                      );
                    }
                    // e.g. a doc that isn't shown on this platform: keep the words, drop the link
                    return <span>{children}</span>;
                  }
                  return (
                    <a {...props} href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {children}
                    </a>
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