import { z } from "zod";
import { fetchText } from "@/lib/http";
import { parseJson } from "../json";
import { asDate, money, toNormalizedJob } from "../normalize";
import type { NormalizedJob } from "../types";

const SOURCE = "Remote OK";

const jobSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  position: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  apply_url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  epoch: z.number().nullable().optional(),
  location: z.string().nullable().optional(),
  salary_min: z.number().nullable().optional(),
  salary_max: z.number().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
});

export async function fetchJobs(): Promise<NormalizedJob[]> {
  const payload = z.array(z.unknown()).parse(parseJson(await fetchText("https://remoteok.com/api")));
  const jobs: NormalizedJob[] = [];
  for (const item of payload.slice(1)) {
    const parsed = jobSchema.safeParse(item);
    if (!parsed.success) continue;
    const row = parsed.data;
    const position = row.position?.trim();
    if (!position) continue;
    const salaryMin = money(row.salary_min);
    const salaryMax = money(row.salary_max);
    const postedAt = asDate(row.epoch && row.epoch > 0 ? row.epoch : row.date);
    const listing = row.url || row.apply_url || "";
    const job = toNormalizedJob({
      source: SOURCE,
      externalId: row.id != null ? String(row.id) : listing || position,
      title: position,
      company: row.company || "Unknown",
      url: listing,
      applyUrl: row.apply_url || row.url,
      text: row.description || position,
      locationText: row.location || "",
      tags: row.tags ?? [],
      salaryMin,
      salaryMax,
      salaryCurrency: salaryMin != null || salaryMax != null ? "USD" : null,
      salaryPeriod: salaryMin != null || salaryMax != null ? "year" : null,
      postedAt,
    });
    if (job) jobs.push(job);
  }
  return jobs;
}
