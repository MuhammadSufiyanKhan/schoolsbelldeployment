export type Role = "admin" | "hr" | "accountant" | "teacher" | "parent" | "student";
export type Module =
  | "dashboard" | "students" | "staff" | "classes" | "attendance" | "staffAttendance" | "leave"
  | "payroll" | "exams" | "fees" | "timetable" | "announcements" | "admissions" | "portal" | "audit";

type Rule = { read: Module[]; write: Module[] };
const R: Record<Role, Rule> = {
  admin: { read: ["dashboard","students","staff","classes","attendance","staffAttendance","leave","payroll","exams","fees","timetable","announcements","admissions","audit"], write: ["students","staff","classes","attendance","staffAttendance","leave","payroll","exams","fees","timetable","announcements","admissions"] },
  hr: { read: ["dashboard","staff","staffAttendance","leave","payroll","announcements"], write: ["staff","staffAttendance","leave","payroll"] },
  accountant: { read: ["dashboard","students","fees","payroll","announcements","admissions"], write: ["fees","payroll"] },
  teacher: { read: ["dashboard","students","classes","attendance","leave","exams","timetable","announcements"], write: ["attendance","exams","leave"] },
  parent: { read: ["portal","announcements"], write: [] },
  student: { read: ["portal","announcements"], write: [] },
};
export const can = (r: Role, m: Module, write = false) => (write ? R[r].write : R[r].read).includes(m) || (!write && m === "dashboard" && r !== "parent" && r !== "student");

export const NAV: { href: string; label: string; mod: Module; icon: string }[] = [
  { href: "/", label: "Dashboard", mod: "dashboard", icon: "🏠" },
  { href: "/portal", label: "My Child / Me", mod: "portal", icon: "👨‍👩‍👧" },
  { href: "/students", label: "Students", mod: "students", icon: "🎓" },
  { href: "/admissions", label: "Admissions", mod: "admissions", icon: "📥" },
  { href: "/staff", label: "Staff & HR", mod: "staff", icon: "🧑‍🏫" },
  { href: "/classes", label: "Classes", mod: "classes", icon: "🏫" },
  { href: "/attendance", label: "Attendance", mod: "attendance", icon: "✅" },
  { href: "/staff-attendance", label: "Staff attendance", mod: "staffAttendance", icon: "🕘" },
  { href: "/leave", label: "Leave", mod: "leave", icon: "🌴" },
  { href: "/payroll", label: "Payroll", mod: "payroll", icon: "💼" },
  { href: "/exams", label: "Exams", mod: "exams", icon: "📝" },
  { href: "/timetable", label: "Timetable", mod: "timetable", icon: "🗓" },
  { href: "/fees", label: "Fees", mod: "fees", icon: "💳" },
  { href: "/announcements", label: "Announcements", mod: "announcements", icon: "📣" },
  { href: "/audit", label: "Audit log", mod: "audit", icon: "🧾" },
];
