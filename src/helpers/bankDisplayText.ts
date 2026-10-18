// Present clean, provider-neutral copy, including old saved assistant replies.
export function bankDisplayText(text: string) {
  return text
    .replace(
      /the available the banking service history/gi,
      "available bank history",
    )
    .replace(/the available Nessie history/gi, "available bank history")
    .replace(/\bNessie\b/g, "the banking service")
    .replace(/^the banking service/, "The banking service")
    .replace(/\u2014/g, ". ");
}
