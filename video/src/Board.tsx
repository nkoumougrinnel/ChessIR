/**
 * Échiquier neutre (aux couleurs de Chess IR, sans reprendre l'interface de Chess.com) :
 * le coup final de la partie de Marie (Noirs) — mat du couloir Te8-e1#.
 * Vu du côté de Marie (Noirs en bas).
 */
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { BODY, C, DISPLAY, useSpring } from './kit'

type P = { sq: string; p: string; white: boolean }
const PIECES: P[] = [
  { sq: 'g1', p: '♚', white: true },
  { sq: 'f2', p: '♟', white: true },
  { sq: 'g2', p: '♟', white: true },
  { sq: 'h2', p: '♟', white: true },
  { sq: 'c3', p: '♞', white: true },
  { sq: 'b5', p: '♛', white: true },
  { sq: 'a2', p: '♟', white: true },
  { sq: 'g8', p: '♚', white: false },
  { sq: 'f7', p: '♟', white: false },
  { sq: 'g7', p: '♟', white: false },
  { sq: 'h7', p: '♟', white: false },
  { sq: 'd6', p: '♝', white: false },
  { sq: 'b7', p: '♟', white: false },
]

export function Board({ width }: { width: number }) {
  const frame = useCurrentFrame()
  const sq = width / 8
  // Vue des Noirs : la colonne a est à droite, la rangée 8 en bas.
  const pos = (s: string) => ({ x: (7 - (s.charCodeAt(0) - 97)) * sq, y: (Number(s[1]) - 1) * sq })
  const move = interpolate(frame, [18, 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const e8 = pos('e8')
  const e1 = pos('e1')
  const rook = { x: e8.x + (e1.x - e8.x) * move, y: e8.y + (e1.y - e8.y) * move }
  const mate = frame >= 34
  const flash = mate ? 0.5 + 0.5 * Math.sin((frame - 34) / 3) : 0
  const banner = useSpring(42, { damping: 11 })
  const king = pos('g1')

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #0c0f2c, #05061a)', alignItems: 'center', paddingTop: 120 }}>
      <PlayerBar name="Kevin Bilong" detail="Blancs · 379" />
      <div style={{ position: 'relative', width, height: width, margin: '18px 0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        {Array.from({ length: 64 }, (_, i) => {
          const x = i % 8
          const y = Math.floor(i / 8)
          const light = (x + y) % 2 === 0
          return (
            <div
              key={i}
              style={{ position: 'absolute', left: x * sq, top: y * sq, width: sq, height: sq, background: light ? '#cfd3f2' : '#5b5fa8' }}
            />
          )
        })}
        {/* Dernier coup en surbrillance */}
        {move > 0 &&
          [e8, e1].map((p, i) => (
            <div key={i} style={{ position: 'absolute', left: p.x, top: p.y, width: sq, height: sq, background: `${C.gold}88` }} />
          ))}
        {mate && <div style={{ position: 'absolute', left: king.x, top: king.y, width: sq, height: sq, background: `rgba(248,113,113,${0.45 + flash * 0.45})` }} />}
        {PIECES.map((p) => {
          const { x, y } = pos(p.sq)
          return <Piece key={p.sq} glyph={p.p} white={p.white} x={x} y={y} size={sq} />
        })}
        <Piece glyph="♜" white={false} x={rook.x} y={rook.y} size={sq} />
      </div>
      <PlayerBar name="Marie Kamga" detail="Noirs · 756" me />
      <div
        style={{
          marginTop: 34,
          padding: '20px 40px',
          borderRadius: 30,
          background: 'rgba(17, 20, 54, 0.92)',
          border: `3px solid ${C.gold}`,
          textAlign: 'center',
          transform: `scale(${banner})`,
          opacity: banner,
        }}
      >
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 62, color: C.goldLight }}>Échec et mat</div>
        <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 30, color: C.ink, marginTop: 4 }}>0 – 1 · Marie Kamga gagne</div>
      </div>
      <div style={{ position: 'absolute', top: 54, fontFamily: BODY, fontSize: 26, fontWeight: 600, color: C.muted }}>Partie classée · Rapide 10 min</div>
    </AbsoluteFill>
  )
}

function Piece({ glyph, white, x, y, size }: { glyph: string; white: boolean; x: number; y: number; size: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.8,
        lineHeight: 1,
        color: white ? '#ffffff' : '#14152e',
        textShadow: white ? '0 0 2px #14152e, 0 0 2px #14152e, 0 2px 3px rgba(0,0,0,0.4)' : '0 0 2px #ffffff88',
        fontFamily: '"DejaVu Sans", "Noto Sans Symbols 2", serif',
      }}
    >
      {glyph}
    </div>
  )
}

function PlayerBar({ name, detail, me = false }: { name: string; detail: string; me?: boolean }) {
  return (
    <div
      style={{
        width: '88%',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '14px 18px',
        borderRadius: 20,
        background: me ? 'rgba(245,184,61,0.14)' : 'rgba(255,255,255,0.05)',
        border: me ? `2px solid ${C.gold}88` : '2px solid transparent',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: me ? 'linear-gradient(180deg,#ff8fb0,#c33a6b)' : 'linear-gradient(180deg,#6aa8ff,#2a55c9)',
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: 26,
          color: 'white',
        }}
      >
        {me ? 'MK' : 'KB'}
      </div>
      <div style={{ fontFamily: BODY, color: C.ink }}>
        <div style={{ fontWeight: 700, fontSize: 30 }}>{name}</div>
        <div style={{ fontSize: 24, color: C.muted }}>{detail}</div>
      </div>
    </div>
  )
}
