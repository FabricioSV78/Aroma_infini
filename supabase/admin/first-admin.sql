-- OPERATOR-ONLY: run in a verified development SQL session, never an API RPC.
-- 1. Create the administrator directly in Supabase Authentication > Users.
-- 2. Choose the password there as the project owner.
-- 3. Verify the Auth UUID, replace the placeholder below, and review this SQL.
-- No public signup, metadata value or hardcoded application email grants admin.
-- This creates the first active membership only. It never changes credentials.
begin;
do $bootstrap$
declare
  target uuid := '__VERIFIED_AUTH_USER_ID__'::uuid;
begin
  if current_user <> 'postgres' then
    raise exception 'Run as the verified project database operator.';
  end if;
  if not exists (
    select 1 from auth.users where id = target
      and coalesce(email, '') <> ''
      and coalesce(encrypted_password, '') <> ''
      and deleted_at is null
  ) then
    raise exception 'The verified Auth account must have an email and a password.';
  end if;
  if exists (select 1 from private.admin_memberships where active and user_id <> target) then
    raise exception 'An administrator already exists. Use a reviewed membership change instead of first-admin bootstrap.';
  end if;
  insert into private.admin_memberships(user_id, active, granted_by)
    values (target, true, null)
    on conflict (user_id) do nothing;
  if not exists (select 1 from private.admin_memberships where user_id = target and active) then
    raise exception 'Existing inactive membership requires an explicit reviewed reactivation.';
  end if;
end;
$bootstrap$;
commit;

-- The grant does not skip MFA. private.is_admin() still requires AAL2, and the
-- administrative login must complete TOTP enrollment before allowing access.
-- granted_by is NULL for this operator bootstrap; do not invent an app actor.
