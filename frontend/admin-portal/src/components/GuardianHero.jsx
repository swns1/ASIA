import BrandBackdrop from "./ui/BrandBackdrop";

// GuardianHero — the banner at the top of each guardian portal page.
//
// It is the login page's brand panel carried over (the brand-950 near-black,
// the faint dot grid, the red glow in the corner), so a parent goes from
// signing in to their children's records without the look changing under
// them. Only the banner takes it: the records below stay on the light
// surface, where the tables and status colours are tuned to be read.
export default function GuardianHero({ className = "", children }) {
  return (
    <section
      className={`relative isolate overflow-hidden rounded-2xl bg-brand-950 px-5 py-6 text-white shadow-md sm:px-8 sm:py-7 ${className}`}
    >
      <BrandBackdrop />
      {children}
    </section>
  );
}
