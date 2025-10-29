import { useCallback, useEffect, useMemo, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useTabStore } from '../store/tabStore'
import { useGroupViewStore } from '../store/groupViewState'
import { useNodeStore } from '../store/nodeStore'
import ReactFlow, { Background, Controls, Edge, Node, NodeTypes, useEdgesState, useNodesState, Connection } from 'react-flow-renderer'
import { buildEquivalenceBoxes, computeCoverRelations, computeRemainder } from '../utils/grouping'
import NodeContextMenu from '../components/graph/NodeContextMenu'
// @ts-ignore: type stub provided in global.d.ts; package installed at runtime
import * as htmlToImage from 'html-to-image'
import toast from 'react-hot-toast'
import GroupBoxNode from '../components/graph/GroupBoxNode'
import CustomNode from '../components/graph/CustomNode'
import { getLayoutedElements } from '../utils/graphLayout'

// Placeholder Group view. Will be replaced with React Flow Sub Flows implementation in subsequent tasks.
export default function GroupView() {
  const { currentProject } = useProjectStore()
  const activeTabId = useTabStore(s => s.activeTabId)
  const tabs = useTabStore(s => s.tabs)
  const loadFromStorage = useGroupViewStore(s => s.loadFromStorage)
  const saveToStorage = useGroupViewStore(s => s.saveToStorage)
  const groups = useGroupViewStore(s => s.groups)
  const options = useGroupViewStore(s => s.options)
  const layout = useGroupViewStore(s => s.layout)
  const setBoxLayout = useGroupViewStore(s => s.setBoxLayout)
  const { nodes: verbweaverNodes, deleteNode, createSoftLink, removeSoftLink } = useNodeStore()
  const { addEditorTab } = useTabStore()

  // Check if we're in Electron
  const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined

  useEffect(() => {
    const tab = tabs.find(t => t.id === activeTabId)
    const graphTabId = tab && tab.type === 'graph' ? tab.id : undefined
    if (currentProject?.id && graphTabId) {
      loadFromStorage(currentProject.id, graphTabId)
    }
  }, [currentProject?.id, activeTabId, tabs, loadFromStorage])

  // Debounced persistence when groups/options/layout change
  useEffect(() => {
    const tab = tabs.find(t => t.id === activeTabId)
    const graphTabId = tab && tab.type === 'graph' ? tab.id : undefined
    if (!currentProject?.id || !graphTabId) return
    const h = window.setTimeout(() => {
      try { saveToStorage(currentProject.id!, graphTabId) } catch {}
    }, 400)
    return () => window.clearTimeout(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, options, layout])
  // Compute group node sets and equivalence boxes
  const equivalence = useMemo(() => {
    const enabled = groups.filter(g => g.enabled)
    if (enabled.length === 0) return { boxes: [], byId: new Map<string, { name: string }>() }
    const byId = new Map(enabled.map(g => [g.id, { name: g.name }]))
    const nodesArr = Array.from(verbweaverNodes.values() || [])

    const normalizeId = (s: string) => String(s || '').replace(/^node-/, '')
    const matches = (node: any, filters: any): boolean => {
      const meta = node?.metadata || {}
      const usingFilters = (
        (filters.tags || []).length > 0 || filters.nameKeyword || filters.descriptionKeyword || filters.startsWith || filters.endsWith ||
        filters.startDateFrom || filters.startDateTo || filters.dueDateFrom || filters.dueDateTo || filters.hasAttachments || (filters.linkedFromNodeTags || []).length > 0
      )
      if (!usingFilters) return true
      const title = String(meta?.title || node.name || '')
      const description = String(meta?.description || '')
      const tags: string[] = Array.isArray(meta?.tags) ? meta.tags.map(String) : []
      const startDate = String(meta?.task?.startDate || '')
      const dueDate = String(meta?.task?.dueDate || '')
      const files = Array.isArray(meta?.task?.files) ? meta.task.files : []
      const nodeId = String(meta?.id || '')
      if (filters.nameKeyword && !title.toLowerCase().includes(String(filters.nameKeyword).toLowerCase())) return false
      if (filters.descriptionKeyword && !description.toLowerCase().includes(String(filters.descriptionKeyword).toLowerCase())) return false
      if (filters.startsWith) {
        if (filters.startsEndsCaseSensitive) {
          if (!title.startsWith(filters.startsWith)) return false
        } else if (!title.toLowerCase().startsWith(String(filters.startsWith).toLowerCase())) return false
      }
      if (filters.endsWith) {
        if (filters.startsEndsCaseSensitive) {
          if (!title.endsWith(filters.endsWith)) return false
        } else if (!title.toLowerCase().endsWith(String(filters.endsWith).toLowerCase())) return false
      }
      if ((filters.tags || []).length > 0) {
        const set = new Set(tags.map((t: string) => t.toLowerCase()))
        const wanted = (filters.tags || []).map((t: string) => t.toLowerCase())
        if (filters.tagsLogic === 'ANY') {
          if (!wanted.some((t: string) => set.has(t))) return false
        } else if (!wanted.every((t: string) => set.has(t))) return false
      }
      if (filters.startDateFrom && (!startDate || startDate < filters.startDateFrom)) return false
      if (filters.startDateTo && (!startDate || startDate > filters.startDateTo)) return false
      if (filters.dueDateFrom && (!dueDate || dueDate < filters.dueDateFrom)) return false
      if (filters.dueDateTo && (!dueDate || dueDate > filters.dueDateTo)) return false
      if (filters.hasAttachments) {
        if (!Array.isArray(files) || files.length === 0) return false
      }
      if ((filters.linkedFromNodeTags || []).length > 0) {
        const sourceIds = new Set<string>((filters.linkedFromNodeTags || []).map(normalizeId).filter(Boolean))
        const outgoingTargetIds = new Set<string>()
        if (sourceIds.size > 0) {
          for (const n of verbweaverNodes.values()) {
            const nid = n?.metadata?.id
            if (nid && sourceIds.has(String(nid))) {
              const links: string[] = Array.isArray(n?.metadata?.links) ? n.metadata.links : []
              links.forEach((id: string) => { if (id) outgoingTargetIds.add(String(id)) })
            }
          }
        }
        if (!nodeId || !outgoingTargetIds.has(nodeId)) return false
      }
      return true
    }

    const groupNodes = enabled.map(g => ({
      groupId: g.id,
      nodeIds: nodesArr
        .filter(n => matches(n, g.filters))
        .map(n => String(n?.metadata?.id || ''))
        .filter(Boolean),
    }))

    const boxes = buildEquivalenceBoxes(groupNodes)
    return { boxes, byId }
  }, [groups, verbweaverNodes])

  // Build maps for metadata lookup
  const idToMeta = useMemo(() => {
    const m = new Map<string, { title: string; links: string[] }>()
    for (const n of verbweaverNodes.values()) {
      const id = String(n?.metadata?.id || '')
      if (!id) continue
      m.set(id, { title: String(n?.metadata?.title || n?.name || id), links: Array.isArray(n?.metadata?.links) ? n?.metadata?.links.map(String) : [] })
    }
    return m
  }, [verbweaverNodes])
  const idToPath = useMemo(() => {
    const m = new Map<string, string>()
    for (const [path, n] of verbweaverNodes.entries()) {
      const id = String(n?.metadata?.id || '')
      if (!id) continue
      if (!m.has(id)) m.set(id, path)
    }
    return m
  }, [verbweaverNodes])

  // Build flow nodes and edges
  const { flowNodes, flowEdges } = useMemo(() => {
    const nodes: Node[] = []
    const edges: Edge[] = []
    const boxIdToName = new Map<string, string>(
      equivalence.boxes.map(b => [b.boxId, b.groupIds.map(id => equivalence.byId.get(id)?.name || id).join(', ')])
    )

    // Simple grid for initial positions if not saved
    const gridW = 260, gridH = 140, perRow = 3
    const covers = computeCoverRelations(equivalence.boxes)
    const parentsOf = new Map<string, Set<string>>()
    const childrenOf = new Map<string, Set<string>>()
    for (const e of covers) {
      if (!parentsOf.has(e.childBoxId)) parentsOf.set(e.childBoxId, new Set())
      parentsOf.get(e.childBoxId)!.add(e.parentBoxId)
      if (!childrenOf.has(e.parentBoxId)) childrenOf.set(e.parentBoxId, new Set())
      childrenOf.get(e.parentBoxId)!.add(e.childBoxId)
    }
    const topLevel = equivalence.boxes.filter(b => !(parentsOf.get(b.boxId)?.size))

    const chipsFor = (ids: string[]) => ids.map(id => ({ id, title: idToMeta.get(id)?.title || id }))
    const linkPairsFor = (ids: string[]) => {
      const idSet = new Set(ids)
      const pairs: Array<{ from: string; to: string }> = []
      ids.forEach(from => {
        const links = idToMeta.get(from)?.links || []
        links.forEach(to => { if (idSet.has(String(to))) pairs.push({ from, to: String(to) }) })
      })
      return pairs.slice(0, 12).map(p => ({ from: idToMeta.get(p.from)?.title || p.from, to: idToMeta.get(p.to)?.title || p.to }))
    }

    const maxCards = Math.max(5, Math.min(200, Number(options.maxCardsPerGroup || 40)))
    if (!options.nestGroups) {
      equivalence.boxes.forEach((b, idx) => {
        const saved = layout.boxes[b.boxId]
        const x = saved?.x ?? (idx % perRow) * gridW
        const y = saved?.y ?? Math.floor(idx / perRow) * gridH
        const isEq = b.groupIds.length > 1
        const totalCount = b.nodeIds.length
        nodes.push({
          id: b.boxId,
          data: { label: boxIdToName.get(b.boxId) || 'Group', isEquivalent: isEq, chips: chipsFor(b.nodeIds), linkPairs: linkPairsFor(b.nodeIds), showNodeCards: !!options.showNodeCards, visibleCardCount: Math.min(totalCount, maxCards), totalCardCount: totalCount },
          position: { x, y },
          style: { width: 260, height: 160 },
          type: 'groupBox',
          draggable: true,
        })

        // Show full node cards inside group (flat mode: all nodes of the set)
        if (options.showNodeCards) {
          const childIds = b.nodeIds.slice(0, maxCards)
          const columns = 2
          const cardW = 180
          const cardH = 80
          const padX = 12, padY = 28
          childIds.forEach((cid, cidx) => {
            const col = cidx % columns
            const row = Math.floor(cidx / columns)
            const cx = padX + col * (cardW + 12)
            const cy = padY + row * (cardH + 12)
            const meta = idToMeta.get(cid)
            const path = idToPath.get(cid)
            const storeNode = path ? verbweaverNodes.get(path) : undefined
            nodes.push({
              id: `${b.boxId}::n::${cid}`,
              parentNode: b.boxId,
              position: { x: cx, y: cy },
              type: 'custom',
              draggable: false,
              data: {
                label: meta?.title || cid,
                type: String(storeNode?.metadata?.type || ''),
                metadata: storeNode?.metadata,
              },
              extent: 'parent' as any,
            } as any)
          })
          // Intra-group soft-link edges between child nodes
          const idSet = new Set(childIds)
          childIds.forEach(from => {
            const links = idToMeta.get(from)?.links || []
            links.forEach(to => {
              if (idSet.has(String(to))) {
                edges.push({
                  id: `${b.boxId}::e::${from}->${to}`,
                  source: `${b.boxId}::n::${from}`,
                  target: `${b.boxId}::n::${to}`,
                  type: 'default',
                })
              }
            })
          })
        }
      })
      // Flat mode: edges for superset/subset cover relations
      covers.forEach(e => {
        edges.push({ id: `${e.parentBoxId}->${e.childBoxId}`, source: e.parentBoxId, target: e.childBoxId })
      })
    } else {
      // Nesting mode: recursively place children under each parent; duplicate children under multiple parents
      const placeBox = (boxId: string, parent?: string, depth: number = 0, idx: number = 0) => {
        const b = equivalence.boxes.find(x => x.boxId === boxId)
        if (!b) return
        const baseId = parent ? `${boxId}__under__${parent}` : boxId
        const saved = layout.boxes[baseId] || layout.boxes[boxId]
        const x = saved?.x ?? ((idx % perRow) * gridW + depth * 12)
        const y = saved?.y ?? (Math.floor(idx / perRow) * gridH)
        const isEq = b.groupIds.length > 1

        // If nested, parent sees only remainder; the child shows its own chips
        const directChildren = Array.from(childrenOf.get(boxId) || [])
        const remainder = directChildren.length > 0 ? computeRemainder(b.nodeIds, directChildren.map(cid => {
          const cb = equivalence.boxes.find(x => x.boxId === cid)
          return cb ? cb.nodeIds : []
        })) : b.nodeIds
        const isRoot = !parent
        const displayedSet = isRoot ? remainder : b.nodeIds
        const totalCount = displayedSet.length

        // Estimate height for root boxes in nested mode and larger boxes in card mode
        const estimateHeight = () => {
          if (!options.showNodeCards) return 160
          const count = (parent ? b.nodeIds : remainder).length
          const rows = Math.ceil(Math.min(count, maxCards) / 2)
          return 28 + rows * (80 + 12) + 24 // header + rows + padding
        }

        nodes.push({
          id: baseId,
          data: {
            label: boxIdToName.get(boxId) || 'Group',
            isEquivalent: isEq,
            chips: chipsFor(displayedSet),
            remainderChips: [],
            linkPairs: linkPairsFor(displayedSet),
            showNodeCards: !!options.showNodeCards,
            visibleCardCount: Math.min(totalCount, maxCards),
            totalCardCount: totalCount,
          },
          position: { x, y },
          style: { width: options.showNodeCards ? (parent ? 480 : 520) : (parent ? 240 : 260), height: estimateHeight() },
          type: 'groupBox',
          draggable: !parent,
          parentNode: parent,
          extent: parent ? 'parent' : undefined,
        } as any)

        // In nested mode with node cards, render only remainder nodes inside the parent box;
        // child boxes will render their own nodes.
        if (options.showNodeCards) {
          const childIds = (parent ? b.nodeIds : remainder).slice(0, maxCards)
          const columns = 2
          const cardW = 180
          const cardH = 80
          const padX = 12, padY = 28
          childIds.forEach((cid, cidx) => {
            const col = cidx % columns
            const row = Math.floor(cidx / columns)
            const cx = padX + col * (cardW + 12)
            const cy = padY + row * (cardH + 12)
            const meta = idToMeta.get(cid)
            const path = idToPath.get(cid)
            const storeNode = path ? verbweaverNodes.get(path) : undefined
            nodes.push({
              id: `${baseId}::n::${cid}`,
              parentNode: baseId,
              position: { x: cx, y: cy },
              type: 'custom',
              draggable: false,
              data: {
                label: meta?.title || cid,
                type: String(storeNode?.metadata?.type || ''),
                metadata: storeNode?.metadata,
              },
              extent: 'parent' as any,
            } as any)
          })
          // Soft-link edges restricted to childIds within this base box
          const idSet = new Set(childIds)
          childIds.forEach(from => {
            const links = idToMeta.get(from)?.links || []
            links.forEach(to => {
              if (idSet.has(String(to))) {
                edges.push({
                  id: `${baseId}::e::${from}->${to}`,
                  source: `${baseId}::n::${from}`,
                  target: `${baseId}::n::${to}`,
                  type: 'default',
                })
              }
            })
          })
        }

        // Recurse children: duplicate under this baseId
        directChildren.forEach((cid, cidx) => placeBox(cid, baseId, depth + 1, cidx))
      }

      topLevel.forEach((b, idx) => placeBox(b.boxId, undefined, 0, idx))
    }

    return { flowNodes: nodes, flowEdges: edges }
  }, [equivalence, layout.boxes, options.nestGroups, options.showNodeCards, idToMeta])

  const [nodesState, setNodesState, onNodesChange] = useNodesState(flowNodes)
  const [edgesState, setEdgesState, onEdgesChange] = useEdgesState(flowEdges)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string; edgeId?: string } | null>(null)

  useEffect(() => { setNodesState(flowNodes) }, [flowNodes, setNodesState])
  useEffect(() => { setEdgesState(flowEdges) }, [flowEdges, setEdgesState])

  const onNodeDragStop = useCallback((_: any, n: Node) => {
    if (!n?.id) return
    setBoxLayout(n.id, { x: n.position.x, y: n.position.y, w: n.width, h: n.height })
    const tab = tabs.find(t => t.id === activeTabId)
    const graphTabId = tab && tab.type === 'graph' ? tab.id : undefined
    if (currentProject?.id && graphTabId) {
      saveToStorage(currentProject.id, graphTabId)
    }
  }, [setBoxLayout, saveToStorage, tabs, activeTabId, currentProject?.id])

  const exportMapAsPng = useCallback(async () => {
    try {
      const el = document.querySelector('.react-flow__renderer') as HTMLElement
      const viewport = document.querySelector('.react-flow') as HTMLElement
      const target = el || viewport || document.body
      const dataUrl = await htmlToImage.toPng(target, { backgroundColor: getComputedStyle(document.body).getPropertyValue('--background') || '#fff' })
      const filename = `groups-${new Date().toISOString().replace(/[:.]/g,'-')}.png`
      if (isElectron && (window as any).electronAPI?.saveBinaryFile) {
        const bin = await (await fetch(dataUrl)).arrayBuffer()
        const result = await (window as any).electronAPI.saveBinaryFile(new Uint8Array(bin), filename)
        if (!result?.canceled) toast.success('Map saved')
      } else {
        const link = document.createElement('a')
        link.href = dataUrl
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        toast.success('Download started')
      }
    } catch (e) {
      toast.error('Failed to export map')
    } finally {
      setContextMenu(null)
    }
  }, [isElectron])

  const parseUnderlyingId = (nodeId: string): string | null => {
    const marker = '::n::'
    const idx = nodeId.indexOf(marker)
    if (idx === -1) return null
    return nodeId.slice(idx + marker.length)
  }

  const onNodeContextMenu = useCallback((e: any, n: Node) => {
    e.preventDefault()
    const underlying = parseUnderlyingId(n.id)
    if (!underlying) return // ignore group box context here; pane context handles export
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: underlying })
  }, [])

  const onEdgeContextMenu = useCallback((e: any, edge: Edge) => {
    e.preventDefault()
    // Only allow unlink for internal in-group edges with ::e:: pattern
    if (edge.id.includes('::e::')) {
      setContextMenu({ x: e.clientX, y: e.clientY, edgeId: edge.id })
    }
  }, [])

  const handleEditNode = useCallback((underlyingId?: string) => {
    if (!underlyingId) return
    const path = idToPath.get(underlyingId)
    const meta = Array.from(verbweaverNodes.values()).find(v => String(v?.metadata?.id || '') === underlyingId)
    if (path && meta) addEditorTab(path, meta.name)
  }, [idToPath, verbweaverNodes, addEditorTab])

  const handleDeleteNode = useCallback(async (underlyingId?: string) => {
    if (!underlyingId) return
    const path = idToPath.get(underlyingId)
    if (path) await deleteNode(path)
  }, [idToPath, deleteNode])

  const handleUnlinkEdge = useCallback(async (edgeId?: string) => {
    if (!edgeId) return
    // edge id format: <base>::e::<from>-><to>
    const marker = '::e::'
    const idx = edgeId.indexOf(marker)
    if (idx === -1) return
    const rest = edgeId.slice(idx + marker.length)
    const parts = rest.split('->')
    if (parts.length !== 2) return
    const from = parts[0]
    const to = parts[1]
    const fromPath = idToPath.get(from)
    const toPath = idToPath.get(to)
    if (fromPath && toPath) {
      await removeSoftLink(fromPath, toPath)
      setEdgesState(prev => prev.filter(e => e.id !== edgeId))
    }
  }, [idToPath, removeSoftLink, setEdgesState])

  const onConnect = useCallback(async (conn: Connection) => {
    const getUnderlying = (nid?: string | null) => (nid ? parseUnderlyingId(nid) : null)
    const s = getUnderlying(conn.source)
    const t = getUnderlying(conn.target)
    if (!s || !t) return
    const sp = idToPath.get(s)
    const tp = idToPath.get(t)
    if (sp && tp) {
      await createSoftLink(sp, tp)
      // Optimistic edge for in-group if both nodes share same base id prefix before '::n::'
      const base = (nid: string) => nid.split('::n::')[0]
      if (base(conn.source!) === base(conn.target!)) {
        const baseId = base(conn.source!)
        setEdgesState(prev => ([...prev, { id: `${baseId}::e::${s}->${t}`, source: `${baseId}::n::${s}`, target: `${baseId}::n::${t}` }]))
      }
    }
  }, [idToPath, createSoftLink, setEdgesState])

  const performAutoLayout = useCallback(() => {
    if (!options.nestGroups) {
      // Flat mode: layout group boxes using dagre; keep children relative
      const groupNodes = nodesState.filter(n => n.type === 'groupBox')
      const groupEdges = edgesState.filter(e => !String(e.id).includes('::e::'))
      const { nodes: laid } = getLayoutedElements(groupNodes as any, groupEdges as any, { direction: 'TB', nodeSpacing: 160, rankSpacing: 200 })
      laid.forEach(n => setBoxLayout(n.id, { x: n.position.x, y: n.position.y, w: n.width, h: n.height }))
      setNodesState(prev => prev.map(n => {
        const found = laid.find(m => m.id === n.id)
        return found ? { ...n, position: found.position } : n
      }))
    } else {
      // Nest mode: simple packing - stack child boxes vertically within each parent
      const updated: Record<string, { x: number; y: number }> = {}
      const groups = nodesState.filter(n => n.type === 'groupBox')
      const roots = groups.filter(n => !n.parentNode)
      const getWidth = (nId: string) => {
        const n = nodesState.find(m => m.id === nId)
        const w = n && n.style && (n.style as any).width ? Number((n.style as any).width) : (options.showNodeCards ? 520 : 260)
        return Number.isFinite(w) ? w : (options.showNodeCards ? 520 : 260)
      }
      const placeChildren = (parentId: string) => {
        const children = groups.filter(n => n.parentNode === parentId)
        let y = 28
        const parentW = getWidth(parentId)
        children.forEach((c, idx) => {
          const childW = getWidth(c.id)
          const x = Math.max(16, Math.round((parentW - childW) / 2))
          updated[c.id] = { x, y }
          y += (c.style && (c.style as any).height ? Number((c.style as any).height) : 160) + 16
          // Recurse
          placeChildren(c.id)
        })
      }
      roots.forEach(r => placeChildren(r.id))
      // Apply child positions relative to parent and expand parent size
      setNodesState(prev => prev.map(n => {
        if (updated[n.id]) {
          return { ...n, position: updated[n.id] }
        }
        if (!n.parentNode && n.type === 'groupBox') {
          // expand root boxes to fit children roughly
          return { ...n, style: { ...(n.style || {}), width: 520, height: 400 } }
        }
        return n
      }))
    }
  }, [options.nestGroups, nodesState, edgesState, setNodesState, setBoxLayout])

  // Trigger auto layout via Options tray button
  const layoutVersion = useGroupViewStore(s => s.layoutVersion)
  useEffect(() => {
    if (!layoutVersion) return
    performAutoLayout()
  }, [layoutVersion, performAutoLayout])

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodesState}
        edges={edgesState}
        nodeTypes={{ groupBox: GroupBoxNode, custom: CustomNode } as NodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onConnect={onConnect}
        onPaneContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }) }}
        className="bg-background"
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          edgeId={contextMenu.edgeId}
          onCreateNode={() => {}}
          onDeleteNode={(nid) => { handleDeleteNode(nid || contextMenu.nodeId); setContextMenu(null) }}
          onEditNode={(nid) => { handleEditNode(nid || contextMenu.nodeId); setContextMenu(null) }}
          onUnlinkEdge={(eid) => { handleUnlinkEdge(eid || contextMenu.edgeId); setContextMenu(null) }}
          onClose={() => setContextMenu(null)}
          onExportMapAsPng={exportMapAsPng}
        />
      )}
    </div>
  )
}


