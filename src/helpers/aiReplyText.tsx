export function aiReplyText(response: unknown): string {
  const value = response as {
    output_text?: string;
    output?: {
      type?: string;
      content?: { type?: string; text?: string; refusal?: string }[];
    }[];
  };
  return (
    value.output_text?.trim() ||
    value.output
      ?.filter((i) => i.type === "message")
      .flatMap((i) => i.content || [])
      .map((c) =>
        c.type === "output_text"
          ? c.text
          : c.type === "refusal"
            ? c.refusal
            : "",
      )
      .filter(Boolean)
      .join("\n")
      .trim() ||
    ""
  );
}
