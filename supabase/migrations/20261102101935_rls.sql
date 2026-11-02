-- Row Level Security, privileges, triggers and the onboarding function for the Phase 0 tables.
--
-- The app reaches these tables through Drizzle inside withRls() (role `authenticated` with the
-- user's JWT claims), and the Supabase Data API uses the same role, so these policies are the second
-- guard behind the explicit org/client filters in the app code (docs/05 §5).

--------------------------------------------------------------------------------------------------
-- Membership helpers. SECURITY DEFINER so policies can read memberships without recursing into the
-- memberships policies; STABLE so Postgres can reuse the result within a statement.
--------------------------------------------------------------------------------------------------

create or replace function private.is_member(p_org uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function private.has_role(p_org uuid, p_roles public.member_role[]) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any (p_roles)
  );
$$;

-- Members limited to some clients (memberships.client_ids) only see those clients.
create or replace function private.can_see_client(p_org uuid, p_client uuid) returns boolean
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

-- True when the current user and p_user are members of at least one common org.
create or replace function private.shares_org(p_user uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.org_id = mine.org_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.user_id = p_user
  );
$$;

revoke all on function
  private.is_member(uuid),
  private.has_role(uuid, public.member_role[]),
  private.can_see_client(uuid, uuid),
  private.shares_org(uuid)
from public;

grant usage on schema private to authenticated;
grant execute on function
  private.is_member(uuid),
  private.has_role(uuid, public.member_role[]),
  private.can_see_client(uuid, uuid),
  private.shares_org(uuid)
to authenticated;

--------------------------------------------------------------------------------------------------
-- Privileges. Start from nothing, then grant exactly what the policies below allow. TRUNCATE,
-- REFERENCES and TRIGGER are never granted (TRUNCATE ignores RLS).
--------------------------------------------------------------------------------------------------

revoke all on
  public.organizations, public.profiles, public.clients, public.memberships,
  public.invitations, public.events, public.audit_logs
from anon, authenticated;

grant select on public.organizations to authenticated;
grant update (name, sender_name, reply_to, entry_msg_template, doc_retention_days)
  on public.organizations to authenticated;

grant select on public.profiles to authenticated;
grant update (name, avatar_url, locale, last_login_at) on public.profiles to authenticated;

grant select, insert, delete on public.clients to authenticated;
grant update (name, slug, logo_path, sender_name_override, settings) on public.clients to authenticated;

grant select, delete on public.memberships to authenticated;
grant update (role, client_ids, status) on public.memberships to authenticated;

grant select, insert, update, delete on public.invitations to authenticated;

-- Append-only for app users.
grant select, insert on public.events, public.audit_logs to authenticated;

--------------------------------------------------------------------------------------------------
-- Policies
--------------------------------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.events enable row level security;
alter table public.audit_logs enable row level security;

-- organizations: created only by private.create_organization(); never deleted by app users.
create policy organizations_select on public.organizations
  for select to authenticated
  using (private.is_member(id));

create policy organizations_update on public.organizations
  for update to authenticated
  using (private.has_role(id, array['owner', 'admin']::public.member_role[]))
  with check (private.has_role(id, array['owner', 'admin']::public.member_role[]));

-- profiles: created by the auth.users trigger; visible to yourself and to people in your orgs.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_org(id));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- clients: admins manage them; the default client can't be created or deleted by hand.
create policy clients_select on public.clients
  for select to authenticated
  using (private.can_see_client(org_id, id));

create policy clients_insert on public.clients
  for insert to authenticated
  with check (
    private.has_role(org_id, array['owner', 'admin']::public.member_role[]) and not is_default
  );

create policy clients_update on public.clients
  for update to authenticated
  using (private.has_role(org_id, array['owner', 'admin']::public.member_role[]))
  with check (private.has_role(org_id, array['owner', 'admin']::public.member_role[]));

create policy clients_delete on public.clients
  for delete to authenticated
  using (
    private.has_role(org_id, array['owner', 'admin']::public.member_role[]) and not is_default
  );

-- memberships: rows are created only by security-definer functions (onboarding, accepting an
-- invitation), never inserted directly. Admins manage everyone except the owner.
create policy memberships_select on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_member(org_id));

create policy memberships_update on public.memberships
  for update to authenticated
  using (
    private.has_role(org_id, array['owner', 'admin']::public.member_role[]) and role <> 'owner'
  )
  with check (
    private.has_role(org_id, array['owner', 'admin']::public.member_role[]) and role <> 'owner'
  );

create policy memberships_delete on public.memberships
  for delete to authenticated
  using (
    private.has_role(org_id, array['owner', 'admin']::public.member_role[]) and role <> 'owner'
  );

-- invitations: admin only; nobody can be invited as owner.
create policy invitations_admin on public.invitations
  for all to authenticated
  using (private.has_role(org_id, array['owner', 'admin']::public.member_role[]))
  with check (
    private.has_role(org_id, array['owner', 'admin']::public.member_role[]) and role <> 'owner'
  );

-- events: readable per client scope. App users may only append their own staff events; system and
-- candidate events are written by trusted server code that bypasses RLS.
create policy events_select on public.events
  for select to authenticated
  using (
    case
      when client_id is null then private.is_member(org_id)
      else private.can_see_client(org_id, client_id)
    end
  );

create policy events_insert on public.events
  for insert to authenticated
  with check (
    actor = 'staff'
    and actor_id = (select auth.uid())
    and case
      when client_id is null then private.is_member(org_id)
      else private.can_see_client(org_id, client_id)
    end
  );

-- audit_logs: admins read; members append entries about themselves.
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (private.has_role(org_id, array['owner', 'admin']::public.member_role[]));

create policy audit_logs_insert on public.audit_logs
  for insert to authenticated
  with check (private.is_member(org_id) and user_id = (select auth.uid()));

--------------------------------------------------------------------------------------------------
-- updated_at triggers
--------------------------------------------------------------------------------------------------

create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger clients_set_updated_at before update on public.clients
  for each row execute function private.set_updated_at();
create trigger memberships_set_updated_at before update on public.memberships
  for each row execute function private.set_updated_at();

--------------------------------------------------------------------------------------------------
-- Profiles follow auth.users
--------------------------------------------------------------------------------------------------

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, coalesce(new.email, ''), nullif(btrim(new.raw_user_meta_data ->> 'name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function private.handle_user_email_change() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

-- Supabase Auth inserts users as supabase_auth_admin; let it reach the trigger functions.
grant usage on schema private to supabase_auth_admin;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

--------------------------------------------------------------------------------------------------
-- Onboarding: create an org with its default client and the caller as owner, atomically.
-- It lives in `private`, not `public`: the server calls it over a direct connection, and nothing
-- outside the app needs it through the Supabase Data API, which exposes `public`.
--------------------------------------------------------------------------------------------------

create or replace function private.create_organization(
  p_name text,
  p_kind public.org_kind default 'inhouse'
)
returns table (created_org_id uuid, org_slug text, client_slug text)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_org uuid;
  v_client uuid;
  v_slug text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 100 then
    raise exception 'organization name must be 1-100 characters' using errcode = '22023';
  end if;

  -- Short random slug: company names are usually Japanese and don't make readable URL slugs.
  loop
    v_slug := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    exit when not exists (select 1 from public.organizations o where o.slug = v_slug);
  end loop;

  insert into public.organizations (name, slug, kind)
  values (v_name, v_slug, p_kind)
  returning id into v_org;

  insert into public.clients (org_id, name, slug, is_default)
  values (v_org, v_name, 'main', true)
  returning id into v_client;

  insert into public.memberships (org_id, user_id, role, status)
  values (v_org, v_user, 'owner', 'active');

  insert into public.events (org_id, client_id, actor, actor_id, type, payload)
  values (v_org, v_client, 'staff', v_user, 'organization.created', jsonb_build_object('kind', p_kind));

  insert into public.audit_logs (org_id, user_id, action, target_type, target_id)
  values (v_org, v_user, 'organization.create', 'organization', v_org);

  return query select v_org, v_slug, 'main'::text;
end;
$$;

revoke all on function private.create_organization(text, public.org_kind) from public;
grant execute on function private.create_organization(text, public.org_kind) to authenticated;
