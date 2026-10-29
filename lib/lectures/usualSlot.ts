/**
 * The weekday (0 = Sunday) and minutes after midnight, in `tz`, when this course is usually recorded: two lectures on
 * the same weekday starting within 30 minutes of each other. The latest such lecture gives the slot.
 * shortcut: one slot per course, so a Tue/Thu course shows only its latest day; return all slots if Home needs both.
 */
export function usualSlot(lectures: { startedAt: Date }[], tz: string): { weekday: number; minutes: number } | null {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" });
  const slots = [...lectures]
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .map(({ startedAt }) => {
      const p = Object.fromEntries(fmt.formatToParts(startedAt).map((x) => [x.type, x.value]));
      return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), minutes: Number(p.hour) * 60 + Number(p.minute) };
    });
  return slots.find((s, i) => slots.some((o, j) => j !== i && o.weekday === s.weekday && Math.abs(o.minutes - s.minutes) <= 30)) ?? null;
}
