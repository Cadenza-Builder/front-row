-- Front Row: each course shows one of ten icons (lib/lectures/icons.ts), picked at Add Course or Rename. Existing
-- courses get the book. Written only by the API (insert/update stay revoked for the browser).
-- Rollback: alter table public.lecture_courses drop column icon;
alter table public.lecture_courses add column icon text not null default 'book'
  check (icon in ('chart', 'sigma', 'brain', 'flask', 'book', 'globe', 'code', 'atom', 'scales', 'palette'));
