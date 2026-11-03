-- Phase 4: the interview workspace, and interviewers limited to the interviews they run
-- (docs/02 M1-4: "see candidates of the client — interviewer: own interviews").

--------------------------------------------------------------------------------------------------
-- Visibility helpers
--------------------------------------------------------------------------------------------------

-- What can_see_client meant until now: an active member whose scope includes the client. Still
-- right for the client row itself and for job postings, which interviewers need to work.
create or replace function private.is_client_member(p_org uuid, p_client uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (m.client_ids is null or p_client = any (m.client_ids))
  );
$$;

-- Client-wide data (applications, candidates, documents, events, messages, …) is no longer
-- visible to interviewers; the policies further down open their own interviews to them.
create or replace function private.can_see_client(p_org uuid, p_client uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role <> 'interviewer'
      and (m.client_ids is null or p_client = any (m.client_ids))
  );
$$;

-- True when the signed-in member runs an interview of this application.
create or replace function private.interviews_application(p_application uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.interviews i
    join public.memberships m on m.org_id = i.org_id
    where i.application_id = p_application
      and (select auth.uid()) = any (i.interviewer_ids)
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (m.client_ids is null or i.client_id = any (m.client_ids))
  );
$$;

create or replace function private.can_see_candidate(p_candidate uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.applications a
    join public.memberships m on m.org_id = a.org_id
    where a.candidate_id = p_candidate
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (m.client_ids is null or a.client_id = any (m.client_ids))
      and (m.role <> 'interviewer' or private.interviews_application(a.id))
  );
$$;

revoke all on function
  private.is_client_member(uuid, uuid), private.interviews_application(uuid)
from public;
grant execute on function
  private.is_client_member(uuid, uuid), private.interviews_application(uuid)
to authenticated;

--------------------------------------------------------------------------------------------------
-- What interviewers keep: their client, its job postings, and their own interviews
--------------------------------------------------------------------------------------------------

drop policy clients_select on public.clients;
create policy clients_select on public.clients
  for select to authenticated
  using (private.is_client_member(org_id, id));

create policy jobs_select_interviewer on public.jobs
  for select to authenticated
  using (
    private.is_client_member(org_id, client_id)
    and private.has_role(org_id, array['interviewer']::public.member_role[])
  );

create policy interviews_select_assigned on public.interviews
  for select to authenticated
  using ((select auth.uid()) = any (interviewer_ids) and private.is_client_member(org_id, client_id));

create policy applications_select_assigned on public.applications
  for select to authenticated
  using (private.interviews_application(id));

do $$
declare
  t text;
begin
  foreach t in array array['documents', 'application_answers', 'screening_runs'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (private.interviews_application(application_id))', t || '_select_assigned', t);
  end loop;
end;
$$;

create policy events_select_assigned on public.events
  for select to authenticated
  using (application_id is not null and private.interviews_application(application_id));

--------------------------------------------------------------------------------------------------
-- The workspace tables
--------------------------------------------------------------------------------------------------

revoke all on
  public.interview_questions, public.interview_evaluations, public.interview_transcripts,
  public.interview_reports, public.interview_decisions
from anon, authenticated;

grant select, insert, update on
  public.interview_questions, public.interview_evaluations, public.interview_transcripts,
  public.interview_reports, public.interview_decisions
to authenticated;

-- Prep, transcripts and report requests: editors of the client and the interview's interviewers.
do $$
declare
  t text;
begin
  foreach t in array array['interview_questions', 'interview_transcripts', 'interview_reports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (private.can_see_client(org_id, client_id)
                or private.interviews_application(application_id))', t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (private.can_edit_client(org_id, client_id)
                     or private.interviews_application(application_id))', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (private.can_edit_client(org_id, client_id)
                or private.interviews_application(application_id))
         with check (private.can_edit_client(org_id, client_id)
                     or private.interviews_application(application_id))', t || '_update', t);
  end loop;
end;
$$;

-- Evaluations: everyone who can see the interview reads them; each person writes only their own.
alter table public.interview_evaluations enable row level security;
create policy interview_evaluations_select on public.interview_evaluations
  for select to authenticated
  using (
    private.can_see_client(org_id, client_id) or private.interviews_application(application_id)
  );
create policy interview_evaluations_insert on public.interview_evaluations
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (private.can_edit_client(org_id, client_id)
         or private.interviews_application(application_id))
  );
create policy interview_evaluations_update on public.interview_evaluations
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (
    author_id = (select auth.uid())
    and (private.can_edit_client(org_id, client_id)
         or private.interviews_application(application_id))
  );

-- Decisions change the application, its invitations and emails: editors only, as themselves.
-- Interviewers give their recommendation in their evaluation.
alter table public.interview_decisions enable row level security;
create policy interview_decisions_select on public.interview_decisions
  for select to authenticated
  using (
    private.can_see_client(org_id, client_id) or private.interviews_application(application_id)
  );
create policy interview_decisions_insert on public.interview_decisions
  for insert to authenticated
  with check (private.can_edit_client(org_id, client_id) and decided_by = (select auth.uid()));
create policy interview_decisions_update on public.interview_decisions
  for update to authenticated
  using (private.can_edit_client(org_id, client_id))
  with check (private.can_edit_client(org_id, client_id));

--------------------------------------------------------------------------------------------------
-- updated_at
--------------------------------------------------------------------------------------------------

create trigger interview_questions_set_updated_at before update on public.interview_questions
  for each row execute function private.set_updated_at();
create trigger interview_evaluations_set_updated_at before update on public.interview_evaluations
  for each row execute function private.set_updated_at();
create trigger interview_transcripts_set_updated_at before update on public.interview_transcripts
  for each row execute function private.set_updated_at();
create trigger interview_reports_set_updated_at before update on public.interview_reports
  for each row execute function private.set_updated_at();

--------------------------------------------------------------------------------------------------
-- Recording notice (docs/02 M11-5): owners and admins switch it (organizations_update).
--------------------------------------------------------------------------------------------------

grant update (records_interviews) on public.organizations to authenticated;
