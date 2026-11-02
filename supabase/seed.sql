-- Local sandbox data, applied by `supabase start` / `supabase db reset`. Synthetic data only.
--
-- LOCAL ONLY: never apply this to a hosted project (no `supabase db push --include-seed`). It
-- creates a login whose password is published right here. `pnpm db:push` leaves it out.
-- The future public /demo sandbox (docs/02 M0-4) needs its own seed without a shared password.
--
-- Demo login (LOCAL DEVELOPMENT ONLY):
--   email:    demo@mask0.example
--   password: mask0-demo-pass
--   URL:      http://localhost:3000/app/demo/main/dashboard

do $$
declare
  v_user uuid := '0195f000-0000-7000-8000-000000000001';
  v_org uuid := '0195f000-0000-7000-8000-0000000000a1';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
    email_change, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
    'demo@mask0.example', extensions.crypt('mask0-demo-pass', extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}', '{"name": "デモ 担当者"}', now(), now(),
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    v_user, v_user::text,
    jsonb_build_object('sub', v_user::text, 'email', 'demo@mask0.example', 'email_verified', true),
    'email', now(), now(), now()
  );

  -- The auth.users trigger has created the profile. Build an agency with three clients.
  insert into public.organizations (id, slug, name, kind)
  values (v_org, 'demo', 'デモ人材株式会社', 'agency');

  insert into public.clients (org_id, name, slug, is_default) values
    (v_org, 'デモ人材株式会社', 'main', true),
    (v_org, '見本商事株式会社', 'mihon', false),
    (v_org, '例示ソリューションズ株式会社', 'reiji', false);

  insert into public.memberships (org_id, user_id, role) values (v_org, v_user, 'owner');

  insert into public.events (org_id, actor, actor_id, type, payload)
  values (v_org, 'staff', v_user, 'organization.created', '{"kind": "agency", "seed": true}');
end;
$$;
