-- OPERATOR ONLY. Review the target project and Auth UUIDs before execution.
-- Create each person's account in Supabase Authentication > Users first.
-- This script never creates passwords, shares accounts, or bypasses MFA.
-- Replace BOTH UUID placeholders. The responsible account must already be
-- an active administrator. Use enabled=false for a reviewed revocation.
begin;

do $membership$
declare
  target uuid := '__VERIFIED_AUTH_USER_ID__'::uuid;
  responsible uuid := '__EXISTING_ADMIN_AUTH_USER_ID__'::uuid;
  enabled boolean := true;
begin
  if current_user <> 'postgres' then
    raise exception 'Run as the verified project database operator.';
  end if;
  -- Serialize operator grants/revocations so concurrent reviews cannot each
  -- remove what the other transaction still sees as the remaining admin.
  lock table private.admin_memberships in share row exclusive mode;
  if not exists (
    select 1 from private.admin_memberships
    where user_id = responsible and active
  ) then
    raise exception 'The responsible Auth UUID must be an active administrator.';
  end if;
  if enabled and not exists (
    select 1 from auth.users
    where id = target and coalesce(email, '') <> ''
      and coalesce(encrypted_password, '') <> '' and deleted_at is null
      and (banned_until is null or banned_until <= pg_catalog.now())
  ) then
    raise exception 'The verified Auth account must have an email, password and active access.';
  end if;
  if not enabled and not exists (
    select 1 from private.admin_memberships where user_id = target
  ) then
    raise exception 'The target must have an existing administrative membership.';
  end if;
  if not enabled and exists (
    select 1 from private.admin_memberships where user_id = target and active
  ) and not exists (
    select 1 from private.admin_memberships where active and user_id <> target
  ) then
    raise exception 'Keep at least one active administrator.';
  end if;
  insert into private.admin_memberships(user_id, active, granted_by)
    values(target, enabled, responsible)
  on conflict(user_id) do update set
    active = excluded.active,
    granted_by = excluded.granted_by,
    granted_at = pg_catalog.now()
  where private.admin_memberships.active is distinct from excluded.active;
end;
$membership$;

commit;

-- Revocation invalidates remembered devices via the trusted-device migration.
-- Application actions continue to record the real signed-in Auth UUID.
