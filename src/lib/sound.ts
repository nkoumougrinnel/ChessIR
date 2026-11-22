/**
 * Sons des alertes (défi reçu, match en direct), générés à la volée : aucun fichier à télécharger.
 *
 * - Activé par défaut ; réglage mémorisé sur l'appareil (interrupteur dans le profil).
 * - Les navigateurs n'autorisent le son qu'après un premier geste dans la page : le
 *   contexte audio est « débloqué » au premier toucher, sans rien jouer.
 * - Vibration en plus du son (Android ; l'iPhone ne vibre pas depuis une app web).
 */
import { useEffect, useState } from 'react'

const KEY = 'chessir-sound'
let ctx: AudioContext | null = null
const listeners = new Set<() => void>()

export function soundEnabled() {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* stockage indisponible */
  }
  listeners.forEach((l) => l())
  if (on) void play('live')
}

export function useSoundEnabled() {
  const [on, setOn] = useState(soundEnabled)
  useEffect(() => {
    const l = () => setOn(soundEnabled())
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return [on, setSoundEnabled] as const
}

function audio() {
  if (ctx) return ctx
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  return ctx
}

/** À appeler une fois : débloque le son au premier geste de l'utilisateur. */
export function initSound() {
  const unlock = () => {
    const c = audio()
    if (c?.state === 'suspended') void c.resume()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

type Note = [freq: number, start: number, duration: number]

const TUNES: Record<'challenge' | 'live', Note[]> = {
  // Défi : appel insistant (deux fois deux notes montantes).
  challenge: [
    [659, 0, 0.12],
    [880, 0.13, 0.18],
    [659, 0.42, 0.12],
    [880, 0.55, 0.22],
  ],
  // Direct : petite fanfare.
  live: [
    [523, 0, 0.1],
    [659, 0.1, 0.1],
    [784, 0.2, 0.1],
    [1047, 0.3, 0.3],
  ],
}

export async function play(kind: 'challenge' | 'live') {
  if (!soundEnabled()) return
  navigator.vibrate?.(kind === 'challenge' ? [200, 100, 200, 100, 300] : [150, 80, 150])
  const c = audio()
  if (!c) return
  // Pas encore de geste dans la page : silence (la vibration suffit), sans jouer en différé plus tard.
  if (c.state !== 'running') {
    void c.resume().catch(() => undefined)
    return
  }
  const t0 = c.currentTime + 0.02
  for (const [freq, start, dur] of TUNES[kind]) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t0 + start)
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + start + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur)
    osc.connect(gain).connect(c.destination)
    osc.start(t0 + start)
    osc.stop(t0 + start + dur + 0.05)
  }
}
