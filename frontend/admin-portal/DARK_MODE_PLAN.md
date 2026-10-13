# Dark mode: plan for the remaining pages

For agents converting pages to dark mode. Read all of it before editing.
Paths are relative to `frontend/admin-portal/src/` unless they start with
`frontend/` or `/`.

**Status (2026-10-12): dark mode is live for every staff member.** Rounds 1–3
are committed (728ee96b); rounds 4 and 5 (below) are uncommitted, awaiting the
user's visual check. 28 entries in `DARK_READY_PAGES` cover every staff page
under the shell (My Settings included), both dashboards, and the student and
enrollment forms. Still light by
design: login, /apply, report card, /print/*, NotFound. The guardian portal
went dark-ready on 2026-10-13 (round 6, below).
Open questions and findings: `.claude/darkmode/findings.md`.

**Round 2 (2026-10-11), the user's answers:** fixed the three bugs (Invoices
discounts heading → `text-warning-600`; the My Sections Passed/Failed chip's
tint; Mass Enroll's `??` precedence). Fixed fills for the green and blue
confirm buttons (`--color-success-fill(-2)`, `--color-info-fill(-2)`), which,
unlike the red ones, take lifted values in dark. Dark fee-range line on
Compare #4a3030 → #9a5a5a. Section headers (My Sections, Sections, the
unadvised section) are the brand panel in dark; level tiles glow
(`LEVEL_GLOW` in statusTones.js). Also: faint `text-neutral-400` text gets
`dark:text-neutral-500`; dead legacy CSS and unused Calendar rules removed;
paymentMethods' unused `color`/`bg` dropped; 13 icon-only buttons named.

**Round 3 (2026-10-11):** the Calendar's day hover works (a day with events,
not the selected one or today's circle); Invoices' Net Amount Due lines are
solid white (dimmer whites fail on the action red); Student Detail's ledger
labels are 11px; school-level colours are one palette app-wide (the level
tokens: My Sections and Fee Schedules moved onto them, with `LEVEL_GLOW`).
Staff don't get the switch for now.

**Round 4 (2026-10-11):** every text size under 11px raised to 11px (icons
and the print sheets excepted; the Calendar's event strips trimmed to 1px
padding to fit). Dark mode opened to all staff: `useAppTheme` gates on
STAFF_ALL (guardians light), works in production builds, and keeps one choice
per person (`asia.theme.<user id>`). The Developer tab is gone.
StaffDashboard converted (NotificationBell panel `bg-surface-raised` +
MENU_DARK, lit tiles, `ring-surface` dot, the stat filters `bg-surface`).

**Round 5 (2026-10-12):** the setting moved from the sidebar to each person's
own page, **My Settings** (`/my-settings`, `pages/MySettingsPage.jsx`, every
staff role), linked from the foot of the sidebar above the account card (the
link is drawn like a nav item: `SidebarLink` in Sidebar.jsx). The page has
the theme (three cards, each with a picture of the portal in that theme,
drawn in fixed colours) and the account's Change password and Log out (the
sidebar's account card lost its key and log-out buttons: the page is the one
place for both; Log out still confirms). `ThemeSwitch.jsx` is gone. Section tiles on Sections and My Sections show their level's icon
(`LEVEL_ICONS`), so a level doesn't rest on colour alone.

---

## 0. Ground rules (set by the user)

- **Light stays the default and must look identical.** Zero light drift:
  every light colour, size and position stays exactly as it was (§2 says how).
- **Branded dark is the approved look:** the login page's brand panel
  (`#180c0c`, dot grid, red corner glows), glass controls, lit icon tiles.
  **Glows hold still** (no drift animation, ever).
- **The switch is every staff member's own:** the Theme setting on their My
  Settings page (`pages/MySettingsPage.jsx`, linked from the foot of the
  sidebar), Light / Dark / Auto (same as my computer), kept per person in
  this browser, in every build. Guardians choose on the portal's own My
  settings (`pages/GuardianSettingsPage.jsx`, round 6); anyone signed out
  gets light. (Until 2026-10-11 it was an admin-only dev tool in Billing Settings
  › Developer; that tab is gone. On 2026-10-11 it sat in the sidebar itself.)
- **Restyle only.** No behaviour changes. Don't add or remove attributes other
  than `className`, `style` and `data-theme` (not even `aria-*` or
  `type="button"`; list such findings in your report instead). Don't split,
  move or rename code, and don't reformat lines you aren't changing.
- **Questions go to the user, never guessed:** if a page needs a decision only
  the user can make (a visible light change, a behaviour change, a design
  choice with no precedent here), skip that page, leave its route out of
  `DARK_READY_PAGES`, finish the rest, and put the question in your report.
- **Process:** never commit. Don't verify UI in a browser; the user does. Run
  the checks in §5.
- **Stays light by design (don't convert):** `/login`, `/apply/:inviteId`,
  `/report-card/:id`, `/print/*`, NotFound, in-page print
  windows (the QR card `<style>` in StudentApplicationsPage), and the
  Calendar's print sheets (portalled to `<body>`).

---

## 1. How dark mode works

| Piece | File | What it gives you |
|---|---|---|
| Dark token set | `styles/tokens.css` `[data-theme="dark"] {…}` | Dark values for every neutral, brand, status and level token. Utilities compile to `var(--color-*)`, so **every token class re-colours inside a dark container with no class changes.** |
| New tokens (light = old literal) | `styles/tokens.css` | `surface` / `surface-raised` (what `bg-white` meant) · `action` / `action-2` (fills under white text) · `danger` (destructive fill) · `on-panel`, `on-panel-muted`, `on-panel-faint` (text on the brand panel) · shadows `card-dark`, `float-dark`, `panel-glow` (use via `dark:`) · `:root` vars `--avatar-N-bg/fg`, `--skeleton*`, `--scrollbar-thumb`, `--chart-*`, `--toast-*` |
| `dark:` variant | `styles/tokens.css` `@custom-variant dark` | "Inside a `[data-theme="dark"]` container", not the OS setting. |
| Theme state | `hooks/useTheme.js` | `useTheme()` = the theme of the area a component sits in (**use this in pages**) · `usePageTheme()` = the current route's page theme (for what floats over a page) · `useAppTheme()` = shell only |
| Per-page opt-in | `constants/darkReady.js` | A page goes dark only once its anchored regex is listed. |
| Scoping | `components/AppLayout.jsx`, `components/ThemeArea.jsx` | AppLayout themes the sidebar and the page area (+ `PageGlow`). **ThemeArea** does the same for the full-page forms, which have no shell: replace the form's root `<div className="min-h-screen bg-neutral-50">` with `<ThemeArea className="min-h-screen bg-neutral-50">`. |
| Floating layers | `components/AppToaster.jsx`, `components/SessionTimeoutWarning.jsx` | Toasts and the session warning take the page's theme. Done. |
| Brand look | `ui/BrandBackdrop.jsx` · `ui/Card.jsx` `brandPanel` · `ui/brandPanel.js` | `GLASS_FIELD`, `GLASS_SEARCH`, `GLASS_BUTTON` (controls on the panel), `BRAND_PANEL_DARK` (a lead block that isn't a Card) |
| Hand-built surfaces | `ui/darkSurfaces.js` | `CARD_DARK` (card-like block), `MENU_DARK` (menu/popover), `DIALOG_DARK` (dialog body), `SELECTED_DARK` (chosen option): the exact classes Card, FilterMenu, Modal and Pagination use. |
| Lit icon tiles | `constants/statusTones.js` `CHIP_GLOW[tone]`, `LEVEL_GLOW[level]` | Append to an icon tile's tone classes (school-level tiles take LEVEL_GLOW). |
| Charts | `components/charts/tokens.js` | `token(name, theme)`, `chartInk(theme)` (`plane`, `dot`, `onMark`), `levelColor(level, theme)`. SVG attributes need resolved colours, never `var()`. |

**Dark-ready shared pieces (use as they are, don't edit):** every `components/ui/*`
(incl. SegmentedControl, StepBar, ToggleCard, RangeMenu, FilterBar,
SummaryList, Tabs), FormField, EmptyState, ConfirmModal, Pagination, Sidebar,
RecordPaymentModal, `components/charts/*` except `compare/*`, toasts, the
session warning, `.search-wrap` / `.row-action` (index.css), and
`constants/observedValues.js` (now `var()` strings).

---

## 2. Conversion rules

**Principle: the smallest edit that keeps light identical and makes dark right.**

| You find | Replace with |
|---|---|
| A literal with an **exact** token (§3) | That token: a class in `className`, or `var(--color-…)` in an inline style, SVG excepted. Pick by meaning when two share a hex (`#fde8e8` = `brand-200` = `error-50`). |
| A literal with **no exact** token | Keep the light value exactly and add a dark override on the same element: `bg-[#fef3e2] dark:bg-warning-50`. Never snap a light colour to the nearest token (that's light drift). `lint.mjs` R8 enforces the pairing. |
| `bg-white` / `"#fff"` on a card, panel, input or row | `bg-surface` (+ `CARD_DARK` on a card-like block that sits on the page) |
| …on a menu, popover or dialog body | `bg-surface-raised` + `MENU_DARK` / `DIALOG_DARK` |
| A switch knob, white text on a red fill | Stays white (`bg-white` knob, `text-white`). |
| A fill under white text (`bg-brand-500 text-white`, a red gradient) | `bg-action` / `bg-action-2` / `bg-danger` (never change), or `<Button>` if it renders identically. |
| A chosen option (pill tab, view switch) | Its light classes + `SELECTED_DARK`. |
| Colour in `style={{…}}` | `var(--color-…)` in place (inline styles beat `dark:` classes, so a literal paints in both themes; `lint.mjs` R9). Move the property to classes only when it needs a dark-only extra (a `dark:` shadow, gradient or override). |
| Hover handlers that set colours (`onMouseEnter={e => e.currentTarget.style.background = "#fff0f0"}`) | Swap the literal for `var(--color-brand-100)` inside the handler. Don't rewrite the handler. |
| Red-tinted inline shadow | The identical shadow token class (`shadow-sm`…) or `shadow-[…exact…]`, plus `dark:shadow-card-dark` (cards) / `dark:shadow-float-dark` (floating). |
| Hex-alpha on a variable colour (`${c}22`) | `color-mix(in srgb, ${c} 13.3%, transparent)`. 22=13.3 · 28=15.7 · 30=18.8 · 33=20 · 40=25 · 60=37.6 (%). |
| Data or user-chosen colours (event types, form colours) | Keep the colour for dots, edges and accents; tints via color-mix. If it fails 4.5:1 as text on `#1c1414`, use it for the dot only and token text beside it. |
| framer-motion animating a colour | Light keeps its literal; dark gets a `DARK_*` literal palette chosen with `dark` (framer can't tween `var()`; pattern: `ChipGroup` `DARK_TONES`). |
| SVG `fill=` / `stroke=` | `token(name, theme)` / `chartInk(theme)`; `#fff` / `SURFACE` → `ink.dot` / `ink.plane`. Near-miss literal: `dark ? token("--color-…", "dark") : "#exact"`. |
| Injected `<style>` blocks | Exact colours → `var(--color-…)`. A near-miss colour stays, with an override rule in the same block: `[data-theme="dark"] .the-class { background: var(--color-warning-50); }`. |
| Local `C` palette / local `Field`, `Sk`, `Card` | Tokenise them in place. Swap to the shared component only if it renders identically in light (same padding, radius, border, font). |
| Text on the brand panel | Token text classes work (they turn light in dark). Never `brand-300` / `brand-border` on a light-mode `bg-brand-950` (R5). |
| `isolate`, `z-*` or `backdrop-filter` on a page-level wrapper | Don't. Dialogs must clear the sidebar; PageHeader's blur traps fixed children. |

**Naming:** the theme flag is always `const dark = useTheme() === "dark";`,
called before any early return. The checks recognise `dark`, `isDark`,
`theme === "dark"` and `DARK_*` constants as dark-only code.

**Branded touches (exactly these):**
- **One brand panel per page at most**, on its lead block. List pages already
  have it (the StatusBand), so add none. Detail pages: the profile or summary
  header (`Card brandPanel`, or `BRAND_PANEL_DARK` + `{dark && <BrandBackdrop tone="dark" />}`),
  with `GLASS_*` on controls sitting on it. Forms: none. Others: only if the
  page has an obvious summary block under its header; otherwise none. Say
  which in your report.
- Icon tiles: `CHIP_GLOW[tone]` appended.
- Hand-built cards, menus and dialogs: the `darkSurfaces.js` constants.
- Nothing else: no new gradients, glows or motion.

**No tailwind-merge:** a `dark:` class beats the plain class for the same
property (variants come later in the stylesheet). Two `dark:` classes on one
property are a coin toss (R3).

---

## 3. Token map (light hex → token)

| Group | Light hex → token |
|---|---|
| Brand | `#fff8f6` brand-50 · `#fff0f0` brand-100 · `#fde8e8` brand-200 · `#fca5a5` brand-300 · `#e87474` brand-400 · `#e03131` brand-500 (text, marks) / `action` (fill) · `#c92a2a` brand-600 (text) / `action-2` · `#a32d2d` brand-700 / error-600 · `#6b4040` brand-800 · `#180c0c` brand-950 · `#f0ceca` brand-border · `#fde2de` brand-border-soft |
| Neutral | `#fdf8f6` neutral-50 · `#fffbfb` neutral-100 · `#f5eaea` neutral-200 · `#f0e4e4` neutral-300 · `#cbb3b3` neutral-400 · `#8a6a6a` neutral-500 · `#855c5c` neutral-600 · `#7a5050` neutral-700 · `#5a4040` neutral-800 · `#1a0a0a` neutral-900 · `#ffffff` surface |
| Success | `#e8f5e0` 50 · `#2e6b0d` 500 · `#256009` 600 · `#4caf50` dot |
| Warning | `#faeeda` 50 · `#854f0b` 500 · `#6f4108` 600 · `#ff9800` dot |
| Error | `#fde8e8` 50 · `#9b2020` 500 (text) / `danger` (fill) · `#a32d2d` 600 · `#f44336` dot |
| Info | `#e3f0fd` 50 · `#1455a0` 500 · `#114a8c` 600 · `#2196f3` dot |
| Muted | `#f0ede8` 50 · `#5c5752` 500 · `#9e9e9e` dot |
| Accent | `#f0e8fd` 50 · `#7c3aed` 500 · `#a855f7` dot |
| Levels (50 / 500) | nursery `#fdf5e8`/`#854f0b` · kindergarten `#f0e8fd`/`#7c3aed` · elementary `#e8f0fd`/`#2563eb` · juniorhigh `#e8fdf0`/`#2e6b0d` · seniorhigh `#fde8f8`/`#be185d` |
| Series (both themes) | `#3987e5` 1 · `#d95926` 2 · `#199e70` 3 · `#c98500` 4 · `#d55181` 5 · `#9085e9` 6 |
| Shadows | `0 1px 8px …0.04` xs · `0 2px 12px …0.06` sm · `0 4px 24px …0.10` md · `0 12px 40px …0.14` lg · `0 24px 64px …0.18` 2xl · `0 4px 20px …0.28` brand · `0 8px 28px …0.38` brand-lg (all `rgba(224,49,49,…)`) |
| Radii | 8 sm · 10 md · 12 lg · 14 xl · 16 2xl · 20 3xl |

Anything else (`#f9f0f0`, `#fef3e2`, `#b45309`, `#fffbeb`, `#15803d`…) has no
exact token: keep it and add a dark override (§2).

---

## 4. Work list (page groups, one agent each)

Each group **owns** the files listed: only its agent edits them. Everything
else is shared; see §7. Routes are what the group adds to `DARK_READY_PAGES`.

| Group | Pages · DARK_READY match | Owns | Notes |
|---|---|---|---|
| **G1 Grades** | Grades `^\/grades(\/[a-z]+)?\/?$` (list, entry, summary, observed) · Grading Setup `^\/grading-templates\/?$` | `pages/GradesPage.jsx`, `pages/grades/*`, `components/AIInsightPanel.jsx`, `pages/GradingSettingsPage.jsx` | `gradeRules` colour maps are shared by both pages. AIInsightPanel also renders on Analytics (G8): keep its props. Leave `utils/grading.js` alone (print). |
| **G2 Enrollments** | `^\/enrollments\/?$` · form `^\/enrollments\/new\/?$`, `^\/enrollments\/\d+\/edit\/?$` | `pages/EnrollmentsPage.jsx` (MassEnroll + PromoteSection windows), `pages/EnrollmentFormPage.jsx`, `pages/enrollment/enrollmentReadiness.js` | Form: ThemeArea. The form shows `components/requirements/*` (G3): don't edit them. Behaviour pinned by `pages/enrollment/*.test.jsx`. |
| **G3 Requirements** | `^\/requirements\/?$` · Enrollment Detail `^\/enrollments\/\d+\/?$` | `pages/RequirementsPage.jsx`, `components/requirements/*`, `pages/EnrollmentDetailPage.jsx` | The requirement components also render in the Enrollment Form (G2): keep their props. DocumentViewModal is a lightbox: keep its dark overlay. |
| **G4 Student records** | Detail `^\/students\/\d+\/?$` · form `^\/students\/new\/?$`, `^\/students\/\d+\/edit\/?$` · `^\/student-applications\/?$` | `pages/StudentDetailPage.jsx`, `pages/StudentFormPage.jsx`, `pages/student-form/*`, `pages/StudentApplicationsPage.jsx`, `pages/apply/ApplicationDetailsEditor.jsx` | `student-form/*` and the editor also render on the public `/apply` form (stays light). Form: ThemeArea. QR-card print style stays light. |
| **G5 Billing lists** | `^\/invoices\/?$` · `^\/payments\/?$` | `pages/InvoicesPage.jsx`, `pages/PaymentsPage.jsx`, `constants/paymentMethods.js` | Keep paymentMethods' shape (RecordPaymentModal reads `tone`). `#fdf5e8` = nursery-50 exactly. |
| **G6 Scholarships** | `^\/scholarships\/?$` · `^\/scholarship-types\/?$` | `pages/ScholarshipsPage.jsx`, `pages/ScholarshipTypesPage.jsx` | |
| **G7 Admin pages** | `^\/sections\/?$` · `^\/users\/?$` · `^\/teacher-advisories\/?$` · `^\/subjects\/?$` · `^\/audit-trail\/?$` · School Years `^\/school-years(\/(?!compare\/?$)[^/]+)?\/?$` | `pages/{Sections,Users,TeacherAdvisories,Subjects,AuditTrail,SchoolYears,SchoolYearDetail}Page.jsx`, `components/sections/*`, `components/PasswordInput.jsx`, `constants/roleDots.js`, `components/schoolYears/*` except `compareFigures.js` | `CarryOverModal` also opens from Billing Settings; `ArchivedYearNotice` shows on 7 pages: keep their props. |
| **G8 Analytics** | `^\/analytics\/?$` · `^\/school-years\/compare\/?$` | `pages/AnalyticsPage.jsx`, `pages/analytics/*`, `pages/SchoolYearComparePage.jsx`, `components/charts/compare/*`, `components/schoolYears/compareFigures.js` | Theme every `token()`/`chartInk()` call; `mapFrame` `isFaint` gets the theme's `ink.plane`. `riskVocabulary.js` also feeds the Dashboard's SVG: leave its values and shape (they pass 3:1 on dark). `groupMap.test` asserts the light plane `#fdfcfb`: keep it. |
| **G9 School Forms** | `^\/school-forms\/?$` | `pages/SchoolFormsPage.jsx` | Data colours with hex-alpha → color-mix. |
| **G10 Calendar** | `^\/academic-calendar\/?$` | `pages/AcademicCalendarPage.jsx` | Event-type colours are user-chosen (§2). Injected hover `<style>` → `var()`. |
| **G11 My Sections** | `^\/my-sections\/?$` | `pages/TeacherSectionsPage.jsx` | `SCHOOL_LEVEL_COLORS` → level tokens where exact, else §2 pairs. The gradebook and narrative cross-tabs are deliberately not `Table`: restyle in place. Its exported `SectionDetail` / `StudentsTab` also render on /sections (already converted, waiting on you): keep their props, and add `{ label: "Sections", match: /^\/sections\/?$/ }` + `"/sections"` to DARK_PATHS once they're done. |
| **G12 Billing Settings** | `^\/settings\/?$` | `pages/BillingSettingsPage.jsx`, `pages/billingSettings/*` | (Its Developer tab was removed 2026-10-11: the theme is on each person's My Settings page.) Injected `baseCss` (`.settings-input`, shimmer) → `var()`. |

**Closeout:** done 2026-10-11. Staff have the switch (My Settings), the staff
dashboard is converted, and `DARK_READY_PAGES` stays as the allowlist (it keeps
print and other light-by-design pages light). The guardian portal joined
in round 6.

**Round 6 (2026-10-13): the guardian portal.** Reverses "the guardian portal
stays light". `useAppTheme` gates on STAFF_ALL + guardian; GuardianLayout
renders through ThemeArea; `/guardian`, `/guardian/child/:id` and
`/guardian/settings` are in `DARK_READY_PAGES`. The Theme and Account cards
moved out of MySettingsPage into `components/settings/` (ThemeSettings takes
`scene="staff"|"portal"` for its pictures), shared by both settings pages.
GuardianHero no longer clips (BrandBackdrop clips itself), so the child
page's school-year menu opens below it.
Known, unfixed: the Dashboard pipeline's in-bar numbers measure 2.6–3.0:1 in
light.

---

## 5. Checks (run all, every group)

The kit lives in the repo, outside git (`.git/info/exclude`):
`/Users/jannolematres/Documents/GitHub/ASIA/.claude/darkmode/kit/`
(`$KIT` below). Run from `frontend/admin-portal` of your worktree.

```bash
NODE_OPTIONS=--no-experimental-webstorage npx vitest run        # all green
npx eslint .                                                    # 0 errors, 46 warnings (baseline)
bash $KIT/check.sh index <your-build-dir> <every file you changed>
```

`check.sh` runs:
1. **ledger.mjs**: the light colours each file paints, before vs after,
   resolved through the tokens. Goal: `light colours: unchanged`. Every
   delta must be explained in your report. Its "light-path literals left"
   list must hold only intentional literals (R8 pairs, knobs, print).
2. **logicdiff.mjs**: the file minus styling, before vs after. Goal: `no
   non-style changes`; every other line must be justified (a `useTheme()`
   hook, a `DARK_*` palette, a `dark &&` backdrop element).
3. **lint.mjs**: R1 white text on a fill that turns pale · R2 alpha
   suffix on a variable colour · R3 two `dark:` utilities for one property ·
   R4 new motion · R5 brand-panel text in a flipping token · R6
   `useAppTheme()` in a page · R7 a dark flag not named `dark` · R8 light
   literal with no dark override · R9 colour literal in an inline style.
4. **build + classcheck.mjs**: every class and every `var(--…)` exists in
   the built CSS (Tailwind silently drops a malformed class).

`contrast.mjs <fg> [bg…]` checks a colour on the dark planes (surface
`#1c1414`, raised `#261c1c`, page `#110b0b`, brand panel `#180c0c`). Text
needs 4.5:1, icons and meaningful borders 3:1.

**Tests to add, per page:**
- the route in `components/AppLayout.test.jsx` `DARK_PATHS` (and a
  look-alike that must stay light in `LIGHT_PATHS` if your regex could
  over-match);
- a dark render test: the page (or its windows) rendered inside
  `<ThemeContext.Provider value="dark"><div data-theme="dark">…</div></ThemeContext.Provider>`
  with the existing test's mocks, asserting real content shows. Dark-only
  branches are otherwise never executed by the suite.

---

## 6. Gotchas

- **No stacking context on the page area** (`isolate`, z-index): dialogs
  (`z-[999]`) must clear the sidebar. No dialogs inside PageHeader (its dark
  `backdrop-filter` traps `position: fixed` children).
- **Hooks first:** `useTheme()` before any early return.
- **`getAvatarPalette` returns `var()` strings** (so do `OBSERVED_VALUES`):
  never glue an alpha suffix on; use color-mix.
- **A `var()` inside a custom property resolves once, where it's declared:**
  a new `:root` variable needs its own value in the dark block too.
- **jsdom has no stylesheet** (`token()` returns fallbacks) **and no
  `matchMedia`** (stub it when a test renders toasts).
- **Shared files render on light pages too:** keep every change to them
  light-identical.

---

## 7. Agent protocol

- **Your worktree is your whole world.** Edit only inside it, only files your
  group owns (plus the merge-by-hand files below). Never touch the main tree
  at `/Users/jannolematres/Documents/GitHub/ASIA`. No git commands that
  write (`commit`, `add`, `stash`, `checkout`, `reset`, `restore`); the
  orchestrator collects your work with `git diff`.
- **Merge-by-hand files** (you may edit them in your worktree; the
  orchestrator re-applies them): `constants/darkReady.js` (your routes),
  `components/AppLayout.test.jsx` (your `DARK_PATHS` / `LIGHT_PATHS` lines),
  `styles/tokens.css` (only if you truly need a new token: add it to both
  the light and the dark block), `components/charts/tokens.js` (G8 only,
  append-only). Report every line you add to them.
- **Everything else outside your group is read-only.** If a shared file is
  wrong in dark, describe the problem in your report; don't fix it.
- **Don't ask the user anything** (no AskUserQuestion); questions go in the
  report (§0).

**Report (your final message, in this shape):**
```
## <Group> report
Pages done: <page> — `<regex>` — test paths added
Pages skipped: <page> — <the question for the user>
Files changed: <list; every one inside your ownership or the merge-by-hand list>
New tokens (tokens.css): <name: light / dark> or none
Light deviations: none, or old → new (where, why)
Ledger: unchanged, or each delta with its reason
Logic diff: none, or each change with its reason
Lint: clean, or each item with its reason
Build + classcheck: <result>
Tests: <passed>/<total>; new tests: <list>
Brand panel: <which block, or none and why>
Contrast checks: <colour on plane = ratio>
Findings (not fixed): <shared-file problems, a11y gaps, bugs>
```

---

## 8. Foundation done on 2026-10-10 (for reference)

- `usePageTheme()`; AppLayout uses it. `ThemeArea` for the full-page forms.
- `AppToaster` (inside the router) + `--toast-*` variables; the session
  warning takes the page theme.
- SegmentedControl (`SELECTED_DARK`), StepBar, ToggleCard, RangeMenu,
  FilterBar (`CARD_DARK`), SummaryList: `bg-surface*` / `bg-action`, light
  identical.
- `.search-wrap` and `.row-action` read `var()`. The other legacy classes in
  `index.css` are unused (left alone).
- `ui/darkSurfaces.js`, `BRAND_PANEL_DARK` in `ui/brandPanel.js`.
- `constants/observedValues.js` colours are `var()` strings.
- `AppLayout.test.jsx` dark checks are tables (`DARK_PATHS`, `LIGHT_PATHS`);
  `components/themeArea.test.jsx` covers ThemeArea, toasts and the warning.
- node_modules synced to the committed lockfile (vitest 4.1.11).
