/**
 * Briques visuelles de la vidéo : fond, téléphone, textes animés, notifications.
 * Couleurs et polices reprises de l'application Chess IR.
 */
import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion'
import { loadFont as loadBarlow } from '@remotion/google-fonts/BarlowSemiCondensed'
import { loadFont as loadInter } from '@remotion/google-fonts/Inter'

export const DISPLAY = loadBarlow('normal', { weights: ['600', '700', '800'], subsets: ['latin', 'latin-ext'] }).fontFamily
export const BODY = loadInter('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext'] }).fontFamily

export const C = {
  night: '#05061a',
  night2: '#0c0f2c',
  ink: '#eef0ff',
  muted: '#9aa0c8',
  gold: '#f5b83d',
  goldLight: '#ffd577',
  goldPale: '#ffe6a8',
  red: '#f87171',
  green: '#34d399',
  violet: '#7c6cff',
}

export const goldText: CSSProperties = {
  background: `linear-gradient(180deg, ${C.goldPale}, ${C.gold} 55%, #c47d14)`,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
}

/* ------------------------------------------------------------------ */
/* Animations                                                          */
/* ------------------------------------------------------------------ */

/** Ressort (0 → 1) qui démarre à `delay` images. */
export function useSpring(delay = 0, config: { damping?: number; stiffness?: number; mass?: number } = {}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 120, mass: 0.9, ...config } })
}

/** Valeur entre deux images clés, avec adoucissement. */
export function useRange(from: number, to: number, out: [number, number] = [0, 1], easing = Easing.bezier(0.2, 0.8, 0.2, 1)) {
  const frame = useCurrentFrame()
  return interpolate(frame, [from, to], out, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing })
}

/** Fondu d'entrée et de sortie d'une scène (durée en images). */
export function SceneFade({ duration, children, inFrames = 10, outFrames = 10 }: { duration: number; children: ReactNode; inFrames?: number; outFrames?: number }) {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, inFrames, duration - outFrames, duration], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const scale = interpolate(frame, [duration - outFrames, duration], [1, 1.04], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return <AbsoluteFill style={{ opacity, transform: `scale(${scale})` }}>{children}</AbsoluteFill>
}

/* ------------------------------------------------------------------ */
/* Fond : nuit, halo doré, damier en perspective (comme l'écran de lancement) */
/* ------------------------------------------------------------------ */

export function Background({ glow = C.gold, floor = true }: { glow?: string; floor?: boolean }) {
  const frame = useCurrentFrame()
  const drift = (frame * 0.6) % 120
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 70% at 50% 0%, #1b1a4a 0%, ${C.night2} 45%, ${C.night} 100%)` }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(45% 30% at 50% 38%, ${glow}33, transparent 70%)`,
        }}
      />
      {floor && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 760, perspective: 520, overflow: 'hidden' }}>
          <div
            style={{
              position: 'absolute',
              left: '-60%',
              right: '-60%',
              top: 0,
              height: 1600,
              transformOrigin: '50% 0%',
              transform: 'rotateX(62deg)',
              backgroundImage:
                'conic-gradient(from 0deg, rgba(150,150,255,0.16) 0 25%, rgba(150,150,255,0.03) 0 50%, rgba(150,150,255,0.16) 0 75%, rgba(150,150,255,0.03) 0)',
              backgroundSize: '240px 240px',
              backgroundPosition: `0 ${drift * 2}px`,
              maskImage: 'linear-gradient(180deg, transparent, black 30%)',
              WebkitMaskImage: 'linear-gradient(180deg, transparent, black 30%)',
            }}
          />
          <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(60% 50% at 50% 0%, ${glow}30, transparent 70%)` }} />
        </div>
      )}
      <Particles />
    </AbsoluteFill>
  )
}

function Particles() {
  const frame = useCurrentFrame()
  const dots = Array.from({ length: 26 }, (_, i) => {
    const x = (i * 397) % 1080
    const speed = 0.6 + ((i * 7) % 10) / 10
    const y = 1920 - ((frame * speed * 2 + i * 173) % 2100)
    const size = 3 + (i % 4)
    return { x, y, size, o: 0.15 + ((i * 13) % 10) / 40 }
  })
  return (
    <AbsoluteFill>
      {dots.map((d, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: d.x,
            top: d.y,
            width: d.size,
            height: d.size,
            borderRadius: '50%',
            background: C.goldLight,
            opacity: d.o,
            boxShadow: `0 0 ${d.size * 3}px ${C.gold}`,
          }}
        />
      ))}
    </AbsoluteFill>
  )
}

/* ------------------------------------------------------------------ */
/* Téléphone avec une capture de l'application                         */
/* ------------------------------------------------------------------ */

export const PHONE_W = 640
export const PHONE_H = Math.round((PHONE_W * 844) / 390) + 36

/** Téléphone. `zoom` agrandit une zone de l'écran : { x, y } en points (390×844), `s` facteur. */
export function Phone({
  src,
  style,
  tilt = 0,
  zoom,
  children,
  screen,
}: {
  src?: string
  /** Contenu d'écran personnalisé (ex. écran verrouillé) à la place d'une capture. */
  screen?: ReactNode
  style?: CSSProperties
  tilt?: number
  zoom?: { x: number; y: number; s: number }
  children?: ReactNode
}) {
  const inner = PHONE_W - 36
  const ratio = inner / 390
  const z = zoom ?? { x: 195, y: 422, s: 1 }
  return (
    <div
      style={{
        position: 'absolute',
        width: PHONE_W,
        height: PHONE_H,
        borderRadius: 86,
        padding: 18,
        background: 'linear-gradient(145deg, #2b2f55, #0d0f24 45%, #23264a)',
        boxShadow: `0 60px 120px rgba(0,0,0,0.65), 0 0 0 2px rgba(255,255,255,0.08), 0 0 80px ${C.gold}22`,
        transform: `perspective(2200px) rotateY(${tilt}deg)`,
        ...style,
      }}
    >
      <div style={{ position: 'relative', width: inner, height: PHONE_H - 36, borderRadius: 70, overflow: 'hidden', background: C.night }}>
        <div style={{ position: 'absolute', inset: 0, transformOrigin: `${z.x * ratio}px ${z.y * ratio}px`, transform: `scale(${z.s})` }}>
          {screen ?? <Img src={staticFile(`captures/${src}.png`)} style={{ position: 'absolute', width: inner }} />}
          {children}
        </div>
        {/* Caméra avant : un simple point */}
        <div style={{ position: 'absolute', top: 12, left: '50%', width: 24, height: 24, marginLeft: -12, borderRadius: '50%', background: '#000', boxShadow: '0 0 0 2px rgba(255,255,255,0.06)' }} />
      </div>
    </div>
  )
}

/** Cercle lumineux qui pulse sur un élément de l'écran (coordonnées en points 390×844). */
export function Pulse({ x, y, w, h, start = 0, color = C.gold }: { x: number; y: number; w: number; h: number; start?: number; color?: string }) {
  const frame = useCurrentFrame() - start
  if (frame < 0) return null
  const ratio = (PHONE_W - 36) / 390
  const t = (frame % 40) / 40
  return (
    <div
      style={{
        position: 'absolute',
        left: x * ratio,
        top: y * ratio,
        width: w * ratio,
        height: h * ratio,
        borderRadius: 18,
        border: `4px solid ${color}`,
        boxShadow: `0 0 ${20 + 30 * t}px ${color}`,
        opacity: 1 - t * 0.7,
        transform: `scale(${1 + t * 0.12})`,
      }}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Textes                                                              */
/* ------------------------------------------------------------------ */

/** Titre qui monte mot par mot. */
export function Headline({
  text,
  start = 0,
  size = 96,
  color = C.ink,
  gold = [],
  style,
}: {
  text: string
  start?: number
  size?: number
  color?: string
  gold?: string[]
  style?: CSSProperties
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const words = text.split(' ')
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: `0 ${size * 0.24}px`, ...style }}>
      {words.map((w, i) => {
        const s = spring({ frame: frame - start - i * 3, fps, config: { damping: 15, stiffness: 140 } })
        return (
          <span
            key={i}
            style={{
              fontFamily: DISPLAY,
              fontWeight: 800,
              fontSize: size,
              lineHeight: 1.02,
              letterSpacing: -0.5,
              color,
              display: 'inline-block',
              opacity: s,
              transform: `translateY(${(1 - s) * 60}px)`,
              ...(gold.includes(w) ? goldText : {}),
            }}
          >
            {w}
          </span>
        )
      })}
    </div>
  )
}

export function Sub({ children, start = 0, style }: { children: ReactNode; start?: number; style?: CSSProperties }) {
  const s = useSpring(start)
  return (
    <div
      style={{
        fontFamily: BODY,
        fontWeight: 500,
        fontSize: 40,
        color: C.muted,
        textAlign: 'center',
        opacity: s,
        transform: `translateY(${(1 - s) * 30}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** Pastille (ex. « EN DIRECT », « sur Chess.com »). */
export function Chip({ children, color = C.gold, start = 0, style }: { children: ReactNode; color?: string; start?: number; style?: CSSProperties }) {
  const s = useSpring(start, { damping: 11 })
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 34px',
        borderRadius: 999,
        background: `${color}22`,
        border: `3px solid ${color}88`,
        color,
        fontFamily: DISPLAY,
        fontWeight: 700,
        fontSize: 46,
        letterSpacing: 1,
        transform: `scale(${s})`,
        opacity: s,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function LiveDot({ size = 22 }: { size?: number }) {
  const frame = useCurrentFrame()
  const t = (frame % 30) / 30
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-block' }}>
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: C.red, transform: `scale(${1 + t * 1.4})`, opacity: 1 - t }} />
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: C.red }} />
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Notification du téléphone (style écran verrouillé)                  */
/* ------------------------------------------------------------------ */

export function PushBanner({ title, body, start = 0, end, style, compact = false }: { title: string; body: string; start?: number; end?: number; style?: CSSProperties; compact?: boolean }) {
  const sIn = useSpring(start, { damping: 13, stiffness: 110 })
  const sOut = useSpring(end ?? 1e9, { damping: 18, stiffness: 140 })
  const s = sIn - sOut
  return (
    <div
      style={{
        position: 'absolute',
        left: compact ? 22 : 60,
        right: compact ? 22 : 60,
        display: 'flex',
        gap: compact ? 20 : 26,
        alignItems: 'center',
        padding: compact ? '22px 22px' : '28px 32px',
        borderRadius: 44,
        background: 'rgba(38, 40, 70, 0.86)',
        backdropFilter: 'blur(20px)',
        border: '2px solid rgba(255,255,255,0.12)',
        boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
        transform: `translateY(${(1 - s) * -260}px)`,
        opacity: Math.min(1, s * 1.4),
        ...style,
      }}
    >
      <Img src={staticFile('logo.png')} style={{ width: compact ? 76 : 96, height: compact ? 76 : 96, borderRadius: 20 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: BODY, fontSize: compact ? 22 : 28, color: C.muted, fontWeight: 600 }}>
          <span>CHESS IR</span>
          <span>maintenant</span>
        </div>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: compact ? 29 : 38, color: C.ink, marginTop: 4 }}>{title}</div>
        <div style={{ fontFamily: BODY, fontSize: compact ? 25 : 32, color: '#c9cdf0', marginTop: 2 }}>{body}</div>
      </div>
    </div>
  )
}

/** Toucher du doigt (cercle blanc) sur l'écran, en points 390×844. */
export function Tap({ x, y, at }: { x: number; y: number; at: number }) {
  const frame = useCurrentFrame() - at
  if (frame < 0 || frame > 24) return null
  const ratio = (PHONE_W - 36) / 390
  const t = frame / 24
  const press = frame < 8 ? frame / 8 : 1
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: x * ratio - 45,
          top: y * ratio - 45,
          width: 90,
          height: 90,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.55)',
          transform: `scale(${0.6 + press * 0.4})`,
          opacity: 1 - t,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x * ratio - 45,
          top: y * ratio - 45,
          width: 90,
          height: 90,
          borderRadius: '50%',
          border: '4px solid white',
          transform: `scale(${1 + t * 1.2})`,
          opacity: 1 - t,
        }}
      />
    </>
  )
}

/** Pluie de confettis à partir de l'image `at`. */
export function Confetti({ at = 0, count = 70, originY = 700 }: { at?: number; count?: number; originY?: number }) {
  const frame = useCurrentFrame() - at
  if (frame < 0) return null
  const colors = [C.gold, C.goldPale, C.violet, C.green, C.red, '#6aa8ff']
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: count }, (_, i) => {
        const x0 = 540 + Math.sin(i * 12.9898) * 120
        const vx = Math.cos(i * 78.233) * 16
        const vy = -28 - ((i * 37) % 22)
        const x = x0 + vx * frame
        const y = originY + vy * frame + 0.9 * frame * frame
        const rot = frame * (8 + (i % 7))
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: 18,
              height: 30,
              borderRadius: 4,
              background: colors[i % colors.length],
              transform: `rotate(${rot}deg)`,
              opacity: Math.max(0, 1 - frame / 90),
            }}
          />
        )
      })}
    </AbsoluteFill>
  )
}

/** Écran verrouillé du téléphone (heure, date, notifications). */
export function LockScreen({ children }: { children?: ReactNode }) {
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(90% 60% at 50% 30%, #2a2466 0%, #0d0f2c 60%, #05061a 100%)' }}>
      <Img
        src={staticFile('logo.png')}
        style={{ position: 'absolute', left: '50%', top: 640, width: 360, marginLeft: -180, opacity: 0.18, filter: 'blur(2px)', borderRadius: '26%' }}
      />
      <div style={{ position: 'absolute', top: 120, width: '100%', textAlign: 'center', fontFamily: BODY, color: C.ink }}>
        <div style={{ fontSize: 34, fontWeight: 600, opacity: 0.85 }}>dimanche 22 novembre</div>
        <div style={{ fontFamily: DISPLAY, fontSize: 190, fontWeight: 700, lineHeight: 1, marginTop: 6 }}>19:00</div>
      </div>
      {children}
    </AbsoluteFill>
  )
}

/* ------------------------------------------------------------------ */
/* Éléments positionnés sur une capture (points 390×844 → pixels)      */
/* ------------------------------------------------------------------ */
export type Rect = { x: number; y: number; w: number; h: number }
export const PX = (PHONE_W - 36) / 390

/** Cache un élément de la capture puis le fait apparaître (glissement + fondu). */
export function Reveal({ src, rect, at, cover, from = 'right' }: { src: string; rect: Rect; at: number; cover: string; from?: 'right' | 'bottom' }) {
  const s = useSpring(at, { damping: 15, stiffness: 120 })
  const dx = from === 'right' ? (1 - s) * 120 : 0
  const dy = from === 'bottom' ? (1 - s) * 40 : 0
  return (
    <>
      <div style={{ position: 'absolute', left: rect.x * PX - 2, top: rect.y * PX - 2, width: rect.w * PX + 4, height: rect.h * PX + 4, background: cover }} />
      <div
        style={{
          position: 'absolute',
          left: rect.x * PX,
          top: rect.y * PX,
          width: rect.w * PX,
          height: rect.h * PX,
          overflow: 'hidden',
          opacity: s,
          transform: `translate(${dx}px, ${dy}px)`,
        }}
      >
        <Img src={staticFile(`captures/${src}.png`)} style={{ position: 'absolute', width: PHONE_W - 36, left: -rect.x * PX, top: -rect.y * PX }} />
      </div>
    </>
  )
}

/** Surlignage lumineux d'un élément (position exacte relevée dans l'application). */
export function Glow({ rect, at, color = C.gold, radius = 22 }: { rect: Rect; at: number; color?: string; radius?: number }) {
  const frame = useCurrentFrame() - at
  if (frame < 0) return null
  const s = Math.min(1, frame / 8)
  const t = (frame % 40) / 40
  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x * PX - 6,
        top: rect.y * PX - 6,
        width: rect.w * PX + 12,
        height: rect.h * PX + 12,
        borderRadius: radius,
        border: `4px solid ${color}`,
        boxShadow: `0 0 ${18 + 26 * Math.sin(t * Math.PI)}px ${color}, inset 0 0 20px ${color}44`,
        opacity: s,
      }}
    />
  )
}

export const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
