import type { Job, SalaryPeriod } from "./types";

export const MAX_AGE_OPTIONS = [
  { days: 1, label: "24 hours" },
  { days: 3, label: "3 days" },
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
] as const;

export const PAY_OPTIONS = [
  { usd: 0, label: "Any pay" },
  { usd: 1000, label: "$1,000 / month" },
  { usd: 2000, label: "$2,000 / month" },
  { usd: 3000, label: "$3,000 / month" },
  { usd: 4000, label: "$4,000 / month" },
  { usd: 5000, label: "$5,000 / month" },
  { usd: 7500, label: "$7,500 / month" },
  { usd: 10000, label: "$10,000 / month" },
] as const;

export const DEFAULT_MAX_AGE_DAYS = 3;
export const DEFAULT_MIN_MONTHLY_USD = 2000;
export const MATCH_LIMIT = 8;

export function maxAgeMs(days: number): number {
  return days * 24 * 60 * 60 * 1000;
}

export function parseMaxAgeDays(value: unknown): number {
  const days = Number(value);
  return MAX_AGE_OPTIONS.some((option) => option.days === days) ? days : DEFAULT_MAX_AGE_DAYS;
}

export function parseMinMonthlyUsd(value: unknown): number {
  const usd = Number(value);
  return PAY_OPTIONS.some((option) => option.usd === usd) ? usd : DEFAULT_MIN_MONTHLY_USD;
}

const USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.73,
  AUD: 0.66,
  NGN: 1 / 1500,
};

const ALLOW_PLACE = /\b(worldwide|anywhere|global|africa|nigeria|emea)\b/i;
const VAGUE_PLACE = /^(remote|fully remote|100% remote)$/i;
const BLOCK_PLACE =
  /\b(united states|u\.s\.a?\.?|usa|canada|united kingdom|uk|europe|european|eu|latam|latin america|apac|asia|australia|india|germany|france|spain|brazil|mexico|netherlands|sweden|poland|portugal|north america|south america|oceania|americas|authorized to work|must be (based|located|resident))\b/i;
const US_TOKEN = /\b(?:usa|u\.s\.a?\.?)\b|(?:^|[^a-z])us(?:[^a-z]|$)/i;

const STOP = new Set([
  "and",
  "the",
  "for",
  "you",
  "our",
  "are",
  "was",
  "not",
  "but",
  "can",
  "all",
  "any",
  "its",
  "per",
  "via",
  "job",
  "jobs",
  "role",
  "team",
  "work",
  "with",
  "this",
  "that",
  "from",
  "your",
  "have",
  "will",
  "about",
  "their",
  "been",
  "were",
  "they",
  "which",
  "into",
  "also",
  "more",
  "than",
  "such",
  "over",
  "using",
  "across",
  "other",
  "these",
  "those",
  "where",
  "while",
  "there",
  "after",
  "before",
  "within",
  "without",
  "through",
  "between",
  "experience",
  "years",
  "working",
  "including",
  "strong",
  "ability",
  "skills",
  "looking",
  "join",
  "company",
  "remote",
  "senior",
  "software",
  "engineer",
  "engineering",
  "developer",
]);

export function normalizePeriod(value: unknown): SalaryPeriod | undefined {
  const v = String(value ?? "").toLowerCase();
  if (v.includes("hour")) return "hour";
  if (v.includes("week")) return "week";
  if (v.includes("month")) return "month";
  if (v.includes("year") || v.includes("annual")) return "year";
  return undefined;
}

export function toMonthlyUsd(
  amount: number,
  period: SalaryPeriod,
  currency = "USD",
): number | undefined {
  const rate = USD_RATES[currency.toUpperCase()];
  if (rate == null) return undefined;
  const usd = amount * rate;
  switch (period) {
    case "hour":
      return usd * 160;
    case "week":
      return (usd * 52) / 12;
    case "month":
      return usd;
    case "year":
      return usd / 12;
  }
}

function periodWord(word: string): SalaryPeriod {
  if (/^hours?$|^hr$/.test(word)) return "hour";
  if (/^weeks?$|^wk$/.test(word)) return "week";
  if (/^years?$|^yr$|^annum$/.test(word)) return "year";
  return "month";
}

function currencyOf(token: string): string {
  if (token.includes("€") || /eur/i.test(token)) return "EUR";
  if (token.includes("£") || /gbp/i.test(token)) return "GBP";
  return "USD";
}

function amountOf(raw: string, kilo: string | undefined): number {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return Number.NaN;
  return kilo ? n * 1000 : n;
}

export function lowestStatedMonthly(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const range =
    /(?:usd|eur|gbp|\$|€|£)\s*([\d,.]+)\s*(k)?\s*(?:-|–|—|to)\s*(?:usd|eur|gbp|\$|€|£)?\s*([\d,.]+)\s*(k)?\s*(?:usd|eur|gbp)?\s*(?:a|per|\/)\s*(hour|hr|week|wk|month|mo|year|yr|annum)/gi;
  const single =
    /(?:usd|eur|gbp|\$|€|£)\s*([\d,.]+)\s*(k)?\s*(?:usd|eur|gbp)?\s*(?:a|per|\/)\s*(hour|hr|week|wk|month|mo|year|yr|annum)|([\d,.]+)\s*(k)?\s*(usd|eur|gbp)\s*(?:a|per|\/)\s*(hour|hr|week|wk|month|mo|year|yr|annum)/gi;
  const lows: number[] = [];
  for (const match of text.matchAll(range)) {
    const low = amountOf(match[1], match[2]);
    const monthly = toMonthlyUsd(low, periodWord(match[5].toLowerCase()), currencyOf(match[0]));
    if (monthly != null && monthly < 200_000) lows.push(monthly);
  }
  range.lastIndex = 0;
  const withoutRanges = text.replace(range, " ");
  for (const match of withoutRanges.matchAll(single)) {
    const raw = match[1] ?? match[4];
    const kilo = match[2] ?? match[5];
    const word = (match[3] ?? match[7] ?? "month").toLowerCase();
    const low = amountOf(raw, kilo);
    const monthly = toMonthlyUsd(low, periodWord(word), currencyOf(match[0]));
    if (monthly != null && monthly < 200_000) lows.push(monthly);
  }
  if (!lows.length) return undefined;
  return Math.min(...lows);
}

export function meetsPayFloor(job: Job, minMonthlyUsd = DEFAULT_MIN_MONTHLY_USD): boolean {
  if (minMonthlyUsd <= 0) return true;
  if (job.salaryPeriod && (job.salaryMin != null || job.salaryMax != null)) {
    const min =
      job.salaryMin != null
        ? toMonthlyUsd(job.salaryMin, job.salaryPeriod, job.salaryCurrency)
        : undefined;
    const max =
      job.salaryMax != null
        ? toMonthlyUsd(job.salaryMax, job.salaryPeriod, job.salaryCurrency)
        : undefined;
    if (min != null && min < minMonthlyUsd) return false;
    if (min == null && max != null && max < minMonthlyUsd) return false;
    if (min != null || max != null) return true;
  }
  const stated = lowestStatedMonthly(`${job.salaryText ?? ""} ${job.description}`);
  return stated == null || stated >= minMonthlyUsd;
}

export function formatSalary(job: Job): string {
  if (job.salaryMin == null && job.salaryMax == null) {
    return job.salaryText?.trim() || "Pay not listed";
  }
  const currency = job.salaryCurrency ?? "USD";
  const period = job.salaryPeriod ?? "";
  const fmt = (n: number) => n.toLocaleString("en-US");
  const span =
    job.salaryMin != null && job.salaryMax != null && job.salaryMin !== job.salaryMax
      ? `${fmt(job.salaryMin)}–${fmt(job.salaryMax)}`
      : fmt((job.salaryMin ?? job.salaryMax)!);
  return `${currency} ${span} ${period}`.trim();
}

export function locationLabel(job: Job): string {
  if (job.locationText?.trim()) return job.locationText.trim();
  if (job.locationRestrictions?.length) return job.locationRestrictions.join(", ");
  return "Remote";
}

export function isRecent(postedAt: string, now = Date.now(), windowMs = maxAgeMs(DEFAULT_MAX_AGE_DAYS)): boolean {
  const t = Date.parse(postedAt);
  return Number.isFinite(t) && t >= now - windowMs && t <= now + 60_000;
}

export function locationTextAllowsNigeria(text: string | undefined): boolean {
  if (!text?.trim()) return true;
  const t = text.trim();
  if (VAGUE_PLACE.test(t)) return true;
  if (/\b(except|excluding|not available in)\s+(nigeria|africa)\b/i.test(t)) return false;
  const zones = [...t.matchAll(/gmt\s*([+-]\d{1,2})/gi)].map((match) => Number(match[1]));
  if (zones.length >= 2) {
    const low = Math.min(...zones);
    const high = Math.max(...zones);
    if (1 < low || 1 > high) return false;
  }
  if (ALLOW_PLACE.test(t)) return true;
  if (US_TOKEN.test(t) || BLOCK_PLACE.test(t)) return false;
  return true;
}

export function acceptsNigeria(job: Job): boolean {
  const restrictions = job.locationRestrictions ?? [];
  if (restrictions.length > 0 && !restrictions.some((place) => ALLOW_PLACE.test(place))) {
    return false;
  }
  const zones = job.timezoneRestrictions ?? [];
  if (zones.length > 0 && !zones.includes(1)) return false;
  return locationTextAllowsNigeria(job.locationText);
}

const CANADA =
  /\b(canada|canadian|toronto|vancouver|montr[eé]al|ottawa|calgary|ontario|british columbia|alberta|qu[eé]bec)\b/i;
const UK =
  /\b(united kingdom|u\.k\.|uk|england|scotland|wales|london|manchester|britain|british)\b/i;
const RELOCATION = /\brelocat(?:e|ion|ing)\b/i;
const VISA =
  /\b(visa sponsorship|skilled worker visa|global talent stream|global skills strategy|lmia|labour market impact|labor market impact|tier 2|work permit)\b|\bsponsor(?:s|ing|ed|ship)?\b[^.]{0,48}\bvisas?\b|\bvisas?\b[^.]{0,48}\bsponsor/i;
const DENIED_MOVE =
  /\b(?:no|not|without|unable to|cannot|can't|do not|don't|does not|will not|won't)\b[^.]{0,40}\b(?:visa|sponsor(?:ship)?|relocat)/i;
const LOCAL_ONLY =
  /only open to candidates currently based|must be (?:legally )?authorized to work|must have (?:the )?right to work|already authorized to work|authorized to work in canada|no visa sponsorship|not able to sponsor|cannot sponsor|without sponsorship/i;

export function offersCanadaOrUkMove(job: Job): boolean {
  const place = [job.title, job.locationText, ...(job.locationRestrictions ?? [])].filter(Boolean).join(" ");
  if (!CANADA.test(place) && !UK.test(place)) return false;
  const text = `${place} ${job.description}`;
  if (DENIED_MOVE.test(text) || LOCAL_ONLY.test(text)) return false;
  if (job.categories?.includes("sponsored-move")) return true;
  if (CANADA.test(place) && (VISA.test(text) || RELOCATION.test(text))) return true;
  return RELOCATION.test(text) && VISA.test(text);
}

export function dedupe(jobs: Job[]): Job[] {
  const map = new Map<string, Job>();
  for (const job of jobs) {
    const key = `${job.company} ${job.title}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const prev = map.get(key);
    if (!prev || richness(job) > richness(prev)) map.set(key, job);
  }
  return [...map.values()];
}

function richness(job: Job): number {
  const salary = job.salaryMin != null || job.salaryMax != null || job.salaryText ? 1000 : 0;
  return salary + Math.min(job.description.length, 500);
}

export function termsFromText(text: string, limit = 24): string[] {
  const counts = new Map<string, number>();
  for (const token of text.toLowerCase().match(/[a-z][a-z0-9+.#]{3,}/g) ?? []) {
    if (STOP.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word);
}

export function termOverlap(terms: string[], job: Job): number {
  const title = job.title.toLowerCase();
  const blob = `${title} ${job.description} ${(job.categories ?? []).join(" ")}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const needle = term.toLowerCase().trim();
    if (needle.length < 2 || !blob.includes(needle)) continue;
    score += needle.includes(" ") ? 3 : 1;
    if (title.includes(needle)) score += 2;
  }
  return score;
}

export function considerMatch(kept: { job: Job; rank: number }[], job: Job, terms: string[], limit = MATCH_LIMIT) {
  const rank = termOverlap(terms, job);
  const posted = Date.parse(job.postedAt);
  const betterThan = (item: { job: Job; rank: number }) =>
    rank > item.rank || (rank === item.rank && posted > Date.parse(item.job.postedAt));
  const brief = job.description.length > 280 ? { ...job, description: job.description.slice(0, 280) } : job;
  if (kept.length < limit) {
    kept.push({ job: brief, rank });
    return;
  }
  let worst = 0;
  for (let index = 1; index < kept.length; index += 1) {
    const item = kept[index];
    const low = kept[worst];
    if (item.rank < low.rank || (item.rank === low.rank && Date.parse(item.job.postedAt) < Date.parse(low.job.postedAt))) {
      worst = index;
    }
  }
  if (betterThan(kept[worst])) kept[worst] = { job: brief, rank };
}

export function prepareJobs(
  jobs: Job[],
  cvText: string,
  now = Date.now(),
  windowMs = maxAgeMs(DEFAULT_MAX_AGE_DAYS),
  includeSponsoredMove = false,
  minMonthlyUsd = DEFAULT_MIN_MONTHLY_USD,
) {
  const terms = termsFromText(cvText);
  const matched = dedupe(
    jobs.filter(
      (job) =>
        isRecent(job.postedAt, now, windowMs) &&
        (acceptsNigeria(job) || (includeSponsoredMove && offersCanadaOrUkMove(job))) &&
        meetsPayFloor(job, minMonthlyUsd),
    ),
  );
  const kept: { job: Job; rank: number }[] = [];
  for (const job of matched) considerMatch(kept, job, terms);
  kept.sort((a, b) => b.rank - a.rank || Date.parse(b.job.postedAt) - Date.parse(a.job.postedAt));
  return {
    jobs: kept.map((item) => item.job),
    total: matched.length,
    capped: matched.length > kept.length,
    skills: terms,
  };
}
