import { fetchText } from "../http";
import type { Job } from "../types";
import { clip, stripHtml } from "../text";

const LIST_URL = "https://app.vanhack.com/jobs";
const CANADA =
  /\b(canada|toronto|vancouver|montr[eé]al|ottawa|calgary|victoria|ontario|british columbia|alberta|qu[eé]bec)\b/i;
const LOCAL_ONLY = /only open to candidates currently based/i;

function decode(value: string): string {
  return stripHtml(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCodePoint(Number(num)));
}

function postedFromRelative(label: string, now: number): string | undefined {
  const match = label.trim().match(/(\d+)\s*(min|h|d|w|mo)/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const ms =
    unit === "min"
      ? amount * 60_000
      : unit === "h"
        ? amount * 3_600_000
        : unit === "d"
          ? amount * 86_400_000
          : unit === "w"
            ? amount * 7 * 86_400_000
            : amount * 30 * 86_400_000;
  return new Date(now - ms).toISOString();
}

export async function loadVanhack(now = Date.now()): Promise<Job[]> {
  const html = await fetchText(LIST_URL);
  const parts = html.split(/<a[^>]+href="(\/job\/\d+)"/i);
  const jobs: Job[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const path = parts[i];
    const block = parts[i + 1]?.slice(0, 6000) ?? "";
    if (LOCAL_ONLY.test(block)) continue;
    const location = decode(block.match(/vh-detail-label">([^<]+)/)?.[1] ?? "");
    if (!CANADA.test(location)) continue;
    const title = decode(block.match(/vh-card-title">([^<]+)/)?.[1] ?? "");
    const postedAt = postedFromRelative(decode(block.match(/vh-posted">([^<]+)/)?.[1] ?? ""), now);
    if (!title || !postedAt) continue;
    const skills = [...block.matchAll(/vh-skill[^"]*">([^<]+)/g)].map((match) => decode(match[1]));
    const id = path.split("/").pop() ?? path;
    jobs.push({
      id: `vanhack:${id}`,
      title,
      company: "VanHack",
      url: `https://app.vanhack.com${path}`,
      description: clip(
        `${skills.join(", ")}. VanHack listing that does not limit applicants to people already based in Canada. Confirm immigration support before applying.`,
        1200,
      ),
      postedAt,
      source: "VanHack",
      sourceUrl: LIST_URL,
      locationText: location,
      categories: ["sponsored-move", ...skills],
    });
  }
  return jobs;
}
