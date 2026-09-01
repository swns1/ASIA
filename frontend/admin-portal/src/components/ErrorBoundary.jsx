import { Component } from "react";
import { isTokenValid, getCurrentUser, homeFor } from "../utils/auth";
import FullPageMessage from "./ui/FullPageMessage";
import Button from "./ui/Button";

// Catches uncaught render-phase errors anywhere in the app and shows a
// recoverable screen instead of a blank white page. Mounted outside
// <BrowserRouter> in main.jsx, so navigation here uses window.location
// rather than useNavigate() -- also more robust if router state itself
// is what's corrupted. (FullPageMessage and Button are router-independent
// as long as no `to` prop is passed.)
export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Uncaught render error:", error, info);
  }

  handleReload = () => window.location.reload();

  handleGoHome = () => {
    window.location.href = isTokenValid() ? homeFor(getCurrentUser()) : "/login";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <FullPageMessage
        icon="ti-alert-triangle"
        tone="error"
        title="Something went wrong"
        message="This page ran into an unexpected error. You can reload the page or head back to a safe place."
        actions={
          <>
            <Button variant="secondary" icon="ti-home" onClick={this.handleGoHome}>
              Go home
            </Button>
            <Button icon="ti-refresh" onClick={this.handleReload}>
              Reload page
            </Button>
          </>
        }
      >
        {this.state.error?.message && (
          // Collapsed by default: useful when reporting a problem, but not the
          // first thing a non-technical user should be confronted with.
          <details className="mt-6 w-full text-left">
            <summary className="focus-ring cursor-pointer rounded-sm text-xs text-neutral-500 hover:text-neutral-700">
              Technical details
            </summary>
            <pre className="mt-2 break-words whitespace-pre-wrap rounded-sm bg-neutral-50 p-3 text-xs text-neutral-600">
              {this.state.error.message}
            </pre>
          </details>
        )}
      </FullPageMessage>
    );
  }
}
