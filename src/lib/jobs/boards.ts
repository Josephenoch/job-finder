import ashbySeed from "./seed/ashby.json";
import greenhouseSeed from "./seed/greenhouse.json";
import leverSeed from "./seed/lever.json";

const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const extra = {
  greenhouse: [] as string[],
  lever: [] as string[],
  ashby: [] as string[],
};

function usable(slugs: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const slug of slugs) {
    const trimmed = slug.trim();
    if (!trimmed || /^\d+$/.test(trimmed) || !SLUG.test(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Company board slugs. The seeded lists are CC BY-NC 4.0, Riley Dorrington,
 * https://github.com/Feashliaa/job-board-aggregator — personal non-commercial use.
 * Add a slug to `extra` or delete it from the seed file.
 */
export const atsBoards = {
  greenhouse: usable([...greenhouseSeed, ...extra.greenhouse]),
  lever: usable([...leverSeed, ...extra.lever]),
  ashby: usable([...ashbySeed, ...extra.ashby]),
};
