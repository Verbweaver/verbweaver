// Lightweight tests for the shared filter rules. Run manually by importing and calling runNodeFilterTests() in dev.
import { isFilterActive, pathMatches, matchesNodeFilters, buildLinkedTargets, summarizeFilters, parseList } from './nodeFilters'
import { DEFAULT_FILTERS } from '../components/NodeFiltersDialog'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

export function runNodeFilterTests(): string {
  // Path prefixes (#34)
  assert(pathMatches('nodes/characters/alice.md', ['characters']), 'The nodes/ prefix is optional')
  assert(pathMatches('nodes/characters/alice.md', ['nodes/characters']), 'A full path works too')
  assert(pathMatches('nodes/characters/heroes/bob.md', ['characters']), 'Pages in subfolders match')
  assert(pathMatches('nodes/characters/alice.md', ['char']), 'A partial folder name matches as a plain prefix')
  assert(pathMatches('nodes/Characters/alice.md', ['characters']), 'Matching ignores case')
  assert(pathMatches('nodes\\characters\\alice.md', ['characters/']), 'Backslashes and trailing slashes are ignored')
  assert(pathMatches('nodes/characters/alice.md', ['/characters']), 'A leading slash is ignored')
  assert(!pathMatches('nodes/places/north.md', ['characters']), 'Other folders do not match')
  assert(pathMatches('nodes/places/north.md', ['characters', 'places']), 'Several paths match any of them')
  assert(pathMatches('uploads/map.png', ['uploads']), 'Uploads can be matched by their own folder')
  assert(pathMatches('nodes/a.md', []), 'No paths means no restriction')
  assert(pathMatches('nodes/a.md', ['  ', '']), 'Blank entries are ignored')

  // Active check
  assert(!isFilterActive(DEFAULT_FILTERS), 'Defaults are not active')
  assert(isFilterActive({ ...DEFAULT_FILTERS, paths: ['characters'] }), 'A path makes the filter active')
  assert(!isFilterActive({ ...DEFAULT_FILTERS, paths: [' / '] }), 'A blank path does not')
  const { paths: _omit, ...legacy } = DEFAULT_FILTERS
  void _omit
  assert(!isFilterActive(legacy), 'Filters saved before #34 (no paths field) still work')

  // Combined with other fields (AND)
  const alice = { path: 'nodes/characters/alice.md', name: 'alice.md', metadata: { id: 'a', title: 'Alice', tags: ['hero'] } }
  const bob = { path: 'nodes/characters/bob.md', name: 'bob.md', metadata: { id: 'b', title: 'Bob', tags: ['villain'] } }
  const north = { path: 'nodes/places/north.md', name: 'north.md', metadata: { id: 'n', title: 'North', tags: ['hero'], links: ['b'] } }
  const pathAndTag = { ...DEFAULT_FILTERS, paths: ['characters'], tags: ['hero'] }
  assert(matchesNodeFilters(alice, pathAndTag, null), 'Matches both path and tag')
  assert(!matchesNodeFilters(bob, pathAndTag, null), 'Right path, wrong tag')
  assert(!matchesNodeFilters(north, pathAndTag, null), 'Right tag, wrong path')
  assert(matchesNodeFilters(north, legacy, null), 'A legacy filter with no fields matches everything')

  // Existing fields still behave as before
  assert(matchesNodeFilters(alice, { ...DEFAULT_FILTERS, endsWith: 'CE' }, null), 'Ends with ignores case by default')
  assert(!matchesNodeFilters(alice, { ...DEFAULT_FILTERS, endsWith: 'CE', startsEndsCaseSensitive: true }, null), 'Case sensitive option')
  assert(!matchesNodeFilters(alice, { ...DEFAULT_FILTERS, tags: ['hero', 'villain'], tagsLogic: 'ALL' }, null), 'Tags ALL')
  const linkedF = { ...DEFAULT_FILTERS, linkedFromNodeTags: ['node-n'] }
  const linked = buildLinkedTargets(linkedF, [alice, bob, north])
  assert(matchesNodeFilters(bob, linkedF, linked) && !matchesNodeFilters(alice, linkedF, linked), 'Linked from')

  // Summary and list parsing
  assert(summarizeFilters(DEFAULT_FILTERS) === null, 'No summary when nothing is filtered')
  assert(summarizeFilters({ ...DEFAULT_FILTERS, paths: ['characters', 'places'] }) === 'path: characters, places', 'Path summary')
  assert(parseList(' characters, places/north ,, ').join('|') === 'characters|places/north', 'Comma-separated list parsing')

  return 'Node filter tests passed'
}

// Attach to window for quick manual testing (optional)
// ;(window as any).runNodeFilterTests = runNodeFilterTests
