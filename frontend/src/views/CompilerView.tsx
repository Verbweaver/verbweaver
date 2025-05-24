import { useState, useEffect } from 'react'
import { FileDown, FileText, Book, Package, Globe, Code, Loader2 } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { EXPORT_FORMATS } from '@verbweaver/shared'
import toast from 'react-hot-toast'
import { api } from '../services/auth'

interface ExportFormat {
  id: string
  name: string
  icon: any
  description: string
  extension: string
}

const exportFormats: ExportFormat[] = [
  {
    id: 'pdf',
    name: 'PDF',
    icon: FileText,
    description: 'Portable Document Format',
    extension: '.pdf'
  },
  {
    id: 'docx',
    name: 'Word Document',
    icon: FileText,
    description: 'Microsoft Word format',
    extension: '.docx'
  },
  {
    id: 'odt',
    name: 'OpenDocument',
    icon: FileText,
    description: 'Open Document Text',
    extension: '.odt'
  },
  {
    id: 'epub',
    name: 'EPUB',
    icon: Book,
    description: 'Electronic publication',
    extension: '.epub'
  },
  {
    id: 'mobi',
    name: 'MOBI',
    icon: Book,
    description: 'Kindle format',
    extension: '.mobi'
  },
  {
    id: 'html',
    name: 'HTML',
    icon: Globe,
    description: 'Web page format',
    extension: '.html'
  },
  {
    id: 'markdown',
    name: 'Markdown',
    icon: Code,
    description: 'Plain text with formatting',
    extension: '.md'
  }
]

interface CompileOptions {
  includeMetadata: boolean
  includeToc: boolean
  includeIndex: boolean
  includeBibliography: boolean
  pageSize: 'A4' | 'Letter' | 'A5'
  fontSize: 'small' | 'medium' | 'large'
  margins: 'narrow' | 'normal' | 'wide'
  lineSpacing: 'single' | '1.5' | 'double'
}

function CompilerView() {
  const { currentProject } = useProjectStore()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [exportFormat, setExportFormat] = useState(EXPORT_FORMATS.PDF)
  const [selectedNodes, setSelectedNodes] = useState<string[]>([])
  const [includeMetadata, setIncludeMetadata] = useState(true)
  const [includeTOC, setIncludeTOC] = useState(true)
  const [selectedFormat, setSelectedFormat] = useState<string>('pdf')
  const [isCompiling, setIsCompiling] = useState(false)
  const [compileProgress, setCompileProgress] = useState(0)
  const [options, setOptions] = useState<CompileOptions>({
    includeMetadata: true,
    includeToc: true,
    includeIndex: false,
    includeBibliography: false,
    pageSize: 'A4',
    fontSize: 'medium',
    margins: 'normal',
    lineSpacing: '1.5'
  })

  useEffect(() => {
    if (currentProject) {
      setTitle(currentProject.name)
    }
  }, [currentProject])

  const handleCompile = async () => {
    if (!currentProject) return
    
    if (selectedNodes.length === 0) {
      toast.error('Please select files to export')
      return
    }

    setIsCompiling(true)
    setCompileProgress(0)

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setCompileProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return prev
          }
          return prev + 10
        })
      }, 500)

      const response = await api.post('/compiler/compile', {
        format: selectedFormat,
        options
      }, {
        responseType: 'blob'
      })

      clearInterval(progressInterval)
      setCompileProgress(100)

      // Download the file
      const blob = new Blob([response.data])
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      const format = exportFormats.find(f => f.id === selectedFormat)
      a.href = url
      a.download = `document${format?.extension || '.pdf'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      setTimeout(() => {
        setIsCompiling(false)
        setCompileProgress(0)
      }, 1000)

      toast.success('Export completed successfully')
    } catch (error) {
      console.error('Compile error:', error)
      setIsCompiling(false)
      setCompileProgress(0)
      toast.error('Failed to compile document')
    }
  }

  const updateOption = <K extends keyof CompileOptions>(key: K, value: CompileOptions[K]) => {
    setOptions(prev => ({ ...prev, [key]: value }))
  }

  const selectAllNodes = () => {
    // TODO: Implement selecting all nodes from the graph
    setSelectedNodes([]);
  };

  const clearSelection = () => {
    setSelectedNodes([]);
  };

  if (!currentProject) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">No Project Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a project to export documents
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex bg-background">
      {/* Left Panel - File Selection */}
      <div className="w-1/3 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold mb-2">Select Files</h2>
          <div className="flex gap-2">
            <button
              onClick={selectAllNodes}
              className="text-sm px-2 py-1 border border-input rounded hover:bg-accent"
            >
              Select All
            </button>
            <button
              onClick={clearSelection}
              className="text-sm px-2 py-1 border border-input rounded hover:bg-accent"
            >
              Clear
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
          <p className="text-sm text-muted-foreground">
            File selection will be implemented with the file tree component
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {selectedNodes.length} files selected
          </p>
        </div>
      </div>

      {/* Right Panel - Export Settings */}
      <div className="flex-1 flex flex-col">
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold mb-2">Export Document</h1>
            <p className="text-muted-foreground">
              Configure and export your project as a document
            </p>
          </div>

          {/* Document Info */}
          <div className="space-y-4">
            <h3 className="font-semibold">Document Information</h3>
            
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background"
                placeholder="Document title"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Author</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background"
                placeholder="Author name"
              />
            </div>
          </div>

          {/* Export Format */}
          <div className="space-y-4">
            <h3 className="font-semibold">Export Format</h3>
            
            <div className="grid grid-cols-2 gap-3">
              {exportFormats.map((format) => (
                <button
                  key={format.id}
                  onClick={() => setSelectedFormat(format.id)}
                  className={`flex items-center gap-3 p-3 border rounded-md transition-colors ${
                    selectedFormat === format.id
                      ? 'border-primary bg-primary/10'
                      : 'border-input hover:bg-accent'
                  }`}
                >
                  <format.icon className="w-5 h-5" />
                  <span className="text-sm font-medium">{format.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-4">
            <h3 className="font-semibold">Options</h3>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={options.includeMetadata}
                onChange={(e) => updateOption('includeMetadata', e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Include metadata</span>
            </label>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={options.includeToc}
                onChange={(e) => updateOption('includeToc', e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Include table of contents</span>
            </label>
          </div>

          {/* Compile Button and Progress */}
          <div className="space-y-4">
            <button
              onClick={handleCompile}
              disabled={isCompiling || selectedNodes.length === 0}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
            >
              {isCompiling ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Compiling...
                </>
              ) : (
                <>
                  <FileDown className="h-5 w-5" />
                  Compile and Download
                </>
              )}
            </button>

            {isCompiling && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{compileProgress}%</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${compileProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default CompilerView 