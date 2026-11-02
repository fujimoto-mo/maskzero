-- Phase 2: scheduling and messaging. RLS, grants, triggers and the constraint that makes double
-- bookings impossible. Same model as 20261102123921_intake_screening_rls.sql.

--------------------------------------------------------------------------------------------------
-- No double bookings, even with concurrent automatic confirmations (docs/04, docs/05 §9)
--------------------------------------------------------------------------------------------------

create extension if not exists btree_gist with schema extensions;

alter table public.interviews add constraint interviews_no_overlap
  exclude using gist (calendar_id with =, tstzrange(starts_at, ends_at) with &&)
  where (status = 'scheduled');

--------------------------------------------------------------------------------------------------
-- Grants
--------------------------------------------------------------------------------------------------

revoke all on
  public.calendars, public.availability_rules, public.slot_overrides, public.concern_options,
  public.interview_invitations, public.booking_requests, public.interviews,
  public.message_templates, public.messages
from anon, authenticated;

grant select, insert, update, delete on
  public.calendars, public.availability_rules, public.slot_overrides, public.concern_options
to authenticated;
-- Invitations, requests and interviews change state but are never deleted by staff.
grant select, insert, update on
  public.interview_invitations, public.booking_requests, public.interviews
to authenticated;
grant select, insert, update, delete on public.message_templates to authenticated;
-- The send log is written only by server code (admin connection).
grant select on public.messages to authenticated;

--------------------------------------------------------------------------------------------------
-- Policies
--------------------------------------------------------------------------------------------------

-- Client-owned tables: readable within client scope, writable by editors.
do $$
declare
  t text;
begin
  foreach t in array array[
    'calendars', 'availability_rules', 'slot_overrides', 'concern_options',
    'interview_invitations', 'booking_requests', 'interviews'
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
  end loop;
  foreach t in array array['calendars', 'availability_rules', 'slot_overrides', 'concern_options'] loop
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (private.can_edit_client(org_id, client_id))', t || '_delete', t);
  end loop;
end;
$$;

-- Templates: every member reads the company's wording; owners and admins change it.
alter table public.message_templates enable row level security;
create policy message_templates_select on public.message_templates
  for select to authenticated
  using (private.is_member(org_id));
create policy message_templates_write on public.message_templates
  for all to authenticated
  using (private.has_role(org_id, array['owner', 'admin']::public.member_role[]))
  with check (private.has_role(org_id, array['owner', 'admin']::public.member_role[]));

-- The send log: readable within client scope.
alter table public.messages enable row level security;
create policy messages_select on public.messages
  for select to authenticated
  using (private.can_see_client(org_id, client_id));

--------------------------------------------------------------------------------------------------
-- updated_at
--------------------------------------------------------------------------------------------------

create trigger availability_rules_set_updated_at before update on public.availability_rules
  for each row execute function private.set_updated_at();
create trigger interview_invitations_set_updated_at before update on public.interview_invitations
  for each row execute function private.set_updated_at();
create trigger booking_requests_set_updated_at before update on public.booking_requests
  for each row execute function private.set_updated_at();
create trigger interviews_set_updated_at before update on public.interviews
  for each row execute function private.set_updated_at();
create trigger message_templates_set_updated_at before update on public.message_templates
  for each row execute function private.set_updated_at();
create trigger messages_set_updated_at before update on public.messages
  for each row execute function private.set_updated_at();

--------------------------------------------------------------------------------------------------
-- Company test mode (docs/02 M9-6): owners and admins switch it (organizations_update policy).
--------------------------------------------------------------------------------------------------

grant update (test_mode) on public.organizations to authenticated;
