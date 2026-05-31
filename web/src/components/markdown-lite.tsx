import type React from "react";

/**
 * Minimal, safe markdown renderer — headings, bold/italic, inline code, links,
 * bullet + numbered lists, and paragraphs. No `dangerouslySetInnerHTML`: every
 * leaf is a React node, so user/agent text is escaped automatically.
 *
 * Deliberately small (no markdown lib dependency). Good enough to turn an
 * agent's raw markdown result into something scannable instead of a wall of
 * `whitespace-pre-wrap` text. Shared by the run Output panel and Documents.
 */
export function MarkdownLite({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <article className="space-y-3 text-sm leading-relaxed">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (/^#{1,3}\s/.test(lines[0] ?? "")) {
          const level = (lines[0].match(/^#+/)?.[0].length ?? 1) as 1 | 2 | 3;
          const content = lines[0].replace(/^#+\s/, "");
          const cls =
            level === 1
              ? "font-semibold text-xl"
              : level === 2
                ? "font-semibold text-lg"
                : "font-medium text-base";
          return (
            <h3 key={i} className={cls}>
              {inline(content)}
            </h3>
          );
        }
        if (lines.every((l) => /^\s*[-*]\s/.test(l) || l.trim() === "")) {
          return (
            <ul key={i} className="ml-5 list-disc space-y-1">
              {lines
                .filter((l) => l.trim())
                .map((l, j) => (
                  <li key={j}>{inline(l.replace(/^\s*[-*]\s/, ""))}</li>
                ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\s*\d+\.\s/.test(l) || l.trim() === "")) {
          return (
            <ol key={i} className="ml-5 list-decimal space-y-1">
              {lines
                .filter((l) => l.trim())
                .map((l, j) => (
                  <li key={j}>{inline(l.replace(/^\s*\d+\.\s/, ""))}</li>
                ))}
            </ol>
          );
        }
        return (
          <p key={i} className="text-foreground/90">
            {lines.map((l, j) => (
              <span key={j}>
                {inline(l)}
                {j < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </article>
  );
}

/** Inline **bold** / *italic* / `code` / [links](url) → escaped React nodes. */
function inline(text: string): React.ReactNode {
  const parts = text
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g)
    .filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("*") && p.endsWith("*")) return <em key={i}>{p.slice(1, -1)}</em>;
    if (p.startsWith("`") && p.endsWith("`"))
      return (
        <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {p.slice(1, -1)}
        </code>
      );
    const link = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <a
          key={i}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary underline underline-offset-2"
        >
          {link[1]}
        </a>
      );
    }
    return <span key={i}>{p}</span>;
  });
}
