-- Creates the FIRST school, campus and super admin on a fresh Supabase project (after running the migrations).
-- Run it once in the Supabase SQL editor after replacing the three CHANGE_ME values. Do not commit the edited copy.
-- Then sign in and change the password under Account.
with s as (insert into public.schools(name, slug) values ('CHANGE_ME_SCHOOL_NAME', 'CHANGE_ME_SLUG') returning id),
c as (insert into public.campuses(school_id, name) select id, 'Main Campus' from s returning id, school_id),
u as (
  insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                         created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'CHANGE_ME_EMAIL',
          crypt('CHANGE_ME_PASSWORD', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
  returning id),
i as (
  insert into auth.identities(id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', 'CHANGE_ME_EMAIL', 'email_verified', true), 'email', now(), now(), now() from u
  returning 1)
insert into public.profiles(id, school_id, campus_id, role, full_name, must_change_password)
select u.id, c.school_id, null, 'super_admin', 'Super Admin', true from u, c;   -- campus_id null = head office (sees every campus)
