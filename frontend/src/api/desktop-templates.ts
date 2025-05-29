import { Template } from './templates'

// Desktop-specific template operations using Electron APIs
export const desktopTemplatesApi = {
  // List templates from the local filesystem
  listTemplates: async (projectPath: string): Promise<Template[]> => {
    if (!window.electronAPI) {
      throw new Error('Electron API not available')
    }

    try {
      // Read templates directory
      const templatesPath = `${projectPath}/templates`
      const files = await window.electronAPI.readDirectory(templatesPath)
      
      const templates: Template[] = []
      
      for (const fileInfo of files) {
        if (fileInfo.name.endsWith('.md')) {
          const filePath = `${templatesPath}/${fileInfo.name}`
          const content: string = await window.electronAPI.readFile(filePath)
          
          // Parse the markdown file with frontmatter
          const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
          const match = content.match(frontmatterRegex)
          
          if (match) {
            const [, frontmatter, markdownContent] = match
            
            // Parse YAML frontmatter manually (simple parser)
            const metadata: any = {}
            const lines = frontmatter.split('\n')
            
            for (const line of lines) {
              const colonIndex = line.indexOf(':')
              if (colonIndex > 0) {
                const key = line.substring(0, colonIndex).trim()
                const value = line.substring(colonIndex + 1).trim()
                
                // Remove quotes if present
                const cleanValue = value.replace(/^['"]|['"]$/g, '')
                
                // Handle nested task object
                if (key === 'task') {
                  metadata.task = {
                    status: 'todo',
                    priority: 'medium',
                    assignee: undefined,
                    dueDate: undefined,
                    completedDate: undefined,
                    description: ''
                  }
                } else if (key.startsWith('  ') && metadata.task) {
                  // Task properties
                  const taskKey = key.trim()
                  metadata.task[taskKey] = cleanValue === 'null' ? undefined : cleanValue
                } else {
                  metadata[key] = cleanValue
                }
              }
            }
            
            templates.push({
              path: `templates/${fileInfo.name}`,
              name: fileInfo.name.replace('.md', ''),
              metadata,
              content: markdownContent
            })
          }
        }
      }
      
      return templates
    } catch (error) {
      console.error('Error reading templates:', error)
      // Return a default Empty template if we can't read the templates directory
      return [{
        path: 'templates/Empty.md',
        name: 'Empty',
        metadata: {
          title: 'Empty',
          type: 'file',
          description: '',
          tags: [],
          task: {
            status: 'todo',
            priority: 'medium',
            assignee: undefined,
            dueDate: undefined,
            completedDate: undefined,
            description: ''
          }
        },
        content: '# {title}\n\n{description}'
      }]
    }
  },

  // Save a node as a template locally
  saveAsTemplate: async (projectPath: string, sourcePath: string, templateName: string): Promise<Template> => {
    if (!window.electronAPI) {
      throw new Error('Electron API not available')
    }

    // Read the source file
    const sourceContent = await window.electronAPI.readFile(`${projectPath}/${sourcePath}`)
    
    // Create the template file
    const templatePath = `${projectPath}/templates/${templateName}.md`
    await window.electronAPI.writeFile(templatePath, sourceContent)
    
    // Return the created template
    return {
      path: `templates/${templateName}.md`,
      name: templateName,
      metadata: {
        title: templateName,
        type: 'file'
      },
      content: sourceContent
    }
  },

  // Delete a template locally
  deleteTemplate: async (projectPath: string, templateName: string): Promise<void> => {
    if (!window.electronAPI) {
      throw new Error('Electron API not available')
    }

    const templatePath = `${projectPath}/templates/${templateName}.md`
    await window.electronAPI.deleteFile(templatePath)
  }
}

// Add this new function for creating a node from a template
export const createNodeFromTemplateDesktop = async (
  // projectPath: string, // No longer needed as first arg, main process gets it from store
  templateRelativePath: string,
  newNodeName: string,
  newParentRelativePath: string,
  initialMetadata: Record<string, any>
): Promise<any> => { // Return type should match the expected node structure
  if (!window.electronAPI) {
    throw new Error('Electron API not available');
  }
  return window.electronAPI.createNodeFromTemplateFile({ // Correctly call the exposed method
    templateRelativePath,
    newNodeName,
    newParentRelativePath,
    initialMetadata,
  });
}; 