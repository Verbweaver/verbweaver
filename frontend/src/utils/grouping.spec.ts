// Lightweight tests for grouping utils. Run manually by importing and calling runGroupingTests() in dev.
import { buildEquivalenceBoxes, computeCoverRelations, computeRemainder } from './grouping'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

export function runGroupingTests(): string {
  // Equivalence boxes
  const eq = buildEquivalenceBoxes([
    { groupId: 'A', nodeIds: ['1', '2', '3'] },
    { groupId: 'B', nodeIds: ['1', '2', '3'] },
    { groupId: 'C', nodeIds: ['2', '3'] },
  ])
  assert(eq.length === 2, 'Expected 2 equivalence boxes')
  const boxA = eq.find(b => b.groupIds.includes('A'))!
  assert(boxA.groupIds.includes('B'), 'A and B should share the same box')
  assert(boxA.nodeIds.join(',') === '1,2,3', 'Box AB should contain nodes 1,2,3')

  // Cover relations (Hasse)
  const covers = computeCoverRelations(eq)
  // AB (1,2,3) should cover C (2,3)
  const abId = boxA.boxId
  const cId = eq.find(b => b.groupIds.includes('C'))!.boxId
  assert(covers.some(e => e.parentBoxId === abId && e.childBoxId === cId), 'AB should cover C')

  // Transitive reduction: A ⊃ B ⊃ C should not include A->C
  const eq2 = buildEquivalenceBoxes([
    { groupId: 'A2', nodeIds: ['1', '2', '3'] },
    { groupId: 'B2', nodeIds: ['2', '3'] },
    { groupId: 'C2', nodeIds: ['3'] },
  ])
  const cov2 = computeCoverRelations(eq2)
  const a2 = eq2.find(b => b.groupIds.includes('A2'))!.boxId
  const b2 = eq2.find(b => b.groupIds.includes('B2'))!.boxId
  const c2 = eq2.find(b => b.groupIds.includes('C2'))!.boxId
  assert(cov2.some(e => e.parentBoxId === a2 && e.childBoxId === b2), 'A2 should cover B2')
  assert(cov2.some(e => e.parentBoxId === b2 && e.childBoxId === c2), 'B2 should cover C2')
  assert(!cov2.some(e => e.parentBoxId === a2 && e.childBoxId === c2), 'A2 should NOT directly cover C2 (transitive)')

  // Remainder
  const remainder = computeRemainder(['1', '2', '3', '4'], [['2', '3']])
  assert(remainder.sort().join(',') === ['1', '4'].join(','), 'Remainder should be 1,4')

  return 'Grouping utils tests passed'
}

// Attach to window for quick manual testing (optional)
// ;(window as any).runGroupingTests = runGroupingTests


