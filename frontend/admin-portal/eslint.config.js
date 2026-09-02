import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // This app fetches data with plain useEffect + setState (no Suspense/data
      // library), which is exactly what this rule flags. Downgraded to warn
      // rather than rearchitecting data-fetching across the whole app.
      'react-hooks/set-state-in-effect': 'warn',
      // Context modules pair a Provider component with a `useX` accessor hook
      // in the same file by design — allow that one named export per file.
      'react-refresh/only-export-components': ['error', { allowExportNames: ['useSchoolYear'] }],

      // Contrast guard. Each literal below was measured against the app surface
      // (--color-neutral-50, #fdf8f6) and failed WCAG AA for text — the palest
      // sat at 1.2:1 against a 4.5:1 requirement. styles/tokens.css already
      // named three of them as banned and they were still in use ~300 times,
      // so the rule is the enforcement the comment never had.
      //
      // Deliberately a denylist of known-bad values, not a ban on all hex:
      // ~3,000 legitimate hex literals remain in the pages (borders, fills,
      // tints), so a blanket rule would report thousands of violations on day
      // one and simply get switched off. Migrating those to tokens is a
      // separate, ongoing job; this rule only stops the failures coming back.
      //
      // Use instead: #8a6a6a (neutral-500, muted text) · #855c5c (neutral-600,
      // secondary) · #7a5050 (neutral-700, body) · #2e6b0d / #854f0b / #9b2020
      // / #1455a0 (success / warning / error / info).
      //
      // Not covered here: the reserved risk palette in pages/analytics/
      // riskVocabulary.js (#0ca30c, #fab219, #ec835a). Those are under 3:1 by
      // design and legitimate — they only ever fill a small chart swatch or dot
      // beside dark ink, always with an icon and text label, never as text.
      'no-restricted-syntax': [
        'error',
        {
          // Tier 1 — the pale warm neutrals, banned in ANY position. Between
          // 1.2:1 and 3.9:1, they are too light to be legible as text and too
          // light to bound a control (1.4.11 wants 3:1), and the palette
          // already has real tokens for borders and fills. There is no context
          // in which one of these is the right answer.
          selector:
            'Literal[value=/^#(?:b09090|c0a0a0|9a7070|cdb0b0|c8b0b0|c8a8a8|e8a0a0|e0a0a0|e8d0d0|f0c8c8|c0a8a8|c09090|e08080|a07878|8a7a7a|c0a0c0|94a3b8)$/i]',
          message:
            'This colour is too light for text (WCAG AA 4.5:1) or for a control boundary (1.4.11, 3:1). Use a token from styles/tokens.css — #8a6a6a (muted), #855c5c (secondary), #7a5050 (body).',
        },
        {
          // Tier 2 — saturated hues that ARE legitimate as a bar fill, a dot or
          // a categorical chart swatch, but fail AA once they carry text
          // (#16a34a is 3.1:1 even on its own tint). So these are restricted by
          // POSITION, not outright: flagged only in a `color:` style property.
          // A blanket ban would fire on the progress-bar fill in
          // BillingSettingsPage and the categorical palette in
          // GradingSettingsPage, both of which are correct as written.
          selector:
            'Property[key.name="color"] > Literal[value=/^#(?:16a34a|d97706|c27a12|f57f17|0891b2|0e9488|c0504a|757575)$/i]',
          message:
            'This hue fails WCAG AA as text (under 4.5:1, even on its own tint). It is fine as a fill or chart swatch — but for text use the semantic token: #2e6b0d success, #854f0b warning, #9b2020 error, #1455a0 info, #5c5752 muted.',
        },
        {
          // Same as tier 2, for the imperative `el.style.color = "#..."` form
          // used by the onMouseLeave hover handlers throughout the pages.
          selector:
            'AssignmentExpression[left.property.name="color"] > Literal[value=/^#(?:16a34a|d97706|c27a12|f57f17|0891b2|0e9488|c0504a|757575)$/i]',
          message:
            'This hue fails WCAG AA as text. Use a semantic token from styles/tokens.css.',
        },
      ],
    },
  },
  {
    // Test files run in Node under vitest, not in the browser, so they may
    // reach for node globals and builtins (`process`, `node:fs`) that the
    // browser-globals config above would flag as undefined.
    files: ['**/*.test.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
])
