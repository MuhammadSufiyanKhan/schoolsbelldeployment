// Rule-based report card remarks in English and Urdu, from a student's own marks, strongest/weakest subject and attendance.
// A teacher always reviews and can edit them. (An AI-written version can replace this later; the saved format stays the same.)
export type RemarkInput = { name: string; pct: number | null; best?: string; worst?: string; attendance?: number | null };

export function draftRemarks(i: RemarkInput): { en: string; ur: string } {
  const first = i.name.split(" ")[0];
  if (i.pct === null) return { en: `${first}'s results are not available yet.`, ur: `${first} کے نتائج ابھی دستیاب نہیں ہیں۔` };
  const band = i.pct >= 85 ? 4 : i.pct >= 70 ? 3 : i.pct >= 50 ? 2 : i.pct >= 40 ? 1 : 0;
  const en = [
    `${first} needs urgent support. Please arrange daily revision at home and meet the class teacher.`,
    `${first} has passed but needs steady practice to improve.`,
    `${first} is making satisfactory progress with regular effort.`,
    `${first} is working well and achieving good results.`,
    `${first} has had an outstanding term and is among the best in the class.`,
  ][band];
  const ur = [
    `${first} کو فوری مدد کی ضرورت ہے۔ براہِ کرم گھر پر روزانہ دہرائی کروائیں اور کلاس ٹیچر سے ملیں۔`,
    `${first} پاس ہو گیا/گئی ہے مگر بہتری کے لیے مسلسل مشق کی ضرورت ہے۔`,
    `${first} باقاعدہ محنت سے تسلی بخش ترقی کر رہا/رہی ہے۔`,
    `${first} اچھی محنت کر رہا/رہی ہے اور اچھے نتائج حاصل کر رہا/رہی ہے۔`,
    `${first} کی اس سمسٹر میں شاندار کارکردگی رہی اور کلاس کے بہترین طلبہ میں شامل ہے۔`,
  ][band];
  const extraEn = [i.best && band > 0 ? ` Strongest subject: ${i.best}.` : "", i.worst && i.worst !== i.best ? ` Needs most work in ${i.worst}.` : "", i.attendance != null && i.attendance < 75 ? ` Attendance is low (${Math.round(i.attendance)}%) and must improve.` : ""].join("");
  const extraUr = [i.best && band > 0 ? ` سب سے مضبوط مضمون: ${i.best}۔` : "", i.worst && i.worst !== i.best ? ` ${i.worst} میں سب سے زیادہ محنت درکار ہے۔` : "", i.attendance != null && i.attendance < 75 ? ` حاضری کم ہے (${Math.round(i.attendance)}٪) اور بہتر ہونی چاہیے۔` : ""].join("");
  return { en: en + extraEn, ur: ur + extraUr };
}
