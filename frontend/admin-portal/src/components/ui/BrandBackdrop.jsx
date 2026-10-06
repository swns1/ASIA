// BrandBackdrop — the login page's brand-panel texture: a faint dot grid and
// a red glow in two corners, strong at the bottom left and faint at the top
// right. It's what makes the brand-950 panel read as the brand's dark red
// rather than plain black.
//
// Drop it inside a `relative isolate overflow-hidden bg-brand-950` container:
// the layers sit at -z-10 behind the content, and `isolate` keeps them from
// slipping behind the container's own background. The login's glows drift;
// these hold still, since the panels that use them are read, not glanced at.
export default function BrandBackdrop() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[length:20px_20px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-24 -z-10 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(224,49,49,0.26)_0%,transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 -z-10 h-60 w-60 rounded-full bg-[radial-gradient(circle,rgba(224,49,49,0.10)_0%,transparent_70%)]"
      />
    </>
  );
}
