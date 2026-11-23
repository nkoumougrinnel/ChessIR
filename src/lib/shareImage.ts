/**
 * Images de partage (WhatsApp…) dessinées dans le navigateur avec <canvas>.
 * Format 1080×1350 (4:5), aux couleurs de Chess IR. Aucune dépendance, aucune
 * image externe (les avatars sont dessinés en initiales pour éviter les
 * restrictions d'images d'autres sites).
 */

export const W = 1080
export const H = 1350

const C = {
  night: '#05061a',
  ink: '#eef0ff',
  muted: '#9aa0c8',
  faint: '#6a7099',
  gold: '#f5b83d',
  goldLight: '#ffd577',
  win: '#34d399',
  draw: '#7aa2ff',
  loss: '#f87171',
  card: 'rgba(17, 20, 54, 0.82)',
  line: 'rgba(255, 255, 255, 0.08)',
}

const AVATAR: Record<string, [string, string]> = {
  violet: ['#8b7cff', '#4b3bd1'],
  gold: ['#ffd577', '#b87613'],
  blue: ['#6aa8ff', '#2a55c9'],
  emerald: ['#4fe0a8', '#11896a'],
  rose: ['#ff8fb0', '#c33a6b'],
  cyan: ['#6fe7ff', '#1b8fb3'],
  orange: ['#ffb071', '#d4581d'],
  slate: ['#a6add6', '#4a5185'],
}

const DISPLAY = '"Barlow Semi Condensed", "Inter", system-ui, sans-serif'
const BODY = '"Inter", system-ui, sans-serif'

let logoPromise: Promise<HTMLImageElement | null> | null = null
function loadLogo() {
  logoPromise ??= new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = '/icon-512.png'
  })
  return logoPromise
}

async function ready() {
  try {
    await Promise.all([
      document.fonts.load(`700 64px ${DISPLAY}`),
      document.fonts.load(`600 40px ${DISPLAY}`),
      document.fonts.load(`500 32px ${BODY}`),
    ])
  } catch {
    /* polices système en secours */
  }
  return loadLogo()
}

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent = false) {
  roundRect(ctx, x, y, w, h, 36)
  ctx.fillStyle = C.card
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = accent ? 'rgba(245, 184, 61, 0.45)' : C.line
  ctx.stroke()
}

/** Texte tronqué avec « … » s'il dépasse `maxWidth`. */
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  opts: { size: number; weight?: number; color?: string; font?: string; align?: CanvasTextAlign; maxWidth?: number },
) {
  ctx.font = `${opts.weight ?? 600} ${opts.size}px ${opts.font ?? DISPLAY}`
  ctx.fillStyle = opts.color ?? C.ink
  ctx.textAlign = opts.align ?? 'left'
  ctx.textBaseline = 'alphabetic'
  let v = value
  if (opts.maxWidth) {
    while (v.length > 1 && ctx.measureText(v).width > opts.maxWidth) v = v.slice(0, -1)
    if (v !== value) v = v.trimEnd() + '…'
  }
  ctx.fillText(v, x, y)
}

function goldText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, align: CanvasTextAlign = 'left') {
  ctx.font = `700 ${size}px ${DISPLAY}`
  ctx.textAlign = align
  const g = ctx.createLinearGradient(0, y - size, 0, y)
  g.addColorStop(0, '#ffe6a8')
  g.addColorStop(1, '#e09a24')
  ctx.fillStyle = g
  ctx.fillText(value, x, y)
}

function initials(name: string) {
  const p = name.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? p[0]?.[1] ?? '')).toUpperCase()
}

function avatar(ctx: CanvasRenderingContext2D, name: string, color: string, cx: number, cy: number, r: number, ring = false) {
  const [a, b] = AVATAR[color] ?? AVATAR.violet
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
  g.addColorStop(0, a)
  g.addColorStop(1, b)
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
  if (ring) {
    ctx.lineWidth = 6
    ctx.strokeStyle = C.gold
    ctx.stroke()
  }
  ctx.font = `700 ${Math.round(r * 0.78)}px ${DISPLAY}`
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initials(name), cx, cy + 2)
  ctx.textBaseline = 'alphabetic'
}

function pieceDot(ctx: CanvasRenderingContext2D, color: 'white' | 'black', x: number, y: number, r = 11) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = color === 'white' ? '#fff' : '#000'
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'
  ctx.stroke()
}

/** Fond commun : nuit, halo violet, lueur dorée et damier en perspective. */
function background(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = C.night
  ctx.fillRect(0, 0, W, H)
  let g = ctx.createRadialGradient(W / 2, -60, 40, W / 2, -60, 900)
  g.addColorStop(0, 'rgba(98, 76, 230, 0.55)')
  g.addColorStop(1, 'rgba(98, 76, 230, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Damier en perspective (bas de l'image)
  const horizon = 1040
  const rows = 7
  const cols = 14
  const topHalf = 380
  const bottomHalf = 1500
  const yAt = (t: number) => horizon + (H - horizon) * t * t
  for (let i = 0; i < rows; i++) {
    const t0 = i / rows
    const t1 = (i + 1) / rows
    const y0 = yAt(t0)
    const y1 = yAt(t1)
    const h0 = topHalf + (bottomHalf - topHalf) * t0 * t0
    const h1 = topHalf + (bottomHalf - topHalf) * t1 * t1
    for (let j = 0; j < cols; j++) {
      if ((i + j) % 2) continue
      const u0 = j / cols
      const u1 = (j + 1) / cols
      ctx.beginPath()
      ctx.moveTo(W / 2 - h0 + 2 * h0 * u0, y0)
      ctx.lineTo(W / 2 - h0 + 2 * h0 * u1, y0)
      ctx.lineTo(W / 2 - h1 + 2 * h1 * u1, y1)
      ctx.lineTo(W / 2 - h1 + 2 * h1 * u0, y1)
      ctx.closePath()
      ctx.fillStyle = `rgba(150, 150, 255, ${0.05 + 0.1 * t1})`
      ctx.fill()
    }
  }
  g = ctx.createRadialGradient(W / 2, horizon, 10, W / 2, horizon, 520)
  g.addColorStop(0, 'rgba(245, 184, 61, 0.22)')
  g.addColorStop(1, 'rgba(245, 184, 61, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, horizon - 300, W, H - horizon + 300)
}

function header(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, kicker: string) {
  if (logo) {
    ctx.save()
    roundRect(ctx, 72, 66, 96, 96, 26)
    ctx.clip()
    ctx.drawImage(logo, 72, 66, 96, 96)
    ctx.restore()
  }
  text(ctx, 'Chess', 192, 132, { size: 58, weight: 700 })
  ctx.font = `700 58px ${DISPLAY}`
  const w = ctx.measureText('Chess ').width
  goldText(ctx, 'IR', 192 + w, 132, 58)
  text(ctx, kicker.toUpperCase(), W - 72, 124, { size: 30, weight: 600, color: C.goldLight, align: 'right', maxWidth: 520 })
}

function footer(ctx: CanvasRenderingContext2D, url: string) {
  text(ctx, url.replace(/^https?:\/\//, ''), W / 2, H - 92, { size: 30, weight: 600, color: C.ink, align: 'center' })
  text(ctx, 'Jouer. Progresser. Grimper.', W / 2, H - 50, { size: 26, weight: 500, color: C.muted, align: 'center', font: BODY })
}

async function render(draw: (ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null) => void): Promise<Blob> {
  const logo = await ready()
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  background(ctx)
  draw(ctx, logo)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image impossible à générer'))), 'image/png'),
  )
}

/* ------------------------------------------------------------------ */
/* Modèles                                                             */
/* ------------------------------------------------------------------ */

export interface SharePlayer {
  name: string
  color: string
  chesscom?: string | null
}

/** Annonce d'un match (avant) ou résultat (après). */
export function renderMatchCard(o: {
  kicker: string
  white: SharePlayer
  black: SharePlayer
  when: string
  result?: 'white_win' | 'black_win' | 'draw' | null
  /** Match en cours sur Chess.com (partage depuis l'Arène). */
  live?: boolean
  url: string
}) {
  return render((ctx, logo) => {
    header(ctx, logo, o.kicker)
    card(ctx, 72, 250, W - 144, 700, true)
    if (o.live) {
      // Pastille « EN DIRECT » au-dessus de la date.
      roundRect(ctx, W / 2 - 150, 214, 300, 72, 36)
      ctx.fillStyle = C.loss
      ctx.fill()
      ctx.beginPath()
      ctx.arc(W / 2 - 100, 250, 12, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      text(ctx, 'EN DIRECT', W / 2 + 18, 263, { size: 38, weight: 700, color: '#ffffff', align: 'center' })
    }
    text(ctx, o.when, W / 2, 345, { size: 36, weight: 600, color: C.muted, align: 'center', maxWidth: W - 220 })

    const side = (p: SharePlayer, color: 'white' | 'black', cx: number, won: boolean | null) => {
      avatar(ctx, p.name, p.color, cx, 520, 112, won === true)
      text(ctx, p.name, cx, 700, { size: 50, weight: 700, align: 'center', maxWidth: 380 })
      pieceDot(ctx, color, cx - 62, 752)
      text(ctx, color === 'white' ? 'Blancs' : 'Noirs', cx - 40, 763, { size: 32, weight: 500, color: C.muted, font: BODY })
      if (p.chesscom) text(ctx, `@${p.chesscom}`, cx, 815, { size: 28, weight: 500, color: '#8fa8ff', align: 'center', font: BODY, maxWidth: 380 })
    }
    const r = o.result
    side(o.white, 'white', 300, r ? r === 'white_win' : null)
    side(o.black, 'black', W - 300, r ? r === 'black_win' : null)
    goldText(ctx, 'VS', W / 2, 545, 92, 'center')

    if (r) {
      const label = r === 'draw' ? 'Match nul' : `Victoire de ${r === 'white_win' ? o.white.name : o.black.name}`
      const color = r === 'draw' ? C.draw : C.win
      roundRect(ctx, 150, 860, W - 300, 66, 33)
      ctx.fillStyle = r === 'draw' ? 'rgba(122,162,255,0.16)' : 'rgba(52,211,153,0.16)'
      ctx.fill()
      text(ctx, label, W / 2, 907, { size: 36, weight: 700, color, align: 'center', maxWidth: W - 340 })
    } else if (o.live) {
      text(ctx, 'La partie se joue maintenant : venez regarder !', W / 2, 905, { size: 34, weight: 600, color: C.loss, align: 'center', maxWidth: W - 220 })
    } else {
      text(ctx, 'La partie commence sur Chess.com !', W / 2, 905, { size: 34, weight: 600, color: C.goldLight, align: 'center' })
    }
    footer(ctx, o.url)
  })
}

/** Classement (général ou de la semaine). */
export function renderStandingsCard(o: {
  kicker: string
  title: string
  rows: Array<{ rank: number; name: string; color: string; points: number; record: string; highlight?: boolean }>
  url: string
}) {
  return render((ctx, logo) => {
    header(ctx, logo, o.kicker)
    text(ctx, o.title, 72, 250, { size: 64, weight: 700, maxWidth: W - 144 })
    const rows = o.rows.slice(0, 10)
    const top = 290
    const rowH = 72
    card(ctx, 72, top, W - 144, rowH * rows.length + 40)
    rows.forEach((r, i) => {
      const y = top + 20 + i * rowH
      if (r.highlight) {
        roundRect(ctx, 88, y + 4, W - 176, rowH - 8, 18)
        ctx.fillStyle = 'rgba(245,184,61,0.14)'
        ctx.fill()
      }
      const rankColor = r.rank <= 3 ? C.goldLight : C.muted
      text(ctx, String(r.rank), 130, y + 50, { size: 40, weight: 700, color: rankColor, align: 'center' })
      avatar(ctx, r.name, r.color, 205, y + 36, 24)
      text(ctx, r.name, 248, y + 49, { size: 38, weight: 600, maxWidth: 470 })
      text(ctx, r.record, 820, y + 48, { size: 28, weight: 500, color: C.muted, align: 'right', font: BODY })
      text(ctx, `${r.points}`, W - 112, y + 50, { size: 42, weight: 700, color: C.ink, align: 'right' })
    })
    text(ctx, 'Victoire 3 · Nul 1 · Défaite 0', W / 2, top + rowH * rows.length + 100, {
      size: 28,
      weight: 500,
      color: C.faint,
      align: 'center',
      font: BODY,
    })
    footer(ctx, o.url)
  })
}

const EMOJI: Record<string, string> = {
  crown: '👑',
  zap: '⚡',
  'trending-up': '📈',
  flame: '🔥',
  footprints: '👣',
  star: '⭐',
  'calendar-check': '📅',
  medal: '🏅',
  swords: '⚔️',
}

/** Distinction ou badge obtenu. */
export function renderAwardCard(o: { kicker: string; award: string; description: string; icon: string; player: SharePlayer; url: string }) {
  return render((ctx, logo) => {
    header(ctx, logo, o.kicker)
    // Écusson doré
    const cx = W / 2
    const cy = 520
    const glow = ctx.createRadialGradient(cx, cy, 20, cx, cy, 330)
    glow.addColorStop(0, 'rgba(245,184,61,0.35)')
    glow.addColorStop(1, 'rgba(245,184,61,0)')
    ctx.fillStyle = glow
    ctx.fillRect(cx - 340, cy - 340, 680, 680)
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2
      const x = cx + 190 * Math.cos(a)
      const y = cy + 190 * Math.sin(a)
      if (i) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    }
    ctx.closePath()
    ctx.fillStyle = '#17122e'
    ctx.fill()
    const stroke = ctx.createLinearGradient(0, cy - 190, 0, cy + 190)
    stroke.addColorStop(0, '#ffe6a8')
    stroke.addColorStop(1, '#c47d14')
    ctx.lineWidth = 14
    ctx.strokeStyle = stroke
    ctx.stroke()
    ctx.font = `150px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(EMOJI[o.icon] ?? '🏆', cx, cy + 8)
    ctx.textBaseline = 'alphabetic'

    goldText(ctx, o.award, cx, 840, 76, 'center')
    text(ctx, o.description, cx, 900, { size: 32, weight: 500, color: C.muted, align: 'center', font: BODY, maxWidth: W - 200 })
    avatar(ctx, o.player.name, o.player.color, cx - 200, 1000, 40, true)
    text(ctx, o.player.name, cx - 140, 1015, { size: 46, weight: 700, maxWidth: 480 })
    footer(ctx, o.url)
  })
}

/** Tirage de la semaine : les trois rondes. */
export function renderDrawCard(o: {
  kicker: string
  title: string
  rounds: Array<{ label: string; pairs: Array<[string, string]>; bye?: string | null }>
  url: string
}) {
  return render((ctx, logo) => {
    header(ctx, logo, o.kicker)
    text(ctx, o.title, 72, 240, { size: 60, weight: 700, maxWidth: W - 144 })
    const maxPairs = Math.max(...o.rounds.map((r) => r.pairs.length), 1)
    const cols = maxPairs > 8 ? 2 : 1
    const linesOf = (r: (typeof o.rounds)[number]) => Math.ceil(r.pairs.length / cols) + (r.bye ? 1 : 0)
    const totalLines = o.rounds.reduce((n, r) => n + Math.max(linesOf(r), 1), 0)
    const available = 1230 - 280 - o.rounds.length * (76 + 22)
    const lineH = Math.max(26, Math.min(48, Math.floor(available / Math.max(totalLines, 1))))
    const size = Math.max(20, Math.min(34, lineH - 12))
    const colW = (W - 216) / cols
    const nameMax = cols === 2 ? colW / 2 - 40 : 380
    let y = 280
    for (const r of o.rounds) {
      const h = 76 + Math.max(linesOf(r), 1) * lineH
      card(ctx, 72, y, W - 144, h)
      text(ctx, r.label, 108, y + 52, { size: 34, weight: 700, color: C.goldLight })
      r.pairs.forEach(([w, b], i) => {
        const col = cols === 2 ? i % 2 : 0
        const line = cols === 2 ? Math.floor(i / 2) : i
        const x0 = 108 + col * colW
        const ly = y + 70 + (line + 1) * lineH - 10
        const mid = x0 + (cols === 2 ? colW / 2 : (W - 216) / 2)
        pieceDot(ctx, 'white', x0 + 8, ly - size / 3, 7)
        text(ctx, w, x0 + 24, ly, { size, weight: 600, maxWidth: nameMax })
        pieceDot(ctx, 'black', mid + 4, ly - size / 3, 7)
        text(ctx, b, mid + 20, ly, { size, weight: 600, maxWidth: nameMax })
      })
      if (r.bye) {
        const ly = y + 70 + (Math.ceil(r.pairs.length / cols) + 1) * lineH - 10
        text(ctx, `Exempt : ${r.bye}`, 116, ly, { size: size - 2, weight: 500, color: C.muted, font: BODY })
      }
      y += h + 22
    }
    footer(ctx, o.url)
  })
}
