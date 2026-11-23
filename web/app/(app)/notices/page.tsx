import { redirect } from "next/navigation";
import { requireProfile, can, activeCampus } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import Speak from "@/components/speak";
import { Card, PageHeader, Btn, Field, Flash, str, first, type SP } from "@/components/ui";

async function post(fd: FormData) {
  "use server";
  const p = await requireProfile();
  if (!(await can("notices", "add"))) redirect("/notices");
  const campus = await activeCampus();
  const wholeSchool = fd.get("whole") === "on" && !p.campus_id;
  const { error } = await (await supabase()).from("notices").insert({
    school_id: p.school_id, campus_id: wholeSchool ? null : campus?.id ?? null, title: str(fd, "title"), body: str(fd, "body"), audience: str(fd, "audience"), created_by: p.id,
  });
  redirect(`/notices?msg=${error ? encodeURIComponent(error.message) : "Posted"}`);
}

export default async function Notices({ searchParams }: { searchParams: SP }) {
  const p = await requireProfile();
  const sp = await searchParams;
  const { data: rows } = await (await supabase()).from("notices").select("id,title,body,audience,created_at").order("created_at", { ascending: false });
  const w = await can("notices", "add");
  return (
    <>
      <PageHeader title="Notices" />
      <Flash msg={first(sp.msg)} />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-3">{(rows ?? []).map((a) => <Card key={a.id}><h2 className="font-semibold">{a.title}</h2><p className="mt-1 whitespace-pre-wrap text-sm">{a.body}</p><p className="mt-2 flex items-center gap-3 text-xs text-mute">{a.created_at.slice(0, 10)} · for {a.audience}<Speak text={`${a.title}. ${a.body}`} label="Read aloud" /></p></Card>)}{!rows?.length && <p className="text-sm text-mute">No notices.</p>}</div>
        {w && <Card><h2 className="mb-3 font-semibold">New notice</h2><form action={post} className="space-y-3"><Field label="Title"><input name="title" required /></Field><Field label="Message"><textarea name="body" rows={4} required /></Field>
          <Field label="Audience"><select name="audience"><option value="all">Everyone</option><option value="staff">Staff only</option><option value="parents">Parents & students</option></select></Field>
          {!p.campus_id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="whole" /> Whole school (all campuses)</label>}<Btn>Post</Btn></form></Card>}
      </div>
    </>
  );
}
