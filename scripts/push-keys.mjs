/**
 * Génère une paire de clés VAPID pour les notifications push.
 *   npm run push:keys
 * - Clé publique  → Vercel : VITE_VAPID_PUBLIC_KEY  (et Supabase : VAPID_PUBLIC_KEY)
 * - Clé privée    → Supabase uniquement : VAPID_PRIVATE_KEY (ne jamais la mettre dans Vercel ni dans Git)
 */
import { generateKeyPairSync } from 'node:crypto'

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const pub = publicKey.export({ format: 'jwk' })
const priv = privateKey.export({ format: 'jwk' })
const b64 = (s) => Buffer.from(s, 'base64url')
// Clé publique au format « point non compressé » (65 octets) attendu par les navigateurs.
const raw = Buffer.concat([Buffer.from([4]), b64(pub.x), b64(pub.y)]).toString('base64url')

console.log('VAPID_PUBLIC_KEY=' + raw)
console.log('VAPID_PRIVATE_KEY=' + priv.d)
