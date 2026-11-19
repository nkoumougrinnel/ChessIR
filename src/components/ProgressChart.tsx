import { useId } from 'react'

export interface ProgressPoint {
  label: string
  points: number
  rank: number
}

/**
 * Courbe de progression : points cumulés par semaine, rang affiché à chaque point.
 * SVG pur, sans dépendance.
 */
export function ProgressChart({ data, height = 150 }: { data: ProgressPoint[]; height?: number }) {
  const gid = useId().replace(/:/g, '')
  if (data.length === 0) return null
  const W = 320
  const H = height
  const pad = { l: 28, r: 16, t: 22, b: 24 }
  const max = Math.max(3, ...data.map((d) => d.points))
  const step = data.length > 1 ? (W - pad.l - pad.r) / (data.length - 1) : 0
  const x = (i: number) => (data.length > 1 ? pad.l + i * step : W / 2)
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b)
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.points)}`).join(' ')
  const area = `${line} L${x(data.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`
  const ticks = [0, Math.round(max / 2), max]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Évolution des points et du rang par semaine">
      <defs>
        <linearGradient id={`fill-${gid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f5b83d" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#f5b83d" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" />
          <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#6a7099">
            {t}
          </text>
        </g>
      ))}
      {data.length > 1 && <path d={area} fill={`url(#fill-${gid})`} />}
      {data.length > 1 && (
        <path d={line} fill="none" stroke="#f5b83d" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.points)} r="4.5" fill="#080a22" stroke="#ffd577" strokeWidth="2.5" />
          <text x={x(i)} y={y(d.points) - 10} textAnchor="middle" fontSize="10" fontWeight="600" fill="#ffd577">
            #{d.rank}
          </text>
          <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#9aa0c8">
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  )
}
