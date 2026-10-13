import { useId } from "react";
import SettingsCard from "./SettingsCard";
import { SELECTED_DARK } from "../ui/darkSurfaces";
import { setThemePreference, useThemePreference } from "../../hooks/useTheme";

// The Theme card: Light, Dark, or the same as this computer, as three
// picture cards. Shared by staff My Settings and the guardian portal's My
// settings; `scene` picks which product the pictures show ("staff": the
// sidebar and a list page; "portal": the guardian top bar, banner and
// child cards). The choice is kept in this browser under the signed-in
// person's account (hooks/useTheme).

const THEMES = [
  { value: "light", label: "Light", hint: "White pages, dark text." },
  { value: "dark", label: "Dark", hint: "Dark pages, light text." },
  { value: "system", label: "Auto", hint: "Matches your computer's light or dark setting." },
];

// The pictures are drawn in fixed colours, the tokens' light and dark values
// (tokens.css), not in tokens: each has to show its own theme whichever theme
// the page around it is in.
const SKETCH = {
  light: {
    page: "#fdf8f6", side: "#ffffff", card: "#ffffff", rule: "#f5eaea",
    ink: "#1a0a0a", text: "#cbb3b3", chip: "#fde8e8",
    pill: "#fff0f0", current: "#e03131",
  },
  dark: {
    page: "#110b0b", side: "#180c0c", card: "#1c1414", rule: "#302424",
    ink: "#f6eded", text: "#604a4a", chip: "#3d2020",
    pill: "rgba(224,49,49,0.3)", current: "#ffffff",
  },
};
// The login's brand panel, which both products' banners use in either theme.
const PANEL = "#180c0c";

const NAV_ROWS = [
  { y: 34, w: 22 },
  { y: 45, w: 26, current: true },
  { y: 56, w: 18 },
  { y: 67, w: 24 },
  { y: 78, w: 20 },
];
const LIST_ROWS = [
  { y: 72, w: 62 },
  { y: 82, w: 48 },
  { y: 92, w: 56 },
  { y: 102, w: 40 },
];

// The staff portal in miniature: the sidebar with the current page lit, the
// page header, three stat tiles and a list. `glow` gives dark's red glows and
// the header's red hairline.
function StaffScene({ c, glow }) {
  return (
    <>
      <rect width="200" height="120" fill={c.page} />

      <rect width="50" height="120" fill={c.side} />
      {glow && <rect width="50" height="120" fill={`url(#${glow.side})`} />}
      <rect x="50" width="1" height="120" fill={c.rule} />
      <rect x="8" y="8" width="10" height="10" rx="2.5" fill="#e03131" />
      <rect x="22" y="9.5" width="20" height="3" rx="1.5" fill={c.ink} />
      <rect x="22" y="14.5" width="13" height="2" rx="1" fill={c.text} />
      <rect y="25" width="50" height="1" fill={c.rule} />
      {NAV_ROWS.map((row) => (
        <g key={row.y}>
          {row.current && <rect x="4" y={row.y - 3} width="42" height="10" rx="2.5" fill={c.pill} />}
          {row.current && <rect x="4" y={row.y - 1.5} width="1.5" height="7" rx="0.75" fill="#e03131" />}
          <rect x="9" y={row.y - 0.5} width="5" height="5" rx="1.2" fill={row.current ? c.current : c.text} />
          <rect x="17" y={row.y + 0.5} width={row.w} height="3" rx="1.5" fill={row.current ? c.current : c.text} />
        </g>
      ))}

      <rect x="51" width="149" height="18" fill={c.card} />
      <rect x="51" y="18" width="149" height="1" fill={glow ? `url(#${glow.line})` : c.rule} />
      <rect x="60" y="7" width="38" height="4" rx="2" fill={c.ink} />
      {glow && <rect x="51" width="149" height="120" fill={`url(#${glow.page})`} />}

      {[60, 106, 152].map((x) => (
        <g key={x}>
          <rect x={x} y="27" width="40" height="20" rx="3" fill={c.card} stroke={c.rule} strokeWidth="0.75" />
          <rect x={x + 4} y="31" width="8" height="8" rx="2" fill={c.chip} />
          <rect x={x + 15} y="31.5" width="14" height="3.5" rx="1.75" fill={c.ink} />
          <rect x={x + 15} y="38" width="19" height="2.5" rx="1.25" fill={c.text} />
        </g>
      ))}
      <rect x="60" y="54" width="132" height="58" rx="3" fill={c.card} stroke={c.rule} strokeWidth="0.75" />
      <rect x="67" y="61" width="34" height="3.5" rx="1.75" fill={c.ink} />
      {LIST_ROWS.map((row) => (
        <g key={row.y}>
          <circle cx="70" cy={row.y + 1.5} r="2.5" fill={c.chip} />
          <rect x="76" y={row.y} width={row.w} height="3" rx="1.5" fill={c.text} />
          <rect x="168" y={row.y - 0.5} width="17" height="4" rx="2" fill={c.chip} />
        </g>
      ))}
    </>
  );
}

// The guardian portal in miniature: the top bar, the brand banner and two
// child cards.
function PortalScene({ c, glow }) {
  return (
    <>
      <rect width="200" height="120" fill={c.page} />
      {glow && <rect width="200" height="120" fill={`url(#${glow.page})`} />}

      <rect width="200" height="16" fill={c.card} />
      <rect y="16" width="200" height="1" fill={glow ? `url(#${glow.line})` : c.rule} />
      <rect x="8" y="4" width="6" height="8" rx="1.5" fill="#e03131" />
      <rect x="18" y="6" width="26" height="4" rx="2" fill={c.ink} />
      <rect x="158" y="5" width="34" height="6" rx="3" fill={c.text} />

      <rect x="12" y="24" width="176" height="34" rx="5" fill={PANEL} />
      <circle cx="176" cy="30" r="20" fill="#e03131" fillOpacity="0.22" />
      <rect x="20" y="32" width="50" height="4" rx="2" fill="#ffffff" fillOpacity="0.55" />
      <rect x="20" y="40" width="80" height="6" rx="3" fill="#ffffff" />

      {[12, 103].map((x) => (
        <g key={x}>
          <rect x={x} y="66" width="85" height="44" rx="5" fill={c.card} stroke={c.rule} strokeWidth="0.75" />
          <rect x={x + 7} y="73" width="12" height="12" rx="3" fill={c.chip} />
          <rect x={x + 23} y="75" width="40" height="4" rx="2" fill={c.ink} />
          <rect x={x + 23} y="82" width="28" height="3" rx="1.5" fill={c.text} />
          <rect x={x + 7} y="97" width="50" height="3" rx="1.5" fill={c.text} />
        </g>
      ))}
    </>
  );
}

const SCENES = { staff: StaffScene, portal: PortalScene };

// One theme's picture. Auto shows light above the diagonal and dark below.
function ThemeSketch({ look, scene }) {
  const Scene = SCENES[scene];
  // useId's characters aren't all safe inside url(#…).
  const uid = useId().replace(/[^\w-]/g, "");
  const glow = { page: `${uid}-page`, side: `${uid}-side`, line: `${uid}-line` };
  const half = `${uid}-half`;
  return (
    <svg viewBox="0 0 200 120" className="block h-auto w-full" aria-hidden="true" focusable="false">
      {look !== "light" && (
        <defs>
          <radialGradient id={glow.page} cx="1" cy="0" r="0.75">
            <stop offset="0" stopColor="#e03131" stopOpacity="0.32" />
            <stop offset="1" stopColor="#e03131" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={glow.side} cx="0" cy="1" r="0.9">
            <stop offset="0" stopColor="#e03131" stopOpacity="0.28" />
            <stop offset="1" stopColor="#e03131" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={glow.line}>
            <stop offset="0" stopColor="#e03131" stopOpacity="0.65" />
            <stop offset="0.45" stopColor="#e03131" stopOpacity="0.15" />
            <stop offset="0.8" stopColor="#e03131" stopOpacity="0" />
          </linearGradient>
          <clipPath id={half}>
            <polygon points="200,0 200,120 0,120" />
          </clipPath>
        </defs>
      )}
      {look === "dark" ? (
        <Scene c={SKETCH.dark} glow={glow} />
      ) : (
        <Scene c={SKETCH.light} />
      )}
      {look === "system" && (
        <g clipPath={`url(#${half})`}>
          <Scene c={SKETCH.dark} glow={glow} />
        </g>
      )}
    </svg>
  );
}

function ThemeOption({ option, checked, scene }) {
  return (
    // `relative`: holds the visually hidden radio inside the card.
    <label
      className={[
        "relative flex cursor-pointer flex-col overflow-hidden rounded-lg border-[1.5px] transition-colors",
        "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-brand-500/25",
        checked
          ? `border-brand-500 bg-brand-100 ${SELECTED_DARK}`
          : "border-neutral-300 bg-surface hover:border-brand-300",
      ].join(" ")}
    >
      <input
        type="radio"
        name="theme"
        value={option.value}
        checked={checked}
        onChange={() => setThemePreference(option.value)}
        className="sr-only"
      />
      <ThemeSketch look={option.value} scene={scene} />
      <span className="flex items-start gap-2.5 border-t border-neutral-200 px-3.5 py-3">
        <span
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
            checked ? "border-brand-500 dark:border-white" : "border-neutral-400"
          }`}
          aria-hidden="true"
        >
          {checked && <span className="h-2 w-2 rounded-full bg-brand-500 dark:bg-white" />}
        </span>
        <span className="min-w-0">
          <span className={`block text-sm font-bold ${checked ? "text-brand-600 dark:text-white" : "text-neutral-900"}`}>
            {option.label}
          </span>
          <span className="block text-xs text-neutral-600">{option.hint}</span>
        </span>
      </span>
    </label>
  );
}

export default function ThemeSettings({
  scene = "staff",
  printNote = "Print pages and report cards stay light: they're made for paper.",
}) {
  const preference = useThemePreference();
  const titleId = useId();
  return (
    <SettingsCard
      title="Theme"
      titleId={titleId}
      description="Saved in this browser, just for you. On another computer, choose again."
    >
      <div role="radiogroup" aria-labelledby={titleId} className="grid gap-3 p-5 sm:grid-cols-3">
        {THEMES.map((option) => (
          <ThemeOption key={option.value} option={option} scene={scene} checked={preference === option.value} />
        ))}
      </div>
      <p className="flex items-center gap-2 border-t border-neutral-200 px-5 py-3 text-xs text-neutral-500">
        <i className="ti ti-printer text-[14px]" aria-hidden="true" />
        {printNote}
      </p>
    </SettingsCard>
  );
}
