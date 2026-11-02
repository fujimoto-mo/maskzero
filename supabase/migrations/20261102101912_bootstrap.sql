-- Bootstrap: objects that the generated table migration depends on.

-- Helpers used by RLS policies and triggers live here. This schema is not exposed through the
-- Supabase Data API (only `public` is), so nothing in it can be called over REST.
create schema if not exists private;

-- Time-ordered UUIDv7 (docs/04 conventions). Built from gen_random_uuid() (core since PG13), so no
-- extension is needed: the first 48 bits are replaced with Unix time in milliseconds, and the
-- version nibble goes from 4 (0100) to 7 (0111) by setting bits 52 and 53.
create or replace function public.uuid_generate_v7() returns uuid
language sql volatile parallel safe
set search_path = ''
as $$
  select encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
          from 1 for 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
$$;

-- Keeps updated_at current on every UPDATE.
create or replace function private.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
