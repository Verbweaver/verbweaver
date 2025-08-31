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
  background?: 'transparent' | 'white'
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

  const backgroundRect = background === 'white' ? (
    <rect x={0} y={0} width={width} height={height} fill="#ffffff" />
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
        <text x={margin.left + innerW / 2} y={margin.top + innerH + 28} textAnchor="middle" fontSize={12} fill="currentColor">{xAxis.label}</text>
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

      {/* Optional X-axis node titles under axis */}
      {showXAxisNodeTitles && allPoints.map((p, i) => (
        <text key={`xlabel-${i}`} x={xScale(p.x)} y={margin.top + innerH + 10} transform={`rotate(-90 ${xScale(p.x)} ${margin.top + innerH + 10})`} textAnchor="end" fontSize={9} fill="currentColor">{p.title}</text>
      ))}
    </svg>
  )
}


