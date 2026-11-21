---
variables:
  avgCvss: { type: number, compute: { fn: mean, args: ['${nodes[*].vars.cvssDirect}'] } }
  avgRounded: { type: number, compute: { fn: round, args: ['${avgCvss}', 1] } }
  totalEffort: { type: number, compute: { fn: sum, args: ['${nodes[*].metadata.effort}'] } }
  maxCvss: { type: number, compute: { fn: max, args: ['${nodes[*].vars.cvssDirect}'] } }
  minCvss: { type: number, compute: { fn: min, args: ['${nodes[*].vars.cvssDirect}'] } }
  findingCount: { type: number, compute: { fn: count, args: ['${nodes[*].title}'] } }
  authorUpper: { type: string, compute: { fn: string.upper, args: ['${author}'] } }
  authorLower: { type: string, compute: { fn: string.lower, args: ['${author}'] } }
  isInternal: { type: boolean, compute: { fn: string.regexMatch, args: ['${title}', '(?i)internal'] } }
  today: { type: string, compute: { fn: date.today } }
  now: { type: string, compute: { fn: date.now } }
nodeVariables:
  cvssVector: { type: string, path: metadata.cvss_vector }
  cvssDirect: { type: number, compute: { fn: cvss.baseScore, args: ['${metadata.cvss_vector}'] } }
  cvss: { type: number, compute: { fn: cvss.baseScore, args: ['${vars.cvssVector}'] } }
  severity: { type: string, compute: { fn: cvss.severity, args: ['${vars.cvss}'] } }
  severityDirect: { type: string, compute: { fn: cvss.severity, args: ['${metadata.cvss_vector}'] } }
---
# $title$

AVG-$avgCvss$ ROUNDED-$avgRounded$ EFFORT-$totalEffort$ MAX-$maxCvss$ MIN-$minCvss$ COUNT-$findingCount$

UPPER-$authorUpper$ LOWER-$authorLower$ INTERNAL-$isInternal$

TODAY-$today$

$for(nodes)$
## $nodes.title$
DIRECT-$nodes.vars.cvssDirect$ SEVDIRECT-$nodes.vars.severityDirect$
CHAINED-[$nodes.vars.cvss$] SEVCHAINED-[$nodes.vars.severity$]
$endfor$
