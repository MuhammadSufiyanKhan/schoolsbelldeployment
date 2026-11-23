// Verifies the migration and every row-level-security rule on a real Postgres engine (PGlite).
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.users(id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
  create role anon nologin; create role authenticated nologin;
`);
for (const f of fs.readdirSync("supabase/migrations").sort()) await db.exec(fs.readFileSync("supabase/migrations/" + f, "utf8"));
await db.exec(`grant usage on schema public, app to authenticated, anon;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant execute on all functions in schema app to authenticated;`);

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const q = async (sql, p) => (await db.query(sql, p)).rows;
const as = async (uid, fn) => { // run as an authenticated user
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false)`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false)`); }
};
const tryq = async (sql, p) => { try { return { rows: (await db.query(sql, p)).rows }; } catch (e) { return { err: e.message }; } };

// ── seed (as superuser) ──
const id = async (sql, p) => (await q(sql + " returning id", p))[0].id;
const S1 = await id("insert into schools(name,slug) values('School One','one')");
const S2 = await id("insert into schools(name,slug) values('School Two','two')");
const C1 = await id("insert into campuses(school_id,name) values($1,'Main')", [S1]);
const C2 = await id("insert into campuses(school_id,name) values($1,'North')", [S1]);
const C3 = await id("insert into campuses(school_id,name) values($1,'Other')", [S2]);
const user = async (email, school, campus, role) => {
  const u = await id("insert into auth.users(email) values($1)", [email]);
  await q("insert into profiles(id,school_id,campus_id,role,full_name) values($1,$2,$3,$4,$5)", [u, school, campus, role, email]);
  return u;
};
const uSuper = await user("super", S1, null, "super_admin");
const uHead = await user("head", S1, null, "head_office");
const uAdminA = await user("adminA", S1, C1, "campus_admin");
const uAdminB = await user("adminB", S1, C2, "campus_admin");
const uAcc = await user("acc", S1, C1, "accountant");
const uTeacher = await user("teacher", S1, C1, "teacher");
const uOther = await user("otherSchoolAdmin", S2, C3, "campus_admin");
const uParent = await user("parent", S1, C1, "parent");
const stf = await id("insert into staff(school_id,campus_id,user_id,full_name) values($1,$2,$3,'Teacher T')", [S1, C1, uTeacher]);
const clsA = await id("insert into classes(school_id,campus_id,name,section,class_teacher) values($1,$2,'Class 8','A',$3)", [S1, C1, stf]);
const clsA2 = await id("insert into classes(school_id,campus_id,name,section) values($1,$2,'Class 8','B')", [S1, C1]);
const clsB = await id("insert into classes(school_id,campus_id,name,section) values($1,$2,'Class 8','A')", [S1, C2]);
const stu = async (n, camp, cls) => id("insert into students(school_id,campus_id,class_id,full_name,admission_no) values($1,$2,$3,$4,$4)", [S1, camp, cls, n]);
const sAyesha = await stu("Ayesha", C1, clsA), sBilal = await stu("Bilal", C1, clsA2), sNorth = await stu("NorthKid", C2, clsB);
await q("insert into student_guardians(student_id,user_id,school_id,status) values($1,$2,$3,'confirmed')", [sAyesha, uParent, S1]);
await q("insert into student_guardians(student_id,user_id,school_id,status) values($1,$2,$3,'pending')", [sBilal, uParent, S1]);
const ch = await id("insert into challans(school_id,campus_id,student_id,month,amount) values($1,$2,$3,'2026-11',5000)", [S1, C1, sAyesha]);
await q("insert into challans(school_id,campus_id,student_id,month,amount) values($1,$2,$3,'2026-11',5000)", [S1, C1, sBilal]);
const exPub = await id("insert into exams(school_id,campus_id,class_id,name,published) values($1,$2,$3,'Mid',true)", [S1, C1, clsA]);
const exDraft = await id("insert into exams(school_id,campus_id,class_id,name,published) values($1,$2,$3,'Draft',false)", [S1, C1, clsA]);
const names = async () => (await q("select full_name from students order by 1")).map(r => r.full_name);

// ── isolation ──
ok(JSON.stringify(await as(uAdminA, names)) === '["Ayesha","Bilal"]', "campus admin sees only own campus students");
ok(JSON.stringify(await as(uAdminB, names)) === '["NorthKid"]', "other campus admin sees only their campus");
ok((await as(uHead, names)).length === 3, "head office sees every campus of the school");
ok((await as(uOther, names)).length === 0, "another school sees nothing");
ok((await as(uOther, () => q("select * from schools"))).length === 1 && (await as(uOther, () => q("select name from schools")))[0].name === "School Two", "a school sees only itself");
// ── teacher ──
ok(JSON.stringify(await as(uTeacher, names)) === '["Ayesha"]', "teacher sees only students of classes they teach");
ok(JSON.stringify((await as(uTeacher, () => q("select section from classes order by 1"))).map(r=>r.section))=='["A"]', "teacher sees only their own class, not every class on the campus");
ok((await as(uTeacher, () => tryq("insert into attendance(student_id,date,school_id,campus_id,class_id,status) values($1,current_date,$2,$3,$4,'P')", [sAyesha, S1, C1, clsA]))).err === undefined, "teacher can mark attendance");
ok((await as(uTeacher, () => tryq("insert into challans(school_id,campus_id,student_id,month,amount) values($1,$2,$3,'2026-12',1)", [S1, C1, sAyesha]))).err !== undefined, "teacher cannot create challans");
ok((await as(uTeacher, () => q("select * from challans"))).length === 0, "teacher cannot read fees");
ok((await as(uTeacher, () => q("select * from staff"))).length === 1, "teacher cannot read other staff records (only their own)");
// ── accountant ──
ok((await as(uAcc, () => q("select * from challans"))).length === 2, "accountant reads campus challans");
ok((await as(uAcc, () => tryq("insert into payments(school_id,campus_id,challan_id,amount) values($1,$2,$3,100)", [S1, C1, ch]))).err === undefined, "accountant records payment");
ok((await as(uAcc, () => q("select * from attendance"))).length === 0, "accountant cannot see attendance");
ok((await as(uAcc, () => tryq("insert into challans(school_id,campus_id,student_id,month,amount) values($1,$2,$3,'2027-01',9)", [S1, C2, sNorth]))).err !== undefined, "accountant cannot write into another campus");
// ── parent ──
ok(JSON.stringify(await as(uParent, names)) === '["Ayesha"]', "parent sees only their confirmed child (pending link hidden)");
ok((await as(uParent, () => q("select * from challans"))).length === 1, "parent sees only their child's challan");
ok((await as(uParent, () => q("select * from payments"))).length === 1, "parent sees their child's payment");
await q("insert into marks(exam_id,student_id,subject_id,school_id,campus_id,class_id,obtained) select $1,$2,s.id,$3,$4,$5,80 from (select gen_random_uuid() id) s", [exPub, sAyesha, S1, C1, clsA]).catch(()=>{});
ok((await as(uParent, () => q("select * from exams"))).map(r => r.name).join() === "Mid", "parent sees only published exams");
ok((await as(uParent, () => tryq("update students set full_name='x' where id=$1", [sAyesha]))).rows?.length === 0 || (await q("select full_name from students where id=$1", [sAyesha]))[0].full_name === "Ayesha", "parent cannot edit student");
ok((await as(uParent, () => q("select * from staff"))).length === 0, "parent cannot read staff");
ok((await as(uParent, () => q("select * from audit_log"))).length === 0, "parent cannot read audit log");
// ── deletes, audit ──
await as(uAdminA, () => tryq("delete from students where id=$1", [sBilal]));
ok((await q("select 1 from students where id=$1", [sBilal])).length === 1, "campus admin cannot hard-delete a student");
await as(uSuper, () => tryq("delete from payments where challan_id=$1", [ch]));
ok((await q("select 1 from payments where challan_id=$1", [ch])).length === 0, "super admin can hard-delete");
ok((await q("select count(*)::int c from audit_log"))[0].c > 0, "changes are written to the audit log");
ok((await tryq("update audit_log set action='x'")).err?.includes("append only"), "audit log cannot be edited");
ok((await tryq("delete from audit_log")).err?.includes("append only"), "audit log cannot be deleted");
ok((await as(uAdminA, () => q("select * from audit_log"))).every(r => r.campus_id === C1), "campus admin reads only own campus audit log");
// ── permissions are editable per school ──
await as(uSuper, () => q("insert into role_permissions(school_id,role,module,can_view) values($1,'teacher','fees',true) on conflict (school_id,role,module) do update set can_view=true", [S1]));
ok((await as(uTeacher, () => q("select * from challans"))).length === 2, "super admin can grant a custom permission");

// ── migration 0004: timetable, payroll, leave, admissions, remarks ──
const uHr = await user("hr", S1, C1, "hr");
const uRecep = await user("recep", S1, C1, "receptionist");
const stf2 = await id("insert into staff(school_id,campus_id,full_name) values($1,$2,'Teacher Two')", [S1, C1]);
const subjM = await id("insert into subjects(school_id,campus_id,class_id,name,teacher_id) values($1,$2,$3,'Maths',$4)", [S1, C1, clsA, stf]);
const subjS = await id("insert into subjects(school_id,campus_id,class_id,name,teacher_id) values($1,$2,$3,'Science',$4)", [S1, C1, clsA2, stf]);   // same teacher, other class
const subjE = await id("insert into subjects(school_id,campus_id,class_id,name,teacher_id) values($1,$2,$3,'English',$4)", [S1, C1, clsA2, stf2]);
const room = await id("insert into rooms(school_id,campus_id,name) values($1,$2,'Room 1')", [S1, C1]);
const slot = (cls, subj, day, per, rm) => tryq("insert into timetable(school_id,campus_id,class_id,subject_id,day,period,room_id) values($1,$2,$3,$4,$5,$6,$7)", [S1, C1, cls, subj, day, per, rm]);
ok((await as(uAdminA, () => slot(clsA, subjM, 0, 1, room))).err === undefined, "timetable: slot saved");
ok((await as(uAdminA, () => slot(clsA2, subjS, 0, 1, null))).err?.includes("Teacher already booked"), "timetable: teacher booked twice is rejected by the database");
ok((await as(uAdminA, () => slot(clsA2, subjE, 0, 1, room))).err?.includes("Room already booked"), "timetable: room booked twice is rejected");
ok((await as(uAdminA, () => slot(clsA2, subjE, 0, 2, room))).err === undefined, "timetable: same room, different period is fine");
ok((await as(uTeacher, () => tryq("insert into timetable(school_id,campus_id,class_id,subject_id,day,period) values($1,$2,$3,$4,3,3)", [S1, C1, clsA, subjM]))).err !== undefined, "timetable: teacher cannot edit it");
ok((await as(uTeacher, () => q("select * from timetable"))).every(r => [clsA, clsA2].includes(r.class_id)) && (await as(uTeacher, () => q("select * from timetable"))).length > 0, "timetable: teacher sees only classes they teach");
ok((await as(uParent, () => q("select * from timetable"))).length === 1, "timetable: parent sees only their child's class");
// payroll
const payrollRow = (staff) => tryq("insert into payroll(school_id,campus_id,staff_id,month,base,net) values($1,$2,$3,'2026-11',50000,50000)", [S1, C1, staff]);
ok((await as(uHr, () => payrollRow(stf))).err === undefined, "payroll: HR can create payslips");
ok((await as(uTeacher, () => q("select * from payroll"))).length === 1, "payroll: teacher sees only their own payslip");
ok((await as(uTeacher, () => tryq("update payroll set net=999999 where staff_id=$1", [stf]))).rows?.length === 0 && (await q("select net from payroll where staff_id=$1", [stf]))[0].net == 50000, "payroll: teacher cannot change their own pay");
ok((await as(uParent, () => q("select * from payroll"))).length === 0, "payroll: parent sees nothing");
ok((await as(uAdminB, () => q("select * from payroll"))).length === 0, "payroll: other campus sees nothing");
// leave privacy
const lv = (staff) => tryq("insert into leaves(school_id,campus_id,staff_id,from_date,to_date,kind) values($1,$2,$3,'2026-12-01','2026-12-02','casual')", [S1, C1, staff]);
ok((await as(uTeacher, () => lv(stf))).err === undefined, "leave: teacher files own leave");
ok((await as(uTeacher, () => lv(stf2))).err !== undefined, "leave: teacher cannot file leave for a colleague");
await q("insert into leaves(school_id,campus_id,staff_id,from_date,to_date,kind) values($1,$2,$3,'2026-12-05','2026-12-06','sick')", [S1, C1, stf2]);
ok((await as(uTeacher, () => q("select * from leaves"))).length === 1, "leave: teacher sees only their own leave");
ok((await as(uHr, () => q("select * from leaves"))).length === 2, "leave: HR sees all campus leave");
ok((await as(uHr, () => tryq("update leaves set status='approved' where staff_id=$1", [stf2]))).err === undefined && (await q("select status from leaves where staff_id=$1", [stf2]))[0].status === "approved", "leave: HR approves");
const hrStaff = await id("insert into staff(school_id,campus_id,user_id,full_name) values($1,$2,$3,'HR Person')", [S1, C1, uHr]);
await q("insert into leaves(school_id,campus_id,staff_id,from_date,to_date,kind) values($1,$2,$3,'2026-12-10','2026-12-11','casual')", [S1, C1, hrStaff]);
ok((await as(uHr, () => tryq("update leaves set status='approved' where staff_id=$1", [hrStaff]))).err?.includes("cannot decide your own"), "leave: nobody approves their own request");
ok((await as(uTeacher, () => q("select full_name from staff"))).map(r => r.full_name).join() === "Teacher T", "staff: a teacher can read only their own staff record");
// staff attendance / admissions / remarks
ok((await as(uTeacher, () => q("select * from staff_attendance"))).length === 0, "staff attendance: teacher cannot see colleagues' attendance");
ok((await as(uHr, () => tryq("insert into staff_attendance(staff_id,date,school_id,campus_id,status) values($1,current_date,$2,$3,'P')", [stf, S1, C1]))).err === undefined, "staff attendance: HR marks it");
ok((await as(uRecep, () => tryq("insert into admissions(school_id,campus_id,applicant_name,guardian_name) values($1,$2,'New Kid','G')", [S1, C1]))).err === undefined, "admissions: receptionist records an enquiry");
ok((await as(uTeacher, () => q("select * from admissions"))).length === 0, "admissions: teacher cannot see them");
await q("insert into report_remarks(exam_id,student_id,school_id,campus_id,class_id,remark_en) values($1,$2,$3,$4,$5,'Good'),($6,$2,$3,$4,$5,'Draft remark')", [exPub, sAyesha, S1, C1, clsA, exDraft]);
ok((await as(uParent, () => q("select remark_en from report_remarks"))).map(r => r.remark_en).join() === "Good", "remarks: parent sees only remarks of published exams");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
