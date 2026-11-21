---
variables:
  client: { type: string, label: Client, default: ACME }
  platform: { type: string, label: Platform }
---
# $title$

BY-$author$

DATE-[$date$]

CLIENT-$client$

PLATFORM-$platform$

TOC-START

$toc$

TOC-END

$for(nodes)$
## $nodes.title$

$nodes.content$
$endfor$
