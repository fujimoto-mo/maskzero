-- Phase 5: the AI interviewer (docs/02 M12). Configs and blind reviews are staff data; sessions are
-- written by server code (candidate endpoints, background jobs) and, for invitations, by editors.

revoke all on
  public.ai_interview_configs, public.ai_interview_sessions, public.ai_interview_reviews
from anon, authenticated;

grant select, insert, update on public.ai_interview_configs to authenticated;
grant select, insert on public.ai_interview_sessions to authenticated;
grant select, insert, update on public.ai_interview_reviews to authenticated;

alter table public.ai_interview_configs enable row level security;
create policy ai_interview_configs_select on public.ai_interview_configs
  for select to authenticated
  using (private.can_see_client(org_id, client_id));
create policy ai_interview_configs_insert on public.ai_interview_configs
  for insert to authenticated
  with check (private.can_edit_client(org_id, client_id));
create policy ai_interview_configs_update on public.ai_interview_configs
  for update to authenticated
  using (private.can_edit_client(org_id, client_id))
  with check (private.can_edit_client(org_id, client_id));

alter table public.ai_interview_sessions enable row level security;
create policy ai_interview_sessions_select on public.ai_interview_sessions
  for select to authenticated
  using (private.can_see_client(org_id, client_id));
create policy ai_interview_sessions_insert on public.ai_interview_sessions
  for insert to authenticated
  with check (private.can_edit_client(org_id, client_id));

-- Blind reviews: everyone who sees the client reads them; each reviewer writes only their own.
alter table public.ai_interview_reviews enable row level security;
create policy ai_interview_reviews_select on public.ai_interview_reviews
  for select to authenticated
  using (private.can_see_client(org_id, client_id));
create policy ai_interview_reviews_insert on public.ai_interview_reviews
  for insert to authenticated
  with check (private.can_edit_client(org_id, client_id) and reviewer_id = (select auth.uid()));
create policy ai_interview_reviews_update on public.ai_interview_reviews
  for update to authenticated
  using (reviewer_id = (select auth.uid()))
  with check (private.can_edit_client(org_id, client_id) and reviewer_id = (select auth.uid()));

create trigger ai_interview_configs_set_updated_at before update on public.ai_interview_configs
  for each row execute function private.set_updated_at();
create trigger ai_interview_sessions_set_updated_at before update on public.ai_interview_sessions
  for each row execute function private.set_updated_at();

-- feature_flags is set by mask0 staff only: no update grant for app users.
