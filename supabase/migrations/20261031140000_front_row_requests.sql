-- Front Row access requests from the public /front-row landing (docs/front-row-request-access-plan.md).
-- The one table without user_id: a visitor asks before they have an account. RLS on, no policy, nothing granted to the
-- browser; only the service role writes it (lib/lectures/request.ts, through the function below) and /admin reads it.
-- No account sits behind a row, so account deletion never reaches it: a request to be forgotten is a hand delete.
-- Apply BEFORE the code deploys: the route calls request_front_row_access().
create table public.front_row_requests (
  email text primary key check (char_length(email) <= 254),
  created_at timestamptz not null default now()
);
alter table public.front_row_requests enable row level security;
revoke all on public.front_row_requests from anon, authenticated;

-- One request; a repeat email stores nothing new. False once 200 requests landed in the last day, so a script cannot
-- fill the table. The cap is global: a flood blocks real visitors for up to a day (the route answers 429).
create function public.request_front_row_access(p_email text) returns boolean
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('front_row_requests'));
  if (select count(*) from public.front_row_requests where created_at > now() - interval '1 day') >= 200 then
    return false;
  end if;
  insert into public.front_row_requests (email) values (p_email) on conflict (email) do nothing;
  return true;
end $$;
revoke execute on function public.request_front_row_access(text) from public, anon, authenticated;
grant execute on function public.request_front_row_access(text) to service_role;
