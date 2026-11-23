export type Role = "super_admin" | "head_office" | "campus_admin" | "accountant" | "hr" | "receptionist" | "teacher" | "parent" | "student";
export type Module = "students" | "attendance" | "fees" | "classes" | "notices" | "staff" | "leave" | "exams" | "payroll" | "admissions" | "timetable" | "staff_attendance" | "diary" | "academics";
export type Action = "view" | "add" | "edit" | "approve" | "download";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super admin", head_office: "Head office", campus_admin: "Campus admin", accountant: "Accountant", hr: "HR",
  receptionist: "Receptionist", teacher: "Teacher", parent: "Parent", student: "Student",
};
export const isFamily = (r: Role) => r === "parent" || r === "student";

// Menu entries. `mod` is the permission module that must be viewable; family-only entries have no module.
export const NAV: { href: string; label: string; mod?: Module; family?: boolean; staffOnly?: boolean; roles?: Role[]; icon: string }[] = [
  { href: "/", label: "Dashboard", staffOnly: true, icon: "🏠" },
  { href: "/portal", label: "My children", family: true, icon: "👨‍👩‍👧" },
  { href: "/ilmi", label: "Ilmi (AI)", staffOnly: true, icon: "✨" },
  { href: "/students", label: "Students", mod: "students", icon: "🎓" },
  { href: "/attendance", label: "Attendance", mod: "attendance", icon: "✅" },
  { href: "/classes", label: "Classes", mod: "classes", icon: "🏫" },
  { href: "/admissions", label: "Admissions", mod: "admissions", icon: "📥" },
  { href: "/exams", label: "Exams", mod: "exams", icon: "📝" },
  { href: "/timetable", label: "Timetable", mod: "timetable", icon: "🗓" },
  { href: "/diary", label: "Diary", mod: "diary", icon: "📒" },
  { href: "/academics", label: "Papers & plans", mod: "academics", icon: "📚" },
  { href: "/fees", label: "Fees", mod: "fees", icon: "💳" },
  { href: "/staff", label: "Staff", mod: "staff", icon: "🧑‍🏫" },
  { href: "/staff-attendance", label: "Staff attendance", mod: "staff_attendance", icon: "🕘" },
  { href: "/leave", label: "Leave", mod: "leave", icon: "🌴" },
  { href: "/payroll", label: "Payroll", mod: "payroll", icon: "💼" },
  { href: "/notices", label: "Notices", icon: "📣" },
  { href: "/audit", label: "Audit log", roles: ["super_admin", "head_office", "campus_admin"], icon: "🧾" },
];
