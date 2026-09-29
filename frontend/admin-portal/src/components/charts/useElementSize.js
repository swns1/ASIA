// useElementSize — an element's size in pixels, for a chart that draws at its
// real size instead of scaling a fixed viewBox. A scaled viewBox scales the
// text with it: a 760-wide chart in a 1,000px card sets its 11px labels at
// ~14px, and the same chart in a narrow card at ~8px.
//
// Pass the element itself, from a callback ref held in state
// (`const [el, setEl] = useState(null)` ... `ref={setEl}`), so the observer
// attaches whenever the element appears -- including after an empty state
// gives way to data. Null until measured, and always null where there's no
// ResizeObserver (jsdom): callers fall back to their fixed size.

import { useEffect, useState } from "react";

export default function useElementSize(el) {
  const [size, setSize] = useState(null);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    // ResizeObserver reports the first size itself, right after observe().
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize(width > 0 ? { width: Math.round(width), height: Math.round(height) } : null);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return size;
}
