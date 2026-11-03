-- Phase 3: custom emails, inbound mail, the "not yet entered" list, notification settings and the
-- talent pool. RLS, grants and triggers; same model as 20261102143029_scheduling_rls.sql.

--------------------------------------------------------------------------------------------------
-- Grants
--------------------------------------------------------------------------------------------------

revoke all on
  public.custom_messages, public.inbound_emails, public.entry_waits,
  public.notification_settings, public.pool_suggestions
from anon, authenticated;

grant select, insert, update, delete on public.custom_messages to authenticated;
-- Inbound mail and waits are created by server code (admin connection); staff mark them read or
-- dismissed.
grant select on public.inbound_emails, public.entry_waits to authenticated;
grant update (read_at, read_by) on public.inbound_emails to authenticated;
grant update (status) on public.entry_waits to authenticated;
grant select, insert, update on public.notification_settings to authenticated;
grant select, insert on public.pool_suggestions to authenticated;
-- Owners and admins set the nudge text and claim the inbound address (organizations_update).
grant update (nudge_msg_template, inbound_local_part) on public.organizations to authenticated;

--------------------------------------------------------------------------------------------------
-- Policies
--------------------------------------------------------------------------------------------------

-- Custom emails: every member reads those for clients they can see; owners and admins write.
alter table public.custom_messages enable row level security;
create policy custom_messages_select on public.custom_messages
  for select to authenticated
  using (
    private.is_member(org_id)
    and (client_id is null or private.can_see_client(org_id, client_id))
  );
create policy custom_messages_write on public.custom_messages
  for all to authenticated
  using (private.has_role(org_id, array['owner', 'admin']::public.member_role[]))
  with check (private.has_role(org_id, array['owner', 'admin']::public.member_role[]));

-- Inbound mail: matched rows within client scope; unmatched rows (no client yet) admins only.
alter table public.inbound_emails enable row level security;
create policy inbound_emails_select on public.inbound_emails
  for select to authenticated
  using (
    (client_id is not null and private.can_see_client(org_id, client_id))
    or (client_id is null and private.has_role(org_id, array['owner', 'admin']::public.member_role[]))
  );
create policy inbound_emails_update on public.inbound_emails
  for update to authenticated
  using (client_id is not null and private.can_edit_client(org_id, client_id))
  with check (client_id is not null and private.can_edit_client(org_id, client_id));

alter table public.entry_waits enable row level security;
create policy entry_waits_select on public.entry_waits
  for select to authenticated
  using (private.can_see_client(org_id, client_id));
create policy entry_waits_update on public.entry_waits
  for update to authenticated
  using (private.can_edit_client(org_id, client_id))
  with check (private.can_edit_client(org_id, client_id));

-- Notification settings: each member manages only their own.
alter table public.notification_settings enable row level security;
create policy notification_settings_own on public.notification_settings
  for all to authenticated
  using (user_id = (select auth.uid()) and private.is_member(org_id))
  with check (user_id = (select auth.uid()) and private.is_member(org_id));

-- Talent pool suggestions: within the suggested job's client; editors suggest as themselves.
alter table public.pool_suggestions enable row level security;
create policy pool_suggestions_select on public.pool_suggestions
  for select to authenticated
  using (private.can_see_client(org_id, client_id));
create policy pool_suggestions_insert on public.pool_suggestions
  for insert to authenticated
  with check (
    private.can_edit_client(org_id, client_id) and suggested_by = (select auth.uid())
  );

--------------------------------------------------------------------------------------------------
-- updated_at
--------------------------------------------------------------------------------------------------

create trigger custom_messages_set_updated_at before update on public.custom_messages
  for each row execute function private.set_updated_at();
create trigger entry_waits_set_updated_at before update on public.entry_waits
  for each row execute function private.set_updated_at();
create trigger notification_settings_set_updated_at before update on public.notification_settings
  for each row execute function private.set_updated_at();

--------------------------------------------------------------------------------------------------
-- Accepting an invitation limited to some clients lands on the first of those clients, not on the
-- default client the new member can't see (docs/02 M1-4). Same function otherwise.
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
    join public.clients c on c.org_id = o.id
    where o.id = v_invitation.org_id
      and (v_invitation.client_ids is null or c.id = any(v_invitation.client_ids))
    order by c.is_default desc, c.name
    limit 1;
end;
$$;
