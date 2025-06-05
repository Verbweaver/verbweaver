import { Template } from './templates'

// Desktop-specific template operations using Electron APIs
export const desktopTemplatesApi = {
  // List templates from the local filesystem
  listTemplates: async (projectPath: string): Promise<Template[]> => {
    if (!window.electronAPI) {
      console.error("[desktopTemplatesApi] Electron API not available");
      throw new Error('Electron API not available');
    }
    console.log(`[desktopTemplatesApi] listTemplates called with projectPath: "${projectPath}"`);

    // Consistently use forward slashes for internal path manipulation
    const normalizedProjectPath = projectPath.replace(/\\/g, '/');
    const templatesPath = `${normalizedProjectPath}/templates`;
    console.log(`[desktopTemplatesApi] Intended templatesPath: "${templatesPath}"`);

    try {
      let templatesDirExists = false;
      try {
        console.log(`[desktopTemplatesApi] Checking if templates directory exists: "${templatesPath}"`);
        await window.electronAPI.readDirectory(templatesPath);
        templatesDirExists = true;
        console.log(`[desktopTemplatesApi] Templates directory "${templatesPath}" already exists.`);
      } catch (dirError: any) {
        console.warn(`[desktopTemplatesApi] Failed to read templates directory "${templatesPath}" (may not exist):`, dirError.message);
        try {
          console.log(`[desktopTemplatesApi] Attempting to create templates directory: "${templatesPath}"`);
          await window.electronAPI.createDirectory(templatesPath); // Assuming this exists as per original code
          templatesDirExists = true;
          console.log(`[desktopTemplatesApi] Successfully created templates directory: "${templatesPath}"`);
        } catch (createError: any) {
          console.error(`[desktopTemplatesApi] Failed to create templates directory "${templatesPath}":`, createError.message);
          throw new Error(`Failed to ensure templates directory exists: ${createError.message}`);
        }
      }
      
      if (templatesDirExists) {
        const emptyTemplatePath = `${templatesPath}/Empty.md`;
        console.log(`[desktopTemplatesApi] Checking/Ensuring Empty.md at: "${emptyTemplatePath}"`);
        try {
          await window.electronAPI.readFile(emptyTemplatePath);
          console.log(`[desktopTemplatesApi] Empty.md already exists at "${emptyTemplatePath}".`);
        } catch (emptyFileError: any) {
          console.warn(`[desktopTemplatesApi] Empty.md not found at "${emptyTemplatePath}", creating it. Error:`, emptyFileError.message);
          const emptyTemplateContent = `---
title: Empty
type: file
description: A blank template for new nodes.
tags: []
---

# {title}

This is a basic empty node.

{description}`;
          try {
            await window.electronAPI.writeFile(emptyTemplatePath, emptyTemplateContent);
            console.log(`[desktopTemplatesApi] Successfully created Empty.md at "${emptyTemplatePath}".`);
          } catch (writeError: any) {
            console.error(`[desktopTemplatesApi] Failed to write Empty.md at "${emptyTemplatePath}":`, writeError.message);
          }
        }
      }
      
      console.log(`[desktopTemplatesApi] Reading files from templates directory: "${templatesPath}"`);
      const files = await window.electronAPI.readDirectory(templatesPath);
      console.log(`[desktopTemplatesApi] Files found in "${templatesPath}":`, files.map(f => f.name));
      
      const templates: Template[] = [];
      
      for (const fileInfo of files) {
        if (fileInfo.name.endsWith('.md')) {
          const filePath = `${templatesPath}/${fileInfo.name}`;
          console.log(`[desktopTemplatesApi] Reading template file: "${filePath}"`);
          const content: string = await window.electronAPI.readFile(filePath);
          console.log(`[desktopTemplatesApi] Content for "${fileInfo.name}" read, length: ${content.length}`);
          
          const frontmatterRegex = /^---(?:\r?\n|\r)([\s\S]*?)(?:\r?\n|\r)---(?:\r?\n|\r)([\s\S]*)$/;
          const match = content.match(frontmatterRegex);
          
          if (match) {
            const [, frontmatter, markdownContent] = match;
            console.log(`[desktopTemplatesApi] Parsed frontmatter for "${fileInfo.name}":`, frontmatter);
            
            const metadata: any = {};
            const lines = frontmatter.split(/\r?\n|\r/);
            
            for (const line of lines) {
              const colonIndex = line.indexOf(':');
              if (colonIndex > 0) {
                const key = line.substring(0, colonIndex).trim();
                const value = line.substring(colonIndex + 1).trim();
                const cleanValue = value.replace(/^['"]|['"]$/g, '');
                
                if (key === 'task') {
                  metadata.task = {
                    status: 'todo',
                    priority: 'medium',
                    assignee: undefined,
                    dueDate: undefined,
                    completedDate: undefined,
                    description: ''
                  };
                } else if (key.startsWith('  ') && metadata.task) {
                  const taskKey = key.trim();
                  metadata.task[taskKey] = cleanValue === 'null' ? undefined : cleanValue;
                } else {
                  metadata[key] = cleanValue;
                }
              }
            }
            
            templates.push({
              path: `templates/${fileInfo.name}`, // This path is relative to project root for UI consistency
              name: fileInfo.name.replace(/\.md$/, ''),
              metadata,
              content: markdownContent.trim()
            });
          } else {
            console.warn(`[desktopTemplatesApi] Could not parse frontmatter for "${fileInfo.name}". Skipping.`);
          }
        }
      }
      
      if (templates.length === 0) {
        console.warn(`[desktopTemplatesApi] No templates parsed from "${templatesPath}". Returning empty list.`);
      }
      
      console.log(`[desktopTemplatesApi] Successfully parsed ${templates.length} templates.`);
      return templates;
    } catch (error: any) {
      console.error('[desktopTemplatesApi] Error reading templates overall:', error.message, error.stack);
      console.warn('[desktopTemplatesApi] Falling back to default Empty template due to error.');
      return [{
        path: 'templates/Empty.md',
        name: 'Empty',
        metadata: {
          title: 'Empty',
          type: 'file',
          description: 'A fallback empty template.',
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
      }];
    }
  },

  // Save a node as a template locally
  saveAsTemplate: async (projectPath: string, sourcePath: string, templateName: string): Promise<Template> => {
    if (!window.electronAPI) {
      console.error("[desktopTemplatesApi] Electron API not available");
      throw new Error('Electron API not available');
    }
    console.log(`[desktopTemplatesApi] saveAsTemplate called with projectPath: "${projectPath}", sourcePath: "${sourcePath}", templateName: "${templateName}"`);
    const normalizedProjectPath = projectPath.replace(/\\/g, '/');
    const fullSourcePath = `${normalizedProjectPath}/${sourcePath.replace(/\\/g, '/')}`;
    const templateFilePath = `${normalizedProjectPath}/templates/${templateName}.md`;
    console.log(`[desktopTemplatesApi] Reading source file from: "${fullSourcePath}"`);
    console.log(`[desktopTemplatesApi] Writing template to: "${templateFilePath}"`);

    const sourceContent = await window.electronAPI.readFile(fullSourcePath);
    
    const templatesDir = `${normalizedProjectPath}/templates`;
    try {
      await window.electronAPI.readDirectory(templatesDir);
    } catch (e) {
      console.log(`[desktopTemplatesApi] Templates directory "${templatesDir}" not found, creating it.`);
      await window.electronAPI.createDirectory(templatesDir); // Assuming this exists
    }
    
    await window.electronAPI.writeFile(templateFilePath, sourceContent);
    console.log(`[desktopTemplatesApi] Successfully saved template: "${templateName}.md"`);
    
    // Parse frontmatter for the created template to return accurate metadata
    let metadata: any = { title: templateName, type: 'file' };
    let contentOnly = sourceContent;

    const frontmatterRegex = /^---(?:\r?\n|\r)([\s\S]*?)(?:\r?\n|\r)---(?:\r?\n|\r)([\s\S]*)$/;
    const match = sourceContent.match(frontmatterRegex);

    if (match) {
        const [, frontmatterStr, markdownContent] = match;
        contentOnly = markdownContent.trim();
        const parsedMeta: any = {};
        const lines = frontmatterStr.split(/\r?\n|\r/);
        for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const key = line.substring(0, colonIndex).trim();
                const value = line.substring(colonIndex + 1).trim();
                parsedMeta[key] = value.replace(/^['"]|['"]$/g, '');
            }
        }
        metadata = { ...metadata, ...parsedMeta }; // Merge parsed meta with defaults
    }
    
    return {
      path: `templates/${templateName}.md`,
      name: templateName,
      metadata,
      content: contentOnly
    };
  },

  // Delete a template locally
  deleteTemplate: async (projectPath: string, templateName: string): Promise<void> => {
    if (!window.electronAPI) {
      console.error("[desktopTemplatesApi] Electron API not available");
      throw new Error('Electron API not available');
    }
    console.log(`[desktopTemplatesApi] deleteTemplate called with projectPath: "${projectPath}", templateName: "${templateName}"`);
    const normalizedProjectPath = projectPath.replace(/\\/g, '/');
    const templateFilePath = `${normalizedProjectPath}/templates/${templateName}.md`;
    console.log(`[desktopTemplatesApi] Deleting template file: "${templateFilePath}"`);

    await window.electronAPI.deleteFile(templateFilePath);
    console.log(`[desktopTemplatesApi] Successfully deleted template: "${templateName}.md"`);
  }
}

// Add this new function for creating a node from a template in desktop mode
export const createNodeFromTemplateDesktop = async (
  templateRelativePath: string, // e.g., "MyTemplate.md" or "folder/MyTemplate.md"
  newNodeName: string,
  newParentRelativePath: string, // e.g., "nodes" or "nodes/subfolder"
  initialMetadata?: Record<string, any>
): Promise<any> => { // Return type should ideally match the expected node structure or void
  if (!window.electronAPI || !window.electronAPI.createNodeFromTemplateFile) {
    console.error("[desktopTemplatesApi] Electron API or createNodeFromTemplateFile not available");
    throw new Error('Electron API function createNodeFromTemplateFile not available');
  }
  console.log("[desktopTemplatesApi] createNodeFromTemplateDesktop called with:", 
    {
      templateRelativePath,
      newNodeName,
      newParentRelativePath,
      initialMetadata
    }
  );
  // This will call the function exposed from the main process via preload
  return window.electronAPI.createNodeFromTemplateFile({
    templateRelativePath,
    newNodeName,
    newParentRelativePath,
    initialMetadata,
  });
}; 