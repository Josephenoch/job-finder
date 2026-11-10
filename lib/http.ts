const UA = "job-finder/0.1 (personal job search)";

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json, application/xml, text/xml, */*",
      "User-Agent": UA,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return res.text();
}

export async function fetchJson<T>(url: string): Promise<T> {
  return JSON.parse(await fetchText(url)) as T;
}
