import Link from "next/link";
import { Fragment } from "react";

/**
 * Campus rich text: renders #hashtags and @mentions as navigable links.
 * Pure render transform — no fabricated data. Unknown mentions resolve via
 * the profile page (which 404s cleanly); hashtags search campus content.
 * Never uses dangerouslySetInnerHTML (XSS-safe by construction).
 */
const TOKEN = /([#@][A-Za-z0-9_]{1,30})/g;

export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(TOKEN);
  return (
    <p className={className}>
      {parts.map((part, i) => {
        if (part.startsWith("#") && part.length > 1) {
          const tag = part.slice(1);
          return (
            <Link
              key={i}
              href={`/search?q=${encodeURIComponent(`#${tag}`)}`}
              className="font-medium text-primary hover:underline"
            >
              {part}
            </Link>
          );
        }
        if (part.startsWith("@") && part.length > 1) {
          const name = part.slice(1);
          return (
            <Link
              key={i}
              href={`/profile/${encodeURIComponent(name)}`}
              className="font-medium text-primary hover:underline"
            >
              {part}
            </Link>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </p>
  );
}
