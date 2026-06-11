import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface CopyButtonProps {
  readonly value: string;
  readonly label?: string;
}

export function CopyButton({ value, label = "Copy" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (e.g. insecure context); fail silently.
    }
  }

  return (
    <button
      aria-label={copied ? "Copied" : label}
      className="copy-button"
      onClick={handleCopy}
      title={copied ? "Copied" : label}
      type="button"
    >
      {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
    </button>
  );
}
