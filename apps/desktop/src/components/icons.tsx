/** One icon set for the app: 16px grid, 1.5px stroke, round joins. */

const PATHS = {
  home: "M2.5 7.75 8 3l5.5 4.75M4 6.75V13h3V9.75h2V13h3V6.75",
  server: "M2.5 3.5h11v3.5h-11ZM2.5 9h11v3.5h-11ZM5 5.25h.01M5 10.75h.01",
  settings:
    "M8 10.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5ZM8 1.5v1.3M8 13.2v1.3M14.5 8h-1.3M2.8 8H1.5M12.3 3.7l-.9.9M4.6 11.4l-.9.9M12.3 12.3l-.9-.9M4.6 4.6l-.9-.9",
  lock: "M4 7h8v6.5H4ZM5.75 7V5.25a2.25 2.25 0 0 1 4.5 0V7",
  key: "M5.5 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM7.3 9.2 13 3.5M11 5.5 12.5 7M9.5 7l1.25 1.25",
  radio: "M8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM5.5 5.5a3.5 3.5 0 0 0 0 5M10.5 5.5a3.5 3.5 0 0 1 0 5M3.5 3.5a6.5 6.5 0 0 0 0 9M12.5 3.5a6.5 6.5 0 0 1 0 9",
  chevronDown: "m4 6.25 4 4 4-4",
  chevronRight: "m6.25 4 4 4-4 4",
  x: "m3.5 3.5 9 9m0-9-9 9",
  copy: "M5.5 5.5h8v8h-8ZM3.5 10.5v-8h8",
  check: "m3.5 8.5 3 3 6-7",
  plus: "M8 3v10M3 8h10",
  arrowLeft: "M13 8H3m4-4L3 8l4 4",
  logout: "M6.5 3h-3v10h3M10 5.5 12.5 8 10 10.5M12.5 8h-7",
  rotate: "M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3",
  sun: "M8 10.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9",
  moon: "M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85Z",
  download: "M8 2.5v7.5m0 0-3-3m3 3 3-3M3.5 12.5h9",
  keyboard: "M2 4.5h12v7H2ZM4.5 7h.01M7 7h.01M9.5 7h.01M12 7h.01M4.5 9.5h7",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
