-- Teachers see only the classes (and subjects) they teach, matching the rule already applied to students, attendance and marks.
drop policy classes_staff_select on public.classes;
create policy classes_staff_select on public.classes for select to authenticated using (
  app.in_scope(school_id, campus_id) and app.can('classes','view') and (app.role() <> 'teacher' or id in (select app.teacher_classes())));
drop policy subjects_staff_select on public.subjects;
create policy subjects_staff_select on public.subjects for select to authenticated using (
  app.in_scope(school_id, campus_id) and app.can('classes','view') and (app.role() <> 'teacher' or class_id in (select app.teacher_classes())));
