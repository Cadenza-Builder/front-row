-- Front Row: a lecture recorded on a phone becomes notes. The server (admin client) writes the lecture, each segment's
-- model output and the finished notes file; the browser only reads them, deletes a lecture and uploads its own audio.
create table public.lectures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  course_label text not null,
  -- Optional: a lecture works without a Cadenza course, and outlives a deleted one.
  course_id uuid references public.courses on delete set null,
  week_id uuid references public.weeks on delete set null,
  source text not null check (source in ('phone', 'room')),
  status text not null default 'recording' check (status in ('recording', 'processing', 'ready', 'failed')),
  started_at timestamptz not null default now(),
  duration_s int,
  segment_count int not null default 0,
  notes jsonb,
  snaps jsonb,
  file_id uuid references public.files on delete set null,
  error text,
  created_at timestamptz not null default now()
);
alter table public.lectures enable row level security;
-- The browser reads and deletes its own lectures and never writes one: the API routes create and update them with
-- the admin client after checking the week through RLS, so a lecture cannot point into another student's week.
create policy own_rows_read on public.lectures for select to authenticated using ((select auth.uid()) = user_id);
create policy own_rows_delete on public.lectures for delete to authenticated using ((select auth.uid()) = user_id);
revoke insert, update on public.lectures from anon, authenticated;
create index on public.lectures (user_id);
create index on public.lectures (course_id);
create index on public.lectures (week_id);
create index on public.lectures (file_id);

create table public.lecture_segments (
  lecture_id uuid references public.lectures on delete cascade,
  user_id uuid not null default auth.uid(),
  n int,
  status text check (status in ('uploaded', 'done', 'failed')),
  result jsonb,
  primary key (lecture_id, n)
);
alter table public.lecture_segments enable row level security;
create policy own_rows_read on public.lecture_segments for select to authenticated
  using ((select auth.uid()) = user_id);
create index on public.lecture_segments (user_id);
-- Model output: only the service role writes it.
revoke insert, update, delete on public.lecture_segments from anon, authenticated;

alter table public.profiles add column recording_consent_at timestamptz;

-- The notes file is written by the server; files_cap already refuses any origin but 'upload' from the browser.
alter table public.files drop constraint files_origin_check,
  add constraint files_origin_check check (origin in ('upload', 'drive', 'onedrive', 'canvas', 'ai', 'lecture'));
alter table public.runs drop constraint runs_kind_check,
  add constraint runs_kind_check check (kind in ('syllabus', 'lesson', 'questions', 'paper', 'notes', 'plan', 'chat', 'slides', 'lecture'));

-- Audio segments and board snapshots: private, 8 MB, path `${user}/${lecture}/${n}.wav` or `${n}-${t}.jpg`, own folder only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lectures', 'lectures', false, 8388608, array['audio/wav', 'image/jpeg']);
create policy lectures_read on storage.objects for select to authenticated
  using (bucket_id = 'lectures' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy lectures_add on storage.objects for insert to authenticated
  with check (bucket_id = 'lectures' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy lectures_change on storage.objects for update to authenticated
  using (bucket_id = 'lectures' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'lectures' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy lectures_remove on storage.objects for delete to authenticated
  using (bucket_id = 'lectures' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Rollback (objects in the bucket must be removed through the Storage API first):
--   drop policy lectures_read on storage.objects; drop policy lectures_add on storage.objects;
--   drop policy lectures_change on storage.objects; drop policy lectures_remove on storage.objects;
--   delete from storage.buckets where id = 'lectures';
--   delete from public.files where origin = 'lecture'; delete from public.runs where kind = 'lecture';
--   alter table public.runs drop constraint runs_kind_check,
--     add constraint runs_kind_check check (kind in ('syllabus', 'lesson', 'questions', 'paper', 'notes', 'plan', 'chat', 'slides'));
--   alter table public.files drop constraint files_origin_check,
--     add constraint files_origin_check check (origin in ('upload', 'drive', 'onedrive', 'canvas', 'ai'));
--   alter table public.profiles drop column recording_consent_at;
--   drop table public.lecture_segments; drop table public.lectures;
