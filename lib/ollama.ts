import { formatSalary, locationLabel } from "./jobs";
import type { Job } from "./types";

export function ollamaHost(): string {
  return process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
}

export function ollamaModel(): string {
  return process.env.OLLAMA_MODEL ?? "qwen2.5:1.5b";
}

const MAX_MODEL_BYTES = 1_800_000_000;

type ListedModel = { name: string; size: number; capabilities?: string[] };

export async function analysisModel(): Promise<{ model: string } | { model: null; message: string }> {
  let models: ListedModel[];
  try {
    models = await listedModels();
  } catch {
    return { model: null, message: "Ollama is not running, so these roles were not ranked." };
  }
  const chat = models.filter((model) => !model.capabilities?.length || model.capabilities.includes("completion"));
  const configured = chat.find((model) => sameModel(model.name, ollamaModel()));
  if (configured && configured.size > 0 && configured.size <= MAX_MODEL_BYTES) return { model: configured.name };
  const small = chat
    .filter((model) => model.size > 0 && model.size <= MAX_MODEL_BYTES)
    .sort((a, b) => a.size - b.size);
  const picked = small.find((model) => model.name.startsWith("qwen2.5")) ?? small[0];
  if (picked) return { model: picked.name };
  return {
    model: null,
    message: "Ranking needs a small model such as qwen2.5:1.5b. The installed model is too large and was not loaded.",
  };
}

export async function unloadLargeModels(): Promise<void> {
  let running: { name: string; size: number; context_length?: number }[] = [];
  try {
    const res = await fetch(`${ollamaHost()}/api/ps`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return;
    const data = (await res.json()) as { models?: { name?: string; size?: number; context_length?: number }[] };
    running = (data.models ?? [])
      .filter((model): model is { name: string; size: number; context_length?: number } => typeof model.name === "string")
      .map((model) => ({ name: model.name, size: model.size ?? 0, context_length: model.context_length }));
  } catch {
    return;
  }
  for (const model of running) {
    if (model.size > 0 && model.size <= MAX_MODEL_BYTES) continue;
    if (!model.context_length) continue;
    await fetch(`${ollamaHost()}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: model.name,
        prompt: "ok",
        stream: false,
        keep_alive: 0,
        options: { num_ctx: model.context_length, num_predict: 1 },
      }),
    }).catch(() => undefined);
  }
}

export async function ollamaStatus(): Promise<{ ok: true } | { ok: false; message: string }> {
  const host = ollamaHost();
  const wanted = ollamaModel();
  let res: Response;
  try {
    res = await fetch(`${host}/api/tags`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  } catch {
    return { ok: false, message: `Ollama is not running, so these roles were not ranked.` };
  }
  if (!res.ok) {
    return { ok: false, message: `Ollama is not running, so these roles were not ranked.` };
  }
  const data = (await res.json()) as { models?: { name: string }[] };
  const names = (data.models ?? []).map((model) => model.name);
  const ready = names.some((name) => name === wanted || name.startsWith(`${wanted}:`) || wanted.startsWith(`${name}:`));
  if (!ready) {
    return {
      ok: false,
      message: `Ollama model ${wanted} is not installed, so these roles were not ranked.`,
    };
  }
  return { ok: true };
}

export type CandidateProfile = {
  summary: string;
  titles: string[];
  keywords: string[];
};

export async function readCandidate(cv: string, model: string): Promise<CandidateProfile> {
  const raw = await chat(
    model,
    `Read this CV. The person may work in any field. Return JSON {"summary":"under 40 words","titles":["up to 4 job titles"],"keywords":["up to 8 skills or domains"]}.\n\nCV:\n${cv.slice(0, 1600)}`,
    { numPredict: 220, keepAlive: "0" },
  );
  const parsed = parseJson(raw) as { summary?: unknown; titles?: unknown; keywords?: unknown };
  const summary = typeof parsed.summary === "string" ? parsed.summary.replace(/\s+/g, " ").trim().slice(0, 500) : "";
  return {
    summary,
    titles: stringList(parsed.titles, 6),
    keywords: stringList(parsed.keywords, 14),
  };
}

export async function scoreBatch(
  model: string,
  profile: CandidateProfile,
  jobs: Job[],
  minMonthlyUsd: number,
  sponsoredMove = false,
  keepAlive = "2m",
): Promise<{ id: string; score: number; reason: string }[]> {
  const payload = jobs.slice(0, 1).map((job) => ({
    id: job.id,
    title: job.title,
    company: job.company,
    location: locationLabel(job),
    salary: formatSalary(job),
    description: job.description.slice(0, 220),
  }));
  const payRule =
    minMonthlyUsd > 0
      ? `- Score 0 if stated pay is below ${minMonthlyUsd} USD per month. If pay is unstated, do not score 0 for pay.`
      : "- Do not score 0 because pay is missing or low.";
  const prompt = `Read each job description and score how well that job fits this candidate. The candidate may work in any field.

Hard rules:
- Score 0 if someone living in Nigeria cannot take the role (country, region, or timezone excludes Nigeria / UTC+1).
${sponsoredMove ? "- A Canada role was kept because it offers visa sponsorship or relocation. A UK role was kept because it offers both. Do not score those 0 for location.\n" : ""}
${payRule}
- Otherwise score 0-100 for how closely the job description matches the candidate's work, titles, and skills. 100 is a direct fit. Score low when the occupation is different.

Return JSON only: {"scores":[{"id":"...","score":0,"reason":"one sentence"}]}
Include every job id exactly once.

Candidate:
${(profile.summary || "No summary.").slice(0, 240)}
Titles: ${profile.titles.slice(0, 4).join(", ") || "not specified"}
Keywords: ${profile.keywords.slice(0, 8).join(", ") || "not specified"}

Jobs:
${JSON.stringify(payload)}`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return normalizeScores(parseJson(await chat(model, prompt, { numPredict: 100, keepAlive })), jobs);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Ollama returned a score list that could not be read");
}

async function chat(
  model: string,
  prompt: string,
  options?: { numPredict?: number; keepAlive?: string },
): Promise<string> {
  const res = await fetch(`${ollamaHost()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      keep_alive: options?.keepAlive ?? "0",
      options: {
        temperature: 0.1,
        num_ctx: 1024,
        num_batch: 128,
        num_predict: options?.numPredict ?? 120,
      },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  const content = data.message?.content?.trim();
  if (!content) throw new Error("Ollama returned an empty response");
  return content;
}

function parseJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    const listStart = trimmed.indexOf("[");
    const listEnd = trimmed.lastIndexOf("]");
    if (listStart >= 0 && listEnd > listStart) return JSON.parse(trimmed.slice(listStart, listEnd + 1)) as unknown;
    throw new Error("Ollama returned invalid JSON");
  }
}

function normalizeScores(value: unknown, jobs: Job[]) {
  const rows = rowsFrom(value);
  const byId = new Map<string, { score: number; reason: string }>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as { id?: unknown; score?: unknown; reason?: unknown };
    if (typeof record.id !== "string") continue;
    const reason = typeof record.reason === "string" ? record.reason.replace(/\s+/g, " ").trim() : "No reason returned";
    byId.set(record.id, { score: clampScore(record.score), reason: reason.slice(0, 280) });
  }
  return jobs.map((job) => {
    const row = byId.get(job.id);
    return {
      id: job.id,
      score: row?.score ?? 0,
      reason: row?.reason ?? "No score returned",
    };
  });
}

function rowsFrom(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["scores", "results", "rankings", "jobs"]) {
    if (Array.isArray(record[key])) return record[key];
  }
  return [];
}

async function listedModels(): Promise<ListedModel[]> {
  const res = await fetch(`${ollamaHost()}/api/tags`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Ollama error ${res.status}`);
  const data = (await res.json()) as { models?: { name?: string; size?: number; capabilities?: string[] }[] };
  return (data.models ?? [])
    .filter((model): model is { name: string; size?: number; capabilities?: string[] } => typeof model.name === "string")
    .map((model) => ({ name: model.name, size: model.size ?? 0, capabilities: model.capabilities }));
}

function sameModel(name: string, wanted: string): boolean {
  return name === wanted || name.startsWith(`${wanted}:`) || wanted.startsWith(`${name}:`);
}

function stringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const text = item.replace(/\s+/g, " ").trim().slice(0, 80);
    const key = text.toLowerCase();
    if (text.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
