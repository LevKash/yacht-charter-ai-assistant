import type { ReactNode } from "react";

/**
 * Very small, dependency-free markdown renderer: paragraphs, bullet/numbered
 * lists, and **bold**. Enough for assistant answers and card bodies.
 */
export function LightMarkdown({ text, className }: { text: string; className?: string }) {
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  return (
    <div className={`prose-light ${className ?? ""}`}>
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim().length > 0);
        if (lines.length === 0) return null;
        const isBullet = lines.every((l) => /^\s*[-*•]\s+/.test(l));
        const isNumbered = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
        if (isBullet || isNumbered) {
          const items = lines.map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ""));
          const List = isBullet ? "ul" : "ol";
          return (
            <List key={i}>
              {items.map((item, j) => (
                <li key={j}>{inline(item)}</li>
              ))}
            </List>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {inline(l.replace(/^#+\s*/, ""))}
                {j < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
}
