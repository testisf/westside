/**
 * One icon set for the whole app: 16px grid, 1.5px stroke, round joins.
 * Add new icons here rather than pulling glyphs from elsewhere so weight stays consistent.
 */

const PATHS = {
  home: "M2.5 7.75 8 3l5.5 4.75M4 6.75V13h3V9.75h2V13h3V6.75",
  server: "M2.5 3.5h11v3.5h-11ZM2.5 9h11v3.5h-11ZM5 5.25h.01M5 10.75h.01",
  users:
    "M6 7.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5ZM2 13.25c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5M10.5 2.9a2.25 2.25 0 0 1 0 4.2M12 9.9c1.3.5 2 1.6 2 3.35",
  log: "M4 2h5.5L13 5.5V14H4ZM9.5 2v3.5H13M6 8.5h5M6 11h5",
  shield: "M8 1.75 13 3.5v4c0 3-2 5.3-5 6.75C5 12.8 3 10.5 3 7.5v-4ZM8 5.5v3M8 10.5h.01",
  key: "M5.5 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM7.3 9.2 13 3.5M11 5.5 12.5 7M9.5 7l1.25 1.25",
  lock: "M4 7h8v6.5H4ZM5.75 7V5.25a2.25 2.25 0 0 1 4.5 0V7",
  menu: "M2.5 4.5h11M2.5 8h11M2.5 11.5h11",
  x: "m3.5 3.5 9 9m0-9-9 9",
  sun: "M8 10.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9",
  moon: "M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85Z",
  chevronDown: "m4 6.25 4 4 4-4",
  chevronRight: "m6.25 4 4 4-4 4",
  copy: "M5.5 5.5h8v8h-8ZM3.5 10.5v-8h8",
  check: "m3.5 8.5 3 3 6-7",
  plus: "M8 3v10M3 8h10",
  arrowLeft: "M13 8H3m4-4L3 8l4 4",
  logout: "M6.5 3h-3v10h3M10 5.5 12.5 8 10 10.5M12.5 8h-7",
  rotate: "M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
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
