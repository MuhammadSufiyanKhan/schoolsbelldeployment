import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { ZodType } from "zod";

// Google Gemini through its OpenAI-compatible endpoint (free tier: create a key at aistudio.google.com/apikey and set GEMINI_API_KEY).
const BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
export const aiReady = () => !!process.env.GEMINI_API_KEY;

/** A message that is safe to show to the person using the app. */
export class AiError extends Error { constructor(public userMessage: string) { super(userMessage); } }

let cachedModel: string | undefined;
/** Picks a current Gemini "flash" model that this key can use (they change over time), unless GEMINI_MODEL says otherwise. */
async function resolveModel(): Promise<string> {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  if (cachedModel) return cachedModel;
  try {
    const r = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${process.env.GEMINI_API_KEY}` }, signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const ids: string[] = ((await r.json()).data ?? []).map((m: { id: string }) => m.id.replace(/^models\//, ""));
      const prefer = [/^gemini-2\.5-flash$/, /^gemini-flash-latest$/, /^gemini-2\.0-flash$/, /^gemini-[\d.]+-flash$/, /^gemini-[\d.]+-flash-lite$/];
      for (const re of prefer) { const hit = ids.find((i) => re.test(i)); if (hit) return (cachedModel = hit); }
    }
  } catch { /* fall through to the default */ }
  return (cachedModel = "gemini-2.5-flash");
}

// Protects the free quota: each person may make a limited number of AI requests per minute.
const hits = new Map<string, number[]>();
export function rateLimit(who: string, perMinute = 12) {
  const now = Date.now(), recent = (hits.get(who) ?? []).filter((t) => now - t < 60000);
  if (recent.length >= perMinute) throw new AiError("You're going a little fast. Please wait a moment and try again.");
  hits.set(who, [...recent, now]);
}

function friendly(e: unknown): AiError {
  const text = String((e as { message?: string })?.message ?? e);
  const status = (e as { statusCode?: number })?.statusCode;
  if (status === 429 || /quota|rate.?limit|resource.?exhausted|429/i.test(text)) return new AiError("The free AI service is busy or today's free limit was reached. Please try again in a minute (or tomorrow).");
  if (status === 401 || status === 403 || /api key|permission|unauthor/i.test(text)) return new AiError("The AI service key is missing or not accepted. Ask the administrator to check GEMINI_API_KEY.");
  if (/timeout|abort/i.test(text)) return new AiError("The AI service took too long. Please try again.");
  return new AiError("The AI service could not complete this. Please try again.");
}

/** Pulls the first JSON object out of a model reply (it may be wrapped in ``` fences or have a sentence around it). */
function extractJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, "").trim();
  const start = t.indexOf("{"), end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON");
  return JSON.parse(t.slice(start, end + 1));
}

export type Image = { data: Buffer; mediaType: string };
/** Asks the model for JSON and validates it against `schema` (one automatic retry with a stricter reminder). Never saves anything. */
export async function askJson<T>(schema: ZodType<T>, o: { system: string; user: string; images?: Image[]; who: string; maxOutputTokens?: number }): Promise<T> {
  if (!aiReady()) throw new AiError("AI is not set up yet (GEMINI_API_KEY is missing).");
  rateLimit(o.who);
  const provider = createOpenAICompatible({ name: "gemini", baseURL: BASE, apiKey: process.env.GEMINI_API_KEY! });
  const model = provider.chatModel(await resolveModel());
  const content = [{ type: "text" as const, text: o.user }, ...(o.images ?? []).map((i) => ({ type: "file" as const, mediaType: i.mediaType, data: i.data }))];
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { text } = await generateText({
        model, temperature: 0.2, maxOutputTokens: o.maxOutputTokens ?? 4000, abortSignal: AbortSignal.timeout(55000),
        system: o.system + (attempt ? "\nYour previous reply was not valid JSON for the schema. Reply with ONLY the JSON object." : ""),
        messages: [{ role: "user", content }],
      });
      return schema.parse(extractJson(text));
    } catch (e) {
      lastError = e;
      const status = (e as { statusCode?: number })?.statusCode;
      if (status) throw friendly(e);            // an API/network failure: retrying will not help
    }
  }
  console.error("AI reply did not match the schema", String((lastError as Error)?.message ?? lastError).slice(0, 300));
  throw new AiError("The AI answer could not be understood. Please try again.");
}
