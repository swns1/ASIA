# admin-portal

The SLIS frontend: a single React 19 + Vite SPA that serves both the staff
portal and the guardian (parent) portal.

Setup, architecture, the backend services this talks to, and the database are
all documented in the **[repository README](../../README.md)** — start there.
This file exists only so nobody mistakes the Vite starter template that used
to sit here for real setup instructions (it described a TypeScript project
with plugins this app doesn't use).

## Commands

```sh
npm install
npm run dev      # Vite dev server on :5173
npm run lint     # eslint — the only static gate; there is no TypeScript here
npm run test     # vitest
npm run build    # production build
```

All four run in CI on every push — see `.github/workflows/ci.yml`.

## Layout

| Path | What's in it |
|---|---|
| `src/App.jsx` | The entire route table. Post-login pages are code-split via `lazyRoute()`. |
| `src/pages/` | One file per route, plus subfolders for pages split into parts. |
| `src/components/ui/` | The design system — `Button`, `Card`, `Table`, `Modal`, `Tabs`, `Badge`, `Skeleton`, … |
| `src/components/charts/` | Hand-rolled SVG charts; no charting library. |
| `src/api/` | One axios client per backend service, all built on `apiClient.js`. |
| `src/utils/` | Shared logic — `auth.js`, `validation.js`, `grading.js`, `attendance.js`. |
| `src/context/` | `SchoolYearContext` — the app-wide school-year selection. |

Two conventions worth knowing before editing:

- **Tailwind class strings must be complete literals.** Classes are extracted
  statically, so `bg-${variant}-500` silently renders unstyled. Map variants to
  whole strings instead (see `components/ui/Button.jsx`).
- **Tailwind v4 runs through PostCSS here**, configured in `postcss.config.js`
  — not through a Vite plugin.
