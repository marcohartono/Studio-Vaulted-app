/**
 * Key generator script.
 * Run: npm run generate-key [count]
 *
 * Generates valid Studio Vaulted license keys in the format:
 *   SVL-XXXXXXXX-YYYYYYYY
 * where YYYYYYYY is the first 8 hex chars of HMAC-SHA256(APP_SECRET, XXXXXXXX).
 */
import crypto from 'node:crypto'

const APP_SECRET = process.env.APP_SECRET ?? 'sv-2025-k9x#mLp!qR7nWz'
const count = Number(process.argv[2] ?? 1)

for (let i = 0; i < count; i++) {
  const nonce = crypto.randomBytes(4).toString('hex').toUpperCase()
  const sig = crypto
    .createHmac('sha256', APP_SECRET)
    .update(nonce)
    .digest('hex')
    .substring(0, 8)
    .toUpperCase()
  console.log(`SVL-${nonce}-${sig}`)
}
