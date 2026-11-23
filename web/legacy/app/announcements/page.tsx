import { redirect } from "next/navigation";
import { guard } from "@/lib/auth";
import { all, run, audit } from "@/lib/db";
import { can } from "@/lib/perm";
import { Card, PageHeader, Btn, Field, Flash, str, num, first, type SP } from "@/components/ui";

async function post(fd: FormData) {
  "use server";
  const s = await guard("announcements", true);
  run("INSERT INTO announcements(title,body,audience,author) VALUES(?,?,?,?)", str(fd, "title"), str(fd, "body"), str(fd, "audience"), s.name);
  audit(s.name, `posted announcement ${str(fd, "title")}`);
  redirect("/announcements?msg=Posted");
}
async function del(fd: FormData) {
  "use server";
  await guard("announcements", true);
  run("DELETE FROM announcements WHERE id=?", num(fd, "id"));
  redirect("/announcements");
}
export default async function Announcements({ searchParams }: { searchParams: SP }) {
  const s = await guard("announcements");
  const sp = await searchParams;
  const aud = s.role === "parent" || s.role === "student" ? "('all','parents')" : s.role === "admin" ? "('all','staff','parents')" : "('all','staff')";
  const rows = all<{ id: number; title: string; body: string; audience: string; author: string; created_at: string }>(`SELECT * FROM announcements WHERE audience IN ${aud} ORDER BY id DESC`);
  const w = can(s.role, "announcements", true);
  return (
    <>
      <PageHeader title="Announcements" />
      <Flash msg={first(sp.msg)} />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-3">{rows.map((a) => <Card key={a.id}><div className="flex items-start justify-between gap-2"><div><h2 className="font-semibold">{a.title}</h2><p className="mt-1 whitespace-pre-wrap text-sm">{a.body}</p><p className="mt-2 text-xs text-mute">{a.author} · {a.created_at.slice(0, 10)} · for {a.audience}</p></div>{w && <form action={del}><input type="hidden" name="id" value={a.id} /><button className="text-xs text-red-600">delete</button></form>}</div></Card>)}{!rows.length && <p className="text-sm text-mute">No announcements.</p>}</div>
        {w && <Card><h2 className="mb-3 font-semibold">New announcement</h2><form action={post} className="space-y-3"><Field label="Title"><input name="title" required /></Field><Field label="Message"><textarea name="body" rows={4} required /></Field>
          <Field label="Audience"><select name="audience"><option value="all">Everyone</option><option value="staff">Staff only</option><option value="parents">Parents & students</option></select></Field><Btn>Post</Btn></form></Card>}
      </div>
    </>
  );
}
