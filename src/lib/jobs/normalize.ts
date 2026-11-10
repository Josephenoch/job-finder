import { clip, httpUrl } from "@/lib/text";
import { plainText } from "./html";
import type { NormalizedJob, SalaryPeriod } from "./types";

const SNIPPET = 500;
const TEXT_MAX = 1_200;

export function asDate(value: string | number | null | undefined): Date | null {
  if (value == null || value === "") return null;
  if (typeof value === "string" && /\bago\b/i.test(value)) return null;
  const raw = typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value) ? `${value}Z` : value;
  const date =
    typeof raw === "number" ? new Date(raw > 10_000_000_000 ? raw : raw * 1000) : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function money(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function periodOf(value: string | null | undefined): SalaryPeriod | null {
  if (!value) return null;
  const period = value.toLowerCase();
  if (period.includes("hour")) return "hour";
  if (period.includes("week")) return "week";
  if (period.includes("year") || period.includes("annual")) return "year";
  if (period.includes("month")) return "month";
  return null;
}

export function toNormalizedJob(input: {
  source: string;
  externalId: string;
  title: string;
  company: string;
  url: string;
  applyUrl?: string | null;
  text: string;
  locationText?: string | null;
  tags?: string[];
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: SalaryPeriod | null;
  postedAt?: Date | null;
}): NormalizedJob | null {
  const title = plainText(input.title);
  const url = httpUrl(input.url);
  const externalId = input.externalId.trim();
  if (!title || !url || !externalId) return null;
  const text = plainText(input.text.slice(0, 12_000)).slice(0, TEXT_MAX);
  const tags = [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))].slice(0, 24);
  return {
    source: input.source,
    externalId,
    title,
    company: plainText(input.company) || "Unknown",
    url,
    applyUrl: httpUrl(input.applyUrl ?? undefined) ?? url,
    descriptionSnippet: clip(plainText(text), SNIPPET),
    locationText: plainText(input.locationText ?? ""),
    tags,
    salaryMin: money(input.salaryMin),
    salaryMax: money(input.salaryMax),
    salaryCurrency: input.salaryCurrency?.trim().toUpperCase() || null,
    salaryPeriod: input.salaryPeriod ?? null,
    postedAt: input.postedAt ?? null,
    text,
  };
}
