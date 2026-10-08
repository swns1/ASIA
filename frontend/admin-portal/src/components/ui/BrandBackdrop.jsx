// BrandBackdrop — the login page's brand-panel texture: a faint dot grid and
// a red glow in two corners, strong at the bottom left and faint at the top
// right. It's what makes the brand-950 panel read as the brand's dark red
// rather than plain black.
//
// Drop it inside a `relative isolate bg-brand-950` container: the layers sit
// at -z-10 behind the content, and `isolate` keeps them from slipping behind
// the container's own background. The layer clips its own glows to the
// container's corners, so the container doesn't need `overflow-hidden` and
// can hold a menu that opens past its edge (the Enrollments school year).
//
// `tone="light"` draws the same texture in faint red for a white container
// (the light status band), where the dark tone's white dots wouldn't show.
//
// The login's glows drift; these hold still, since the panels that use them
// are read, not glanced at. Dark mode uses the dark tone for the sidebar and
// the status band, and PageGlow below behind the whole page.

// Every class string is a complete literal, as Tailwind needs.
const LAYERS = {
  dark: {
    dots: "bg-[radial-gradient(circle,rgba(255,255,255,0.035)_1px,transparent_1px)]",
    low: "bg-[radial-gradient(circle,rgba(224,49,49,0.26)_0%,transparent_70%)]",
    high: "bg-[radial-gradient(circle,rgba(224,49,49,0.10)_0%,transparent_70%)]",
  },
  light: {
    dots: "bg-[radial-gradient(circle,rgba(224,49,49,0.06)_1px,transparent_1px)]",
    low: "bg-[radial-gradient(circle,rgba(224,49,49,0.08)_0%,transparent_70%)]",
    high: "bg-[radial-gradient(circle,rgba(224,49,49,0.04)_0%,transparent_70%)]",
  },
};

/**
 * PageGlow — the same light across a whole dark page: a wide red glow from
 * the top-right corner, where the dot grid shows before fading out, and a
 * fainter one low on the left. AppLayout puts it behind a converted page in
 * dark mode. The page scrolls over it, so it holds still like the login
 * panel's, and the sidebar's brand panel carries the strong glow at the
 * bottom left.
 */
export function PageGlow() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:20px_20px] [mask-image:radial-gradient(ellipse_75%_65%_at_100%_0%,#000_0%,transparent_75%)]" />
      <div className="absolute -right-60 -top-72 h-[640px] w-[780px] rounded-full bg-[radial-gradient(closest-side,rgba(224,49,49,0.16),transparent)]" />
      <div className="absolute -bottom-80 -left-72 h-[620px] w-[720px] rounded-full bg-[radial-gradient(closest-side,rgba(224,49,49,0.08),transparent)]" />
    </div>
  );
}

export default function BrandBackdrop({ tone = "dark" }) {
  const l = LAYERS[tone] ?? LAYERS.dark;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]"
    >
      <div className={`absolute inset-0 bg-[length:20px_20px] ${l.dots}`} />
      <div className={`absolute -bottom-32 -left-24 h-80 w-80 rounded-full ${l.low}`} />
      <div className={`absolute -right-16 -top-20 h-60 w-60 rounded-full ${l.high}`} />
    </div>
  );
}
