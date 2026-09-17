// GuardianHero — the banner at the top of each guardian portal page.
//
// It is the login page's brand panel carried over (the brand-950 near-black,
// the faint dot grid, the red glow in the corner), so a parent goes from
// signing in to their children's records without the look changing under
// them. Only the banner takes it: the records below stay on the light
// surface, where the tables and status colours are tuned to be read. The
// login's glows drift; these hold still, since this page is read, not glanced at.
export default function GuardianHero({ className = "", children }) {
  return (
    <section
      className={`relative isolate overflow-hidden rounded-2xl bg-brand-950 px-5 py-6 text-white shadow-md sm:px-8 sm:py-7 ${className}`}
    >
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
      {children}
    </section>
  );
}
