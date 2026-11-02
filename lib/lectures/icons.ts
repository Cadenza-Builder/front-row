// A Front Row course's icon. Mirrors the check in supabase/migrations/20261102120000_lecture_course_icon.sql.
export const ICONS = ["chart", "sigma", "brain", "flask", "book", "globe", "code", "atom", "scales", "palette"] as const;
export type Icon = (typeof ICONS)[number];
