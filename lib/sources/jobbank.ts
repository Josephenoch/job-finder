import type { Job } from "../types";
import { clip, stripHtml } from "../text";

const SEARCH =
  "https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring=software+engineer&sort=D";

function decode(value: string): string {
  return stripHtml(value).replace(/&#(\d+);/g, (_, num: string) => String.fromCodePoint(Number(num)));
}

export async function loadJobBank(now = Date.now()): Promise<Job[]> {
  let res: Response;
  try {
    res = await fetch(SEARCH, {
      headers: {
        Accept: "text/html",
        "User-Agent": "job-finder/0.1 (personal job search)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error("jobbank.gc.ca did not respond");
  }
  if (!res.ok) throw new Error(`jobbank.gc.ca returned ${res.status}`);
  const html = await res.text();
  const jobs: Job[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/href="(\/jobsearch\/jobposting\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const id = match[2];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const title = decode(match[3]);
    if (!title || title.length < 4) continue;
    const around = html.slice(Math.max(0, match.index ?? 0), (match.index ?? 0) + 900);
    const posted = around.match(/Posted on\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
    const postedAt = posted ? new Date(posted[1]).toISOString() : new Date(now).toISOString();
    if (posted && Number.isNaN(Date.parse(postedAt))) continue;
    const location = decode(around.match(/class="location"[^>]*>([^<]+)/i)?.[1] ?? "Canada");
    const foreign = /lmia|foreign worker|foreign candidate|global talent/i.test(around);
    jobs.push({
      id: `jobbank:${id}`,
      title,
      company: decode(around.match(/class="business"[^>]*>([^<]+)/i)?.[1] ?? "Canada Job Bank"),
      url: `https://www.jobbank.gc.ca/jobsearch/jobposting/${id}`,
      description: clip(`${title}. ${location}.`, 500),
      postedAt,
      source: "Canada Job Bank",
      sourceUrl: "https://www.jobbank.gc.ca",
      locationText: location.includes("Canada") ? location : `${location}, Canada`,
      categories: foreign ? ["sponsored-move"] : undefined,
    });
    if (jobs.length >= 40) break;
  }
  return jobs;
}
