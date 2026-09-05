import { Fragment } from "react";

/** Minimal, safe markdown rendering for AI proposals (headings, lists, bold). */
export function MarkdownLite({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (!list.length) return;
    blocks.push(
      <ul key={key} className="my-1.5 ml-4 list-disc space-y-0.5 text-[11.5px] text-om-dim marker:text-om-muted">
        {list.map((li, i) => (
          <li key={i}>{inline(li)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const num = line.match(/^\s*\d+\.\s+(.*)$/);

    if (h) {
      flushList(`ul-${i}`);
      blocks.push(
        <div
          key={i}
          className="mt-3 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-om-blue first:mt-0"
        >
          {h[2]}
        </div>,
      );
    } else if (bullet || num) {
      list.push((bullet ?? num)![1]);
    } else if (line.trim() === "") {
      flushList(`ul-${i}`);
    } else {
      flushList(`ul-${i}`);
      blocks.push(
        <p key={i} className="my-1 text-[11.5px] leading-relaxed text-om-dim">
          {inline(line)}
        </p>,
      );
    }
  });
  flushList("ul-end");

  return <div>{blocks}</div>;
}

function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold text-om-text">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}
