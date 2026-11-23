-- AI features: diary, question papers, lesson plans, MCQ tests, cover, face templates. Same security model: RLS on every table.
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
   ('teacher','timetable',true,false,false,false,false),
   ('campus_admin','diary',true,true,true,true,true),('campus_admin','academics',true,true,true,true,true),
   ('head_office','diary',true,false,false,false,true),('head_office','academics',true,false,false,false,true),
   ('teacher','diary',true,true,true,false,false),('teacher','academics',true,true,true,false,false)
  ) t(r, m, v, a, e, ap, d) on conflict do nothing
$$;
select app.seed_permissions(id) from public.schools;

create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  class_id uuid not null references public.classes on delete cascade, subject_id uuid not null references public.subjects on delete cascade,
  date date not null, classwork_en text, classwork_ur text, homework_en text, homework_ur text, source text not null default 'manual',
  created_by uuid references auth.users, unique (class_id, subject_id, date)
);
create table public.question_papers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  class_id uuid not null references public.classes on delete cascade, subject_id uuid references public.subjects on delete set null,
  title text not null, chapters text, body jsonb not null, source text not null default 'ai', created_by uuid references auth.users, created_at timestamptz not null default now()
);
create table public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  class_id uuid not null references public.classes on delete cascade, subject_id uuid references public.subjects on delete set null,
  kind text not null check (kind in ('year','month','daily')), title text not null, period text, body jsonb not null, created_by uuid references auth.users, created_at timestamptz not null default now()
);
create table public.mcq_tests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  class_id uuid not null references public.classes on delete cascade, subject_id uuid references public.subjects on delete set null,
  title text not null, questions jsonb not null, published boolean not null default false, created_by uuid references auth.users, created_at timestamptz not null default now()
);
-- the answer key lives apart from the questions so a parent can never read it
create table public.mcq_keys (
  test_id uuid primary key references public.mcq_tests on delete cascade,
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses, class_id uuid not null references public.classes,
  answers jsonb not null
);
create table public.mcq_attempts (
  test_id uuid not null references public.mcq_tests on delete cascade, student_id uuid not null references public.students on delete cascade,
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses, class_id uuid not null references public.classes,
  score int not null, total int not null, answers jsonb not null, taken_at timestamptz not null default now(), primary key (test_id, student_id)
);
create table public.cover_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses,
  date date not null, class_id uuid not null references public.classes on delete cascade, period smallint not null,
  absent_staff uuid references public.staff, cover_staff uuid references public.staff, subject_name text, unique (date, class_id, period)
);
create table public.face_templates (
  student_id uuid primary key references public.students on delete cascade,
  school_id uuid not null references public.schools, campus_id uuid not null references public.campuses, class_id uuid references public.classes,
  descriptor jsonb not null, enrolled_at timestamptz not null default now()
);

do $$
declare t record;
begin
  for t in select * from (values
    ('diary_entries','diary','class_id'), ('question_papers','academics','class_id'), ('lesson_plans','academics','class_id'),
    ('mcq_tests','academics','class_id'), ('mcq_keys','academics','class_id'), ('mcq_attempts','academics','class_id'),
    ('cover_assignments','timetable',null), ('face_templates','attendance','class_id')
  ) as v(tbl, module, tcol) loop
    execute format('alter table public.%I enable row level security', t.tbl);
    execute format($f$create policy %1$s_staff_select on public.%1$I for select to authenticated using (
        app.in_scope(school_id, campus_id) and app.can(%2$L,'view') and (app.role() <> 'teacher' or %3$s))$f$, t.tbl, t.module,
        case when t.tcol is null then 'true' else format('%I in (select app.teacher_classes())', t.tcol) end);
    execute format($f$create policy %1$s_staff_insert on public.%1$I for insert to authenticated with check (app.in_scope(school_id, campus_id) and app.can(%2$L,'add'))$f$, t.tbl, t.module);
    execute format($f$create policy %1$s_staff_update on public.%1$I for update to authenticated using (app.in_scope(school_id, campus_id) and app.can(%2$L,'edit')) with check (app.in_scope(school_id, campus_id))$f$, t.tbl, t.module);
    execute format($f$create policy %1$s_delete on public.%1$I for delete to authenticated using (app.in_scope(school_id, campus_id) and app.can(%2$L,'add'))$f$, t.tbl, t.module);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function app.audit()', t.tbl);
  end loop;
end $$;
-- teachers add and fix their own entries, so allow them to update diary rows they can add
drop policy diary_entries_staff_update on public.diary_entries;
create policy diary_entries_staff_update on public.diary_entries for update to authenticated using (app.in_scope(school_id, campus_id) and app.can('diary','add')) with check (app.in_scope(school_id, campus_id));
drop policy question_papers_staff_update on public.question_papers;
create policy question_papers_staff_update on public.question_papers for update to authenticated using (app.in_scope(school_id, campus_id) and app.can('academics','add')) with check (app.in_scope(school_id, campus_id));
drop policy mcq_tests_staff_update on public.mcq_tests;
create policy mcq_tests_staff_update on public.mcq_tests for update to authenticated using (app.in_scope(school_id, campus_id) and app.can('academics','add')) with check (app.in_scope(school_id, campus_id));

-- families: diary and published tests for their child's class; their own results. Never the answer key or face data.
create policy diary_parent on public.diary_entries for select to authenticated using (class_id in (select class_id from public.students where id in (select app.my_students())));
create policy mcq_parent on public.mcq_tests for select to authenticated using (published and class_id in (select class_id from public.students where id in (select app.my_students())));
create policy mcq_attempt_parent on public.mcq_attempts for select to authenticated using (student_id in (select app.my_students()));
