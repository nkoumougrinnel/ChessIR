"""Effets sonores de la vidéo, synthétisés (aucun fichier externe).

    python3 scripts/sfx.py   ->  public/sfx/*.wav
"""
import os
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'sfx')
os.makedirs(OUT, exist_ok=True)


def t(d):
    return np.linspace(0, d, int(SR * d), endpoint=False)


def env(n, a=0.005, r=0.2):
    x = np.ones(n)
    ai = max(1, int(SR * a))
    x[:ai] = np.linspace(0, 1, ai)
    tt = np.arange(n) / SR
    return x * np.exp(-tt / r)


def tone(f, d, r=0.25, harm=(1, 0.35, 0.12)):
    tt = t(d)
    y = sum(a * np.sin(2 * np.pi * f * (i + 1) * tt) for i, a in enumerate(harm))
    return y * env(len(tt), r=r)


def mix(parts, total):
    out = np.zeros(int(SR * total))
    for start, y in parts:
        i = int(SR * start)
        out[i : i + len(y)] += y[: len(out) - i]
    return out


def save(name, y, gain=0.8):
    y = y / (np.max(np.abs(y)) + 1e-9) * gain
    wavfile.write(os.path.join(OUT, name), SR, (y * 32767).astype(np.int16))
    print('✓', name)


# Notification : deux notes cristallines
save('notif.wav', mix([(0, tone(1318.5, 0.5, 0.18)), (0.11, tone(1760, 0.7, 0.25))], 0.9), 0.7)
# Toucher : petit clic sec
n = t(0.06)
save('tap.wav', np.random.default_rng(1).normal(0, 1, len(n)) * env(len(n), 0.001, 0.008) + np.sin(2 * np.pi * 2200 * n) * env(len(n), 0.001, 0.01), 0.55)
# Glissement : bruit filtré qui monte
d = 0.45
noise = np.random.default_rng(2).normal(0, 1, int(SR * d))
b, a = butter(2, [400 / (SR / 2), 4000 / (SR / 2)], 'band')
w = lfilter(b, a, noise) * np.sin(np.linspace(0, np.pi, len(noise))) ** 2
save('whoosh.wav', w, 0.45)
# Message envoyé : « pop » descendant
tt = t(0.18)
save('pop.wav', np.sin(2 * np.pi * (900 - 2400 * tt) * tt) * env(len(tt), 0.002, 0.06), 0.6)
# Tic du compte à rebours
save('tick.wav', tone(2400, 0.05, 0.012, (1,)), 0.35)
# Victoire : arpège majeur + accord tenu
notes = [523.25, 659.25, 783.99, 1046.5]
parts = [(i * 0.09, tone(f, 0.5, 0.3)) for i, f in enumerate(notes)]
parts += [(0.4, tone(f, 1.4, 0.7) * 0.6) for f in (523.25, 659.25, 783.99, 1046.5)]
save('victoire.wav', mix(parts, 2.0), 0.75)
# Échec et mat : coup sourd de la pièce posée
tt = t(0.25)
save('coup.wav', (np.sin(2 * np.pi * 140 * tt) + 0.4 * np.random.default_rng(3).normal(0, 1, len(tt))) * env(len(tt), 0.001, 0.04), 0.7)
# Direct : petit « ding-dong » grave
save('direct.wav', mix([(0, tone(880, 0.5, 0.22)), (0.16, tone(659.25, 0.8, 0.3))], 1.0), 0.65)
