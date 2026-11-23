import "server-only";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

const g = globalThis as unknown as { __db?: DatabaseSync };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL, name TEXT NOT NULL, must_change INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS staff(id INTEGER PRIMARY KEY, user_id INTEGER, emp_no TEXT UNIQUE, name TEXT NOT NULL, designation TEXT, department TEXT, phone TEXT, cnic TEXT, address TEXT, salary INTEGER DEFAULT 0, join_date TEXT, status TEXT DEFAULT 'active');
CREATE TABLE IF NOT EXISTS classes(id INTEGER PRIMARY KEY, name TEXT NOT NULL, section TEXT DEFAULT '', teacher_id INTEGER, monthly_fee INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS subjects(id INTEGER PRIMARY KEY, name TEXT NOT NULL, class_id INTEGER NOT NULL, teacher_id INTEGER);
CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY, admission_no TEXT UNIQUE, name TEXT NOT NULL, gender TEXT, dob TEXT, class_id INTEGER, guardian_name TEXT, guardian_phone TEXT, parent_user_id INTEGER, user_id INTEGER, address TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS attendance(student_id INTEGER, date TEXT, status TEXT, PRIMARY KEY(student_id,date));
CREATE TABLE IF NOT EXISTS staff_attendance(staff_id INTEGER, date TEXT, status TEXT, PRIMARY KEY(staff_id,date));
CREATE TABLE IF NOT EXISTS leaves(id INTEGER PRIMARY KEY, staff_id INTEGER, from_date TEXT, to_date TEXT, kind TEXT, reason TEXT, status TEXT DEFAULT 'pending', decided_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS payroll(id INTEGER PRIMARY KEY, staff_id INTEGER, month TEXT, base INTEGER, deductions INTEGER DEFAULT 0, bonus INTEGER DEFAULT 0, net INTEGER, status TEXT DEFAULT 'unpaid', paid_on TEXT, UNIQUE(staff_id,month));
CREATE TABLE IF NOT EXISTS exams(id INTEGER PRIMARY KEY, name TEXT, class_id INTEGER, date TEXT, total INTEGER DEFAULT 100);
CREATE TABLE IF NOT EXISTS marks(exam_id INTEGER, student_id INTEGER, subject_id INTEGER, obtained REAL, PRIMARY KEY(exam_id,student_id,subject_id));
CREATE TABLE IF NOT EXISTS invoices(id INTEGER PRIMARY KEY, student_id INTEGER, month TEXT, amount INTEGER, note TEXT, UNIQUE(student_id,month));
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY, invoice_id INTEGER, amount INTEGER, method TEXT, paid_on TEXT, receipt_no TEXT, received_by TEXT);
CREATE TABLE IF NOT EXISTS timetable(id INTEGER PRIMARY KEY, class_id INTEGER, day INTEGER, period INTEGER, subject_id INTEGER, UNIQUE(class_id,day,period));
CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY, title TEXT, body TEXT, audience TEXT DEFAULT 'all', author TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS admissions(id INTEGER PRIMARY KEY, applicant TEXT, guardian TEXT, phone TEXT, class_id INTEGER, status TEXT DEFAULT 'new', notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, who TEXT, action TEXT, at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
`;

function open(): DatabaseSync {
  // On Vercel only /tmp is writable (and it is temporary): fine for a demo, not for real data.
  const dir = process.env.VERCEL ? "/tmp" : path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(process.env.DB_PATH || path.join(dir, "school.db"));
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=OFF;");
  db.exec(SCHEMA);
  const n = (db.prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c;
  if (n === 0) seed(db);
  return db;
}

export function db(): DatabaseSync {
  return (g.__db ??= open());
}

type P = string | number | null;
export function all<T = Record<string, unknown>>(sql: string, ...p: P[]): T[] {
  return db().prepare(sql).all(...p) as T[];
}
export function one<T = Record<string, unknown>>(sql: string, ...p: P[]): T | undefined {
  return db().prepare(sql).get(...p) as T | undefined;
}
export function run(sql: string, ...p: P[]) {
  return db().prepare(sql).run(...p);
}
export function audit(who: string, action: string) {
  run("INSERT INTO audit(who,action) VALUES(?,?)", who, action);
}
export function setting(key: string, fallback = ""): string {
  return one<{ value: string }>("SELECT value FROM settings WHERE key=?", key)?.value ?? fallback;
}

function seed(d: DatabaseSync) {
  const h = (p: string) => bcrypt.hashSync(p, 10);
  const u = d.prepare("INSERT INTO users(email,password_hash,role,name) VALUES(?,?,?,?)");
  const uid = (e: string, p: string, r: string, n: string) => Number(u.run(e, h(p), r, n).lastInsertRowid);
  uid("admin@school.test", "admin123", "admin", "Principal Admin");
  const hrU = uid("hr@school.test", "hr123", "hr", "Sara HR");
  const accU = uid("accounts@school.test", "acc123", "accountant", "Adeel Accounts");
  const t1 = uid("farooq@school.test", "teacher123", "teacher", "Mr. Farooq");
  const t2 = uid("sana@school.test", "teacher123", "teacher", "Ms. Sana");
  const parentU = uid("parent@school.test", "parent123", "parent", "Khalid Khan");
  const st = d.prepare("INSERT INTO staff(user_id,emp_no,name,designation,department,phone,salary,join_date) VALUES(?,?,?,?,?,?,?,?)");
  const s = (a: [number, string, string, string, string, string, number, string]) => Number(st.run(...a).lastInsertRowid);
  const sHr = s([hrU, "E-001", "Sara HR", "HR Manager", "Administration", "0300-1111111", 90000, "2022-01-10"]);
  s([accU, "E-002", "Adeel Accounts", "Accountant", "Administration", "0300-2222222", 80000, "2022-03-01"]);
  const sF = s([t1, "E-003", "Mr. Farooq", "Senior Teacher", "Mathematics", "0300-3333333", 75000, "2021-08-15"]);
  const sS = s([t2, "E-004", "Ms. Sana", "Teacher", "English", "0300-4444444", 65000, "2023-04-01"]);
  void sHr;
  const cl = d.prepare("INSERT INTO classes(name,section,teacher_id,monthly_fee) VALUES(?,?,?,?)");
  const c1 = Number(cl.run("Class 8", "A", sF, 5000).lastInsertRowid);
  const c2 = Number(cl.run("Class 8", "B", sS, 5000).lastInsertRowid);
  const sb = d.prepare("INSERT INTO subjects(name,class_id,teacher_id) VALUES(?,?,?)");
  for (const c of [c1, c2]) {
    sb.run("Mathematics", c, sF); sb.run("English", c, sS); sb.run("Urdu", c, sS); sb.run("Science", c, sF);
  }
  const ins = d.prepare("INSERT INTO students(admission_no,name,gender,dob,class_id,guardian_name,guardian_phone,parent_user_id) VALUES(?,?,?,?,?,?,?,?)");
  const names: [string, string, number][] = [["Ayesha Khan", "F", c1], ["Bilal Ahmed", "M", c1], ["Hira Malik", "F", c1], ["Usman Tariq", "M", c1], ["Zainab Ali", "F", c2], ["Hamza Sheikh", "M", c2], ["Maryam Noor", "F", c2], ["Danish Raza", "M", c2]];
  names.forEach(([n, g2, c], i) => ins.run(`A-${String(i + 1).padStart(3, "0")}`, n, g2, "2012-05-0" + ((i % 8) + 1), c, i === 0 ? "Khalid Khan" : "Parent of " + n.split(" ")[0], "0301-000000" + i, i === 0 ? parentU : null));
  d.prepare("INSERT INTO announcements(title,body,audience,author) VALUES(?,?,?,?)").run("Welcome to Schoolwell", "Term begins Monday. Please check your timetable.", "all", "Principal Admin");
  d.prepare("INSERT INTO settings(key,value) VALUES('school_name','Schoolwell Public School')").run();
}
