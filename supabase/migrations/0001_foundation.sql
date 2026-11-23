-- Schoolwell foundation: schools → campuses, roles & permissions, students, guardians,
-- attendance, exams, fees, notices, audit. Every table has row level security.
-- Requires Supabase's auth schema (auth.users, auth.uid()).

create schema if not exists app;

-- ───────────── tenancy ─────────────
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,            -- yourschool.example.com
  brand jsonb not null default '{}',    -- logo, colours, franchise print name
  created_at timestamptz not null default now()
);
create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools on delete restrict,
  name text not null,
  address text,
  brand jsonb not null default '{}',    -- per-campus / franchise brand overrides
  created_at timestamptz not null default now()
);

-- one row per login. campus_id NULL = head office (sees every campus of the school).
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  school_id uuid not null references public.schools,
  campus_id uuid references public.campuses,
  role text not null check (role in ('super_admin','head_office','campus_admin','accountant','hr','receptionist','teacher','parent','student')),
  full_name text not null,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  school_id uuid not null references public.schools on delete cascade,
  role text not null,
  module text not null,
  can_view boolean not null default false, can_add boolean not null default false,
  can_edit boolean not null default false, can_approve boolean not null default false,
  can_download boolean not null default false,
  primary key (school_id, role, module)
);

-- ───────────── helper functions (read profiles without RLS) ─────────────
create function app.school_id() returns uuid language sql stable security definer set search_path = public as
$$ select school_id from public.profiles where id = auth.uid() $$;
create function app.campus_id() returns uuid language sql stable security definer set search_path = public as
$$ select campus_id from public.profiles where id = auth.uid() $$;
create function app.role() returns text language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;
create function app.is_head_office() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select campus_id is null and role in ('super_admin','head_office') from public.profiles where id = auth.uid()), false) $$;
create function app.can(m text, act text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case act when 'view' then p.can_view when 'add' then p.can_add when 'edit' then p.can_edit
                    when 'approve' then p.can_approve when 'download' then p.can_download else false end
    from public.role_permissions p join public.profiles u on u.id = auth.uid()
    where p.school_id = u.school_id and p.role = u.role and p.module = m), false)
  or coalesce((select role = 'super_admin' from public.profiles where id = auth.uid()), false)
$$;
-- rows the caller may see for a campus-scoped table
create function app.in_scope(sch uuid, camp uuid) returns boolean language sql stable security definer set search_path = public as
$$ select sch = app.school_id() and (app.is_head_office() or camp = app.campus_id()) $$;

-- ───────────── people & academics ─────────────
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  user_id uuid references auth.users, emp_no text, full_name text not null, designation text, department text,
  phone text, cnic text, address text, salary numeric(12,2) not null default 0, join_date date,
  status text not null default 'active', created_at timestamptz not null default now(),
  unique (school_id, emp_no)
);
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  name text not null, section text not null default '', class_teacher uuid references public.staff, monthly_fee numeric(12,2) not null default 0
);
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  class_id uuid not null references public.classes, name text not null, teacher_id uuid references public.staff
);
create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  class_id uuid references public.classes, admission_no text, roll_no text, full_name text not null, gender text, dob date,
  guardian_name text, guardian_phone text, address text,
  status text not null default 'active' check (status in ('active','inactive','graduated','archived')),
  created_at timestamptz not null default now(), unique (school_id, admission_no)
);
-- a parent sees a student only when the school has confirmed the link
create table public.student_guardians (
  student_id uuid not null references public.students on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  school_id uuid not null references public.schools,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  primary key (student_id, user_id)
);
create function app.my_students() returns setof uuid language sql stable security definer set search_path = public as
$$ select student_id from public.student_guardians where user_id = auth.uid() and status = 'confirmed' $$;
create function app.teacher_classes() returns setof uuid language sql stable security definer set search_path = public as $$
  select c.id from public.classes c join public.staff s on s.id = c.class_teacher where s.user_id = auth.uid()
  union select sb.class_id from public.subjects sb join public.staff s on s.id = sb.teacher_id where s.user_id = auth.uid() $$;
create function app.my_student_id() returns uuid language sql stable security definer set search_path = public as
$$ select id from public.students where id in (select student_id from public.student_guardians where user_id = auth.uid() and status='confirmed') limit 1 $$;

create table public.face_consents (        -- face attendance only for children with consent on record
  student_id uuid primary key references public.students on delete cascade,
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  given_by text not null, given_on date not null default current_date, withdrawn_on date
);

-- ───────────── attendance, leave ─────────────
create table public.attendance (
  student_id uuid not null references public.students on delete cascade, date date not null,
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  class_id uuid references public.classes, status text not null check (status in ('P','A','L','LV')), method text not null default 'manual',
  primary key (student_id, date)
);
create table public.staff_attendance (
  staff_id uuid not null references public.staff on delete cascade, date date not null,
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  status text not null check (status in ('P','A','L')), primary key (staff_id, date)
);
create table public.leaves (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  staff_id uuid not null references public.staff, from_date date not null, to_date date not null, kind text, reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')), decided_by uuid references auth.users,
  created_at timestamptz not null default now(), check (to_date >= from_date)
);

-- ───────────── exams ─────────────
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  class_id uuid not null references public.classes, name text not null, exam_date date, total numeric not null default 100,
  published boolean not null default false           -- parents see results only once published
);
create table public.marks (
  exam_id uuid not null references public.exams on delete cascade, student_id uuid not null references public.students on delete cascade,
  subject_id uuid not null references public.subjects on delete cascade,
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses, class_id uuid references public.classes,
  obtained numeric, reason text, source text not null default 'manual', primary key (exam_id, student_id, subject_id)
);

-- ───────────── fees (challans, payments, refunds with approval) ─────────────
create table public.challans (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  student_id uuid not null references public.students, month text not null, amount numeric(12,2) not null, discount numeric(12,2) not null default 0,
  note text, created_at timestamptz not null default now(), unique (student_id, month)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  challan_id uuid not null references public.challans, amount numeric(12,2) not null check (amount > 0), method text,
  receipt_no text, received_by uuid references auth.users, paid_on date not null default current_date,
  voided_at timestamptz, void_reason text            -- never deleted: voided with a reason
);
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  payment_id uuid not null references public.payments, amount numeric(12,2) not null, reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')), requested_by uuid references auth.users, approved_by uuid references auth.users
);

-- ───────────── notices ─────────────
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid references public.campuses,  -- null = whole school
  title text not null, body text not null, audience text not null default 'all' check (audience in ('all','staff','parents')),
  class_id uuid references public.classes, created_by uuid references auth.users, created_at timestamptz not null default now()
);

-- ───────────── audit log: append only ─────────────
create table public.audit_log (
  id bigint generated always as identity primary key,
  school_id uuid, campus_id uuid, actor uuid, action text not null, table_name text, row_id text, detail jsonb, at timestamptz not null default now()
);
create function app.audit() returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log(school_id, campus_id, actor, action, table_name, row_id, detail)
  values ((r->>'school_id')::uuid, nullif(r->>'campus_id','')::uuid, auth.uid(), tg_op, tg_table_name, coalesce(r->>'id', r->>'student_id', r->>'staff_id'), r);
  return coalesce(new, old);
end $$;
create function app.no_change() returns trigger language plpgsql as $$ begin raise exception 'audit_log is append only'; end $$;
create trigger audit_no_update before update or delete on public.audit_log for each row execute function app.no_change();

-- ───────────── default permissions per role ─────────────
create function app.seed_permissions(sch uuid) returns void language sql as $$
  insert into public.role_permissions(school_id, role, module, can_view, can_add, can_edit, can_approve, can_download)
  select sch, r, m, v, a, e, ap, d from (values
   ('campus_admin','students',true,true,true,true,true),('campus_admin','attendance',true,true,true,true,true),('campus_admin','fees',true,true,true,true,true),
   ('campus_admin','exams',true,true,true,true,true),('campus_admin','staff',true,true,true,true,true),('campus_admin','leave',true,true,true,true,true),
   ('campus_admin','notices',true,true,true,true,true),('campus_admin','classes',true,true,true,true,true),
   ('head_office','students',true,false,false,false,true),('head_office','attendance',true,false,false,false,true),('head_office','fees',true,false,false,true,true),
   ('head_office','exams',true,false,false,false,true),('head_office','staff',true,false,false,false,true),('head_office','leave',true,false,false,true,true),
   ('head_office','notices',true,true,true,false,true),('head_office','classes',true,false,false,false,true),
   ('accountant','fees',true,true,true,false,true),('accountant','students',true,false,false,false,false),('accountant','classes',true,false,false,false,false),
   ('hr','staff',true,true,true,false,true),('hr','leave',true,true,true,true,true),('hr','notices',true,false,false,false,false),
   ('receptionist','students',true,true,true,false,false),('receptionist','classes',true,false,false,false,false),('receptionist','notices',true,false,false,false,false),
   ('teacher','students',true,false,false,false,false),('teacher','attendance',true,true,true,false,false),('teacher','exams',true,true,true,false,false),
   ('teacher','classes',true,false,false,false,false),('teacher','leave',true,true,false,false,false),('teacher','notices',true,false,false,false,false)
  ) t(r, m, v, a, e, ap, d) on conflict do nothing
$$;
create function app.on_school_created() returns trigger language plpgsql as $$ begin perform app.seed_permissions(new.id); return new; end $$;
create trigger school_seed_perms after insert on public.schools for each row execute function app.on_school_created();

-- ───────────── RLS: generic campus-scoped policies ─────────────
-- (table, permission module, teacher restriction column or null)
do $$
declare t record;
begin
  for t in select * from (values
    ('staff','staff',null), ('classes','classes',null), ('subjects','classes',null), ('students','students','class_id'),
    ('face_consents','students',null), ('attendance','attendance','class_id'), ('staff_attendance','staff',null), ('leaves','leave',null),
    ('exams','exams','class_id'), ('marks','exams','class_id'), ('challans','fees',null), ('payments','fees',null), ('refunds','fees',null)
  ) as v(tbl, module, tcol) loop
    execute format('alter table public.%I enable row level security', t.tbl);
    -- staff read: in scope + may view the module (teachers only their own classes where a class column exists)
    execute format($f$create policy %1$s_staff_select on public.%1$I for select to authenticated using (
        app.in_scope(school_id, campus_id) and app.can(%2$L,'view')
        and (app.role() <> 'teacher' or %3$s))$f$, t.tbl, t.module,
        case when t.tcol is null then 'true' else format('%I in (select app.teacher_classes())', t.tcol) end);
    execute format($f$create policy %1$s_staff_insert on public.%1$I for insert to authenticated with check (
        app.in_scope(school_id, campus_id) and app.can(%2$L,'add'))$f$, t.tbl, t.module);
    execute format($f$create policy %1$s_staff_update on public.%1$I for update to authenticated using (
        app.in_scope(school_id, campus_id) and app.can(%2$L,'edit')) with check (app.in_scope(school_id, campus_id))$f$, t.tbl, t.module);
    -- nothing is quietly lost: hard delete is Super Admin only
    execute format($f$create policy %1$s_delete on public.%1$I for delete to authenticated using (
        school_id = app.school_id() and app.role() = 'super_admin')$f$, t.tbl);
    -- audit every change
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function app.audit()', t.tbl);
  end loop;
end $$;

-- ───────────── RLS: specific policies ─────────────
alter table public.schools enable row level security;
create policy schools_own on public.schools for select to authenticated using (id = app.school_id());
alter table public.campuses enable row level security;
create policy campuses_scope on public.campuses for select to authenticated using (school_id = app.school_id() and (app.is_head_office() or id = app.campus_id()));
alter table public.profiles enable row level security;
create policy profiles_self on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_staff on public.profiles for select to authenticated using (app.in_scope(school_id, campus_id) and app.can('staff','view') and role not in ('parent','student'));
alter table public.role_permissions enable row level security;
create policy perms_read on public.role_permissions for select to authenticated using (school_id = app.school_id());
create policy perms_admin on public.role_permissions for all to authenticated using (school_id = app.school_id() and app.role() = 'super_admin') with check (school_id = app.school_id());
alter table public.student_guardians enable row level security;
create policy guardians_self on public.student_guardians for select to authenticated using (user_id = auth.uid());
create policy guardians_staff on public.student_guardians for select to authenticated using (school_id = app.school_id() and app.can('students','view') and app.role() <> 'teacher');
create policy guardians_confirm on public.student_guardians for update to authenticated using (school_id = app.school_id() and app.can('students','edit'));
alter table public.notices enable row level security;
create policy notices_staff on public.notices for select to authenticated using (school_id = app.school_id() and app.role() not in ('parent','student') and audience in ('all','staff')
   and (campus_id is null or app.is_head_office() or campus_id = app.campus_id()) and app.can('notices','view'));
create policy notices_parents on public.notices for select to authenticated using (school_id = app.school_id() and app.role() in ('parent','student') and audience in ('all','parents')
   and (campus_id is null or campus_id in (select campus_id from public.students where id in (select app.my_students()))));
create policy notices_write on public.notices for insert to authenticated with check (school_id = app.school_id() and app.can('notices','add') and (campus_id is not null or app.is_head_office()));
alter table public.audit_log enable row level security;
create policy audit_read on public.audit_log for select to authenticated using (school_id = app.school_id() and app.role() in ('super_admin','head_office','campus_admin') and (app.is_head_office() or campus_id = app.campus_id()));

-- parents / students: only their own confirmed children
create policy students_parent on public.students for select to authenticated using (id in (select app.my_students()));
create policy attendance_parent on public.attendance for select to authenticated using (student_id in (select app.my_students()));
create policy challans_parent on public.challans for select to authenticated using (student_id in (select app.my_students()));
create policy payments_parent on public.payments for select to authenticated using (voided_at is null and challan_id in (select id from public.challans where student_id in (select app.my_students())));
create policy exams_parent on public.exams for select to authenticated using (published and class_id in (select class_id from public.students where id in (select app.my_students())));
create policy marks_parent on public.marks for select to authenticated using (student_id in (select app.my_students()) and exam_id in (select id from public.exams where published));
create policy classes_parent on public.classes for select to authenticated using (id in (select class_id from public.students where id in (select app.my_students())));
create policy subjects_parent on public.subjects for select to authenticated using (class_id in (select class_id from public.students where id in (select app.my_students())));

-- never let the client skip the table-level checks
revoke all on all tables in schema public from anon;
