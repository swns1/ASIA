import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import Button from "./Button";

// CopyButton — puts text on the clipboard and says so.
//
// `text` may be a string or a function returning one, so a caller can build
// the copy (plain text from markup, say) only when it is clicked. The label
// turns to "Copied" for a moment; a browser that refuses the clipboard gets
// a toast rather than a silent nothing.

export default function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  variant = "secondary",
  size = "sm",
  ...props
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — please select the text and copy it manually.");
    }
  };

  return (
    <Button variant={variant} size={size} icon={copied ? "ti-check" : "ti-copy"} onClick={copy} {...props}>
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </Button>
  );
}
