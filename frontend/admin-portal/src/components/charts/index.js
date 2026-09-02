// charts/ — the app's one charting language.
//
// Hand-rolled SVG rather than a charting library: the conventions here (2px
// surface gaps, 4px rounded data-ends, hairline solid grid, dashed lines only
// for thresholds, status colour never carrying meaning alone) were already
// established by pages/analytics/RiskCharts.jsx, and every library would need
// fighting into that shape while adding a bundle and a second visual idiom.
//
// Read tokens.js before adding a chart — colours come from styles/tokens.css,
// never from a literal.

export { default as ChartFrame, ChartTooltip, NoData } from "./ChartFrame";
export { default as BarChart } from "./BarChart";
export { default as LineChart } from "./LineChart";
export { default as Meter } from "./Meter";
export { default as Sparkline } from "./Sparkline";
export { default as StackedBar } from "./StackedBar";
export { barPath, columnPath, linePath, niceMax } from "./geometry";
export { GAP, MARKER, RADIUS, STROKE, SURFACE, chartInk, clearTokenCache, token } from "./tokens";
