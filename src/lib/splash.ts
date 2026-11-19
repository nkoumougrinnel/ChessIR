/** Retire l'écran de lancement (défini dans index.html) une fois l'application prête. */
const MIN_VISIBLE_MS = 900
let done = false

export function hideSplash() {
  if (done) return
  done = true
  const el = document.getElementById('splash')
  if (!el) return
  const wait = Math.max(0, MIN_VISIBLE_MS - performance.now())
  window.setTimeout(() => {
    el.classList.add('hide')
    window.setTimeout(() => el.remove(), 500)
  }, wait)
}
