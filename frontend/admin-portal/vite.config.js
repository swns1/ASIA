import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
export default defineConfig({
  plugins: [react(), tablerIconsWoff2Only()],
})
