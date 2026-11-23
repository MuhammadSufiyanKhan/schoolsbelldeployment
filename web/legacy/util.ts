import "server-only";
import bcrypt from "bcryptjs";
import { one, run } from "./db";
import type { Role } from "./perm";

export const tempPassword = () => Math.random().toString(36).slice(2, 6) + "-" + Math.random().toString(36).slice(2, 6);
/** Creates a login (or returns the existing one). Returns the new temporary password only when created. */
export function ensureUser(email: string, name: string, role: Role): { id: number; password?: string } {
  const e = email.toLowerCase();
  const ex = one<{ id: number }>("SELECT id FROM users WHERE email=?", e);
  if (ex) return { id: ex.id };
  const pw = tempPassword();
  const r = run("INSERT INTO users(email,password_hash,role,name,must_change) VALUES(?,?,?,?,1)", e, bcrypt.hashSync(pw, 10), role, name);
  return { id: Number(r.lastInsertRowid), password: pw };
}
export const q = (s: string) => encodeURIComponent(s);
export const nextNo = (table: "students" | "staff", col: string, prefix: string) => {
  const n = one<{ c: number }>(`SELECT COUNT(*) c FROM ${table}`)!.c + 1;
  let no = `${prefix}${String(n).padStart(3, "0")}`;
  while (one(`SELECT 1 FROM ${table} WHERE ${col}=?`, no)) no += "x";
  return no;
};
