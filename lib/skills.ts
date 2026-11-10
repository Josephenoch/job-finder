import type { Job } from "./types";

const CATALOG: { name: string; pattern: RegExp }[] = [
  { name: "JavaScript", pattern: /\bjavascript\b|(?<![\w.])js(?![\w.])/i },
  { name: "TypeScript", pattern: /\btypescript\b/i },
  { name: "Python", pattern: /\bpython\b/i },
  { name: "Java", pattern: /\bjava(?!script)\b/i },
  { name: "Kotlin", pattern: /\bkotlin\b/i },
  { name: "Swift", pattern: /\bswift(?:ui)?\b/i },
  { name: "Go", pattern: /\bgolang\b|(?<!\bto\s)\bgo(?=\s*(?:,|\/|developer|engineer|programmer|lang))/i },
  { name: "Rust", pattern: /\brust\b/i },
  { name: "Ruby", pattern: /\bruby\b/i },
  { name: "PHP", pattern: /\bphp\b/i },
  { name: "C#", pattern: /\bc#\b|\bcsharp\b|\.net\b|\bdotnet\b/i },
  { name: "C++", pattern: /\bc\+\+\b|\bcpp\b/i },
  { name: "Scala", pattern: /\bscala\b/i },
  { name: "Elixir", pattern: /\belixir\b/i },
  { name: "Dart", pattern: /\bdart\b|\bflutter\b/i },
  { name: "SQL", pattern: /\bsql\b/i },
  { name: "React", pattern: /\breact(?:\.js|js)?\b/i },
  { name: "React Native", pattern: /\breact native\b/i },
  { name: "Next.js", pattern: /\bnext(?:\.js|js)\b/i },
  { name: "Gatsby", pattern: /\bgatsby(?:\.js|js)?\b/i },
  { name: "Vue", pattern: /\bvue(?:\.js|js)?\b/i },
  { name: "Angular", pattern: /\bangular(?:\.js|js)?\b/i },
  { name: "Svelte", pattern: /\bsvelte\b/i },
  { name: "Node.js", pattern: /\bnode(?:\.js|js)\b|\bnode(?=\s+(?:developer|engineer))/i },
  { name: "NestJS", pattern: /\bnest(?:\.js|js)\b/i },
  { name: "Express", pattern: /\bexpress(?:\.js|js)?\b/i },
  { name: "Django", pattern: /\bdjango\b/i },
  { name: "Flask", pattern: /\bflask\b/i },
  { name: "FastAPI", pattern: /\bfastapi\b/i },
  { name: "Spring", pattern: /\bspring(?:\s*boot)?\b/i },
  { name: "Rails", pattern: /\brails\b|\bruby on rails\b/i },
  { name: "Laravel", pattern: /\blaravel\b/i },
  { name: "PostgreSQL", pattern: /\bpostgres(?:ql)?\b/i },
  { name: "MySQL", pattern: /\bmysql\b/i },
  { name: "MongoDB", pattern: /\bmongodb\b|\bmongo\b/i },
  { name: "Redis", pattern: /\bredis\b/i },
  { name: "GraphQL", pattern: /\bgraphql\b/i },
  { name: "Tailwind", pattern: /\btailwind(?:\s*css)?\b/i },
  { name: "Material UI", pattern: /\bmaterial(?:\s*ui|-ui)\b|\bmui\b/i },
  { name: "Chakra UI", pattern: /\bchakra(?:\s*ui)?\b/i },
  { name: "AWS", pattern: /\baws\b|\bamazon web services\b|\blambda\b|\bec2\b|\bcognito\b|\bamplify\b/i },
  { name: "Google Cloud", pattern: /\bgoogle cloud\b|\bgcp\b/i },
  { name: "Azure", pattern: /\bazure\b/i },
  { name: "Firebase", pattern: /\bfirebase\b/i },
  { name: "Docker", pattern: /\bdocker\b/i },
  { name: "Kubernetes", pattern: /\bkubernetes\b|\bk8s\b/i },
];

const byName = new Map(CATALOG.map((skill) => [skill.name, skill]));

export function skillsFromCv(text: string): string[] {
  return CATALOG.filter((skill) => skill.pattern.test(text)).map((skill) => skill.name);
}

export function jobMatchesSkills(job: Job, skills: string[]): boolean {
  if (!skills.length) return false;
  const blob = `${job.title}\n${job.description}\n${(job.categories ?? []).join(" ")}`;
  return skills.some((name) => byName.get(name)?.pattern.test(blob));
}
