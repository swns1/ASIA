import { useNavigate } from "react-router-dom";
import { usePageTitle } from "../hooks/usePageTitle";
import { isTokenValid, getCurrentUser, homeFor } from "../utils/auth";
import FullPageMessage from "../components/ui/FullPageMessage";
import Button from "../components/ui/Button";

export default function NotFoundPage() {
  usePageTitle("Not Found");
  const navigate = useNavigate();

  const signedIn = isTokenValid();

  return (
    <FullPageMessage
      icon="ti-file-search"
      tone="brand"
      title="Page not found"
      message="The page you're looking for doesn't exist or may have moved."
      actions={
        <>
          {/* "Back" first: returning to where they were is almost always what
              someone who mistyped or followed a stale link actually wants. */}
          <Button variant="secondary" icon="ti-arrow-left" onClick={() => navigate(-1)}>
            Go back
          </Button>
          <Button onClick={() => navigate(signedIn ? homeFor(getCurrentUser()) : "/login")}>
            {signedIn ? "Go to dashboard" : "Go to login"}
          </Button>
        </>
      }
    />
  );
}
