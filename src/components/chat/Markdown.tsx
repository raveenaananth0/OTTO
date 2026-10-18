import { Fragment } from "react";
// Small safe renderer: plain text, bold and lists; no HTML is ever injected.
export default function Markdown({ text }: { text: string }) {
  const inline = (line: string) =>
    line
      .split(/(\*\*[^*]+\*\*)/g)
      .map((part, i) =>
        part.startsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      );
  return (
    <>
      {text.split("\n").map((line, i) =>
        /^\s*([-*]|\d+\.)\s/.test(line) ? (
          <div key={i} style={{ paddingLeft: 16 }}>
            • {inline(line.replace(/^\s*([-*]|\d+\.)\s+/, ""))}
          </div>
        ) : (
          <div key={i}>{inline(line) || <br />}</div>
        ),
      )}
    </>
  );
}
