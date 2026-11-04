-- Connected accounts (docs/02 M8-6, M9-4) and the meeting bot's live transcript (M11-5, M11-7).

revoke all on
  public.integrations, public.interview_live_segments, public.interview_assists
from anon, authenticated;

--------------------------------------------------------------------------------------------------
-- Integrations: owners and admins connect and disconnect accounts. Every member sees which accounts
-- are connected (the interview tools on the scheduling page depend on it), nobody sees the tokens:
-- there is no SELECT grant on tokens_enc, and only server code (on the admin connection) reads or
-- refreshes them.
--------------------------------------------------------------------------------------------------

grant select (id, org_id, provider, account_email, scopes, status, error, connected_by,
              connected_at, updated_at)
  on public.integrations to authenticated;
-- Drizzle names every column in an INSERT (DEFAULT for the unset ones), so the grant covers the
-- table; the policy below keeps it to owners and admins.
grant insert on public.integrations to authenticated;
grant delete on public.integrations to authenticated;

alter table public.integrations enable row level security;
create policy integrations_select on public.integrations
  for select to authenticated
  using (private.is_member(org_id));
create policy integrations_insert on public.integrations
  for insert to authenticated
  with check (private.has_role(org_id, array['owner', 'admin']::public.member_role[])
              and connected_by = (select auth.uid()));
create policy integrations_delete on public.integrations
  for delete to authenticated
  using (private.has_role(org_id, array['owner', 'admin']::public.member_role[]));

create trigger integrations_set_updated_at before update on public.integrations
  for each row execute function private.set_updated_at();

--------------------------------------------------------------------------------------------------
-- What the meeting bot heard and the AI's suggestions: written by server code (the bot's webhook,
-- background jobs), read by whoever may open the interview, like its transcript.
--------------------------------------------------------------------------------------------------

grant select on public.interview_live_segments, public.interview_assists to authenticated;

alter table public.interview_live_segments enable row level security;
create policy interview_live_segments_select on public.interview_live_segments
  for select to authenticated
  using (private.can_see_client(org_id, client_id)
         or private.interviews_application(application_id));

alter table public.interview_assists enable row level security;
create policy interview_assists_select on public.interview_assists
  for select to authenticated
  using (private.can_see_client(org_id, client_id)
         or private.interviews_application(application_id));

create trigger interview_assists_set_updated_at before update on public.interview_assists
  for each row execute function private.set_updated_at();

--------------------------------------------------------------------------------------------------
-- Company settings: the Gmail sender and the bot's name, switched by owners and admins
-- (organizations_update).
--------------------------------------------------------------------------------------------------

grant update (email_via, bot_name) on public.organizations to authenticated;
