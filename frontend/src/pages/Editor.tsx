import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { Save, FileText, Settings, X } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { useEditorStore } from '../store/editorStore'
import { useThemeStore } from '../store/themeStore'
import EditorSidebar from '../components/editor/EditorSidebar'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import toast from 'react-hot-toast'
import { EDITOR_DEFAULT_FONT_SIZE } from '@verbweaver/shared'

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

function EditorView() {
  const { nodeId, filePath } = useParams()
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
  const [localFilePath, setLocalFilePath] = useState<string | null>(null)
  const [localFileName, setLocalFileName] = useState<string | null>(null)

  // Load file when nodeId or filePath changes
  useEffect(() => {
    const loadContent = async () => {
      if (isElectron && filePath && window.electronAPI) {
        // For Electron, load file directly from filesystem
        try {
          const decodedPath = decodeURIComponent(filePath)
          const fileContent = await window.electronAPI.readFile(decodedPath)
          setContent(fileContent)
          setLocalFilePath(decodedPath)
          setLocalFileName(decodedPath.split(/[/\\]/).pop() || 'Unknown')
          setIsModified(false)
        } catch (error) {
          toast.error('Failed to load file')
          navigate('/editor')
        }
      } else if (nodeId && currentProject) {
        // For web version, use the API
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
    }
    
    loadContent()
  }, [nodeId, filePath, currentProject, loadFile, navigate])

  // Handle content changes
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setContent(value)
      setIsModified(true)
      
      if (!isElectron && currentFile) {
        updateFileContent(currentFile.id, value)
      }
    }
  }, [currentFile, updateFileContent])

  // Save file
  const handleSave = useCallback(async () => {
    if (isModified) {
      try {
        if (isElectron && localFilePath && window.electronAPI) {
          // For Electron, save directly to filesystem
          await window.electronAPI.writeFile(localFilePath, content)
          setIsModified(false)
          toast.success('File saved')
        } else if (currentFile && currentProject) {
          // For web version, use the API
          await saveFile(currentProject.id, currentFile.id, content)
          setIsModified(false)
          toast.success('File saved')
        }
      } catch (error) {
        toast.error('Failed to save file')
      }
    }
  }, [currentFile, currentProject, content, isModified, saveFile, localFilePath])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

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

  if (!isElectron && !currentFile) {
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

  const displayFileName = isElectron ? localFileName : currentFile?.name

  return (
    <div className="h-full flex flex-col">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4" />
          <span className="font-medium">{displayFileName || 'Untitled'}</span>
          {isModified && <span className="text-xs text-muted-foreground">(modified)</span>}
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!isModified}
            className="p-1.5 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save (Ctrl+S)"
          >
            <Save className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => setFontSize(prev => Math.min(prev + 1, 24))}
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
          <Editor
            value={content}
            onChange={handleEditorChange}
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
        </Panel>
      </PanelGroup>
    </div>
  )
}

export default EditorView 