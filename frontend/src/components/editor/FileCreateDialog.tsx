import { useState } from 'react'
import { X } from 'lucide-react'

interface FileCreateDialogProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (fileName: string) => void
}

export default function FileCreateDialog({ isOpen, onClose, onCreate }: FileCreateDialogProps) {
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleCreate = () => {
    // Validate file name
    if (!fileName.trim()) {
      setError('File name is required')
      return
    }

    // Ensure .md extension
    const fullFileName = fileName.endsWith('.md') ? fileName : `${fileName}.md`
    
    // Validate filename characters
    const validFilename = /^[a-zA-Z0-9-_. ]+$/
    if (!validFilename.test(fullFileName)) {
      setError('File name contains invalid characters')
      return
    }

    onCreate(fullFileName)
    setFileName('')
    setError('')
    onClose()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreate()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg p-6 w-[400px] max-w-[90vw]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">New File</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              File Name
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => {
                setFileName(e.target.value)
                setError('')
              }}
              onKeyPress={handleKeyPress}
              className="w-full px-3 py-2 border border-border rounded-md bg-background"
              placeholder="my-document.md"
              autoFocus
            />
            {error && (
              <p className="text-xs text-red-500 mt-1">{error}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              The file will be created in the nodes folder. The .md extension will be added automatically if not provided.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border rounded-md hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Create File
          </button>
        </div>
      </div>
    </div>
  )
} 