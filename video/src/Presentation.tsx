/**
 * Chess IR — vidéo de présentation (9:16, 30 i/s, 60 s). Script V3.
 * Une semaine de Marie Kamga, du tirage à sa distinction.
 * Un seul téléphone reste à l'écran : seul son écran change (vraies captures, noms fictifs).
 */
import type { ReactNode } from 'react'
import { AbsoluteFill, Audio, Img, Sequence, getStaticFiles, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import {
  Background,
  BODY,
  C,
  center,
  Confetti,
  DISPLAY,
  Glow,
  goldText,
  Headline,
  LockScreen,
  Phone,
  PHONE_W,
  PushBanner,
  PX,
  Reveal,
  Sub,
  Tap,
  useRange,
  useSpring,
} from './kit'
import { Board } from './Board'
import RECTS from './rects.json'

export const FPS = 30
/** Repères de la timeline (images). */
const T = {
  tirage: 0,
  semaine: 150,
  defi: 330,
  jyvais: 460,
  partie: 570,
  victoire: 660,
  partage: 760,
  direct: 840,
  arene: 1030,
  defis: 1150,
  classement: 1260,
  distinction: 1440,
  fin: 1650,
  end: 1800,
}
export const DURATION = T.end

const PHONE_X = (1080 - PHONE_W) / 2
const PHONE_TOP = 470
const INNER = PHONE_W - 36

/* ------------------------------------------------------------------ */
export function Presentation() {
  const hasMusic = getStaticFiles().some((f) => f.name === 'music.mp3')
  return (
    <AbsoluteFill style={{ background: C.night }}>
      <Backgrounds />
      <Captions />
      <MovingPhone />
      <Overlays />
      <EndCard />
      <Sounds />
      {hasMusic && <Music />}
    </AbsoluteFill>
  )
}

/* ------------------------------------------------------------------ */
/* Fonds : la teinte du halo suit l'ambiance de chaque moment          */
/* ------------------------------------------------------------------ */
function Backgrounds() {
  const frame = useCurrentFrame()
  const layer = (from: number, to: number) =>
    interpolate(frame, [from - 15, from, to, to + 15], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{ opacity: layer(T.partie, T.direct) }}>
        <Background glow={C.green} />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: layer(T.direct, T.classement) }}>
        <Background glow={C.red} />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

/* ------------------------------------------------------------------ */
/* Légendes                                                            */
/* ------------------------------------------------------------------ */
const CAPTIONS: Array<{ from: number; to: number; title: string; gold: string[]; sub?: string; size?: number }> = [
  { from: T.tirage, to: T.semaine, title: 'Dimanche, 19 h : le tirage tombe', gold: ['tirage'], sub: "Le championnat d'échecs de la classe" },
  { from: T.semaine, to: T.defi, title: 'Tes 3 adversaires de la semaine', gold: ['3', 'adversaires'], sub: 'Kevin, Aïcha et Ibrahim' },
  { from: T.defi, to: T.jyvais, title: 'Kevin te défie !', gold: ['défie'], sub: 'Tu es prévenu sur ton téléphone', size: 120 },
  { from: T.jyvais, to: T.partie, title: 'Tu as 5 minutes pour accepter', gold: ['5', 'minutes'], sub: "« J'y vais » et la partie démarre sur Chess.com" },
  { from: T.partie, to: T.victoire, title: "Sur Chess.com, Marie l'emporte !", gold: ["l'emporte"], sub: 'Partie classée, avec les couleurs du tirage' },
  { from: T.victoire, to: T.partage, title: 'Victoire retrouvée dans Chess IR', gold: ['Victoire'], sub: 'Kevin confirme : les 3 points sont acquis' },
  { from: T.partage, to: T.direct, title: 'Partagée au groupe en un geste', gold: ['groupe'], sub: "L'image est prête à envoyer" },
  { from: T.direct, to: T.arene, title: 'Pendant ce temps, un match en direct', gold: ['direct'], sub: "L'onglet Arène s'anime" },
  { from: T.arene, to: T.defis, title: "L'Arène : toute la classe suit le direct", gold: ['direct'], sub: 'Un geste pour regarder la partie sur Chess.com' },
  { from: T.defis, to: T.classement, title: 'Les défis, en temps réel', gold: ['défis'], sub: "L'Arène est bien vivante !" },
  { from: T.classement, to: T.distinction, title: 'Marie prend la tête du classement', gold: ['tête'], sub: 'Victoire 3 pts · Nul 1 pt · Défaite 0 pt' },
  { from: T.distinction, to: T.fin, title: 'Championne de la semaine !', gold: ['Championne'], sub: 'Distinctions et badges à chaque clôture', size: 116 },
]

function Captions() {
  return (
    <>
      {CAPTIONS.map((c) => (
        <Sequence key={c.from} from={c.from} durationInFrames={c.to - c.from} layout="none">
          <CaptionBlock {...c} duration={c.to - c.from} />
        </Sequence>
      ))}
    </>
  )
}

function CaptionBlock({ title, gold, sub, size = 104, duration }: { title: string; gold: string[]; sub?: string; size?: number; duration: number }) {
  const frame = useCurrentFrame()
  const out = interpolate(frame, [duration - 10, duration], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <div style={{ position: 'absolute', top: 100, left: 50, right: 50, opacity: out, transform: `translateY(${(1 - out) * -20}px)` }}>
      <Headline text={title} start={2} size={size} gold={gold} />
      {sub && (
        <Sub start={14} style={{ marginTop: 16 }}>
          {sub}
        </Sub>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Le téléphone (unique) et ses déplacements                           */
/* ------------------------------------------------------------------ */
function MovingPhone() {
  const frame = useCurrentFrame()
  const enter = useSpring(2, { damping: 16, stiffness: 80 })
  // Partage : le téléphone se pousse à gauche pour laisser la place au groupe.
  const side = useRange(T.partage, T.partage + 22, [0, 1]) - useRange(T.direct, T.direct + 22, [0, 1])
  const leave = useRange(T.fin, T.fin + 26, [0, 1])
  const sway = Math.sin(frame / 45) * 2.5
  const x = PHONE_X - side * 230
  const scale = (1 - side * 0.3) * (1 - leave * 0.4)
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity: 1 - leave,
        transformOrigin: `${x + PHONE_W / 2}px 1200px`,
        transform: `scale(${scale}) translateY(${(1 - enter) * 900 + leave * -200}px)`,
      }}
    >
      <Phone tilt={sway + side * 12 + (1 - enter) * -18} style={{ left: x, top: PHONE_TOP }} screen={<Screens />} />
    </div>
  )
}

/** Un écran affiché entre `from` et `to`, avec son entrée. */
function Layer({ from, to, children, enter = 'fade' }: { from: number; to: number; children: ReactNode; enter?: 'fade' | 'right' | 'up' | 'open' }) {
  return (
    <Sequence from={from} durationInFrames={to - from} layout="none">
      <LayerAnim enter={enter}>{children}</LayerAnim>
    </Sequence>
  )
}

function LayerAnim({ enter, children }: { enter: 'fade' | 'right' | 'up' | 'open'; children: ReactNode }) {
  const s = useSpring(0, { damping: 18, stiffness: 140 })
  const style =
    enter === 'right'
      ? { transform: `translateX(${(1 - s) * INNER}px)` }
      : enter === 'up'
        ? { transform: `translateY(${(1 - s) * 300}px)`, opacity: s }
        : enter === 'open'
          ? { transform: `scale(${0.85 + s * 0.15})`, opacity: s, transformOrigin: '50% 30%' }
          : { opacity: s }
  return <AbsoluteFill style={{ background: C.night, ...style }}>{children}</AbsoluteFill>
}

function Capture({ src }: { src: string }) {
  return <Img src={staticFile(`captures/${src}.png`)} style={{ position: 'absolute', width: INNER }} />
}

/** Zoom de l'écran autour d'un point (points 390×844). */
function Zoom({ x, y, s, children }: { x: number; y: number; s: number; children: ReactNode }) {
  return <AbsoluteFill style={{ transformOrigin: `${x * PX}px ${y * PX}px`, transform: `scale(${s})` }}>{children}</AbsoluteFill>
}

const R = RECTS as unknown as {
  semaine: { cartes: Rect[] }
  defi: { jyvais: Rect }
  victoire: { resultat: Rect; partager: Rect }
  'accueil-direct': { arene: Rect }
  arene: { direct: Rect; defis: Rect }
  classement: { lignes: Rect[] }
  distinctions: { heros: Rect }
}
type Rect = { x: number; y: number; w: number; h: number }

function Screens() {
  return (
    <>
      {/* 1. Écran verrouillé : notification du tirage */}
      <Layer from={T.tirage} to={T.semaine + 20}>
        <LockScreen>
          <PushBanner compact title="Semaine 1 : tirage publié" body="Vos trois adversaires de la semaine sont connus." start={28} style={{ top: 420 }} />
        </LockScreen>
        <Tap x={195} y={300} at={108} />
      </Layer>

      {/* 2. Les trois adversaires, révélés un à un */}
      <Layer from={T.semaine} to={T.defi + 75} enter="open">
        <Capture src="semaine" />
        {R.semaine.cartes.map((r, i) => (
          <Reveal key={i} src="semaine" rect={r} at={22 + i * 16} cover="#040518" />
        ))}
        {R.semaine.cartes.map((r, i) => (
          <SeqGlow key={i} rect={r} from={80 + i * 14} to={80 + i * 14 + 50} />
        ))}
        <Tap x={195} y={70} at={T.defi + 62 - T.semaine} />
      </Layer>

      {/* 3. Le défi de Kevin : « J'y vais » */}
      <Layer from={T.defi + 70} to={T.partie + 10} enter="right">
        <Capture src="defi" />
        <Glow rect={R.defi.jyvais} at={T.jyvais - T.defi - 70} radius={14} />
        <Tap {...center(R.defi.jyvais)} at={T.partie - 26 - (T.defi + 70)} />
      </Layer>

      {/* 4. La partie sur Chess.com : échec et mat */}
      <Layer from={T.partie} to={T.victoire + 15} enter="fade">
        <AbsoluteFill style={{ alignItems: 'center' }}>
          <Board width={INNER - 60} />
        </AbsoluteFill>
      </Layer>

      {/* 5. La victoire dans Chess IR, puis « Partager » */}
      <Layer from={T.victoire} to={T.direct + 10} enter="up">
        <Capture src="victoire" />
        <Glow rect={R.victoire.resultat} at={20} color={C.green} />
        <Tap {...center(R.victoire.partager)} at={T.partage - 12 - T.victoire} />
      </Layer>

      {/* 6. Accueil : l'onglet Arène s'anime */}
      <Layer from={T.direct} to={T.arene + 30} enter="fade">
        <ArenaTabScene />
      </Layer>

      {/* 7. Dans l'Arène */}
      <Layer from={T.arene} to={T.classement + 15} enter="fade">
        <ArenaScene />
      </Layer>

      {/* 8. Le classement */}
      <Layer from={T.classement} to={T.distinction + 15} enter="right">
        <Capture src="classement" />
        {R.classement.lignes.map((r, i) => (
          <Reveal key={i} src="classement" rect={r} at={14 + (R.classement.lignes.length - 1 - i) * 6} cover="#0d0f2d" from="bottom" />
        ))}
        <Glow rect={R.classement.lignes[0]} at={70} radius={10} />
      </Layer>

      {/* 9. La distinction */}
      <Layer from={T.distinction} to={T.end} enter="open">
        <DistinctionScene />
      </Layer>
    </>
  )
}

function SeqGlow({ rect, from, to }: { rect: Rect; from: number; to: number }) {
  return (
    <Sequence from={from} durationInFrames={to - from} layout="none">
      <Glow rect={rect} at={0} />
    </Sequence>
  )
}

function ArenaTabScene() {
  const frame = useCurrentFrame()
  const tab = R['accueil-direct'].arene
  const c = center(tab)
  const zoom = useRange(60, 110, [1, 2.1])
  const t = (frame % 36) / 36
  return (
    <Zoom x={c.x} y={c.y - 40} s={zoom}>
      <Capture src="accueil-direct" />
      {[0, 0.5].map((o, i) => {
        const k = (t + o) % 1
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: c.x * PX - 50,
              top: c.y * PX - 50,
              width: 100,
              height: 100,
              borderRadius: '50%',
              border: `5px solid ${i ? C.gold : C.red}`,
              transform: `scale(${1 + k * 0.9})`,
              opacity: (1 - k) * 0.9,
            }}
          />
        )
      })}
      <Tap {...c} at={T.arene - 18 - T.direct} />
    </Zoom>
  )
}

function ArenaScene() {
  const tab = center(R['accueil-direct'].arene)
  const open = useRange(0, 22, [2.1, 1])
  const zin = useRange(30, 60, [1, 1.25])
  const zout = useRange(110, 140, [0, 0.25])
  const live = center(R.arene.direct)
  return (
    <Zoom x={tab.x} y={tab.y} s={open}>
      <Zoom x={live.x} y={live.y} s={zin - zout}>
        <Capture src="arene" />
        <Glow rect={R.arene.defis} at={T.defis - T.arene + 10} radius={18} />
      </Zoom>
    </Zoom>
  )
}

function DistinctionScene() {
  const hero = center(R.distinctions.heros)
  const zoom = useRange(30, 70, [1, 1.25])
  const shine = useRange(40, 90, [-0.4, 1.4])
  return (
    <Zoom x={hero.x} y={hero.y} s={zoom}>
      <Capture src="distinctions" />
      {/* Reflet qui balaie la distinction */}
      <div
        style={{
          position: 'absolute',
          left: R.distinctions.heros.x * PX,
          top: R.distinctions.heros.y * PX,
          width: R.distinctions.heros.w * PX,
          height: R.distinctions.heros.h * PX,
          overflow: 'hidden',
          mixBlendMode: 'screen',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -100,
            bottom: -100,
            width: 140,
            left: `${shine * 100}%`,
            transform: 'rotate(18deg)',
            background: 'linear-gradient(90deg, transparent, rgba(255,230,168,0.55), transparent)',
          }}
        />
      </div>
    </Zoom>
  )
}

/* ------------------------------------------------------------------ */
/* Éléments par-dessus le téléphone                                    */
/* ------------------------------------------------------------------ */
function Overlays() {
  return (
    <>
      <Sequence from={T.defi} durationInFrames={110} layout="none">
        <PushBanner title="Kevin Bilong vous défie !" body="Rejoignez-le sur Chess.com dans les 5 minutes." start={12} end={66} style={{ top: 500 }} />
      </Sequence>
      <Sequence from={T.jyvais - 10} durationInFrames={T.partie - T.jyvais + 10} layout="none">
        <Countdown />
      </Sequence>
      <Sequence from={T.partie} durationInFrames={120} layout="none">
        <Confetti at={44} count={60} originY={1150} />
      </Sequence>
      <Sequence from={T.partage} durationInFrames={T.direct - T.partage + 20} layout="none">
        <GroupChat />
      </Sequence>
      <Sequence from={T.direct} durationInFrames={150} layout="none">
        <PushBanner title="🔴 Aïcha Daouda affronte Kevin Bilong" body="Match en direct sur Chess.com : venez regarder !" start={14} end={100} style={{ top: 500 }} />
      </Sequence>
      <Sequence from={T.defis + 50} durationInFrames={110} layout="none">
        <PushBanner title="🔴 Sandra Tchami affronte Grace Nana" body="Match en direct sur Chess.com : venez regarder !" start={6} end={80} style={{ top: 500 }} />
      </Sequence>
      <Sequence from={T.classement + 70} durationInFrames={T.distinction - T.classement - 70} layout="none">
        <RankBadge />
      </Sequence>
      <Sequence from={T.distinction} durationInFrames={T.fin - T.distinction} layout="none">
        <Confetti at={40} count={90} originY={1100} />
      </Sequence>
    </>
  )
}

/** Compte à rebours de 5 minutes (le défi a été lancé il y a 28 s). */
function Countdown() {
  const frame = useCurrentFrame()
  const s = useSpring(0, { damping: 12 })
  const left = Math.max(0, 272 - Math.floor(frame / 30))
  const label = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
  return (
    <div
      style={{
        position: 'absolute',
        right: 60,
        top: 640,
        padding: '18px 30px',
        borderRadius: 30,
        background: 'rgba(17, 20, 54, 0.92)',
        border: `3px solid ${C.gold}`,
        fontFamily: DISPLAY,
        fontWeight: 800,
        fontSize: 72,
        color: C.goldLight,
        transform: `scale(${s}) rotate(4deg)`,
        boxShadow: `0 16px 50px rgba(0,0,0,0.5), 0 0 40px ${C.gold}44`,
      }}
    >
      ⏱ {label}
    </div>
  )
}

function RankBadge() {
  const s = useSpring(0, { damping: 10 })
  return (
    <div
      style={{
        position: 'absolute',
        right: 60,
        top: 680,
        padding: '18px 32px',
        borderRadius: 999,
        background: `linear-gradient(180deg, ${C.goldLight}, ${C.gold})`,
        color: C.night,
        fontFamily: DISPLAY,
        fontWeight: 800,
        fontSize: 60,
        transform: `scale(${s}) rotate(${(1 - s) * 30 + 6}deg)`,
        boxShadow: `0 16px 50px ${C.gold}88`,
      }}
    >
      #1 · 9 pts
    </div>
  )
}

/** Conversation du groupe de la classe, avec l'image du résultat. */
function GroupChat() {
  const enter = useSpring(16, { damping: 14 })
  const text = useSpring(40, { damping: 14 })
  const out = useRange(T.direct - T.partage - 4, T.direct - T.partage + 16, [0, 1])
  return (
    <div
      style={{
        position: 'absolute',
        right: 50,
        top: 620,
        width: 580,
        padding: 22,
        borderRadius: 40,
        background: '#0e2a2a',
        border: '2px solid rgba(255,255,255,0.08)',
        boxShadow: '0 40px 100px rgba(0,0,0,0.6)',
        transform: `translateX(${(1 - enter + out) * 800}px) rotate(-3deg)`,
        opacity: enter,
      }}
    >
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 30, color: '#9fe3c2', margin: '4px 8px 16px' }}>Groupe de la classe</div>
      <div style={{ background: '#155b4a', borderRadius: 28, padding: 14 }}>
        <Img src={staticFile('captures/partage-resultat.png')} style={{ width: '100%', borderRadius: 18, display: 'block' }} />
        <div style={{ fontFamily: BODY, fontSize: 27, color: '#e9fff6', marginTop: 14, lineHeight: 1.35, opacity: text, transform: `translateY(${(1 - text) * 20}px)` }}>
          🏆 Victoire de Marie Kamga contre Kevin Bilong (semaine 1, ronde 1) !
        </div>
        <div style={{ textAlign: 'right', fontFamily: BODY, fontSize: 22, color: '#9fe3c2', marginTop: 6, opacity: text }}>19:42 ✓✓</div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Signature finale                                                    */
/* ------------------------------------------------------------------ */
function EndCard() {
  return (
    <Sequence from={T.fin} durationInFrames={T.end - T.fin} layout="none">
      <EndCardInner />
    </Sequence>
  )
}

function EndCardInner() {
  const frame = useCurrentFrame()
  const logo = useSpring(14, { damping: 11 })
  const url = useSpring(44, { damping: 10 })
  const out = interpolate(frame, [T.end - T.fin - 20, T.end - T.fin], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 420, opacity: out }}>
      <Img src={staticFile('logo.png')} style={{ width: 260, height: 260, borderRadius: '26%', transform: `scale(${logo})`, boxShadow: `0 20px 90px ${C.gold}66` }} />
      <div style={{ marginTop: 40, fontFamily: DISPLAY, fontWeight: 800, fontSize: 130, color: C.ink, opacity: logo }}>
        Chess <span style={goldText}>IR</span>
      </div>
      <Headline text="À toi de jouer !" start={28} size={110} gold={['jouer']} style={{ marginTop: 10 }} />
      <div
        style={{
          marginTop: 60,
          padding: '30px 60px',
          borderRadius: 999,
          background: `linear-gradient(180deg, ${C.goldLight}, ${C.gold})`,
          color: C.night,
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: 78,
          transform: `scale(${url})`,
          boxShadow: `0 20px 80px ${C.gold}88`,
        }}
      >
        chessir.vercel.app
      </div>
    </AbsoluteFill>
  )
}

/* ------------------------------------------------------------------ */
/* Sons                                                                */
/* ------------------------------------------------------------------ */
const SFX: Array<[number, string, number?]> = [
  [T.tirage + 28, 'notif'],
  [T.tirage + 108, 'tap'],
  [T.semaine - 4, 'whoosh'],
  [T.semaine + 22, 'pop', 0.35],
  [T.semaine + 38, 'pop', 0.35],
  [T.semaine + 54, 'pop', 0.35],
  [T.defi + 12, 'notif'],
  [T.defi + 62, 'tap'],
  [T.defi + 70, 'whoosh'],
  [T.jyvais, 'tick'],
  [T.jyvais + 30, 'tick'],
  [T.jyvais + 60, 'tick'],
  [T.partie - 26, 'tap'],
  [T.partie, 'whoosh'],
  [T.partie + 34, 'coup'],
  [T.partie + 42, 'victoire'],
  [T.victoire, 'whoosh'],
  [T.partage - 12, 'tap'],
  [T.partage + 10, 'whoosh'],
  [T.partage + 40, 'pop'],
  [T.direct + 14, 'direct'],
  [T.arene - 18, 'tap'],
  [T.arene, 'whoosh'],
  [T.defis + 56, 'direct'],
  [T.classement, 'whoosh'],
  [T.classement + 70, 'pop'],
  [T.distinction + 38, 'victoire'],
  [T.fin, 'whoosh'],
]

function Sounds() {
  return (
    <>
      {SFX.map(([at, name, vol], i) => (
        <Sequence key={i} from={at} durationInFrames={70} layout="none">
          <Audio src={staticFile(`sfx/${name}.wav`)} volume={vol ?? 0.8} />
        </Sequence>
      ))}
    </>
  )
}

function Music() {
  const { durationInFrames } = useVideoConfig()
  return (
    <Audio
      src={staticFile('music.mp3')}
      volume={(f) =>
        interpolate(f, [0, 20, durationInFrames - 60, durationInFrames], [0, 0.5, 0.5, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      }
    />
  )
}
