import { useMemo } from 'react'

interface DataPoint {
  x: number
  y: number
  nodeId: string
  title: string
}

export interface Series {
  name: string
  color: string
  points: DataPoint[]
}

interface AxisConfig {
  label?: string
}

interface ProgressionChartProps {
  width: number
  height: number
  margin?: { top: number; right: number; bottom: number; left: number }
  series: Series[]
  xDomain: [number, number]
  yDomain: [number, number]
  xAxis?: AxisConfig
  yAxis?: AxisConfig
  showNodeTitles?: boolean
  showXAxisNodeTitles?: boolean
  background?: 'transparent' | string
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export default function ProgressionChart({
  width,
  height,
  margin = { top: 16, right: 16, bottom: 40, left: 48 },
  series,
  xDomain,
  yDomain,
  xAxis,
  yAxis,
  showNodeTitles,
  showXAxisNodeTitles,
  background = 'transparent',
}: ProgressionChartProps) {
  const innerW = Math.max(10, width - margin.left - margin.right)
  const innerH = Math.max(10, height - margin.top - margin.bottom)

  const [xMin, xMax] = xDomain
  const [yMin, yMax] = yDomain
  const xScale = (x: number) => margin.left + ((x - xMin) / (xMax - xMin || 1)) * innerW
  const yScale = (y: number) => margin.top + (1 - (y - yMin) / (yMax - yMin || 1)) * innerH

  const allPoints = useMemo(() => series.flatMap(s => s.points), [series])
  // Unique points per node for X-axis labels (avoid duplicates across multiple series)
  const uniqueXLabelPoints = useMemo(() => {
    const byNode = new Map<string, DataPoint>()
    for (const p of allPoints) {
      if (!byNode.has(p.nodeId)) byNode.set(p.nodeId, p)
    }
    return Array.from(byNode.values()).sort((a, b) => a.x - b.x)
  }, [allPoints])
  const xTickValues = useMemo(() => {
    // Choose up to ~10 ticks
    const count = 10
    const step = (xMax - xMin) / (count - 1 || 1)
    const arr: number[] = []
    for (let i = 0; i < count; i++) arr.push(xMin + i * step)
    return arr
  }, [xMin, xMax])
  const yTickValues = useMemo(() => {
    const count = 10
    const step = (yMax - yMin) / (count - 1 || 1)
    const arr: number[] = []
    for (let i = 0; i < count; i++) arr.push(yMin + i * step)
    return arr
  }, [yMin, yMax])

  const backgroundRect = background !== 'transparent' ? (
    <rect x={0} y={0} width={width} height={height} fill={background} />
  ) : null

  return (
    <svg width={width} height={height} role="img">
      {backgroundRect}
      {/* Axes */}
      <line x1={margin.left} y1={margin.top + innerH} x2={margin.left + innerW} y2={margin.top + innerH} stroke="currentColor" strokeOpacity={0.5} />
      <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + innerH} stroke="currentColor" strokeOpacity={0.5} />

      {/* X ticks */}
      {xTickValues.map((t, i) => {
        const x = clamp(xScale(t), margin.left, margin.left + innerW)
        return (
          <g key={`xtick-${i}`}>
            <line x1={x} y1={margin.top + innerH} x2={x} y2={margin.top + innerH + 4} stroke="currentColor" strokeOpacity={0.4} />
          </g>
        )
      })}

      {/* Y ticks and labels */}
      {yTickValues.map((t, i) => {
        const y = clamp(yScale(t), margin.top, margin.top + innerH)
        return (
          <g key={`ytick-${i}`}>
            <line x1={margin.left - 4} y1={y} x2={margin.left} y2={y} stroke="currentColor" strokeOpacity={0.4} />
            <text x={margin.left - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="currentColor" opacity={0.7}>{t.toFixed(2)}</text>
          </g>
        )
      })}

      {/* Axis labels */}
      {xAxis?.label && (
        <text x={margin.left + innerW / 2} y={margin.top + innerH + 38} textAnchor="middle" fontSize={12} fill="currentColor">{xAxis.label}</text>
      )}
      {yAxis?.label && (
        <text x={margin.left - 36} y={margin.top + innerH / 2} textAnchor="middle" fontSize={12} fill="currentColor" transform={`rotate(-90 ${margin.left - 36} ${margin.top + innerH / 2})`}>{yAxis.label}</text>
      )}

      {/* Lines */}
      {series.map((s, si) => {
        const sorted = [...s.points].sort((a, b) => a.x - b.x)
        const d = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.x)} ${yScale(p.y)}`).join(' ')
        return (
          <g key={`series-${si}`}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={2} />
            {sorted.map((p, pi) => (
              <g key={`pt-${si}-${pi}`}>
                <circle cx={xScale(p.x)} cy={yScale(p.y)} r={3} fill={s.color}>
                  <title>{`${s.name}: ${p.y} • ${p.title}`}</title>
                </circle>
                {showNodeTitles && (
                  <text x={xScale(p.x) + 6} y={yScale(p.y)} fontSize={10} fill="currentColor" dominantBaseline="middle">{p.title}</text>
                )}
              </g>
            ))}
          </g>
        )
      })}

      {/* Optional X-axis node titles under axis (horizontal, staggered to reduce overlap) */}
      {showXAxisNodeTitles && uniqueXLabelPoints.map((p, i) => {
        const x = xScale(p.x)
        const y = margin.top + innerH + 12 + (i % 2 === 0 ? 0 : 10) // alternate rows
        const anchor = i === 0 ? 'start' : (i === uniqueXLabelPoints.length - 1 ? 'end' : 'middle')
        const MAX = 18
        const text = p.title.length > MAX ? (p.title.slice(0, MAX - 1) + '…') : p.title
        return (
          <text key={`xlabel-${i}`} x={x} y={y} textAnchor={anchor as any} fontSize={10} fill="currentColor">
            <title>{p.title}</title>
            {text}
          </text>
        )
      })}
    </svg>
  )
}


