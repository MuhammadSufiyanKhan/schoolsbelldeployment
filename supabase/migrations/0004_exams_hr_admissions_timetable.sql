-- Exams (remarks), staff & payroll, admissions, timetable. Same security model as 0001: every table has RLS.

-- ───────────── permissions for the new modules ─────────────
create or replace function app.seed_permissions(sch uuid) returns void language sql as $$
  insert into public.role_permissions(school_id, role, module, can_view, can_add, can_edit, can_approve, can_download)
  select sch, r, m, v, a, e, ap, d from (values
   ('campus_admin','students',true,true,true,true,true),('campus_admin','attendance',true,true,true,true,true),('campus_admin','fees',true,true,true,true,true),
   ('campus_admin','exams',true,true,true,true,true),('campus_admin','staff',true,true,true,true,true),('campus_admin','leave',true,true,true,true,true),
   ('campus_admin','notices',true,true,true,true,true),('campus_admin','classes',true,true,true,true,true),
   ('campus_admin','payroll',true,true,true,true,true),('campus_admin','admissions',true,true,true,true,true),('campus_admin','timetable',true,true,true,true,true),
   ('campus_admin','staff_attendance',true,true,true,true,true),
   ('head_office','students',true,false,false,false,true),('head_office','attendance',true,false,false,false,true),('head_office','fees',true,false,false,true,true),
   ('head_office','exams',true,false,false,false,true),('head_office','staff',true,false,false,false,true),('head_office','leave',true,false,false,true,true),
   ('head_office','notices',true,true,true,false,true),('head_office','classes',true,false,false,false,true),
   ('head_office','payroll',true,false,false,true,true),('head_office','admissions',true,false,false,false,true),('head_office','timetable',true,false,false,false,true),
   ('head_office','staff_attendance',true,false,false,false,true),
   ('accountant','fees',true,true,true,false,true),('accountant','students',true,false,false,false,false),('accountant','classes',true,false,false,false,false),
   ('accountant','payroll',true,true,true,false,true),
   ('hr','staff',true,true,true,false,true),('hr','leave',true,true,true,true,true),('hr','notices',true,false,false,false,false),
   ('hr','payroll',true,true,true,false,true),('hr','staff_attendance',true,true,true,false,true),
   ('receptionist','students',true,true,true,false,false),('receptionist','classes',true,false,false,false,false),('receptionist','notices',true,false,false,false,false),
   ('receptionist','admissions',true,true,true,false,false),
   ('teacher','students',true,false,false,false,false),('teacher','attendance',true,true,true,false,false),('teacher','exams',true,true,true,false,false),
   ('teacher','classes',true,false,false,false,false),('teacher','leave',true,true,false,false,false),('teacher','notices',true,false,false,false,false),
   ('teacher','timetable',true,false,false,false,false)
  ) t(r, m, v, a, e, ap, d) on conflict do nothing
$$;
select app.seed_permissions(id) from public.schools;   -- existing schools get the new modules too

-- ───────────── tables ─────────────
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  name text not null, unique (campus_id, name)
);
create table public.timetable (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  class_id uuid not null references public.classes on delete cascade, day smallint not null check (day between 0 and 5), period smallint not null check (period between 1 and 10),
  subject_id uuid not null references public.subjects on delete cascade, room_id uuid references public.rooms, unique (class_id, day, period)
);
-- A teacher or a room booked twice is rejected by the database itself, so no screen can skip the check.
create function app.timetable_clash() returns trigger language plpgsql security definer set search_path = public as $$
declare t uuid; clash text;
begin
  select teacher_id into t from public.subjects where id = new.subject_id;
  if t is not null then
    select c.name || '-' || c.section || ' (' || sb.name || ')' into clash from public.timetable x
      join public.subjects sb on sb.id = x.subject_id join public.classes c on c.id = x.class_id
      where x.day = new.day and x.period = new.period and sb.teacher_id = t and x.class_id <> new.class_id and x.id is distinct from new.id limit 1;
    if clash is not null then raise exception 'Teacher already booked in % at this time', clash using errcode = 'P0001'; end if;
  end if;
  if new.room_id is not null then
    select c.name || '-' || c.section into clash from public.timetable x join public.classes c on c.id = x.class_id
      where x.day = new.day and x.period = new.period and x.room_id = new.room_id and x.class_id <> new.class_id and x.id is distinct from new.id limit 1;
    if clash is not null then raise exception 'Room already booked by % at this time', clash using errcode = 'P0001'; end if;
  end if;
  return new;
end $$;
create trigger timetable_clash before insert or update on public.timetable for each row execute function app.timetable_clash();

create table public.payroll (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  staff_id uuid not null references public.staff, month text not null check (month ~ '^\d{4}-\d{2}$'),
  base numeric(12,2) not null, absent_days int not null default 0, deductions numeric(12,2) not null default 0,
  bonus numeric(12,2) not null default 0, advance numeric(12,2) not null default 0, eobi numeric(12,2) not null default 0, tax numeric(12,2) not null default 0,
  net numeric(12,2) not null, status text not null default 'unpaid' check (status in ('unpaid','paid')), paid_on date, unique (staff_id, month)
);
create table public.admissions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  applicant_name text not null, dob date, guardian_name text not null, guardian_phone text, guardian_email text,
  class_id uuid references public.classes, stage text not null default 'enquiry' check (stage in ('enquiry','documents','interview','accepted','rejected','enrolled')),
  interview_at timestamptz, notes text, student_id uuid references public.students, created_at timestamptz not null default now()
);
create table public.admission_documents (
  id uuid primary key default gen_random_uuid(), admission_id uuid not null references public.admissions on delete cascade,
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  kind text not null, received boolean not null default false, unique (admission_id, kind)
);
create table public.report_remarks (
  exam_id uuid not null references public.exams on delete cascade, student_id uuid not null references public.students on delete cascade,
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses, class_id uuid references public.classes,
  remark_en text, remark_ur text, source text not null default 'manual', primary key (exam_id, student_id)
);

-- ───────────── RLS ─────────────
do $$
declare t record;
begin
  for t in select * from (values
    ('rooms','classes',null), ('timetable','timetable','class_id'), ('payroll','payroll',null), ('admissions','admissions',null),
    ('admission_documents','admissions',null), ('report_remarks','exams','class_id')
  ) as v(tbl, module, tcol) loop
    execute format('alter table public.%I enable row level security', t.tbl);
    execute format($f$create policy %1$s_staff_select on public.%1$I for select to authenticated using (
        app.in_scope(school_id, campus_id) and app.can(%2$L,'view') and (app.role() <> 'teacher' or %3$s))$f$, t.tbl, t.module,
        case when t.tcol is null then 'true' else format('%I in (select app.teacher_classes())', t.tcol) end);
    execute format($f$create policy %1$s_staff_insert on public.%1$I for insert to authenticated with check (app.in_scope(school_id, campus_id) and app.can(%2$L,'add'))$f$, t.tbl, t.module);
    execute format($f$create policy %1$s_staff_update on public.%1$I for update to authenticated using (app.in_scope(school_id, campus_id) and app.can(%2$L,'edit')) with check (app.in_scope(school_id, campus_id))$f$, t.tbl, t.module);
    execute format($f$create policy %1$s_delete on public.%1$I for delete to authenticated using (
        app.in_scope(school_id, campus_id) and (app.role() = 'super_admin' or (%2$L = 'classes' and app.can('classes','edit'))))$f$, t.tbl, t.module);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function app.audit()', t.tbl);
  end loop;
end $$;
-- the timetable is edited by deleting a slot: allow that for people who can edit the timetable
create policy timetable_slot_delete on public.timetable for delete to authenticated using (app.in_scope(school_id, campus_id) and app.can('timetable','edit'));

-- "my own staff record", readable even by roles that may not read the staff table
create function app.my_staff_id() returns uuid language sql stable security definer set search_path = public as
$$ select id from public.staff where user_id = auth.uid() limit 1 $$;

-- a teacher sees their own payslips; a family sees the class timetable and published remarks
create policy payroll_self on public.payroll for select to authenticated using (staff_id = app.my_staff_id());
create policy timetable_parent on public.timetable for select to authenticated using (class_id in (select class_id from public.students where id in (select app.my_students())));
create policy remarks_parent on public.report_remarks for select to authenticated using (student_id in (select app.my_students()) and exam_id in (select id from public.exams where published));

-- teachers see and file only their own leave (colleagues' leave is private); decisions need the 'edit' right
drop policy leaves_staff_select on public.leaves;
create policy leaves_staff_select on public.leaves for select to authenticated using (
  app.in_scope(school_id, campus_id) and app.can('leave','view')
  and (app.role() <> 'teacher' or staff_id = app.my_staff_id()));
drop policy leaves_staff_insert on public.leaves;
create policy leaves_staff_insert on public.leaves for insert to authenticated with check (
  app.in_scope(school_id, campus_id) and app.can('leave','add')
  and (app.role() <> 'teacher' or staff_id = app.my_staff_id()));
-- nobody may approve their own leave
create function app.no_self_approval() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> old.status and exists (select 1 from public.staff where id = new.staff_id and user_id = auth.uid()) and app.role() <> 'super_admin' then
    raise exception 'You cannot decide your own leave request'; end if;
  return new;
end $$;
create trigger leaves_no_self_approval before update on public.leaves for each row execute function app.no_self_approval();

-- staff attendance gets its own permission module (HR marks it; teachers cannot see colleagues' attendance)
drop policy staff_attendance_staff_select on public.staff_attendance;
drop policy staff_attendance_staff_insert on public.staff_attendance;
drop policy staff_attendance_staff_update on public.staff_attendance;
create policy staff_attendance_staff_select on public.staff_attendance for select to authenticated using (app.in_scope(school_id, campus_id) and app.can('staff_attendance','view'));
create policy staff_attendance_staff_insert on public.staff_attendance for insert to authenticated with check (app.in_scope(school_id, campus_id) and app.can('staff_attendance','add'));
create policy staff_attendance_staff_update on public.staff_attendance for update to authenticated using (app.in_scope(school_id, campus_id) and app.can('staff_attendance','edit')) with check (app.in_scope(school_id, campus_id));
