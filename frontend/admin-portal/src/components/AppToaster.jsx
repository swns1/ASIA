import { Toaster } from "react-hot-toast";
import { toasterProps } from "../utils/toastConfig";
import { usePageTheme } from "../hooks/useTheme";

// AppToaster — the app's one toast host, themed like the page under it.
//
// Toasts float over the page, outside every themed container, so the host
// carries the page's theme itself: dark over a converted page while dark
// mode is on, light everywhere else. toastConfig styles the toasts with the
// --toast-* variables, which the theme switches. `contents` keeps the
// wrapper out of the layout; the variables still reach the toasts.
export default function AppToaster() {
  const dark = usePageTheme() === "dark";
  return (
    <div className="contents" data-theme={dark ? "dark" : undefined}>
      <Toaster {...toasterProps} />
    </div>
  );
}
