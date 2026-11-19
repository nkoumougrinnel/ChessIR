/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Numéro de version unique par déploiement (commit Vercel, sinon horodatage).
 * Il est inclus dans l'application et publié dans /version.json : l'application
 * installée compare les deux pour savoir qu'une mise à jour est en ligne.
 */
const APP_VERSION = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 12) || `local-${Date.now()}`

function versionFile(): Plugin {
  return {
    name: 'chessir-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), versionFile()],
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  build: { chunkSizeWarningLimit: 600 },
  test: {
    include: ['tests/*.test.ts'],
  },
})
