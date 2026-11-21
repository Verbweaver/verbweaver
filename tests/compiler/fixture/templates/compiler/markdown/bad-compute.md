---
variables:
  oops: { type: number, compute: { fn: no.such.function, args: ['${title}'] } }
---
# $title$

$oops$
