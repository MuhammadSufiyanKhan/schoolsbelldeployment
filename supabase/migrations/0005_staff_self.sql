-- Everyone may read their own staff record (needed to file leave and open their payslips), and nobody else's.
create policy staff_self_select on public.staff for select to authenticated using (user_id = auth.uid());
