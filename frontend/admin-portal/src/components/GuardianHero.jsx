import BrandBackdrop from "./ui/BrandBackdrop";

// GuardianHero — the banner at the top of each guardian portal page.
//
// It is the login page's brand panel carried over (the brand-950 near-black,
// the faint dot grid, the red glow in the corner), so a parent goes from
// signing in to their children's records without the look changing under
// them. It is the same panel in both themes; in dark it takes the brand
// panel's faint edge and red glow, so it still reads as raised off the
// near-black page.
//
// No overflow-hidden: BrandBackdrop clips its own glow to the rounded
// corners, and a menu opened from the banner (the child page's school year)
// has to show below its edge.
export default function GuardianHero({ className = "", children }) {
  return (
    <section
      className={`relative isolate rounded-2xl bg-brand-950 px-5 py-6 text-white shadow-md sm:px-8 sm:py-7 dark:shadow-panel-glow dark:ring-1 dark:ring-white/[0.07] ${className}`}
    >
      <BrandBackdrop />
      {children}
    </section>
  );
}
