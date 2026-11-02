-- Phase 1: RLS, privileges and helper functions for intake and screening, storage buckets,
-- invitations and retention bookkeeping. Same model as 20261102101935_rls.sql.

--------------------------------------------------------------------------------------------------
-- Helpers
--------------------------------------------------------------------------------------------------

-- Members who may change a client's jobs, candidates and screening: owner, admin and recruiter,
-- within their client scope. Interviewers and viewers can read but not edit.
create or replace function private.can_edit_client(p_org uuid, p_client uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner', 'admin', 'recruiter')
      and (m.client_ids is null or p_client = any (m.client_ids))
  );
$$;

-- A candidate (one person, possibly applying to several clients' jobs) is visible to members who
-- can see at least one of their applications.
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
  );
$$;

revoke all on function private.can_edit_client(uuid, uuid), private.can_see_candidate(uuid) from public;
grant execute on function private.can_edit_client(uuid, uuid), private.can_see_candidate(uuid)
  to authenticated;

--------------------------------------------------------------------------------------------------
-- Privileges: nothing for anon; exactly what the policies below allow for app users.
--------------------------------------------------------------------------------------------------

revoke all on
  public.jobs, public.job_images, public.entry_urls, public.candidates, public.applications,
  public.application_answers, public.documents, public.consents, public.csv_imports,
  public.screening_settings, public.screening_criteria, public.screening_runs,
  public.screening_decisions, public.ai_usage, public.data_requests, public.contact_inquiries,
  public.rate_limits
from anon, authenticated;

grant select, insert, update, delete on
  public.jobs, public.job_images, public.entry_urls, public.screening_settings,
  public.screening_criteria, public.application_answers, public.documents
to authenticated;
grant select, update, delete on public.candidates to authenticated;
grant select, insert, update, delete on public.applications to authenticated;
grant select, insert on public.screening_decisions, public.csv_imports to authenticated;
grant select on public.consents, public.screening_runs, public.ai_usage to authenticated;
grant select, insert, update on public.data_requests to authenticated;
grant update (notifications_seen_at) on public.profiles to authenticated;
-- contact_inquiries and rate_limits: server code only, no grants.

--------------------------------------------------------------------------------------------------
-- Policies
--------------------------------------------------------------------------------------------------

-- Client-owned tables that recruiters edit: readable within client scope, writable by editors.
do $$
declare
  t text;
begin
  foreach t in array array[
    'jobs', 'job_images', 'entry_urls', 'screening_settings', 'screening_criteria',
    'application_answers', 'documents'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (private.can_see_client(org_id, client_id))', t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (private.can_edit_client(org_id, client_id))', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (private.can_edit_client(org_id, client_id))
         with check (private.can_edit_client(org_id, client_id))', t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (private.can_edit_client(org_id, client_id))', t || '_delete', t);
  end loop;
end;
$$;

alter table public.candidates enable row level security;
alter table public.applications enable row level security;
alter table public.consents enable row level security;
alter table public.csv_imports enable row level security;
alter table public.screening_runs enable row level security;
alter table public.screening_decisions enable row level security;
alter table public.ai_usage enable row level security;
alter table public.data_requests enable row level security;
alter table public.contact_inquiries enable row level security;
alter table public.rate_limits enable row level security;

-- candidates: created only through private.upsert_candidate() (dedupe across client scopes) or by
-- server code for candidate entries; staff edit contact details of candidates they can see.
create policy candidates_select on public.candidates
  for select to authenticated
  using (private.can_see_candidate(id));

create policy candidates_update on public.candidates
  for update to authenticated
  using (
    private.can_see_candidate(id)
    and private.has_role(org_id, array['owner', 'admin', 'recruiter']::public.member_role[])
  )
  with check (private.has_role(org_id, array['owner', 'admin', 'recruiter']::public.member_role[]));

create policy candidates_delete on public.candidates
  for delete to authenticated
  using (
    private.can_see_candidate(id)
    and private.has_role(org_id, array['owner', 'admin']::public.member_role[])
  );

create policy applications_select on public.applications
  for select to authenticated
  using (private.can_see_client(org_id, client_id));

create policy applications_insert on public.applications
  for insert to authenticated
  with check (private.can_edit_client(org_id, client_id));

create policy applications_update on public.applications
  for update to authenticated
  using (private.can_edit_client(org_id, client_id))
  with check (private.can_edit_client(org_id, client_id));

create policy applications_delete on public.applications
  for delete to authenticated
  using (
    private.can_see_client(org_id, client_id)
    and private.has_role(org_id, array['owner', 'admin']::public.member_role[])
  );

-- Written by trusted server code (entry submissions, the screening pipeline); staff read them.
create policy consents_select on public.consents
  for select to authenticated
  using (private.can_see_client(org_id, client_id));

create policy screening_runs_select on public.screening_runs
  for select to authenticated
  using (private.can_see_client(org_id, client_id));

-- Staff decisions are recorded under their own name.
create policy screening_decisions_select on public.screening_decisions
  for select to authenticated
  using (private.can_see_client(org_id, client_id));

create policy screening_decisions_insert on public.screening_decisions
  for insert to authenticated
  with check (
    private.can_edit_client(org_id, client_id)
    and source in ('staff', 'confirm', 'revert')
    and decided_by = (select auth.uid())
  );

create policy csv_imports_select on public.csv_imports
  for select to authenticated
  using (private.can_see_client(org_id, client_id));

create policy csv_imports_insert on public.csv_imports
  for insert to authenticated
  with check (private.can_edit_client(org_id, client_id) and created_by = (select auth.uid()));

create policy ai_usage_select on public.ai_usage
  for select to authenticated
  using (private.has_role(org_id, array['owner', 'admin']::public.member_role[]));

create policy data_requests_admin on public.data_requests
  for all to authenticated
  using (private.has_role(org_id, array['owner', 'admin']::public.member_role[]))
  with check (private.has_role(org_id, array['owner', 'admin']::public.member_role[]));

-- contact_inquiries, rate_limits: RLS on and no policies, so only trusted server code reads them.

--------------------------------------------------------------------------------------------------
-- updated_at and retention bookkeeping
--------------------------------------------------------------------------------------------------

create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function private.set_updated_at();
create trigger candidates_set_updated_at before update on public.candidates
  for each row execute function private.set_updated_at();
create trigger applications_set_updated_at before update on public.applications
  for each row execute function private.set_updated_at();
create trigger documents_set_updated_at before update on public.documents
  for each row execute function private.set_updated_at();
create trigger screening_settings_set_updated_at before update on public.screening_settings
  for each row execute function private.set_updated_at();
create trigger screening_criteria_set_updated_at before update on public.screening_criteria
  for each row execute function private.set_updated_at();

-- When an application closes as rejected or withdrawn, schedule its purge after the org's
-- retention period (docs/04 §7); reopening it cancels the purge.
create or replace function private.set_application_closure() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_days integer;
begin
  if new.outcome = 'active' then
    new.closed_at := null;
    new.purge_after := null;
  elsif tg_op = 'INSERT' or old.outcome is distinct from new.outcome then
    new.closed_at := coalesce(new.closed_at, now());
    if new.outcome in ('rejected', 'withdrawn') then
      select o.doc_retention_days into v_days from public.organizations o where o.id = new.org_id;
      new.purge_after := new.closed_at + make_interval(days => v_days);
    else
      new.purge_after := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger applications_closure before insert or update of outcome on public.applications
  for each row execute function private.set_application_closure();

--------------------------------------------------------------------------------------------------
-- Candidate dedupe for staff (manual add, CSV import)
--------------------------------------------------------------------------------------------------

-- Returns the org's candidate with this email hash, creating it if needed. SECURITY DEFINER so a
-- recruiter limited to some clients still finds a person who applied elsewhere in the org, without
-- being able to read that person's other applications.
create or replace function private.upsert_candidate(
  p_org uuid,
  p_name text,
  p_email_enc text,
  p_email_hash text,
  p_phone_enc text,
  p_phone_hash text
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.has_role(p_org, array['owner', 'admin', 'recruiter']::public.member_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'name is required' using errcode = '22023';
  end if;

  if p_email_hash is not null then
    select c.id into v_id from public.candidates c
    where c.org_id = p_org and c.email_hash = p_email_hash;
  end if;
  if v_id is null then
    insert into public.candidates (org_id, name, email_enc, email_hash, phone_enc, phone_hash)
    values (p_org, btrim(p_name), p_email_enc, p_email_hash, p_phone_enc, p_phone_hash)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function private.upsert_candidate(uuid, text, text, text, text, text) from public;
grant execute on function private.upsert_candidate(uuid, text, text, text, text, text)
  to authenticated;

--------------------------------------------------------------------------------------------------
-- Invitations: accept as the invited, signed-in user
--------------------------------------------------------------------------------------------------

create or replace function private.accept_invitation(p_token_hash text)
returns table (org_slug text, client_slug text)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  v_invitation public.invitations%rowtype;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select u.email into v_email from auth.users u where u.id = v_user;

  select * into v_invitation from public.invitations i
  where i.token_hash = p_token_hash
  for update;
  if not found or v_invitation.accepted_at is not null or v_invitation.expires_at < now() then
    raise exception 'invitation invalid or expired' using errcode = '22023';
  end if;
  if lower(v_invitation.email) <> lower(coalesce(v_email, '')) then
    raise exception 'invitation is for a different email address' using errcode = '42501';
  end if;

  -- Existing members keep their current role.
  insert into public.memberships (org_id, user_id, role, client_ids, status)
  values (v_invitation.org_id, v_user, v_invitation.role, v_invitation.client_ids, 'active')
  on conflict (org_id, user_id) do nothing;

  update public.invitations set accepted_at = now() where id = v_invitation.id;

  insert into public.events (org_id, actor, actor_id, type, payload)
  values (v_invitation.org_id, 'staff', v_user, 'member.joined',
          jsonb_build_object('role', v_invitation.role));
  insert into public.audit_logs (org_id, user_id, action, target_type, target_id)
  values (v_invitation.org_id, v_user, 'invitation.accept', 'invitation', v_invitation.id);

  return query
    select o.slug, c.slug
    from public.organizations o
    join public.clients c on c.org_id = o.id and c.is_default
    where o.id = v_invitation.org_id;
end;
$$;

revoke all on function private.accept_invitation(text) from public;
grant execute on function private.accept_invitation(text) to authenticated;

--------------------------------------------------------------------------------------------------
-- Storage. No storage policies: only the server, with the secret key, reads or writes these
-- buckets, after its own permission checks (docs/05 §8). Job images are public on purpose: they
-- appear on the public entry pages.
--------------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 10485760,
   array['application/pdf', 'image/jpeg', 'image/png']),
  ('job-images', 'job-images', true, 4194304, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
