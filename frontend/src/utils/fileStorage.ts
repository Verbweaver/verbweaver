// File storage utility for handling uploads within Git repository
import { useProjectStore } from '../store/projectStore'

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

export interface StoredFile {
  id: string
  name: string
  originalName: string
  size: number
  uploadedAt: Date
  uploadedBy: string
  path: string // Path within the project repository
  mimeType: string
}

export class FileStorage {
  private static getProjectPath(): string | null {
    if (!isElectron || !window.electronAPI) return null
    
    const { currentProjectPath } = useProjectStore.getState()
    return currentProjectPath || null
  }

  private static getUploadsPath(): string | null {
    const projectPath = this.getProjectPath()
    if (!projectPath) return null
    
    return `${projectPath}/uploads`
  }

  private static async ensureUploadsDirectory(): Promise<string | null> {
    const uploadsPath = this.getUploadsPath()
    if (!uploadsPath || !isElectron || !window.electronAPI) return null

    try {
      // Check if uploads directory exists
      await window.electronAPI.readDirectory(uploadsPath)
    } catch (error) {
      // Directory doesn't exist, create it
      try {
        // Create uploads directory
        await window.electronAPI.createDirectory(uploadsPath)
      } catch (createError) {
        console.error('Failed to create uploads directory:', createError)
        return null
      }
    }

    return uploadsPath
  }

  static async uploadFile(file: File, taskId: string): Promise<StoredFile | null> {
    if (!isElectron || !window.electronAPI) {
      console.error('File upload only supported in Electron mode')
      return null
    }

    const uploadsPath = await this.ensureUploadsDirectory()
    if (!uploadsPath) {
      console.error('Failed to ensure uploads directory')
      return null
    }

    try {
      // Prefer preserving original filename; disambiguate with numeric suffix when needed
      const timestamp = Date.now()
      const sanitizedOriginal = file.name.replace(/[\\/]/g, '')
      const dotIndex = sanitizedOriginal.lastIndexOf('.')
      const base = dotIndex > 0 ? sanitizedOriginal.slice(0, dotIndex) : sanitizedOriginal
      const ext = dotIndex > 0 ? sanitizedOriginal.slice(dotIndex) : ''

      // Build a unique path that preserves original name, appending " (n)" if it exists
      let candidateName = `${base}${ext}`
      let candidatePath = `${uploadsPath}/${candidateName}`
      let counter = 1
      // Probe for existence by attempting to read; if it fails, assume it doesn't exist
      // This avoids overwriting existing files
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          await window.electronAPI.readFile(candidatePath)
          // If read succeeded, file exists; bump suffix
          candidateName = `${base} (${counter})${ext}`
          candidatePath = `${uploadsPath}/${candidateName}`
          counter += 1
        } catch {
          // read failed → treat as not existing
          break
        }
      }

      // Convert File to Uint8Array for Electron
      const arrayBuffer = await file.arrayBuffer()
      // Use Uint8Array instead of Buffer for browser compatibility
      const uint8Array = new Uint8Array(arrayBuffer)

      // Write file to filesystem
      await window.electronAPI.writeFileBinary(candidatePath, uint8Array)

      // Create stored file record
      const storedFile: StoredFile = {
        id: `${taskId}_${timestamp}`,
        name: candidateName,
        originalName: sanitizedOriginal,
        size: file.size,
        uploadedAt: new Date(),
        uploadedBy: 'Current User', // TODO: Get from auth context
        path: candidatePath,
        mimeType: file.type || 'application/octet-stream'
      }

      return storedFile
    } catch (error) {
      console.error('Failed to upload file:', error)
      return null
    }
  }

  static async downloadFile(storedFile: StoredFile): Promise<void> {
    if (!isElectron || !window.electronAPI) {
      console.error('File download only supported in Electron mode')
      return
    }

    // Validate the stored file has a valid path
    if (!storedFile.path) {
      console.error('Stored file has no path:', storedFile)
      throw new Error('File path is missing')
    }

    try {
      // Get the file data from Electron
      const result = await window.electronAPI.downloadFile(storedFile.path, storedFile.originalName)
      
      if (!result.success) {
        throw new Error('Failed to read file for download')
      }
      
      // Create a blob from the file data
      const blob = new Blob([result.data])
      
      // Use the fallback download method since File System Access API is blocked in Electron
      console.log('Using fallback download method for:', storedFile.originalName)
      this.fallbackDownload(blob, storedFile.originalName)
    } catch (error) {
      console.error('Failed to download file:', error)
      throw error
    }
  }

  private static fallbackDownload(blob: Blob, filename: string): void {
    // Create download link as fallback
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    
    // Trigger the browser's native download dialog
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    // Clean up
    URL.revokeObjectURL(url)
    
    console.log('File download initiated (fallback):', filename)
  }

  static async deleteFile(storedFile: StoredFile): Promise<boolean> {
    if (!isElectron || !window.electronAPI) {
      console.error('File deletion only supported in Electron mode')
      return false
    }

    // Validate the stored file has a valid path
    if (!storedFile.path) {
      console.error('Stored file has no path:', storedFile)
      return false
    }

    try {
      // Delete file from filesystem
      await window.electronAPI.deleteFile(storedFile.path)
      return true
    } catch (error) {
      console.error('Failed to delete file:', error)
      return false
    }
  }

  static getFileUrl(storedFile: StoredFile): string | null {
    if (!isElectron || !window.electronAPI) return null
    
    // Return a file:// URL for Electron
    return `file://${storedFile.path}`
  }

  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Helper method to migrate old file format to new format
  static migrateOldFileFormat(oldFile: any): StoredFile | null {
    // If it's already in the new format, return as is
    if (oldFile.path && oldFile.originalName) {
      return oldFile as StoredFile
    }

    // If it's in the old format, we can't recover the file
    // but we can create a placeholder
    console.warn('Found old file format, cannot recover file:', oldFile)
    return null
  }
} 