import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { Save, FileText, Settings, X, Eye, HelpCircle } from 'lucide-react'
import { editorApi } from '../api/editorApi'
import { useProjectStore } from '../store/projectStore'
import { useEditorStore } from '../store/editorStore'
import { useThemeStore } from '../store/themeStore'
import EditorSidebar from '../components/editor/EditorSidebar'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import toast from 'react-hot-toast'
import { EDITOR_DEFAULT_FONT_SIZE } from '@verbweaver/shared'

function EditorView() {
  const { nodeId } = useParams()
  const navigate = useNavigate()
  const { currentProject, currentProjectPath } = useProjectStore()
  const { theme } = useThemeStore()
  const { 
    currentFile, 
    openFiles, 
    loadFile, 
    saveFile, 
    closeFile,
    updateFileContent 
  } = useEditorStore()
  
  const [content, setContent] = useState('')
  const [isModified, setIsModified] = useState(false)
  const [fontSize, setFontSize] = useState(EDITOR_DEFAULT_FONT_SIZE)
  const [isPreview, setIsPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const editorRef = useRef<any>(null)

  // Load file when nodeId changes
  useEffect(() => {
    if (nodeId && currentProject) {
      loadFile(currentProject.id, nodeId)
        .then((file) => {
          setContent(file.content)
          setIsModified(false)
        })
        .catch(() => {
          toast.error('Failed to load file')
          navigate('/editor')
        })
    }
  }, [nodeId, currentProject, loadFile, navigate])

  // Handle content changes
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined && currentFile) {
      if (isPreview) setPreviewHtml('')
      setContent(value)
      setIsModified(true)
      updateFileContent(currentFile.id, value)
    }
  }, [currentFile, updateFileContent])

  // Save file
  const handleSave = useCallback(async () => {
    if (currentFile && currentProject && isModified) {
      try {
        await saveFile(currentProject.id, currentFile.id, content)
        setIsModified(false)
        toast.success('File saved')
      } catch (error) {
        toast.error('Failed to save file')
      }
    }
  }, [currentFile, currentProject, content, isModified, saveFile])

  // Fetch preview when in preview mode and content changes
  useEffect(() => {
    const fetchPreview = async () => {
      if (!isPreview || !currentFile || !currentFile.name.endsWith('.md')) return
             try {
         const html = await editorApi.previewMarkdown(content, currentProjectPath || undefined)
         setPreviewHtml(html)
       } catch (err) {
         console.error('Preview failed', err)
       }
    }
    const id = setTimeout(fetchPreview, 400) // debounce 400ms
    return () => clearTimeout(id)
  }, [isPreview, content, currentFile])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const editorHasFocus = !!(editorRef.current && typeof editorRef.current.hasTextFocus === 'function' && editorRef.current.hasTextFocus())

      // Save
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSave()
        return
      }
      // Toggle preview (Ctrl+P)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setIsPreview((prev) => !prev)
        return
      }

      // Formatting shortcuts only when editor has focus
      if (!editorHasFocus) return

      // Bold **selection**
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        applyWrap('**', '**')
        return
      }
      // Italic *selection*
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        applyWrap('*', '*')
        return
      }
      // Link [selection](url)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        applyLink()
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  const applyWrap = (prefix: string, suffix: string) => {
    const editor = editorRef.current
    if (!editor) return
    const model = editor.getModel?.()
    const sel = editor.getSelection?.()
    if (!model || !sel) return
    const selectedText = model.getValueInRange(sel)
    const replacement = `${prefix}${selectedText}${suffix}`
    editor.executeEdits('markdown-wrap', [
      { range: sel, text: replacement, forceMoveMarkers: true }
    ])
    // Set cursor inside the wrappers when empty selection
    if (!selectedText) {
      const pos = sel.getStartPosition()
      const newPos = { lineNumber: pos.lineNumber, column: pos.column + prefix.length }
      editor.setPosition(newPos)
    }
    editor.focus()
  }

  const applyLink = () => {
    const editor = editorRef.current
    if (!editor) return
    const model = editor.getModel?.()
    const sel = editor.getSelection?.()
    if (!model || !sel) return
    const selectedText = model.getValueInRange(sel)
    const label = selectedText || 'link-text'
    const replacement = `[${label}]()`
    editor.executeEdits('markdown-link', [
      { range: sel, text: replacement, forceMoveMarkers: true }
    ])
    // Place cursor inside the parentheses for URL entry
    const start = sel.getStartPosition()
    const newPos = { lineNumber: start.lineNumber, column: start.column + label.length + 3 } // [ + label + ](
    editor.setPosition(newPos)
    editor.focus()
  }

  // Close file
  const handleCloseFile = useCallback(() => {
    if (currentFile) {
      closeFile(currentFile.id)
      const remainingFiles = openFiles.filter(f => f.id !== currentFile.id)
      if (remainingFiles.length > 0) {
        navigate(`/editor/${remainingFiles[0].id}`)
      } else {
        navigate('/editor')
      }
    }
  }, [currentFile, openFiles, closeFile, navigate])

  if (!currentProject) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">No Project Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a project to start editing
          </p>
        </div>
      </div>
    )
  }

  if (!currentFile) {
    return (
      <div className="h-full flex">
        <EditorSidebar />
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="text-center">
            <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No File Open</h2>
            <p className="text-muted-foreground">
              Select a file from the sidebar to start editing
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4" />
          <span className="font-medium">{currentFile.name}</span>
          {isModified && <span className="text-xs text-muted-foreground">(modified)</span>}
        </div>
        
                 <div className="flex items-center gap-2">
           <button
             onClick={() => window.open('https://pandoc.org/MANUAL.html#pandocs-markdown', '_blank')}
             className="p-1.5 rounded hover:bg-accent"
             title="Formatting guidelines - Pandocs Markdown"
           >
             <HelpCircle className="w-4 h-4" />
           </button>
           
           <button
            onClick={() => setIsPreview((prev: boolean) => !prev)}
             disabled={!currentFile.name.endsWith('.md')}
             className={`p-1.5 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed ${
               isPreview ? 'bg-accent border border-primary' : ''
             }`}
             title="Toggle preview"
           >
             <Eye className="w-4 h-4" />
           </button>

          <button
            onClick={handleSave}
            disabled={!isModified}
            className="p-1.5 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save (Ctrl+S)"
          >
            <Save className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => setFontSize((prev: number) => Math.min(prev + 1, 24))}
            className="p-1.5 rounded hover:bg-accent"
            title="Increase font size"
          >
            <Settings className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleCloseFile}
            className="p-1.5 rounded hover:bg-accent"
            title="Close file"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor Content */}
      <PanelGroup direction="horizontal" className="flex-1">
        <Panel defaultSize={20} minSize={15} maxSize={30}>
          <EditorSidebar />
        </Panel>
        
        <PanelResizeHandle className="w-1 bg-border hover:bg-primary/20 transition-colors" />
        
        <Panel defaultSize={80}>
          {isPreview ? (
            <div className="h-full w-full overflow-auto bg-background p-4" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          ) : (
            <Editor
              value={content}
              onChange={handleEditorChange}
              onMount={(editor, monaco) => {
                editorRef.current = editor
                try {
                  const disposables: any[] = []
                  // Ctrl/Cmd+B Bold
                  disposables.push(editor.addCommand((monaco as any).KeyMod.CtrlCmd | (monaco as any).KeyCode.KeyB, () => {
                    applyWrap('**', '**')
                  }))
                  // Ctrl/Cmd+I Italic
                  disposables.push(editor.addCommand((monaco as any).KeyMod.CtrlCmd | (monaco as any).KeyCode.KeyI, () => {
                    applyWrap('*', '*')
                  }))
                  // Ctrl/Cmd+K Link
                  disposables.push(editor.addCommand((monaco as any).KeyMod.CtrlCmd | (monaco as any).KeyCode.KeyK, () => {
                    applyLink()
                  }))
                  editor.onDidDispose(() => {
                    try { disposables.forEach(d => d?.dispose?.()) } catch {}
                  })
                } catch {}
              }}
              language="markdown"
              theme={theme === 'dark' ? 'vs-dark' : 'light'}
              options={{
                fontSize,
                wordWrap: 'on',
                minimap: { enabled: false },
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                insertSpaces: true,
              }}
            />
          )}
        </Panel>
      </PanelGroup>
    </div>
  )
}

export default EditorView 