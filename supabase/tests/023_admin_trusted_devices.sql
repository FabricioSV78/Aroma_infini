-- SQL-only Auth fixtures, never proof of GoTrue, real MFA or JWT validation.
begin;
do $$ begin if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then raise exception 'Only isolated SQL fixtures';end if;end $$;
create schema aroma_device_test;
grant usage on schema aroma_device_test to anon,authenticated,service_role,aro_api_executor;
create function aroma_device_test.ok(value boolean,label text) returns text language plpgsql set search_path='' as $$
begin if value is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end $$;
create function aroma_device_test.error(statement text,state text,label text) returns text language plpgsql set search_path='' as $$
declare actual text;begin begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
if actual is distinct from state then raise exception 'FAIL: %, expected %, got %',label,state,coalesce(actual,'success');end if;return 'PASS: '||label;end $$;
create function aroma_device_test.uid(i integer) returns uuid language sql immutable set search_path='' as $$
select ('a1230000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid $$;
create function aroma_device_test.sid(i integer) returns uuid language sql immutable set search_path='' as $$
select ('b1230000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid $$;
create function aroma_device_test.fid(i integer) returns uuid language sql immutable set search_path='' as $$
select ('c1230000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid $$;
create function aroma_device_test.hash(value text) returns text language sql immutable set search_path='' as $$
select encode(sha256(convert_to(value,'UTF8')),'hex') $$;
create function aroma_device_test.claims(owner_number integer,session_number integer,assurance text default 'aal1',password boolean default true,totp_age integer default null)
returns text language sql volatile set search_path='' as $$
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_device_test.uid(owner_number),'role','authenticated',
 'session_id',aroma_device_test.sid(session_number),'aal',assurance,'amr',
 (case when password then jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)) else '[]'::jsonb end)
 ||case when totp_age is not null then jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint-totp_age)) else '[]'::jsonb end)::text,true) $$;
grant execute on all functions in schema aroma_device_test to anon,authenticated,service_role,aro_api_executor;
create table aroma_device_test.saved(key text primary key,value jsonb);
grant select,insert,update,delete on aroma_device_test.saved to authenticated;

insert into auth.users(id,email,encrypted_password) values
 (aroma_device_test.uid(1),'device-a@example.invalid','fixture-password-hash-a'),
 (aroma_device_test.uid(2),'device-b@example.invalid','fixture-password-hash-b'),
 (aroma_device_test.uid(3),'device-customer@example.invalid','fixture-password-hash-c');
insert into private.admin_memberships(user_id) values(aroma_device_test.uid(1)),(aroma_device_test.uid(2));
insert into auth.mfa_factors(id,user_id,factor_type,status,secret) values
 (aroma_device_test.fid(1),aroma_device_test.uid(1),'totp','verified','fixture-only-a'),
 (aroma_device_test.fid(2),aroma_device_test.uid(2),'totp','verified','fixture-only-b'),
 (aroma_device_test.fid(3),aroma_device_test.uid(1),'totp','unverified','fixture-only-pending');
insert into auth.sessions(id,user_id,aal,factor_id,not_after) values
 (aroma_device_test.sid(1),aroma_device_test.uid(1),'aal2',aroma_device_test.fid(1),null),
 (aroma_device_test.sid(2),aroma_device_test.uid(1),'aal1',null,null),
 (aroma_device_test.sid(3),aroma_device_test.uid(1),'aal1',null,null),
 (aroma_device_test.sid(4),aroma_device_test.uid(1),'aal1',null,null),
 (aroma_device_test.sid(5),aroma_device_test.uid(1),'aal1',null,now()-interval '1 second'),
 (aroma_device_test.sid(6),aroma_device_test.uid(2),'aal2',aroma_device_test.fid(2),null),
 (aroma_device_test.sid(7),aroma_device_test.uid(2),'aal1',null,null),
 (aroma_device_test.sid(8),aroma_device_test.uid(3),'aal1',null,null);

select aroma_device_test.ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in(
 'private.admin_trusted_devices'::regclass,'private.admin_trusted_sessions'::regclass,'private.admin_trusted_device_limits'::regclass)),
 'All trusted-device tables enforce and force RLS');
select aroma_device_test.ok(not exists(select 1 from (values('anon'),('authenticated'),('service_role')) roles(name)
 cross join (values('private.admin_trusted_devices'),('private.admin_trusted_sessions'),('private.admin_trusted_device_limits')) tables(name)
 where has_table_privilege(roles.name,tables.name,'select,insert,update,delete')),'Browser and service roles have no raw trusted-device table access');
select aroma_device_test.ok(not has_function_privilege('service_role','api.admin_device_resume(text)','execute')
 and not has_function_privilege('anon','api.admin_device_register(text,text)','execute')
 and not has_function_privilege('authenticated','private.admin_device_trusted_until()','execute')
 and has_function_privilege('aro_api_executor','private.admin_device_trusted_until()','execute'),
 'Only authenticated user RPCs and the internal identity helper receive narrowly scoped execute grants');
select aroma_device_test.ok((select bool_and(proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=""']) from pg_proc
 where oid in('private.admin_device_session()'::regprocedure,'private.admin_device_trusted_until()'::regprocedure,'api.admin_device_resume(text)'::regprocedure)),
 'Managed Auth reads use narrow fixed-path postgres definers');
set local role anon;
select aroma_device_test.error('select api.admin_device_resume(repeat(''a'',64))','42501','Anonymous cannot use a remembered cookie');
reset role;
set local role service_role;
select aroma_device_test.error('select api.admin_device_register(repeat(''a'',64),''Browser'')','42501','Service role cannot create arbitrary trusted devices');
reset role;

select aroma_device_test.claims(3,8,'aal2',true,0);
set local role authenticated;
select aroma_device_test.error('select api.admin_device_register(aroma_device_test.hash(repeat(''a'',64)),''Customer'')','42501','A customer with AAL2 cannot create admin trust');
select aroma_device_test.ok(api.admin_device_resume(repeat('a',64))->>'trusted'='false','Customer cannot resume administrative trust');
select aroma_device_test.error('select api.admin_catalog_page(1,0)','42501','A customer cannot call the actual administrative catalog RPC');
select aroma_device_test.error('select token_hash from private.admin_trusted_devices','42501','An authenticated caller cannot select private cookie hashes directly');
reset role;
select aroma_device_test.claims(1,2,'aal1',true,0);
set local role authenticated;
select aroma_device_test.error('select api.admin_device_register(aroma_device_test.hash(repeat(''a'',64)),''Browser'')','42501','AAL1 cannot register a remembered device');
reset role;
select aroma_device_test.claims(1,1,'aal2',true,301);
set local role authenticated;
select aroma_device_test.error('select api.admin_device_register(aroma_device_test.hash(repeat(''a'',64)),''Browser'')','42501','A stale TOTP cannot enroll trust');
reset role;
select aroma_device_test.claims(1,1,'aal2',false,0);
set local role authenticated;
select aroma_device_test.error('select api.admin_device_register(aroma_device_test.hash(repeat(''a'',64)),''Browser'')','42501','Enrollment requires password authentication as well as recent genuine TOTP');
reset role;
select aroma_device_test.claims(1,99,'aal2',true,0);
set local role authenticated;
select aroma_device_test.error('select api.admin_device_register(aroma_device_test.hash(repeat(''a'',64)),''Browser'')','42501','A JWT without a live Auth session cannot enroll trust');
reset role;
select aroma_device_test.claims(1,1,'aal2',true,0);
set local role authenticated;
select aroma_device_test.error('select api.admin_device_register(repeat(''x'',64),''Browser'')','22023','Registration validates the server-generated token hash');
insert into aroma_device_test.saved values('a',api.admin_device_register(aroma_device_test.hash(repeat('a',64)),'Browser A'));
select aroma_device_test.ok((api.admin_device_list()->'items'->0->>'current')::boolean,'Registration labels the issuing Auth session as the current device');
select aroma_device_test.ok(not (api.admin_device_list()->'items'->0 ?| array['token_hash','credential_hash','factor_id','user_id']),
 'Device listing returns no credential hashes, cookie hashes, factor IDs or owners');
reset role;
select aroma_device_test.claims(1,1,'aal1',true);
set local role authenticated;
select aroma_device_test.ok(api.current_actor()->>'requires_mfa'='true' and api.current_actor()->>'trusted_device'='false',
 'Registering after genuine TOTP never upgrades an older pre-MFA AAL1 JWT sharing that Auth session');
select aroma_device_test.error('select api.admin_catalog_page(1,0)','42501','An older pre-MFA JWT cannot use administrative RPCs merely because its session registered a device');
reset role;
select aroma_device_test.ok((select not authorized_by_resume from private.admin_trusted_sessions where session_id=aroma_device_test.sid(1)),
 'Registration creates non-authorizing current-browser linkage until a cookie is proved');
select aroma_device_test.ok((select extract(epoch from(expires_at-created_at))=5184000 and created_by=user_id from private.admin_trusted_devices
 where id=(select (value->>'id')::uuid from aroma_device_test.saved where key='a')),'Remembered trust has a fixed audited 60-day lifetime');
select aroma_device_test.ok((select token_hash=aroma_device_test.hash(repeat('a',64)) and token_hash<>repeat('a',64) from private.admin_trusted_devices
 where id=(select (value->>'id')::uuid from aroma_device_test.saved where key='a')),'Only SHA256 of the cookie token is stored');

select aroma_device_test.claims(1,2);
set local role authenticated;
select aroma_device_test.ok((api.current_actor()->>'requires_mfa')::boolean,'A new password session receives no trust automatically');
select aroma_device_test.ok(api.admin_device_resume(repeat('x',64))->>'trusted'='false','Malformed token fails without raising away rate accounting');
select aroma_device_test.ok(api.admin_device_resume(repeat('b',64))->>'trusted'='false','An unknown well-formed cookie is denied');
select aroma_device_test.ok(api.admin_device_resume(repeat('a',64))->>'trusted'='true','Password plus the existing HttpOnly cookie grants this Auth session');
select aroma_device_test.ok(api.current_actor()->>'aal'='aal1' and api.current_actor()->>'trusted_device'='true'
 and api.current_actor()->>'requires_mfa'='false','Remembered authorization preserves real AAL1 and separately satisfies application MFA policy');
select aroma_device_test.ok(api.admin_catalog_page(1,0) ? 'products','A trusted AAL1 session can use the existing direct Supabase administrative RPCs');
select aroma_device_test.error('select api.admin_device_register(aroma_device_test.hash(repeat(''c'',64)),''Cannot extend'')','42501',
 'Remembered trust cannot enroll or extend another device without genuine recent TOTP');
reset role;
select aroma_device_test.ok((select attempt_count=3 from private.admin_trusted_device_limits where user_id=aroma_device_test.uid(1) and action='resume'),
 'Invalid and valid resume attempts are counted persistently together');
-- Simulate a different signed JWT for the same live session: claims alone are
-- SQL fixtures here. Production PostgREST verifies their signature first.
select set_config('request.jwt.claims',(current_setting('request.jwt.claims')::jsonb||'{"iat":1}'::jsonb)::text,true);
set local role authenticated;
select aroma_device_test.ok(api.current_actor()->>'requires_mfa'='true','A different JWT in the same Auth session does not inherit a cookie-proven grant');
select aroma_device_test.error('select api.admin_catalog_page(1,0)','42501','The actual admin RPC rejects a different same-session JWT until cookie proof');
select aroma_device_test.ok(api.admin_device_resume(repeat('a',64))->>'trusted'='true',
 'A refreshed same-session JWT can prove the remembered cookie without extending expiry');
select aroma_device_test.ok(api.current_actor()->>'requires_mfa'='false','The new JWT becomes authorized after its successful cookie proof');
reset role;
select aroma_device_test.ok((select expires_at=(select (value->>'expires_at')::timestamptz from aroma_device_test.saved where key='a')
 from private.admin_trusted_sessions where session_id=aroma_device_test.sid(2)), 'A new JWT cookie proof preserves the original device expiry');
select aroma_device_test.claims(1,2);
set local role authenticated;
select aroma_device_test.ok(api.current_actor()->>'requires_mfa'='true','An older JWT stops matching after a newer same-session JWT proves the cookie');
select api.admin_device_resume(repeat('a',64));
reset role;
select aroma_device_test.claims(1,3);
set local role authenticated;
select aroma_device_test.ok(api.current_actor()->>'requires_mfa'='true','A session-bound grant cannot authorize a second session');
select aroma_device_test.ok(api.admin_device_resume(repeat('a',64))->>'trusted'='true','A second freshly authenticated password session may prove the remembered cookie');
reset role;
select aroma_device_test.claims(1,4,'aal1',false);
set local role authenticated;
select aroma_device_test.ok(api.admin_device_resume(repeat('a',64))->>'trusted'='false','A session without verified password AMR cannot use remembered trust');
reset role;
select aroma_device_test.claims(1,5);
set local role authenticated;
select aroma_device_test.ok(api.admin_device_resume(repeat('a',64))->>'trusted'='false','Expired Auth not_after prevents resume');
reset role;
select aroma_device_test.claims(2,2);
set local role authenticated;
select aroma_device_test.ok(api.admin_device_resume(repeat('a',64))->>'trusted'='false','A JWT subject cannot reuse another user Auth session ID');
reset role;
select aroma_device_test.claims(2,7);
set local role authenticated;
select aroma_device_test.ok(api.admin_device_resume(repeat('a',64))->>'trusted'='false','Another administrator cannot use the first administrator cookie');
reset role;
select aroma_device_test.claims(2,6,'aal2',true,0);
set local role authenticated;
select aroma_device_test.ok(api.admin_device_list()->'items'='[]'::jsonb,'Device listing is restricted to the owner');
select aroma_device_test.ok(api.admin_device_revoke((select (value->>'id')::uuid from aroma_device_test.saved where key='a'))='{"revoked":false,"current":false}'::jsonb,
 'An administrator cannot revoke another administrator device by UUID');
reset role;

-- Every administrative request rechecks expiry and the live underlying session.
update private.admin_trusted_sessions set expires_at=now()-interval '1 second' where session_id=aroma_device_test.sid(3);
select aroma_device_test.claims(1,3);
set local role authenticated;
select aroma_device_test.ok(api.current_actor()->>'requires_mfa'='true','A grant expires without refreshing the JWT');
reset role;
select aroma_device_test.claims(1,2);
update auth.sessions set not_after=now()-interval '1 second' where id=aroma_device_test.sid(2);
set local role authenticated;
select aroma_device_test.ok(api.current_actor()->>'requires_mfa'='true','Existing trust stops immediately when its Auth session expires');
reset role;
update auth.sessions set not_after=null where id=aroma_device_test.sid(2);
-- Native Supabase TOTP verification may delete a user's other AAL1 sessions.
-- Our application grant must follow that provider action, never fake AAL2.
delete from auth.sessions where user_id=aroma_device_test.uid(1) and (aal is null or aal<'aal2');
select aroma_device_test.claims(1,3);
set local role authenticated;
select aroma_device_test.ok(api.current_actor()->>'requires_mfa'='true','Removing a signed-out Auth session invalidates its existing access-token trust');
reset role;
select aroma_device_test.ok(not exists(select 1 from private.admin_trusted_sessions where user_id=aroma_device_test.uid(1) and session_id<>aroma_device_test.sid(1)),
 'Provider deletion of same-user lower-AAL sessions cascades trusted grants without fabricating provider AAL2');
insert into auth.sessions(id,user_id,aal) values(aroma_device_test.sid(2),aroma_device_test.uid(1),'aal1');
select aroma_device_test.claims(1,2);
set local role authenticated;
select aroma_device_test.ok(api.current_actor()->>'requires_mfa'='true','Deleted Auth session grants never resurrect when an identifier is reused in a SQL fixture');
select api.admin_device_resume(repeat('a',64));
insert into aroma_device_test.saved values('revoke',api.admin_device_revoke((select (value->>'id')::uuid from aroma_device_test.saved where key='a')));
select aroma_device_test.ok((select value='{"revoked":true,"current":true}'::jsonb from aroma_device_test.saved where key='revoke'),
 'Owner revocation identifies the current device before removing its grant');
select aroma_device_test.ok(api.current_actor()->>'requires_mfa'='true','Revoking the device immediately removes current-session trust');
select aroma_device_test.ok(api.admin_device_resume(repeat('a',64))->>'trusted'='false','A revoked cookie cannot be replayed');
reset role;
select aroma_device_test.ok((select revoked_by=user_id and revoked_at is not null and revoke_reason='owner' from private.admin_trusted_devices
 where id=(select (value->>'id')::uuid from aroma_device_test.saved where key='a')),'Owner revocation records the actor and timestamp');

-- Security changes revoke monotonically, even if old values are restored later.
select aroma_device_test.claims(1,1,'aal2',true,0);
set local role authenticated;
insert into aroma_device_test.saved values('password',api.admin_device_register(aroma_device_test.hash(repeat('c',64)),'Password lifecycle'));
reset role;
update auth.users set encrypted_password='changed-password' where id=aroma_device_test.uid(1);
update auth.users set encrypted_password='fixture-password-hash-a' where id=aroma_device_test.uid(1);
select aroma_device_test.claims(1,2);
set local role authenticated;
select aroma_device_test.ok(api.admin_device_resume(repeat('c',64))->>'trusted'='false','Password changes permanently revoke old cookies even if an old hash is restored');
reset role;
select aroma_device_test.claims(1,1,'aal2',true,0);
set local role authenticated;
insert into aroma_device_test.saved values('factor',api.admin_device_register(aroma_device_test.hash(repeat('d',64)),'Factor lifecycle'));
reset role;
update auth.mfa_factors set last_challenged_at=now(),updated_at=now() where id=aroma_device_test.fid(1);
select aroma_device_test.claims(1,2);
set local role authenticated;
select aroma_device_test.ok(api.admin_device_resume(repeat('d',64))->>'trusted'='true','Ordinary authenticator challenge timestamps preserve existing remembered devices');
reset role;
update auth.mfa_factors set status='unverified' where id=aroma_device_test.fid(1);
update auth.mfa_factors set status='verified' where id=aroma_device_test.fid(1);
set local role authenticated;
select aroma_device_test.ok(api.current_actor()->>'requires_mfa'='true' and api.admin_device_resume(repeat('d',64))->>'trusted'='false',
 'Factor lifecycle changes permanently revoke both cookie and active grant');
reset role;
select aroma_device_test.claims(1,1,'aal2',true,0);
set local role authenticated;
select api.admin_device_register(aroma_device_test.hash(repeat('e',64)),'Membership lifecycle');
reset role;
update private.admin_memberships set active=false where user_id=aroma_device_test.uid(1);
update private.admin_memberships set active=true where user_id=aroma_device_test.uid(1);
select aroma_device_test.claims(1,2);
set local role authenticated;
select aroma_device_test.ok(api.admin_device_resume(repeat('e',64))->>'trusted'='false','Reactivating administrator membership never reactivates old remembered cookies');
reset role;
select aroma_device_test.claims(1,1,'aal2',true,0);
set local role authenticated;
select api.admin_device_register(aroma_device_test.hash(repeat('f',64)),'Ban lifecycle');
reset role;
update auth.users set banned_until=now()+interval '1 day' where id=aroma_device_test.uid(1);
select aroma_device_test.claims(1,2);
set local role authenticated;
select aroma_device_test.ok(api.admin_device_resume(repeat('f',64))->>'trusted'='false','A banned Auth user cannot resume remembered trust');
reset role;
update auth.users set banned_until=null where id=aroma_device_test.uid(1);
set local role authenticated;
select aroma_device_test.ok(api.admin_device_resume(repeat('f',64))->>'trusted'='false','Unbanning the account does not restore revoked devices');
reset role;
select aroma_device_test.claims(1,1,'aal2',true,0);
set local role authenticated;
select api.admin_device_register(aroma_device_test.hash(repeat('1',64)),'Email lifecycle');
reset role;
update auth.users set email='device-new@example.invalid' where id=aroma_device_test.uid(1);
select aroma_device_test.claims(1,2);
set local role authenticated;
select aroma_device_test.ok(api.admin_device_resume(repeat('1',64))->>'trusted'='false','Changing the account email revokes remembered devices');
reset role;
select aroma_device_test.claims(1,1,'aal2',true,0);
set local role authenticated;
insert into aroma_device_test.saved values('expiry',api.admin_device_register(aroma_device_test.hash(repeat('2',64)),'Expiry fixture'));
reset role;
select aroma_device_test.claims(1,2);
set local role authenticated;
select api.admin_device_resume(repeat('2',64));
reset role;
update private.admin_trusted_devices set created_at=now()-interval '5184000 seconds',expires_at=now()
 where id=(select (value->>'id')::uuid from aroma_device_test.saved where key='expiry');
select aroma_device_test.claims(1,2);
set local role authenticated;
select aroma_device_test.ok(api.current_actor()->>'requires_mfa'='true','Every current-session authorization rechecks exact device expiry');
select aroma_device_test.ok(api.admin_device_resume(repeat('2',64))->>'trusted'='false','The exact 60-day expiry boundary rejects remembered trust');
reset role;
select aroma_device_test.claims(1,1,'aal2',true,0);
set local role authenticated;
select api.admin_device_register(aroma_device_test.hash(repeat('3',64)),'Deleted lifecycle');
reset role;
update auth.users set deleted_at=now() where id=aroma_device_test.uid(1);
select aroma_device_test.claims(1,2);
set local role authenticated;
select aroma_device_test.ok(api.admin_device_resume(repeat('3',64))->>'trusted'='false','A soft-deleted Auth identity cannot resume a remembered cookie');
reset role;
update auth.users set deleted_at=null where id=aroma_device_test.uid(1);
select aroma_device_test.claims(1,1,'aal2',true,0);
set local role authenticated;
select api.admin_device_register(aroma_device_test.hash(repeat('4',64)),'Factor deletion');
reset role;
delete from auth.mfa_factors where id=aroma_device_test.fid(1);
select aroma_device_test.claims(1,2);
set local role authenticated;
select aroma_device_test.ok(api.admin_device_resume(repeat('4',64))->>'trusted'='false','Deleting the original verified authenticator permanently revokes its device');
reset role;
update private.admin_trusted_device_limits set attempt_count=60 where user_id=aroma_device_test.uid(1) and action='resume';
set local role authenticated;
select aroma_device_test.ok(api.admin_device_resume(repeat('a',64))->>'trusted'='false','Per-user resume rate exhaustion returns a denial without exceptions');
reset role;
select aroma_device_test.ok((select attempt_count=60 from private.admin_trusted_device_limits where user_id=aroma_device_test.uid(1) and action='resume'),
 'Repeated denied attempts cannot grow the bounded rate counter');
rollback;
