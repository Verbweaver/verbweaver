import { useEffect, useState } from 'react'
import { templatesApi, Template } from '../api/templates'
import { desktopTemplatesApi } from '../api/desktop-templates'
import { useProjectStore } from '../store/projectStore'
import toast from 'react-hot-toast'
import { X, Loader2 } from 'lucide-react'

const isElectron = window.electronAPI !== undefined

interface TemplateSelectionDialogProps {
  isOpen: boolean
  onClose: () => void
  onSelectTemplate: (templatePath: string, nodeName: string, parentPath: string) => void
  parentPath?: string
}

export function TemplateSelectionDialog({
  isOpen,
  onClose,
  onSelectTemplate,
  parentPath = ''
}: TemplateSelectionDialogProps) {
  const { currentProject, currentProjectPath } = useProjectStore()
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [nodeName, setNodeName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [contentPreview, setContentPreview] = useState<string>('')

  useEffect(() => {
    if (isOpen && (currentProject || currentProjectPath)) {
      loadTemplates()
    }
  }, [isOpen, currentProject, currentProjectPath])

  useEffect(() => {
    if (selectedTemplate) {
      // Replace placeholders in content preview
      let preview = selectedTemplate.content
      preview = preview.replace('{title}', nodeName || 'Node Title')
      preview = preview.replace('{description}', selectedTemplate.metadata.description || '')
      setContentPreview(preview)
    }
  }, [selectedTemplate, nodeName])

  const loadTemplates = async () => {
    setIsLoading(true)
    try {
      let templateList: Template[]
      
      if (isElectron && currentProjectPath) {
        // Desktop: use local filesystem API
        console.log('Loading templates from desktop API:', currentProjectPath)
        templateList = await desktopTemplatesApi.listTemplates(currentProjectPath)
      } else if (!isElectron && currentProject?.id) {
        // Web: use REST API
        console.log('Loading templates from REST API:', currentProject.id)
        templateList = await templatesApi.listTemplates(currentProject.id)
      } else {
        console.error('No project selected or invalid project state:', { 
          isElectron, 
          currentProjectPath, 
          currentProjectId: currentProject?.id 
        })
        throw new Error('No project selected')
      }
      
      setTemplates(templateList)
      // Select the first template by default
      if (templateList.length > 0) {
        setSelectedTemplate(templateList[0])
      }
    } catch (error) {
      console.error('Failed to load templates:', error)
      toast.error('Failed to load templates')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = () => {
    if (!selectedTemplate || !nodeName.trim()) {
      toast.error('Please select a template and enter a name')
      return
    }

    onSelectTemplate(selectedTemplate.path, nodeName.trim(), parentPath)
    setNodeName('')
    onClose()
  }

  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      {/* Dialog */}
      <div className="relative bg-background border rounded-lg shadow-lg w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold">Create Node from Template</h2>
            <p className="text-sm text-muted-foreground">
              Select a template and enter a name for your new node
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-accent rounded-md transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
            {/* Template Selection */}
            <div className="flex flex-col">
              <label className="text-sm font-medium mb-2">Select Template</label>
              {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <div className="flex-1 border rounded-md overflow-y-auto p-2 space-y-2">
                  {templates.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No templates available
                    </p>
                  ) : (
                    templates.map((template) => (
                      <div
                        key={template.path}
                        className={`p-3 rounded-md cursor-pointer transition-colors ${
                          selectedTemplate?.path === template.path
                            ? 'bg-accent border-primary'
                            : 'hover:bg-accent/50'
                        } border`}
                        onClick={() => handleTemplateSelect(template)}
                      >
                        <h4 className="font-medium text-sm">{template.metadata.title}</h4>
                        {template.metadata.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {template.metadata.description}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Preview */}
            <div className="flex flex-col">
              <label className="text-sm font-medium mb-2">Preview</label>
              <div className="flex-1 border rounded-md p-4 bg-muted/30 overflow-y-auto">
                {selectedTemplate ? (
                  <pre className="text-sm whitespace-pre-wrap font-mono">
                    {contentPreview}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Select a template to preview
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Node Name Input */}
          <div className="mt-4">
            <label htmlFor="node-name" className="text-sm font-medium">
              Node Name
            </label>
            <input
              id="node-name"
              type="text"
              value={nodeName}
              onChange={(e) => setNodeName(e.target.value)}
              placeholder="Enter node name..."
              className="mt-1 w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nodeName.trim() && selectedTemplate) {
                  handleCreate()
                }
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-6 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedTemplate || !nodeName.trim()}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Node
          </button>
        </div>
      </div>
    </div>
  )
} 