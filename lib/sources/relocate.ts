import { fetchText } from "../http";
import type { Job } from "../types";
import { clip, stripHtml } from "../text";

const HOME = "https://relocate.me/international-jobs";
const PAGES = 6;

function textOf(value: string): string {
  return stripHtml(value).replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)));
}

function jobsFromHtml(html: string, now: number): Job[] {
  const jobs: Job[] = [];
  for (const block of html.split('class="jobs-list__job"').slice(1)) {
    const href = block.match(/<a href="(\/[^"]+)"/)?.[1];
    const title = textOf(block.match(/<b>([^<]+)<\/b>/)?.[1] ?? "");
    const paragraphs = [...block.matchAll(/<p>([^<]+)<\/p>/g)].map((match) => textOf(match[1]));
    const country = paragraphs[0] ?? "";
    const company = paragraphs[1] ?? "";
    if (!href || !title || !/^canada$/i.test(country)) continue;
    const preview = textOf(block.match(/job__preview">([^<]+)/)?.[1] ?? "");
    jobs.push({
      id: `relocate:${href}`,
      title,
      company: company || "Unknown",
      url: `https://relocate.me${href}`,
      description: clip(
        `${preview} Relocate.me lists this role with relocation to Canada. The site does not publish a posting date, so this search includes it. Confirm what the package covers before applying.`,
        1200,
      ),
      postedAt: new Date(now).toISOString(),
      source: "Relocate.me",
      sourceUrl: HOME,
      locationText: `Canada${href.split("/")[2] ? `, ${href.split("/")[2]}` : ""}`,
      categories: ["sponsored-move"],
    });
  }
  return jobs;
}

export async function loadRelocate(now = Date.now()): Promise<Job[]> {
  const pages = await Promise.all(
    Array.from({ length: PAGES }, (_, index) => {
      const url = index === 0 ? HOME : `${HOME}?page=${index + 1}`;
      return fetchText(url).catch(() => "");
    }),
  );
  const seen = new Set<string>();
  const jobs: Job[] = [];
  for (const html of pages) {
    for (const job of jobsFromHtml(html, now)) {
      if (seen.has(job.id)) continue;
      seen.add(job.id);
      jobs.push(job);
    }
  }
  return jobs;
}
