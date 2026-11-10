import { z } from "zod";
import { fetchText } from "@/lib/http";
import { httpUrl } from "@/lib/text";
import { plainText } from "../html";
import { parseJson } from "../json";
import { asDate, toNormalizedJob } from "../normalize";
import type { NormalizedJob } from "../types";

const SOURCE = "Hacker News";
const SEARCH = "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=10";

const searchSchema = z.object({
  hits: z
    .array(
      z.object({
        objectID: z.union([z.string(), z.number()]),
        title: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

const commentSchema = z.object({
  id: z.union([z.string(), z.number()]),
  text: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});

const itemSchema = z.object({
  children: z.array(z.unknown()).default([]),
});

function hiringStoryId(hits: { objectID: string | number; title?: string | null }[]): string | null {
  const hit = hits.find((item) => {
    const title = item.title ?? "";
    return /who is hiring/i.test(title) && !/who wants to be hired/i.test(title);
  });
  if (!hit) return null;
  const id = String(hit.objectID);
  return /^\d+$/.test(id) ? id : null;
}

function firstLink(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"')\]]+/);
  return match ? (httpUrl(match[0]) ?? null) : null;
}

function fromComment(id: string, html: string, createdAt: string | null | undefined): NormalizedJob | null {
  const text = plainText(html, true);
  const first = text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!first) return null;
  const parts = first
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  const company = parts.length >= 2 ? parts[0] : "Unknown";
  const title = parts.length >= 2 ? parts[1] : first;
  const listing = `https://news.ycombinator.com/item?id=${id}`;
  return toNormalizedJob({
    source: SOURCE,
    externalId: id,
    title,
    company,
    url: listing,
    applyUrl: firstLink(text) ?? listing,
    text,
    locationText: parts[2] ?? "",
    tags: parts.slice(3),
    postedAt: asDate(createdAt),
  });
}

export async function fetchJobs(): Promise<NormalizedJob[]> {
  const search = searchSchema.parse(parseJson(await fetchText(SEARCH)));
  const storyId = hiringStoryId(search.hits);
  if (!storyId) return [];
  const story = itemSchema.parse(parseJson(await fetchText(`https://hn.algolia.com/api/v1/items/${storyId}`)));
  const jobs: NormalizedJob[] = [];
  for (const child of story.children) {
    const comment = commentSchema.safeParse(child);
    if (!comment.success || !comment.data.text) continue;
    const job = fromComment(String(comment.data.id), comment.data.text, comment.data.created_at);
    if (job) jobs.push(job);
  }
  return jobs;
}
