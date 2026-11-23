import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useTabStore } from '../store/tabStore'
import { useGroupViewStore } from '../store/groupViewState'
import { useNodeStore } from '../store/nodeStore'
import { ReactFlow, Background, Controls, Edge, Node, NodeTypes, Connection, useReactFlow, ReactFlowProvider, applyNodeChanges, type NodeChange } from '@xyflow/react'
import { buildEquivalenceBoxes, computeCoverRelations, computeRemainder } from '../utils/grouping'
import NodeContextMenu from '../components/graph/NodeContextMenu'
import SharedCreateLinkModal from '../components/common/CreateLinkModal'
import RemoveLinksModal from '../components/common/RemoveLinksModal'
import ConfirmDialog from '../components/ConfirmDialog'
import type { NodeFilterState } from '../components/NodeFiltersDialog'
import { getLinkedNodes } from '../utils/nodeLinks'
import { attachFilesToNode } from '../utils/nodeAttachments'
import { chooseHandleIds, type XY } from '../utils/edgeHandles'
// @ts-ignore: type stub provided in global.d.ts; package installed at runtime
import * as htmlToImage from 'html-to-image'
import toast from 'react-hot-toast'
import GroupBoxNode from '../components/graph/GroupBoxNode'
import CustomNode from '../components/graph/CustomNode'

const groupNodeTypes: NodeTypes = { groupBox: GroupBoxNode, custom: CustomNode }

// Node card sizes inside group boxes
const CARD_W = 180
const CARD_H = 80
const CARD_GAP = 12
const CARD_PAD_X = 12
// Wide enough for three columns of cards plus padding
const CARD_BOX_W = 2 * CARD_PAD_X + 3 * CARD_W + 2 * CARD_GAP
// Space between top-level boxes placed on the default grid
const BOX_GAP = 40
const cardColumnsFor = (boxWidth: number) =>
  Math.max(1, Math.floor((boxWidth - 2 * CARD_PAD_X + CARD_GAP) / (CARD_W + CARD_GAP)))
type Rect = { x: number; y: number; w: number; h: number }
const rectsOverlap = (a: Rect, b: Rect, margin = 0) =>
  a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin

// Placeholder Group view. Will be replaced with React Flow Sub Flows implementation in subsequent tasks.
function GroupViewInner() {
  const { currentProject } = useProjectStore()
  const activeTabId = useTabStore(s => s.activeTabId)
  const tabs = useTabStore(s => s.tabs)
  const loadFromStorage = useGroupViewStore(s => s.loadFromStorage)
  const saveToStorage = useGroupViewStore(s => s.saveToStorage)
  const groups = useGroupViewStore(s => s.groups)
  const options = useGroupViewStore(s => s.options)
  const layout = useGroupViewStore(s => s.layout)
  const setBoxLayout = useGroupViewStore(s => s.setBoxLayout)
  const setExportImage = useGroupViewStore(s => s.setExportImage)
  const { nodes: verbweaverNodes, loadNodes, deleteNode, createSoftLink, removeSoftLink } = useNodeStore()
  const { addEditorTab } = useTabStore()
  const flowWrapperRef = useRef<HTMLDivElement>(null)
  const { fitView, getViewport, setViewport } = useReactFlow()

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
    const isFilterActive = (filters: NodeFilterState): boolean => !!(
      (filters.tags || []).length > 0 || filters.nameKeyword || filters.descriptionKeyword || filters.startsWith || filters.endsWith ||
      filters.startDateFrom || filters.startDateTo || filters.dueDateFrom || filters.dueDateTo || filters.hasAttachments || (filters.linkedFromNodeTags || []).length > 0
    )
    const matches = (node: any, filters: any): boolean => {
      const meta = node?.metadata || {}
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

    // A page is in a group if it matches any of the group's filters; blank filters are ignored,
    // and a group with no conditions at all holds every page (#68)
    const groupNodes = enabled.map(g => {
      const active = g.filters.filter(isFilterActive)
      return {
        groupId: g.id,
        nodeIds: nodesArr
          .filter(n => !n.isDirectory && (active.length === 0 || active.some(f => matches(n, f))))
          .map(n => String(n?.metadata?.id || ''))
          .filter(Boolean),
      }
    })

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
    const safeIdByBoxId = new Map<string, string>()
    equivalence.boxes.forEach((b, i) => {
      const sid = b.boxId && b.boxId.length > 0 ? b.boxId : `__empty__${i}`
      safeIdByBoxId.set(b.boxId, sid)
    })
    

    // Default positions for boxes without a saved one: a grid spaced from each box's real size,
    // skipping saved boxes, so boxes never overlap (#114)
    const perRow = 3
    const placeOnGrid = (items: Array<{ id: string; w: number; h: number }>, obstacles: Rect[]) => {
      const placed = new Map<string, XY>()
      const colW = Math.max(0, ...items.map(i => i.w)) + BOX_GAP
      let col = 0, rowY = 0, rowH = 0
      for (const item of items) {
        for (let guard = 0; guard < 10_000; guard++) {
          const rect = { x: col * colW, y: rowY, w: item.w, h: item.h }
          const free = !obstacles.some(o => rectsOverlap(o, rect, BOX_GAP))
          if (free) {
            placed.set(item.id, { x: rect.x, y: rect.y })
            rowH = Math.max(rowH, item.h)
          }
          col++
          if (col >= perRow) { col = 0; rowY += (rowH || item.h) + BOX_GAP; rowH = 0 }
          if (free) break
        }
      }
      return placed
    }
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
    const showCap = options.showCapIndicator !== false
    if (!options.nestGroups) {
      // Sizes first, so default positions can be spaced from them
      const boxWidth = options.showNodeCards ? CARD_BOX_W : 260
      const columns = options.showNodeCards ? cardColumnsFor(boxWidth) : 0
      const sizeOf = (b: typeof equivalence.boxes[number]) => {
        if (!options.showNodeCards) return { w: boxWidth, h: 160 }
        const rows = Math.ceil(Math.min(b.nodeIds.length, maxCards) / columns)
        return { w: boxWidth, h: 28 + rows * (CARD_H + CARD_GAP) + 24 }
      }
      // Drags are saved under the box's node id, which differs from boxId for the empty set
      const savedFor = (b: typeof equivalence.boxes[number]) => {
        const sid = safeIdByBoxId.get(b.boxId)!
        return layout.boxes[sid] || layout.boxes[b.boxId]
      }
      const savedRects: Rect[] = []
      const unsaved: Array<{ id: string; w: number; h: number }> = []
      equivalence.boxes.forEach(b => {
        const saved = savedFor(b)
        const size = sizeOf(b)
        if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') savedRects.push({ x: saved.x, y: saved.y, ...size })
        else unsaved.push({ id: b.boxId, ...size })
      })
      const defaults = placeOnGrid(unsaved, savedRects)
      equivalence.boxes.forEach((b) => {
        const saved = savedFor(b)
        const fallback = defaults.get(b.boxId) || { x: 0, y: 0 }
        const x = typeof saved?.x === 'number' ? saved.x : fallback.x
        const y = typeof saved?.y === 'number' ? saved.y : fallback.y
        const isEq = b.groupIds.length > 1
        const totalCount = b.nodeIds.length
        const sid = safeIdByBoxId.get(b.boxId)!
        nodes.push({
          id: sid,
          data: { label: boxIdToName.get(b.boxId) || 'Group', isEquivalent: isEq, chips: chipsFor(b.nodeIds), linkPairs: linkPairsFor(b.nodeIds), showNodeCards: !!options.showNodeCards, visibleCardCount: Math.min(totalCount, maxCards), totalCardCount: totalCount, showCapIndicator: showCap },
          position: { x, y },
          style: { width: boxWidth, height: sizeOf(b).h },
          type: 'groupBox',
          draggable: true,
        })

        // Show full node cards inside group (flat mode: all nodes of the set)
        if (options.showNodeCards) {
          const childIds = b.nodeIds.slice(0, maxCards)
          const padY = 28
          const cardPos = new Map<string, XY>()
          childIds.forEach((cid, cidx) => {
            const col = cidx % columns
            const row = Math.floor(cidx / columns)
            const cx = CARD_PAD_X + col * (CARD_W + CARD_GAP)
            const cy = padY + row * (CARD_H + CARD_GAP)
            cardPos.set(cid, { x: cx, y: cy })
            const meta = idToMeta.get(cid)
            const path = idToPath.get(cid)
            const storeNode = path ? verbweaverNodes.get(path) : undefined
            nodes.push({
              id: `${sid}::n::${cid}`,
              parentId: sid,
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
          childIds.forEach(from => {
            const links = idToMeta.get(from)?.links || []
            links.forEach(to => {
              const fromPos = cardPos.get(from)
              const toPos = cardPos.get(String(to))
              if (fromPos && toPos) {
                edges.push({
                  id: `${sid}::e::${from}->${to}`,
                  source: `${sid}::n::${from}`,
                  target: `${sid}::n::${to}`,
                  type: 'default',
                  // Attach to the facing sides so links to an earlier card don't overshoot both cards (#85)
                  ...chooseHandleIds(fromPos, toPos),
                } as any)
              }
            })
          })
        }
      })
      // Flat mode: edges for superset/subset cover relations
      covers.forEach(e => {
        const ps = safeIdByBoxId.get(e.parentBoxId)!
        const cs = safeIdByBoxId.get(e.childBoxId)!
        if (ps && cs) edges.push({
          id: `${ps}->${cs}`,
          source: ps,
          target: cs,
          label: 'Contains',
          labelStyle: { fontSize: 11, fontWeight: 500, fill: 'hsl(var(--muted-foreground))' },
          labelBgStyle: { fill: 'hsl(var(--background))', fillOpacity: 0.9 },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 3,
        })
      })
    } else {
      // Nesting mode: recursively place children under each parent; duplicate children under multiple parents.
      // Sizes are measured bottom-up, so a parent always fits its nested children at every depth.
      const boxById = new Map(equivalence.boxes.map(b => [b.boxId, b]))
      const rowH = options.showNodeCards ? CARD_H : 48
      const padY = 16
      const rootWidth = options.showNodeCards ? CARD_BOX_W : 260
      const childWidthFor = (parentWidth: number) => Math.max(160, parentWidth - 32)
      const directChildrenOf = (boxId: string, chain: Set<string>) =>
        Array.from(childrenOf.get(boxId) || []).filter(cid => boxById.has(cid) && !chain.has(cid))
      // Pages a box lists itself: the root shows what its children don't; children show their whole set
      const displayedFor = (boxId: string, isRoot: boolean) => {
        const b = boxById.get(boxId)!
        const kids = Array.from(childrenOf.get(boxId) || [])
        if (!isRoot || kids.length === 0) return b.nodeIds
        return computeRemainder(b.nodeIds, kids.map(cid => boxById.get(cid)?.nodeIds || []))
      }
      const listHeightFor = (count: number, width: number) => {
        if (count === 0) return 0
        const columns = options.showNodeCards ? cardColumnsFor(width) : 1
        return Math.ceil(Math.min(count, maxCards) / columns) * (rowH + CARD_GAP) + padY
      }
      const heightMemo = new Map<string, number>()
      const measureHeight = (boxId: string, width: number, isRoot: boolean, chain: Set<string>): number => {
        const key = `${boxId}|${width}|${isRoot ? 1 : 0}`
        const memo = heightMemo.get(key)
        if (memo !== undefined) return memo
        const nextChain = new Set(chain).add(boxId)
        const kids = directChildrenOf(boxId, nextChain)
        const childW = childWidthFor(width)
        let childrenHeight = 0
        kids.forEach(cid => { childrenHeight += measureHeight(cid, childW, false, nextChain) + CARD_GAP })
        if (childrenHeight > 0) childrenHeight += padY
        const h = 24 /*header*/ + listHeightFor(displayedFor(boxId, isRoot).length, width) + childrenHeight + padY
        heightMemo.set(key, h)
        return h
      }

      const placeBox = (boxId: string, parentSafeId: string | undefined, x: number, y: number, boxWidth: number, chain: Set<string>) => {
        const b = boxById.get(boxId)
        if (!b) return
        const safe = safeIdByBoxId.get(boxId)!
        const baseId = parentSafeId ? `${safe}__under__${parentSafeId}` : safe
        const isEq = b.groupIds.length > 1
        const isRoot = !parentSafeId
        const remainder = displayedFor(boxId, true)
        const displayedSet = displayedFor(boxId, isRoot)
        const totalCount = displayedSet.length
        const boxHeight = measureHeight(boxId, boxWidth, isRoot, chain)
        const remainderHeight = listHeightFor(displayedSet.length, boxWidth)

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
            showCapIndicator: showCap,
          },
          position: { x, y },
          style: { width: boxWidth, height: boxHeight },
          type: 'groupBox',
          draggable: !parentSafeId,
          parentId: parentSafeId,
          extent: parentSafeId ? 'parent' : undefined,
        } as any)

        // In nested mode with node cards, render only remainder nodes inside the parent box;
        // child boxes will render their own nodes.
        if (options.showNodeCards) {
          const childIds = (isRoot ? remainder : b.nodeIds).slice(0, maxCards)
          const columns = cardColumnsFor(boxWidth)
          const padY = 20
          const cardPos = new Map<string, XY>()
          childIds.forEach((cid, cidx) => {
            const col = cidx % columns
            const row = Math.floor(cidx / columns)
            const cx = CARD_PAD_X + col * (CARD_W + CARD_GAP)
            const cy = padY + row * (CARD_H + CARD_GAP) + 24 // leave space for header
            cardPos.set(cid, { x: cx, y: cy })
            const meta = idToMeta.get(cid)
            const path = idToPath.get(cid)
            const storeNode = path ? verbweaverNodes.get(path) : undefined
            nodes.push({
              id: `${baseId}::n::${cid}`,
              parentId: baseId,
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
          childIds.forEach(from => {
            const links = idToMeta.get(from)?.links || []
            links.forEach(to => {
              const fromPos = cardPos.get(from)
              const toPos = cardPos.get(String(to))
              if (fromPos && toPos) {
                edges.push({
                  id: `${baseId}::e::${from}->${to}`,
                  source: `${baseId}::n::${from}`,
                  target: `${baseId}::n::${to}`,
                  type: 'default',
                  // Attach to the facing sides so links to an earlier card don't overshoot both cards (#85)
                  ...chooseHandleIds(fromPos, toPos),
                } as any)
              }
            })
          })
        }

        // Recurse children: duplicate under this baseId, stacked by their measured heights
        const nextChain = new Set(chain).add(boxId)
        const kids = directChildrenOf(boxId, nextChain)
        if (kids.length > 0) {
          const childW = childWidthFor(boxWidth)
          let childY = 24 + remainderHeight + padY
          kids.forEach(cid => {
            const cx = Math.max(16, (boxWidth - childW) / 2)
            placeBox(cid, baseId, cx, childY, childW, nextChain)
            childY += measureHeight(cid, childW, false, nextChain) + CARD_GAP
          })
        }
      }

      // Top-level boxes: saved positions first, then grid slots spaced from measured sizes
      const savedFor = (boxId: string) => {
        const safe = safeIdByBoxId.get(boxId)!
        const saved = layout.boxes[safe] || layout.boxes[boxId]
        return saved && typeof saved.x === 'number' && typeof saved.y === 'number' ? saved : undefined
      }
      const savedRects: Rect[] = []
      const unsaved: Array<{ id: string; w: number; h: number }> = []
      topLevel.forEach(b => {
        const h = measureHeight(b.boxId, rootWidth, true, new Set())
        const saved = savedFor(b.boxId)
        if (saved) savedRects.push({ x: saved.x, y: saved.y, w: rootWidth, h })
        else unsaved.push({ id: b.boxId, w: rootWidth, h })
      })
      const defaults = placeOnGrid(unsaved, savedRects)
      topLevel.forEach(b => {
        const pos = savedFor(b.boxId) || defaults.get(b.boxId) || { x: 0, y: 0 }
        placeBox(b.boxId, undefined, pos.x, pos.y, rootWidth, new Set())
      })
    }

    return { flowNodes: nodes, flowEdges: edges }
  }, [equivalence, layout.boxes, options.nestGroups, options.showNodeCards, options.maxCardsPerGroup, options.showCapIndicator, idToMeta])

  const [optimisticEdges, setOptimisticEdges] = useState<Edge[]>([])
  // React Flow 12 reports measured node sizes through onNodesChange; nodes stay hidden until those
  // are applied. Keep a local copy of the derived nodes that accepts size, drag and selection
  // changes (not removals: those must go through the node store), and carry measured sizes across
  // recomputes so nodes don't flicker back to hidden.
  const [rfNodes, setRfNodes] = useState<Node[]>(flowNodes)
  useEffect(() => {
    setRfNodes(prev => {
      const prevById = new Map(prev.map(n => [n.id, n]))
      return flowNodes.map(n => {
        const measured = prevById.get(n.id)?.measured
        return measured ? { ...n, measured } : n
      })
    })
  }, [flowNodes])
  // Re-fit the view when the layout changes shape (groups added or removed, node cards or nesting
  // toggled), so re-spaced boxes stay on screen. Drags don't change this signature.
  const layoutSig = useMemo(
    () => `${options.nestGroups ? 1 : 0}|${options.showNodeCards ? 1 : 0}|${equivalence.boxes.map(b => b.boxId).join(',')}`,
    [options.nestGroups, options.showNodeCards, equivalence]
  )
  const fittedSigRef = useRef<string | null>(null)
  useEffect(() => {
    // The first layout is fitted by ReactFlow's fitView prop
    if (fittedSigRef.current === null) { fittedSigRef.current = layoutSig; return }
    if (fittedSigRef.current === layoutSig) return
    fittedSigRef.current = layoutSig
    // Wait for React Flow to measure the new nodes
    const id = window.setTimeout(() => {
      try { fitView({ padding: 0.2 }) } catch (err) { console.warn('[GroupView] fitView failed', err) }
    }, 120)
    return () => window.clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutSig])
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const applicable = changes.filter(c => c.type === 'dimensions' || c.type === 'position' || c.type === 'select')
    if (applicable.length > 0) setRfNodes(nds => applyNodeChanges(applicable, nds))
  }, [])

  const renderEdges = useMemo(() => {
    const nodeIds = new Set(flowNodes.map(n => n.id))
    const baseEdges = options.nestGroups
      ? flowEdges.filter(e => e.id.includes('::e::') || (String(e.source).includes('::n::') && String(e.target).includes('::n::')))
      : flowEdges
    const exist = new Set(baseEdges.map(e => e.id))
    const extras = optimisticEdges
      .filter(e => !exist.has(e.id))
      .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
      .filter(e => !options.nestGroups || e.id.includes('::e::') || (String(e.source).includes('::n::') && String(e.target).includes('::n::')))
    return [...baseEdges, ...extras]
  }, [flowEdges, optimisticEdges, flowNodes, options.nestGroups])

  // Clear optimistic edges when toggling nest mode to avoid stale group-to-group edges with missing handles
  useEffect(() => {
    setOptimisticEdges([])
  }, [options.nestGroups])
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string; edgeId?: string } | null>(null)

  // Clear optimistic edges that are now part of computed edges
  useEffect(() => {
    if (!optimisticEdges.length) return
    const exist = new Set(flowEdges.map(e => e.id))
    setOptimisticEdges(prev => prev.filter(e => !exist.has(e.id)))
  }, [flowEdges])

  const onNodeDragStop = useCallback((_: any, n: Node) => {
    if (!n?.id) return
    setBoxLayout(n.id, { x: n.position.x, y: n.position.y, w: n.measured?.width ?? undefined, h: n.measured?.height ?? undefined })
    const tab = tabs.find(t => t.id === activeTabId)
    const graphTabId = tab && tab.type === 'graph' ? tab.id : undefined
    if (currentProject?.id && graphTabId) {
      saveToStorage(currentProject.id, graphTabId)
    }
  }, [setBoxLayout, saveToStorage, tabs, activeTabId, currentProject?.id])

  const exportMapAsPng = useCallback(async () => {
    const toHide: HTMLElement[] = []
    // Scrolling lists inside boxes: their scrollbars render as bright native bars in the image (#148)
    const noScrollbar: Array<{ el: HTMLElement; prev: string }> = []
    const styled: Array<{ el: HTMLElement; prev: { color?: string; backgroundColor?: string; fill?: string; stroke?: string; strokeWidth?: string; attrStroke?: string | null; attrStrokeWidth?: string | null; attrFill?: string | null } }> = []
    const imageEvents: Array<{ src: string; ok: boolean; error?: any }> = []
    const originalImage = window.Image
    const scrubbedAttrs: Array<{ el: Element; name: string; prev: string }> = []
    let prevViewport: { x: number; y: number; zoom: number } | null = null
    try {
      // Patch Image to log every load/error that html-to-image triggers
      // so we can deterministically see failing resources.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      window.Image = class LoggingImage extends originalImage {
        constructor() {
          super()
          this.crossOrigin = 'anonymous'
          this.addEventListener('load', () => { imageEvents.push({ src: (this as any).src || '', ok: true }) })
          this.addEventListener('error', (err) => { imageEvents.push({ src: (this as any).src || '', ok: false, error: err }) })
        }
      } as typeof Image

      const wrapper = flowWrapperRef.current
      const flowRoot = (wrapper?.querySelector('.react-flow') as HTMLElement | null) || (wrapper?.querySelector('.react-flow__renderer') as HTMLElement | null)
      if (!flowRoot) {
        toast.error('Could not find the group canvas to export')
        return
      }

      // Collect all candidate resource URLs before capture to detect failures deterministically
      const collectResourceUrls = (root: HTMLElement) => {
        const urls = new Set<string>()
        root.querySelectorAll('img').forEach(img => { if (img.src) urls.add(img.src) })
        root.querySelectorAll<HTMLElement>('*').forEach(el => {
          const bg = getComputedStyle(el).backgroundImage || ''
          // Match url("...") occurrences; may return multiple
          const matches = Array.from(bg.matchAll(/url\(["']?([^"')]+)["']?\)/g))
          matches.forEach(m => { if (m[1]) urls.add(m[1]) })
        })
        return Array.from(urls)
      }

      const preflightResources = async (urls: string[]) => {
        const checks = urls.map(url => new Promise<{ url: string; ok: boolean; error?: any }>(resolve => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => resolve({ url, ok: true })
          img.onerror = (err) => resolve({ url, ok: false, error: err })
          img.src = url
        }))
        return Promise.all(checks)
      }

      const resourceUrls = collectResourceUrls(flowRoot)
      console.log('[Group export] resources detected', resourceUrls)
      const preflight = await preflightResources(resourceUrls)
      const failed = preflight.filter(r => !r.ok)
      console.log('[Group export] preflight results', preflight)
      if (failed.length) {
        console.error('Group export preflight failed for URLs:', failed)
        toast.error('Failed to export map: resource could not be loaded')
        return
      }

      // Fit all nodes into view for export, then restore the viewport afterward
      prevViewport = getViewport ? getViewport() : null
      try {
        if (flowNodes.length > 0 && fitView) {
          await Promise.resolve(fitView({ includeHiddenNodes: true, padding: 0.2 }))
        }
      } catch (err) {
        console.error('Group export: fitView failed (continuing)', err)
      }

      wrapper?.querySelectorAll('.react-flow__attribution, .react-flow__controls, .vw-node-context-menu').forEach(el => {
        const h = el as HTMLElement
        if (h.style) { toHide.push(h); h.style.visibility = 'hidden' }
      })
      wrapper?.querySelectorAll('.react-flow__node-groupBox *').forEach(el => {
        const h = el as HTMLElement
        if (h.scrollHeight > h.clientHeight || h.scrollWidth > h.clientWidth) {
          noScrollbar.push({ el: h, prev: h.style.overflow })
          h.style.overflow = 'hidden'
        }
      })

      // Scrub invalid XML chars from attribute values to avoid parser errors in toSvg
      const invalidXmlChars = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD]/g
      const scrubElementAttributes = (el: Element) => {
        if (el.attributes) {
          Array.from(el.attributes).forEach(attr => {
            if (invalidXmlChars.test(attr.value)) {
              scrubbedAttrs.push({ el, name: attr.name, prev: attr.value })
              attr.value = attr.value.replace(invalidXmlChars, '')
            }
          })
        }
        Array.from(el.children || []).forEach(child => scrubElementAttributes(child))
      }
      scrubElementAttributes(flowRoot)

      // Inline edge stroke styles so edges render in exported image
      flowRoot.querySelectorAll('.react-flow__edge-path, .react-flow__connection-path').forEach(el => {
        try {
          const h = el as HTMLElement
          const cs = getComputedStyle(h)
          const prev = {
            stroke: (h.style as any).stroke,
            strokeWidth: (h.style as any).strokeWidth,
            fill: (h.style as any).fill,
            attrStroke: h.getAttribute('stroke'),
            attrStrokeWidth: h.getAttribute('stroke-width'),
            attrFill: h.getAttribute('fill'),
          }
          const stroke = cs.getPropertyValue('stroke') || '#9ca3af'
          const strokeWidth = cs.getPropertyValue('stroke-width') || '3'
          h.setAttribute('stroke', stroke)
          h.setAttribute('stroke-width', strokeWidth)
          h.setAttribute('fill', 'none')
          styled.push({ el: h, prev })
        } catch (err) {
          console.error('Group export: failed to inline edge stroke', err, { el })
        }
      })

      // Inline edge label colors to avoid missing computed styles in export
      flowRoot.querySelectorAll('.react-flow__edge-textbg').forEach(el => {
        const h = el as HTMLElement
        const cs = getComputedStyle(h)
        const prev = { backgroundColor: h.style.backgroundColor, fill: (h.style as any).fill, stroke: (h.style as any).stroke }
        const fill = cs.fill || cs.backgroundColor
        const stroke = (cs as any).stroke || cs.borderColor
        if (fill) (h.style as any).fill = fill
        if (stroke) (h.style as any).stroke = stroke
        styled.push({ el: h, prev })
      })
      flowRoot.querySelectorAll('.react-flow__edge-text').forEach(el => {
        const h = el as HTMLElement
        const cs = getComputedStyle(h)
        const prev = { color: h.style.color, fill: (h.style as any).fill }
        const textFill = (cs as any).fill && (cs as any).fill !== 'none' ? (cs as any).fill : cs.color
        if (textFill) (h.style as any).fill = textFill
        h.style.color = textFill
        styled.push({ el: h, prev })
      })

      const root = getComputedStyle(document.documentElement)
      const bgVar = root.getPropertyValue('--background').trim()
      const bgColor = bgVar ? `hsl(${bgVar})` : getComputedStyle(document.body).backgroundColor || '#fff'
      const exportScale = 2 // upscale for crisper output

      // First generate SVG so we can inspect it deterministically
      const svgDataUrl = await htmlToImage.toSvg(flowRoot, {
        backgroundColor: bgColor,
        pixelRatio: exportScale,
        cacheBust: true,
        // useCORS is supported at runtime; cast to satisfy types
        useCORS: true,
        filter: (el: Element) => {
          const cls = (el as HTMLElement).classList
          if (!cls) return true
          return !cls.contains('react-flow__controls') && !cls.contains('react-flow__attribution') && !cls.contains('vw-node-context-menu')
        },
      } as any)

      let svgText = (() => {
        try {
          const comma = svgDataUrl.indexOf(',')
          return comma >= 0 ? decodeURIComponent(svgDataUrl.slice(comma + 1)) : ''
        } catch {
          return ''
        }
      })()
      console.log('[Group export] svg length', svgText?.length || 0)
      if (svgText) {
        console.log('[Group export] svg head', svgText.slice(0, 400))
        console.log('[Group export] svg tail', svgText.slice(-400))
      }

      // Validate SVG parse to surface syntax errors
      const parser = new DOMParser()
      const parsed = parser.parseFromString(svgText, 'image/svg+xml')
      let parseError = parsed.querySelector('parsererror')
      let parseErrorText: string | null = null
      if (parseError) {
        const msg = parseError.textContent || ''
        parseErrorText = msg
        const colMatch = msg.match(/column\s+(\d+)/i)
        const col = colMatch ? Number(colMatch[1]) : -1
        const charInfo = () => {
          if (col <= 0 || col > svgText.length) return null
          const idx = col - 1
          const ch = svgText[idx]
          const code = ch ? ch.charCodeAt(0) : -1
          return { idx, ch, code, context: svgText.slice(Math.max(0, idx - 40), Math.min(svgText.length, idx + 40)) }
        }
        console.error('Group export: SVG parsererror', msg, { column: col, charInfo: charInfo() })

        // Sanitize control characters not allowed in XML and retry
        const sanitized = svgText.replace(/[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD]/g, '')
        if (sanitized !== svgText) {
          const reparsed = parser.parseFromString(sanitized, 'image/svg+xml')
          const reparsedError = reparsed.querySelector('parsererror')
          if (!reparsedError) {
            console.warn('Group export: SVG sanitized to remove invalid chars before export')
            svgText = sanitized
            parseError = null
          } else {
            console.error('Group export: SVG still invalid after sanitize', reparsedError.textContent)
          }
        }
        if (parseError) {
          toast.error('Failed to export map: invalid SVG (see console)')
          return
        }
      }

      // Normalize to base64 data URL to eliminate encoding edge cases
      const svgBase64 = (() => {
        try {
          return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgText)))}`
        } catch (err) {
          console.error('Group export: base64 encode failed', err)
          return svgDataUrl
        }
      })()

      // Manual image load to surface the exact error if decode fails
      const imgResult = await new Promise<{ ok: true; w: number; h: number } | { ok: false; error: any }>((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = (err) => resolve({ ok: false, error: err })
        img.src = svgBase64
      })

      if (!imgResult.ok) {
        console.error('Group export: SVG image decode failed', imgResult, { svgSample: svgText?.slice(0, 500) })
        toast.error('Failed to export map: SVG decode error (see console)')
        return
      }

      // Draw to canvas manually to avoid hidden internals masking errors
      const canvas = document.createElement('canvas')
      canvas.width = imgResult.w * exportScale
      canvas.height = imgResult.h * exportScale
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        toast.error('Failed to export map: no canvas context')
        return
      }
      // Paint background first for safety
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.scale(exportScale, exportScale)
      ctx.drawImage(await (() => new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = svgBase64
      }))(), 0, 0)

      const dataUrl = canvas.toDataURL('image/png')
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
      ;(window as any).__vw_groupExportDebug = {
        svgLength: svgText?.length || 0,
        svgSampleHead: svgText?.slice(0, 400),
        svgSampleTail: svgText?.slice(-400),
        resourceUrls,
        preflight,
        imageEvents,
        svgParseError: parseErrorText,
        svgDataUrl: svgDataUrl?.slice(0, 200) || '',
        svgBase64Prefix: svgBase64?.slice(0, 200) || '',
      }
    } catch (e) {
      console.error('Failed to export group map:', e, { imageEvents })
      const msg = e && (e as Error).message ? (e as Error).message : ''
      toast.error(`Failed to export map${msg ? `: ${msg}` : ''}`)
    } finally {
      try { window.Image = originalImage } catch {}
      try { console.log('[Group export] image load events', imageEvents) } catch {}
      try { toHide.forEach(h => { h.style.visibility = '' }) } catch {}
      try { noScrollbar.forEach(({ el, prev }) => { el.style.overflow = prev }) } catch { /* best effort */ }
      try { scrubbedAttrs.forEach(s => { s.el.setAttribute(s.name, s.prev) }) } catch {}
      try {
        styled.forEach(s => {
          if (s.prev.color !== undefined) s.el.style.color = s.prev.color
          if (s.prev.backgroundColor !== undefined) s.el.style.backgroundColor = s.prev.backgroundColor
          if ((s.prev as any).fill !== undefined) (s.el.style as any).fill = (s.prev as any).fill
          if ((s.prev as any).stroke !== undefined) (s.el.style as any).stroke = (s.prev as any).stroke
          if ((s.prev as any).strokeWidth !== undefined) (s.el.style as any).strokeWidth = (s.prev as any).strokeWidth
          if ((s.prev as any).attrStroke !== undefined && (s.prev as any).attrStroke !== null) s.el.setAttribute('stroke', (s.prev as any).attrStroke)
          if ((s.prev as any).attrStrokeWidth !== undefined && (s.prev as any).attrStrokeWidth !== null) s.el.setAttribute('stroke-width', (s.prev as any).attrStrokeWidth)
          if ((s.prev as any).attrFill !== undefined && (s.prev as any).attrFill !== null) s.el.setAttribute('fill', (s.prev as any).attrFill)
        })
      } catch {}
      try {
        if (prevViewport && setViewport) {
          setViewport(prevViewport)
        }
      } catch {}
      setContextMenu(null)
    }
  }, [isElectron, flowNodes.length, fitView, getViewport, setViewport])

  // Offer this export to the Options tray's Save Image button while the Group view is open (#148)
  useEffect(() => {
    setExportImage(exportMapAsPng)
    return () => setExportImage(null)
  }, [exportMapAsPng, setExportImage])

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

  // Deleting a card's page asks first, as in the Mind Map (#99)
  const [confirmDelete, setConfirmDelete] = useState<{ path: string; name: string } | null>(null)
  const handleDeleteNode = useCallback((underlyingId?: string) => {
    if (!underlyingId) return
    const path = idToPath.get(underlyingId)
    if (!path) return
    const name = idToMeta.get(underlyingId)?.title || path.split('/').pop() || path
    setConfirmDelete({ path, name })
  }, [idToPath, idToMeta])
  const confirmDeleteNode = useCallback(async () => {
    if (!confirmDelete) return
    try {
      await deleteNode(confirmDelete.path)
    } catch (err) {
      console.error('[GroupView] Failed to delete node', err)
      toast.error('Failed to delete node')
    } finally {
      setConfirmDelete(null)
    }
  }, [confirmDelete, deleteNode])

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
    if (!fromPath || !toPath) return
    try {
      await removeSoftLink(fromPath, toPath)
      setOptimisticEdges(prev => prev.filter(e => e.id !== edgeId))
      toast.success('Link removed')
    } catch (err) {
      console.error('[GroupView] Failed to remove link', err)
      toast.error('Failed to remove link')
    }
  }, [idToPath, removeSoftLink])

  // Context-menu link/attachment targets, as node paths (menu ids are metadata ids)
  const [createLinkPath, setCreateLinkPath] = useState<string | null>(null)
  const [removeLinksPath, setRemoveLinksPath] = useState<string | null>(null)
  // Object (not string) so re-attaching to the same node after a cancelled picker re-opens it
  const [attachTarget, setAttachTarget] = useState<{ path: string } | null>(null)

  const removeLinksCandidates = useMemo(
    () => getLinkedNodes(removeLinksPath ? verbweaverNodes.get(removeLinksPath) : undefined, verbweaverNodes)
      .map(n => ({ path: n.path, title: n.metadata?.title || n.name })),
    [removeLinksPath, verbweaverNodes]
  )

  const handleRemoveLinks = useCallback(async (targetPaths: string[]) => {
    const sourcePath = removeLinksPath
    try {
      if (!sourcePath) return
      const sourceId = String(verbweaverNodes.get(sourcePath)?.metadata?.id || '')
      const targetIds = new Set(targetPaths.map(p => String(verbweaverNodes.get(p)?.metadata?.id || '')).filter(Boolean))
      for (const p of targetPaths) {
        await removeSoftLink(sourcePath, p)
      }
      // Drop optimistic in-group edges for the removed links (either direction)
      setOptimisticEdges(prev => prev.filter(e => {
        const idx = e.id.indexOf('::e::')
        if (idx === -1) return true
        const [from, to] = e.id.slice(idx + 5).split('->')
        return !((from === sourceId && targetIds.has(to)) || (to === sourceId && targetIds.has(from)))
      }))
      await loadNodes()
      toast.success('Link(s) removed')
    } catch (err) {
      console.error('[GroupView] Failed to remove links', err)
      toast.error('Failed to remove link(s)')
    } finally {
      setRemoveLinksPath(null)
    }
  }, [removeLinksPath, verbweaverNodes, removeSoftLink, loadNodes])

  // When an attach target is set, open the hidden file picker
  useEffect(() => {
    if (!attachTarget) return
    const id = setTimeout(() => {
      (document.getElementById('group-attach-input') as HTMLInputElement | null)?.click()
    }, 0)
    return () => clearTimeout(id)
  }, [attachTarget])

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
        setOptimisticEdges(prev => ([...prev, {
          id: `${baseId}::e::${s}->${t}`,
          source: `${baseId}::n::${s}`,
          target: `${baseId}::n::${t}`,
          sourceHandle: conn.sourceHandle || 'right-source',
          targetHandle: conn.targetHandle || 'left-target',
        } as any]))
      }
    }
  }, [idToPath, createSoftLink])

  return (
    <div ref={flowWrapperRef} className="h-full w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={renderEdges}
        nodeTypes={groupNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={undefined as any}
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
          variant={!contextMenu.nodeId && !contextMenu.edgeId ? 'group-pane' : undefined}
          onCreateNode={() => {}}
          onDeleteNode={(nid) => { handleDeleteNode(nid || contextMenu.nodeId); setContextMenu(null) }}
          onEditNode={(nid) => { handleEditNode(nid || contextMenu.nodeId); setContextMenu(null) }}
          onUnlinkEdge={(eid) => { handleUnlinkEdge(eid || contextMenu.edgeId); setContextMenu(null) }}
          onCreateLink={(nid) => { setCreateLinkPath(idToPath.get(nid) ?? null); setContextMenu(null) }}
          onRemoveLinks={(nid) => { setRemoveLinksPath(idToPath.get(nid) ?? null); setContextMenu(null) }}
          onAttachFiles={(nid) => { const path = idToPath.get(nid); setAttachTarget(path ? { path } : null); setContextMenu(null) }}
          onClose={() => setContextMenu(null)}
          onExportMapAsPng={exportMapAsPng}
        />
      )}
      {createLinkPath && (
        <SharedCreateLinkModal
          currentNodePath={createLinkPath}
          onClose={() => setCreateLinkPath(null)}
          onLinkCreated={async () => {
            try { await loadNodes() } catch (err) { console.error('[GroupView] Failed to refresh after creating link', err) }
            toast.success('Link created')
          }}
        />
      )}
      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Delete node"
        message={`Are you sure you want to delete "${confirmDelete?.name || ''}"? This action cannot be undone.`}
        onConfirm={confirmDeleteNode}
        onCancel={() => setConfirmDelete(null)}
      />
      <RemoveLinksModal
        isOpen={!!removeLinksPath}
        linkedNodes={removeLinksCandidates}
        onClose={() => setRemoveLinksPath(null)}
        onRemoveSelected={handleRemoveLinks}
      />
      {attachTarget && (
        <input
          type="file"
          multiple
          style={{ display: 'none' }}
          id="group-attach-input"
          onChange={async (e) => {
            const input = e.currentTarget
            const files = input.files
            const targetPath = attachTarget.path
            setAttachTarget(null)
            if (!files || files.length === 0 || !targetPath) return
            try {
              await attachFilesToNode(targetPath, files)
              toast.success('Files attached')
            } catch (err) {
              console.error('[GroupView] Attach files failed', err)
              toast.error('Failed to attach files')
            } finally {
              input.value = ''
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  )
}

export default function GroupView() {
  return (
    <ReactFlowProvider>
      <GroupViewInner />
    </ReactFlowProvider>
  )
}
