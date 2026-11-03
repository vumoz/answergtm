/** Small fetch wrapper with a timeout and readable errors. */
export async function postJson<T>(url: string, body: unknown, headers: Record<string, string>, timeoutMs = 90_000): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

export async function getJson<T>(url: string, timeoutMs = 90_000): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}
