// Shared helpers for attaching uploaded files to a node's task.files.
import type { TaskMetadata } from '@verbweaver/shared'
import { useNodeStore } from '../store/nodeStore'
import { FileStorage, StoredFile } from './fileStorage'

type TaskWithFiles = Partial<TaskMetadata> & { files?: StoredFile[] }

/** Upload files for a node and return the stored entries (failed uploads are skipped). */
export async function uploadFilesForNode(files: FileList | File[], nodePath: string): Promise<StoredFile[]> {
  const uploaded: StoredFile[] = []
  for (const f of Array.from(files)) {
    const sf = await FileStorage.uploadFile(f, nodePath)
    if (sf) uploaded.push(sf)
  }
  return uploaded
}

/**
 * Upload files and append them to the node's `metadata.task.files`, persisting via the node
 * store. Throws if the node is not in the store. Returns the newly stored entries.
 */
export async function attachFilesToNode(nodePath: string, files: FileList | File[]): Promise<StoredFile[]> {
  if (!useNodeStore.getState().nodes.get(nodePath)) throw new Error(`Node not found: ${nodePath}`)
  const uploaded = await uploadFilesForNode(files, nodePath)
  // Re-read after the (async) uploads so concurrent metadata changes are not clobbered
  const node = useNodeStore.getState().nodes.get(nodePath)
  if (!node) throw new Error(`Node not found: ${nodePath}`)
  // `files` is stored in task metadata but isn't part of the shared TaskMetadata type yet
  const task: TaskWithFiles = node.metadata?.task || {}
  const existing = Array.isArray(task.files) ? task.files : []
  const nextTask: TaskWithFiles = { ...task, files: [...existing, ...uploaded] }
  await useNodeStore.getState().updateNode(nodePath, {
    metadata: { task: nextTask as TaskMetadata },
  })
  return uploaded
}
