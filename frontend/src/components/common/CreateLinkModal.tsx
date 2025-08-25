import { useEffect, useMemo, useState } from 'react'
import { useNodeStore } from '../../store/nodeStore'
import { X, Search, Link as LinkIcon } from 'lucide-react'

interface SharedCreateLinkModalProps {
  currentNodePath: string
  onClose: () => void
  onLinkCreated?: (updatedLinks?: string[]) => void
}

export function SharedCreateLinkModal({ currentNodePath, onClose, onLinkCreated }: SharedCreateLinkModalProps) {
  const { nodes, createSoftLink } = useNodeStore()
  const [search, setSearch] = useState('')
  const [selectedPath, setSelectedPath] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  // Build list of candidate nodes (exclude current node, directories, non-markdown, and existing links)
  const candidates = useMemo(() => {
    const source = nodes.get(currentNodePath)
    const existingIds = new Set<string>(Array.isArray(source?.metadata?.links) ? (source!.metadata.links as string[]) : [])
    const all = Array.from(nodes.values()).filter(n => {
      if (n.path === currentNodePath) return false
      if (!n.isMarkdown || n.isDirectory) return false
      // Filter out already linked nodes by default
      if (existingIds.size > 0 && n.metadata?.id && existingIds.has(n.metadata.id)) return false
      return true
    })
    if (!search.trim()) return all.sort((a, b) => (a.metadata.title || a.name).localeCompare(b.metadata.title || b.name))
    const q = search.toLowerCase()
    return all
      .map(n => ({
        node: n,
        score: ((n.metadata.title || n.name).toLowerCase().includes(q) ? 2 : 0) + (n.path.toLowerCase().includes(q) ? 1 : 0)
      }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || (a.node.metadata.title || a.node.name).localeCompare(b.node.metadata.title || b.node.name))
      .map(x => x.node)
  }, [nodes, currentNodePath, search])

  useEffect(() => {
    if (!selectedPath && candidates.length > 0) {
      setSelectedPath(candidates[0].path)
    }
  }, [candidates, selectedPath])

  const handleCreate = async () => {
    if (!selectedPath) return
    setIsBusy(true)
    try {
      await createSoftLink(currentNodePath, selectedPath)
      // Compute updated links to return to caller
      const store = useNodeStore.getState()
      const source = store.nodes.get(currentNodePath)
      const target = store.nodes.get(selectedPath)
      const currentLinks = Array.isArray(source?.metadata?.links) ? [...source!.metadata.links] : []
      if (target && !currentLinks.includes(target.metadata.id)) currentLinks.push(target.metadata.id)
      onLinkCreated?.(currentLinks)
      onClose()
    } catch (e) {
      console.error('Create link failed', e)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-background border border-border rounded-lg w-[560px] max-w-[90vw] p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold inline-flex items-center gap-2"><LinkIcon className="w-4 h-4"/>Create Link</h3>
          <button className="p-1.5 rounded hover:bg-accent" onClick={onClose} aria-label="Close"><X className="w-4 h-4"/></button>
        </div>
        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">Find a node</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full p-2 pr-8 border border-input rounded-md bg-background"
                placeholder="Search by title or path..."
              />
              <Search className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        </div>
        <div className="max-h-64 overflow-auto border border-border rounded">
          {candidates.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No matches</div>
          ) : (
            <ul>
              {candidates.map(n => (
                <li key={n.path}>
                  <label className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer">
                    <input
                      type="radio"
                      name="link-target"
                      value={n.path}
                      checked={selectedPath === n.path}
                      onChange={() => setSelectedPath(n.path)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{n.metadata.title || n.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{n.path}</div>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="px-4 py-2 border border-input rounded-md hover:bg-accent" onClick={onClose} disabled={isBusy}>Cancel</button>
          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50" onClick={handleCreate} disabled={!selectedPath || isBusy}>Create Link</button>
        </div>
      </div>
    </div>
  )
}

export default SharedCreateLinkModal


