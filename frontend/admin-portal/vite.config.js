import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Every api/*.js falls back to http://localhost:800x when its VITE_* var is
 * unset. That is deliberate and documented for `npm run dev`, but a production
 * build inherits the same fallback silently: the build succeeds, and the bundle
 * ships pointing at localhost, so the deployed app loads and then fails every
 * request with what look like CORS errors. Nothing warns you -- the last build
 * baked localhost into 16 places without a word.
 *
 * So the fallbacks stay for dev, and a production build refuses to emit one
 * that would be wrong. To build against localhost on purpose, set the vars to
 * the localhost URLs explicitly; being explicit is the entire point.
 *
 * VITE_AUDIT_API_URL is not listed: it is a real optional override that falls
 * back to the identity base, which is itself covered below.
 */
const REQUIRED_PROD_ENV = [
  'VITE_IDENTITY_API_URL',
  'VITE_STUDENT_API_URL',
  'VITE_BILLING_API_URL',
  'VITE_ENROLLMENT_API_URL',
]

function assertApiUrlsConfigured(mode) {
  // '.' rather than process.cwd(): this file sits at the package root, which is
  // where the npm scripts run from, and `process` is not a defined global here.
  const env = loadEnv(mode, '.', 'VITE_')
  // loadEnv already merges VITE_-prefixed vars from the process environment on
  // top of the .env files, so this covers both a local .env.production and CI
  // passing them as step env -- without referencing `process`, which is not a
  // defined global under this project's eslint config.
  const missing = REQUIRED_PROD_ENV.filter((key) => !String(env[key] ?? '').trim())
  if (missing.length === 0) return

  throw new Error(
    [
      '',
      'Production build aborted -- required API URLs are not set:',
      ...missing.map((key) => `  - ${key}`),
      '',
      'Without them the bundle silently points at http://localhost and every',
      'API call fails once deployed. Set them in .env.production (see',
      '.env.example), or pass them in the build environment. To target',
      'localhost deliberately, set them to the localhost URLs explicitly.',
      '',
    ].join('\n'),
  )
}

/**
 * @tabler/icons-webfont declares one @font-face listing woff2, woff and ttf.
 * A browser downloads only the first format it supports — so in practice every
 * user fetches the 457 kB woff2 — but the build still *emits* all three,
 * putting 3.6 MB of dead weight into dist/ that has to be uploaded, stored and
 * served on the off-chance a browser from 2015 arrives. woff2 has been
 * supported everywhere since then, and this app targets React 19 + ES modules,
 * which rules out anything that would need the fallbacks anyway.
 *
 * Done as a transform rather than by vendoring a trimmed copy of the CSS so a
 * `npm update @tabler/icons-webfont` still picks up new glyphs; there is no
 * second copy to fall out of sync. `enforce: 'pre'` matters — this has to run
 * before vite:css resolves the url() references, or the woff and ttf get
 * emitted as assets before we drop them.
 */
function tablerIconsWoff2Only() {
  return {
    name: 'tabler-icons-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@tabler/icons-webfont')) return null
      if (!code.includes('@font-face')) return null

      // Only the first src: in the file — there is exactly one @font-face.
      const trimmed = code.replace(/src:([^;}]*)/, (match, sources) => {
        const woff2 = sources.split(',').find((source) => source.includes('woff2'))
        return woff2 ? `src:${woff2.trim()}` : match
      })

      return { code: trimmed, map: null }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  if (mode === 'production') assertApiUrlsConfigured(mode)

  return {
    plugins: [react(), tablerIconsWoff2Only()],
  }
})
