-- Lectures (20261028000000_lectures.sql), on a scratch Postgres; see stub.sql for the command, ending in
-- -f supabase/tests/lectures.sql. Each check raises when it fails.
-- Student A owns course C with week W and Front Row course L; student B owns course CB with week WB and Front Row course LB.
insert into auth.users values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2');
insert into public.profiles (user_id) values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2');
insert into public.courses (id, user_id, name) values
  ('c0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1', 'ECO101'),
  ('cb000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000b2', 'MAT135');
insert into public.weeks (id, user_id, course_id, number) values
  ('d0000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-00000000000c', 1),
  ('db000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000b2', 'cb000000-0000-0000-0000-00000000000c', 1);
insert into public.lecture_courses (id, user_id, name) values
  ('f0000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000a1', 'ECO101'),
  ('fb000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000b2', 'MAT135');

create function pg_temp.expect_error(sql text, msg text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'expected %: %', msg, sql;
exception when others then
  if sqlerrm <> msg then raise exception 'expected %, got "%": %', msg, sqlerrm, sql; end if;
end $$;
-- Supabase grants these; the stub does not (as in classes.sql).
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

-- The server (admin client) creates A's lecture on A's week, stamps consent, writes a segment and the notes file.
set role service_role;
set request.jwt.claim.role = 'service_role';
insert into public.lectures (id, user_id, lecture_course_id, number, course_id, week_id, source) values
  ('e0000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-00000000000f', 1, 'c0000000-0000-0000-0000-00000000000c', 'd0000000-0000-0000-0000-00000000000d', 'phone'),
  ('e1000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-00000000000f', 2, null, null, 'room');
update public.profiles set recording_consent_at = now() where user_id = '00000000-0000-0000-0000-0000000000a1';
insert into public.lecture_segments (lecture_id, user_id, n, status, result)
  values ('e0000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-0000000000a1', 0, 'done', '{"text":"x"}');
insert into public.files (user_id, course_id, week_id, name, origin, text, status)
  values ('00000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-00000000000c', 'd0000000-0000-0000-0000-00000000000d', 'Lecture notes', 'lecture', 'Notes', 'extracted');
reset role;
set request.jwt.claim.role = '';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
-- Keywords reach every Meta call for this student's lectures, so the browser can't write a huge list; meets is a list.
select pg_temp.expect_error($$update public.lecture_courses set keywords = array[repeat('x', 8001)] where id = 'f0000000-0000-0000-0000-00000000000f'$$, 'new row for relation "lecture_courses" violates check constraint "lecture_courses_keywords_check"');
select pg_temp.expect_error($$update public.lecture_courses set meets = '{"weekday": 2}' where id = 'f0000000-0000-0000-0000-00000000000f'$$, 'new row for relation "lecture_courses" violates check constraint "lecture_courses_meets_check"');
-- The browser never writes a lecture: not a new one, and not its own (no pointing it at B's week, no forged notes).
select pg_temp.expect_error($$insert into public.lectures (lecture_course_id, number, source) values ('f0000000-0000-0000-0000-00000000000f', 3, 'phone')$$, 'permission denied for table lectures');
select pg_temp.expect_error($$update public.lectures set week_id = 'db000000-0000-0000-0000-00000000000d' where id = 'e0000000-0000-0000-0000-00000000000e'$$, 'permission denied for table lectures');
select pg_temp.expect_error($$update public.lectures set notes = '{}', status = 'ready'$$, 'permission denied for table lectures');
-- Nor can it free a lecture another finish holds.
select pg_temp.expect_error($$update public.lectures set processing_at = null$$, 'permission denied for table lectures');
-- Recording consent is stamped by the server, never by the browser.
select pg_temp.expect_error($$update public.profiles set recording_consent_at = now()$$, 'permission denied for table profiles');
-- Segments carry model output: only the server writes them.
select pg_temp.expect_error($$insert into public.lecture_segments (lecture_id, n, status) values ('e0000000-0000-0000-0000-00000000000e', 1, 'done')$$, 'permission denied for table lecture_segments');
-- The browser cannot label a file as a lecture's notes.
select pg_temp.expect_error($$insert into public.files (course_id, week_id, name, origin) values ('c0000000-0000-0000-0000-00000000000c', 'd0000000-0000-0000-0000-00000000000d', 'notes', 'lecture')$$, 'origin_server_only');
-- A lecture run starts like any other run, one at a time per week.
select public.start_run('d0000000-0000-0000-0000-00000000000d', 'lecture');
select pg_temp.expect_error($$select public.start_run('d0000000-0000-0000-0000-00000000000d', 'lecture')$$, 'duplicate key value violates unique constraint "runs_one_running"');
-- Audio goes into A's own folder of the lectures bucket.
insert into storage.objects (bucket_id, name) values ('lectures', '00000000-0000-0000-0000-0000000000a1/e0000000-0000-0000-0000-00000000000e/0.wav');
-- A adds and renames their own Front Row course, and cannot add one in B's name.
insert into public.lecture_courses (name) values ('STA220');
update public.lecture_courses set name = 'ECO101 Y' where id = 'f0000000-0000-0000-0000-00000000000f';
select pg_temp.expect_error($$insert into public.lecture_courses (user_id, name) values ('00000000-0000-0000-0000-0000000000b2', 'x')$$, 'new row violates row-level security policy for table "lecture_courses"');
-- Nor delete one: the cascade would orphan its lectures' audio and frames in storage.
select pg_temp.expect_error($$delete from public.lecture_courses where id = 'f0000000-0000-0000-0000-00000000000f'$$, 'permission denied for table lecture_courses');
-- A reads their own courses, lectures and segment.
do $$ begin
  if (select count(*) from public.lecture_courses) <> 2 then raise exception 'A cannot read their own courses (or sees B''s)'; end if;
  if (select count(*) from public.lectures) <> 2 then raise exception 'A cannot read their lectures'; end if;
  if (select count(*) from public.lecture_segments) <> 1 then raise exception 'A cannot read their segment'; end if;
end $$;

-- B sees none of A's courses, lectures, segments or audio, cannot change or delete them, and cannot write into A's folder.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  if (select count(*) from public.lecture_courses) <> 1 then raise exception 'B sees A''s Front Row courses'; end if;
  if exists (select from public.lectures) then raise exception 'B sees A''s lecture'; end if;
  if exists (select from public.lecture_segments) then raise exception 'B sees A''s segments'; end if;
  if exists (select from storage.objects where bucket_id = 'lectures') then raise exception 'B sees A''s audio'; end if;
end $$;
delete from public.lectures;
update public.lecture_courses set keywords = '{x}' where id = 'f0000000-0000-0000-0000-00000000000f';
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('lectures', '00000000-0000-0000-0000-0000000000a1/e0000000-0000-0000-0000-00000000000e/1.wav')$$, 'new row violates row-level security policy for table "objects"');
reset role;
do $$ begin
  if (select count(*) from public.lectures) <> 2 then raise exception 'B deleted A''s lecture'; end if;
  if (select keywords from public.lecture_courses where id = 'f0000000-0000-0000-0000-00000000000f') <> '{}' then raise exception 'B changed A''s course'; end if;
end $$;

-- Deleting the week keeps the lecture and clears week_id.
delete from public.weeks where id = 'd0000000-0000-0000-0000-00000000000d';
do $$ begin
  if (select week_id from public.lectures where id = 'e0000000-0000-0000-0000-00000000000e') is not null then raise exception 'week delete did not clear week_id'; end if;
end $$;
-- A deletes their own lecture, and its segments go with it.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
delete from public.lectures where id = 'e0000000-0000-0000-0000-00000000000e';
reset role;
do $$ begin
  if exists (select from public.lectures where id = 'e0000000-0000-0000-0000-00000000000e') then raise exception 'A could not delete their lecture'; end if;
  if exists (select from public.lecture_segments) then raise exception 'segments outlived their lecture'; end if;
end $$;
-- Deleting a Front Row course deletes its lectures.
delete from public.lecture_courses where id = 'f0000000-0000-0000-0000-00000000000f';
do $$ begin
  if exists (select from public.lectures) then raise exception 'lectures outlived their course'; end if;
end $$;
select 'lectures ok';
