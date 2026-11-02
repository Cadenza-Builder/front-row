import type { Icon } from "@/lib/lectures/icons";

// The ten course icons from mockups/front-row/home (dark tile, one gradient line). The gradient `#fr-ga` lives in (app)/layout.tsx.
const G: Record<Icon, React.ReactNode> = {
  chart: <><path d="M17 44l10-12 8 7 13-16" /><circle cx="48" cy="23" r="3.2" className="f" /></>,
  sigma: <path d="M42 19H21l12 13-12 13h21" />,
  brain: <path d="M30 19c-6-3-12 1-11 6-5 1-6 8-2 11-2 5 3 10 8 8 2 4 5 4 5 0V19zM34 19c6-3 12 1 11 6 5 1 6 8 2 11 2 5-3 10-8 8-2 4-5 4-5 0" />,
  flask: <path d="M27 17h10M28 17v11L18 45a3 3 0 0 0 3 4h22a3 3 0 0 0 3-4L36 28V17M23 40h18" />,
  book: <path d="M32 23c-5-4-11-4-15-3v24c4-1 10-1 15 3 5-4 11-4 15-3V20c-4-1-10-1-15 3zM32 23v24" />,
  globe: <><circle cx="32" cy="32" r="14" /><path d="M18 32h28M32 18c-5 5-5 23 0 28M32 18c5 5 5 23 0 28" /></>,
  code: <path d="M25 22l-10 10 10 10M39 22l10 10-10 10M35 18l-6 28" />,
  atom: <><ellipse cx="32" cy="32" rx="16" ry="6.5" /><ellipse cx="32" cy="32" rx="16" ry="6.5" transform="rotate(60 32 32)" /><ellipse cx="32" cy="32" rx="16" ry="6.5" transform="rotate(-60 32 32)" /><circle cx="32" cy="32" r="2.6" className="f" /></>,
  scales: <path d="M32 17v29M24 46h16M18 22h28M18 22l-5 11h10zM46 22l-5 11h10z" />,
  palette: <><path d="M32 17a15 15 0 1 0 0 30c3 0 4-2 3-4s0-5 3-5h5a5 5 0 0 0 5-5c0-9-7-16-16-16z" /><circle cx="24" cy="30" r="2.2" className="f" /><circle cx="31" cy="24" r="2.2" className="f" /><circle cx="39" cy="27" r="2.2" className="f" /></>,
};

export function CourseIcon({ icon, size = 56 }: { icon: Icon; size?: number }) {
  return (
    <svg className="fr-icon" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" rx="16" />
      {G[icon] ?? G.book}
    </svg>
  );
}
