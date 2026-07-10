import { useState, useEffect } from "react";

export function useIsFirstRender() {
  const [isFirstRender, setIsFirstRender] = useState(true);

  useEffect(() => {
    // Detecting "has this component mounted" cannot be derived during render;
    // an effect is the correct primitive here, unlike the general case this rule guards against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsFirstRender(false);
  }, []);

  return isFirstRender;
}
