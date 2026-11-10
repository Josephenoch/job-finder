import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { fetchText } from "@/lib/http";
import { asDate, toNormalizedJob } from "../normalize";
import type { NormalizedJob } from "../types";

const SOURCE = "We Work Remotely";
const FEEDS = [
  "https://weworkremotely.com/remote-jobs.rss",
  "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
];

const itemSchema = z.object({
  title: z.string().optional(),
  link: z.string().optional(),
  guid: z.union([z.string(), z.number()]).optional(),
  pubDate: z.string().optional(),
  description: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  category: z.string().optional(),
  skills: z.string().optional(),
  type: z.string().optional(),
});

const feedSchema = z.object({
  rss: z.object({
    channel: z.object({
      item: z.array(itemSchema).optional(),
    }),
  }),
});

const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  isArray: (tagName) => tagName === "item",
});

function locationText(item: z.infer<typeof itemSchema>): string {
  return [item.region, item.state, item.country]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(", ");
}

function fromItem(item: z.infer<typeof itemSchema>, seen: Set<string>): NormalizedJob | null {
  const rawTitle = item.title?.trim();
  const url = item.link?.trim() || (item.guid != null ? String(item.guid) : "");
  if (!rawTitle || !url || seen.has(url)) return null;
  seen.add(url);
  const splitAt = rawTitle.indexOf(":");
  const company = splitAt === -1 ? "Unknown" : rawTitle.slice(0, splitAt).trim();
  const title = splitAt === -1 ? rawTitle : rawTitle.slice(splitAt + 1).trim();
  const skills = item.skills
    ?.split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
  return toNormalizedJob({
    source: SOURCE,
    externalId: url,
    title: title || rawTitle,
    company,
    url,
    applyUrl: url,
    text: item.description || rawTitle,
    locationText: locationText(item),
    tags: [...(item.category ? [item.category] : []), ...(item.type ? [item.type] : []), ...(skills ?? [])],
    postedAt: asDate(item.pubDate),
  });
}

export async function fetchJobs(): Promise<NormalizedJob[]> {
  const seen = new Set<string>();
  const jobs: NormalizedJob[] = [];
  for (const feed of FEEDS) {
    const parsed = feedSchema.parse(parser.parse(await fetchText(feed)) as unknown);
    for (const item of parsed.rss.channel.item ?? []) {
      const job = fromItem(item, seen);
      if (job) jobs.push(job);
    }
  }
  return jobs;
}
