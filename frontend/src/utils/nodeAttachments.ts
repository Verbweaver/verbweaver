// Shared helpers for the files attached to a node (stored in its `metadata.task.files`).
import type { TaskMetadata } from '@verbweaver/shared'
import { useNodeStore } from '../store/nodeStore'
import { FileStorage, StoredFile } from './fileStorage'

type TaskWithFiles = Partial<TaskMetadata> & { files?: StoredFile[] }
// A raw `task.files` entry as read from front-matter (may be partial or an old format)
type RawFileEntry = Partial<StoredFile>
type NodeLike = { path: string; metadata?: { task?: unknown } | null } | null | undefined

function rawFiles(node: NodeLike): RawFileEntry[] {
  const files = (node?.metadata?.task as TaskWithFiles | undefined)?.files
  return Array.isArray(files) ? (files as RawFileEntry[]) : []
}

/**
 * The files attached to a node, normalised to StoredFile. Entries in an old format that can't be
 * located on disk come back with an empty `path`.
 */
export function getNodeFiles(node: NodeLike): StoredFile[] {
  return rawFiles(node).map((file, i) => {
    const migrated = file && typeof file === 'object' ? FileStorage.migrateOldFileFormat(file) : null
    if (migrated) return migrated
    return {
      id: file?.id || `old_${i}`,
      name: file?.name || 'Unknown File',
      originalName: file?.originalName || file?.name || 'Unknown File',
      size: file?.size || 0,
      uploadedAt: file?.uploadedAt ? String(file.uploadedAt) : '',
      uploadedBy: file?.uploadedBy || 'Unknown User',
      path: '', // Empty path: the file can't be opened or deleted
      mimeType: file?.mimeType || 'application/octet-stream',
    } as StoredFile
  })
}

const normalizePath = (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/')

/** Paths of the nodes (other than `excludePath`) that have a file at `filePath` attached. */
export function findNodesReferencingFile(
  filePath: string,
  nodes: Iterable<NodeLike>,
  excludePath?: string,
): string[] {
  if (!filePath) return []
  const target = normalizePath(filePath)
  const result: string[] = []
  for (const node of nodes) {
    if (!node || node.path === excludePath) continue
    if (rawFiles(node).some((f) => typeof f?.path === 'string' && f.path && normalizePath(f.path) === target)) {
      result.push(node.path)
    }
  }
  return result
}

/** Upload files for a node and return the stored entries (failed uploads are skipped). */
export async function uploadFilesForNode(files: FileList | File[], nodePath: string): Promise<StoredFile[]> {
  const uploaded: StoredFile[] = []
  for (const f of Array.from(files)) {
    const sf = await FileStorage.uploadFile(f, nodePath)
    if (sf) uploaded.push(sf)
  }
  return uploaded
}

async function writeNodeFiles(nodePath: string, next: (files: RawFileEntry[]) => RawFileEntry[]): Promise<void> {
  // Read the node fresh so concurrent metadata changes are not clobbered
  const node = useNodeStore.getState().nodes.get(nodePath)
  if (!node) throw new Error(`Node not found: ${nodePath}`)
  // `files` is stored in task metadata but isn't part of the shared TaskMetadata type yet
  const task: TaskWithFiles = node.metadata?.task || {}
  const nextTask: TaskWithFiles = { ...task, files: next(rawFiles(node)) as StoredFile[] }
  await useNodeStore.getState().updateNode(nodePath, {
    metadata: { task: nextTask as TaskMetadata },
  })
}

/**
 * Upload files and append them to the node's `metadata.task.files`, persisting via the node
 * store. Throws if the node is not in the store. Returns the newly stored entries.
 */
export async function attachFilesToNode(nodePath: string, files: FileList | File[]): Promise<StoredFile[]> {
  if (!useNodeStore.getState().nodes.get(nodePath)) throw new Error(`Node not found: ${nodePath}`)
  const uploaded = await uploadFilesForNode(files, nodePath)
  await writeNodeFiles(nodePath, (existing) => [...existing, ...uploaded])
  return uploaded
}

/** Remove a file from a node's attachments, matching by id, or by path when the entry has no id. The file stays on disk. */
export async function unattachFileFromNode(nodePath: string, file: Pick<StoredFile, 'id' | 'path'>): Promise<void> {
  await writeNodeFiles(nodePath, (existing) => existing.filter((f) => !matchesFile(f, file)))
}

function matchesFile(entry: RawFileEntry, file: Pick<StoredFile, 'id' | 'path'>): boolean {
  if (entry?.id && file.id) return entry.id === file.id
  return !!file.path && typeof entry?.path === 'string' && normalizePath(entry.path) === normalizePath(file.path)
}

/**
 * Delete an attached file from disk and remove it from every node it is attached to
 * (duplicated nodes can share an upload). Throws if the file can't be deleted.
 */
export async function deleteAttachedFile(nodePath: string, file: StoredFile): Promise<void> {
  if (!file.path) throw new Error('This file has no location on disk')
  const deleted = await FileStorage.deleteFile(file)
  if (!deleted) throw new Error(`Could not delete ${file.originalName || file.name}`)
  await unattachFileFromNode(nodePath, file)
  const target = normalizePath(file.path)
  const others = findNodesReferencingFile(file.path, useNodeStore.getState().nodes.values(), nodePath)
  for (const other of others) {
    await writeNodeFiles(other, (existing) =>
      existing.filter((f) => !(typeof f?.path === 'string' && normalizePath(f.path) === target)))
  }
}
