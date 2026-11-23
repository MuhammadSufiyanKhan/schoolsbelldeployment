export type Role = "super_admin" | "head_office" | "campus_admin" | "accountant" | "hr" | "receptionist" | "teacher" | "parent" | "student";
export type Module = "students" | "attendance" | "fees" | "classes" | "notices" | "staff" | "leave" | "exams";
export type Action = "view" | "add" | "edit" | "approve" | "download";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super admin", head_office: "Head office", campus_admin: "Campus admin", accountant: "Accountant", hr: "HR",
  receptionist: "Receptionist", teacher: "Teacher", parent: "Parent", student: "Student",
};
export const isFamily = (r: Role) => r === "parent" || r === "student";

// Menu entries. `mod` is the permission module that must be viewable; family-only entries have no module.
export const NAV: { href: string; label: string; mod?: Module; family?: boolean; staffOnly?: boolean; icon: string }[] = [
  { href: "/", label: "Dashboard", staffOnly: true, icon: "🏠" },
  { href: "/portal", label: "My children", family: true, icon: "👨‍👩‍👧" },
  { href: "/students", label: "Students", mod: "students", icon: "🎓" },
  { href: "/attendance", label: "Attendance", mod: "attendance", icon: "✅" },
  { href: "/classes", label: "Classes", mod: "classes", icon: "🏫" },
  { href: "/fees", label: "Fees", mod: "fees", icon: "💳" },
  { href: "/notices", label: "Notices", icon: "📣" },
];
