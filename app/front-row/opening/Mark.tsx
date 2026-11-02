import { useId } from "react";

// Front Row's mark (mockups/front-row/home/home.html #logo): Cadenza's dark tile with one gradient line, drawn as a
// camera. The classes and pathLength let the Intro draw it.
export function Mark({ className }: { className?: string }) {
  const g = useId();
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <defs><linearGradient id={g} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fcd34d" /><stop offset="1" stopColor="#ea580c" /></linearGradient></defs>
      <rect className="tile" width="32" height="32" rx="8" fill="#050507" />
      <g fill="none" stroke={`url(#${g})`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path className="ln" pathLength={1} d="M7 12.5a2 2 0 0 1 2-2h2.6l1.6-2.3h5.6l1.6 2.3H23a2 2 0 0 1 2 2V22a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" />
        <circle className="ln lens" pathLength={1} cx="16" cy="16.8" r="3.6" />
      </g>
      <circle className="dot" cx="16" cy="16.8" r="1.3" fill={`url(#${g})`} />
    </svg>
  );
}
