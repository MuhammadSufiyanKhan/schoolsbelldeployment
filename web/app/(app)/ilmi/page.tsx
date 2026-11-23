import { requireStaff } from "@/lib/auth";
import { aiReady } from "@/lib/ai";
import IlmiChat from "@/components/ilmi-chat";
import { Card, PageHeader } from "@/components/ui";

export default async function IlmiPage() {
  await requireStaff();
  return (
    <>
      <PageHeader title="Ilmi" sub="The assistant that does the work. You confirm every change." />
      {aiReady() ? <IlmiChat /> : <Card><p className="text-sm">Ilmi is not set up yet. Add <code>GEMINI_API_KEY</code> in the hosting settings.</p></Card>}
      <p className="mt-3 text-xs text-mute">Powered by Google Gemini (free tier). Students&apos; and teachers&apos; names are replaced by codes before your message is sent, and put back here. Ilmi sees only what your account is allowed to see.</p>
    </>
  );
}
