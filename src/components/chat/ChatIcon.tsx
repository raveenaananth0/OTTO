export function ChatIcon({
  name,
  size = 18,
}: {
  name: "plus" | "menu" | "close" | "send" | "chat" | "edit";
  size?: number;
}) {
  const paths = {
    plus: "M12 5v14M5 12h14",
    menu: "M4 6h16M4 12h16M4 18h16",
    close: "m6 6 12 12M6 18 18 6",
    send: "M12 19V5m-6 6 6-6 6 6",
    chat: "M21 11a8 8 0 0 1-8 8H4l-2 3V11a8 8 0 0 1 8-8h3a8 8 0 0 1 8 8Z",
    edit: "m15 5 4 4M4 20l4-1L20 7l-5-5L3 14l1 6Z",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function OttoMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="23" cy="28" r="16" stroke="currentColor" strokeWidth="4" />
      <circle cx="41" cy="28" r="16" stroke="currentColor" strokeWidth="4" />
      <path d="M7 51h50" stroke="#d03027" strokeWidth="3" />
    </svg>
  );
}
