# Handoff: Analytics page chart changes

Target repo: `swns1/ASIA` (branch `main`), app `frontend/admin-portal`.
Target files: `src/pages/analytics/RiskCharts.jsx` and `src/pages/AnalyticsPage.jsx`.

## About the design file
`Analytics - Chart Changes.dc.html` is an HTML design reference with sample data. It opens in a browser; keep `support.js` next to it. Rebuild it in the portal's React + Tailwind code, reusing `components/charts/*` (`ChartFrame`, `geometry.js`, `scale.js`, `tokens.js`, `useElementSize`) and `src/styles/tokens.css`. Fidelity is high: follow the colours, sizes and spacing given here.

## Suggested Claude Code prompt
> Read `design_handoff_analytics_charts/README.md` and open the HTML file in it. Update `src/pages/analytics/RiskCharts.jsx` and `src/pages/AnalyticsPage.jsx` to match 4a–4d. Reuse `components/charts/*` and the tokens, with no new hard-coded hex. Keep every existing empty state and role check, and update the tests in `analytics.test.jsx` that the changes affect.

## 4a How everyone is doing (`GradeDistributionChart`)
1. **Headline above the plot** (pass it through `ChartFrame`'s `legend` slot, replacing the `key`):
   - `{belowPassing} of {graded.length}` at 20px/700 `neutral-900`, then "students are below the passing mark" at 14px `neutral-800`, then a pill with `{pct}%` (`pct = round(belowPassing / graded.length × 100)`): `bg error-50`, text `error-500`, 11px/700, `px-2 py-0.5`, fully rounded. 12px gap below.
   - If `belowPassing` is 0: "No students are below the passing mark", no pill.
2. **Passing side tinted and labelled; key removed.**
   - Before the columns, draw a rect from x=0 to `passX`, y=0 to `baseY`, fill `token("--color-error-50")`, opacity 0.6.
   - Delete the "Passing mark (75)" label. Put two labels either side of the dashed line at y=24: `textAnchor="end"` at `passX − 10`, "Below passing", `error-500`; `textAnchor="start"` at `passX + 10`, `Passing · ${PASSING_GRADE} and up`, `success-500`. Both 11px/700.
   - Keep the dashed line (`ink().threshold`, 1.5px, `4,3`), starting at y=32. Column colours stay (`riskLevelMeta("low")` / `("critical")`).
3. **Drop the count axis.** Remove the y ticks, y labels and gridlines. Keep one baseline hairline at `baseY` (`ink().grid`). New padding: `PAD_L 12, PAD_R 12, PAD_T 40, PAD_B 44`. Scale with `yOf(n) = baseY − n / (most × 1.08) × plotH`. Make the "75" x tick label bold `ink().ink`.
   - If you prefer to keep an axis: `linearAxis(0, most, { integer: true })` from `scale.js`, like the other charts.
4. **Bin labels.** Tooltip title is `Averages ${from} to ${to}` for every bin ("95 to 100" for the last, no "under"). If `lowest < MIN` (a grade was clamped to the floor), the first bin's title is `Under ${MIN + BIN_SIZE}`.
5. **Note for missing averages.** Under the existing caption, when `graded.length < scores.length`, add an `ti-info-circle` (13px) and "`{n}` students have no average yet and aren't shown." (singular: "1 student has no average yet and isn't shown."), 11px `neutral-500`. 4px above it.
6. **Card header, all six views** (`AnalyticsPage.jsx`): delete the title div (`CHART_OPTIONS.find(...).label`). The header is the `ChipGroup`, then the `chartBlurb(chartView)` line 10px below it.

## 4b Grades vs attendance (`AttendanceGradeChart`)
- **Axis floors from the data.** `X_MIN = clamp(floor(lowestGrade / 10) × 10, 0, 60)`, `Y_MIN = clamp(floor(lowestAttendancePct / 10) × 10, 0, 50)`. Maxes stay 100. In `scaleX` / `scaleY` keep only a 0–100 guard, so no student is pinned to the frame.
- **Ticks.** x: every 10 from `X_MIN`, plus `PASSING_GRADE` and 100. y: the set of `Y_MIN, 50, 70, GOOD_ATTENDANCE, 100` at or above `Y_MIN`, sorted. (Sample data gives x 40–100 and y 30–100%.)
- **Quadrant labels:** `fill={ink().axis}` instead of `#a89494`, same 11px/600. Draw them after the dots, with a surface halo (`stroke={SURFACE} strokeWidth={3} paintOrder="stroke"`).
- **Padding and label placement:** `PAD_L 50` (was 44, so the 11px y ticks clear the rotated title), `PAD_T 34` (was 18). The two top quadrant labels, "Attending, still struggling" and "Doing well", sit above the plot at `y = PAD_T − 10`, out of the dot field. The two bottom labels stay inside the plot at `PAD_T + plotH − 8`. Y tick labels use `x = PAD_L − 8`.
- Legend, caption, hit targets and click-through are unchanged.

## 4c By grade level / By section (`GroupedBandChart`)
- Row grid, labels, right-hand text, colours, segment order (critical → low) and `flexGrow` split are unchanged.
- **Bar length shows group size.** Compute `maxTotal = Math.max(...visible.map(r => r.total))`. The bar span keeps `flex h-3 gap-[2px] overflow-hidden rounded-full` but gets `style={{ width: \`${(row.total / maxTotal) * 100}%\`, minWidth: 10 }}`, inside a block wrapper that carries `BAR_CELL`. This matches dashboard 2d.
- **Caption:** "Each bar is one {unitLabel}'s students, split by level. A longer bar is a bigger group. Ordered by how many need following up." Keep the "Showing the top N of M" suffix.

## 4d Student history (`RiskTrendChart`)
- Draw at the card's measured width: `useElementSize` on a `plotRef`, inside `ChartFrame` (give it a `title`, for example "{name}: {first band} on {first date} to {last band} on {last date}"), instead of the fixed 760 viewBox. Use `ChartFrame`'s `tip` and `ChartTooltip` in place of the bespoke tooltip div. Replace the hard-coded hexes with `chartInk()` / `SURFACE`.
- Geometry: `H 220, PAD_L 136, PAD_R 24, PAD_T 14, PAD_B 36`. Score 0–100 maps to the plot height as now.
- **Band zones** replace "Fine" / "Urgent": four rects, 0–25 `low`, 25–50 `moderate`, 50–75 `high`, 75–100 `critical` (the backend's `RISK_LEVEL_THRESHOLDS`), each filled with `riskLevelMeta(level).tint`. Label each zone at `x = PAD_L − 12`, `textAnchor="end"`, 11px/600, `neutral-700`, centred vertically in the zone, text `riskLevelMeta(level).label`.
- Keep hairlines at 25 / 50 / 75 (`ink().grid`) and add a baseline. Drop the 0 / 50 / 100 label map.
- Points: x from `PAD_L + 20` to `W − PAD_R − 20`; r 5.5, fill the band colour, 2.5px `SURFACE` stroke. Connecting line `token("--color-neutral-400")`, 2px, round joins. Date labels at `PAD_T + plotH + 20`, 10px `ink().axis`, same thinning rule as now.

## Text size
Axis tick and date labels in 4a, 4b and 4d are 11px (the `tokens.css` floor), up from 10.

## Tests (`analytics.test.jsx`)
- "colours passing grades green and failing ones red": the key text "Passing (75 and up)" becomes the in-chart label `Passing · 75 and up`; also assert "Below passing".
- "marks the passing line on the grade spread": "Passing mark (75)" no longer exists. Assert the two labels above instead, and the headline "1 of 2 students are below the passing mark" for the fixture (72.5 and 91).
- Add: a grade of 100 lands in the "Averages 95 to 100" bin; `graded.length < scores.length` shows the missing-average note; a grade of 47.7 in `AttendanceGradeChart` is not drawn at the frame edge.

## Unchanged
Stat tiles, filter card, tabs, `RiskTable`, "Why they're flagged", Performance groups.

## Not designed, your call
- "How many need help" repeats the four tiles above it and adds only the percentage. Put the share on the tiles and drop the view, or leave it.
- "Why they're flagged" counts reasons across everyone assessed (`by_reason` in `risk_views.py`), so "flagged" overstates it. Consider renaming the chip.
