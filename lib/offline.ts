// Offline layer (P-022 stage 1). Sits under every Supabase call, so screens need no change.
// - Reads: network first; when the network is down, the last answer seen is served from a local copy.
// - Writes (RPC and table changes): when the network is down they wait in a local queue with a "waiting to send" count,
//   and are replayed in order when the network returns. If the server refuses one (someone else changed it first),
//   it goes to a list of conflicts that the person is told about.
// - Not queued: sign-in, the AI functions, file uploads, demo/business creation, and chat messages (they have their own queue).
const ACTIONS = "bos.actions.v1", CONFLICTS = "bos.conflicts.v1", CACHE = "bos-read-v1";
const READ_RPC = new Set(["stock_levels", "money_summary", "customer_balances", "inventory_summary", "message_receipts", "private_chat_messages", "private_access_history"]);
const NEVER_QUEUE_RPC = new Set(["enter_demo", "create_business", "request_private_access", "customer_thread", "customer_message", "save_push_subscription", "remove_push_subscription"]);

export type Action = { id: string; at: string; name: string; method: string; url: string; headers: [string, string][]; body: string | null };
export type Conflict = { id: string; at: string; name: string; reason: string; method?: string; url?: string; headers?: [string, string][]; body?: string | null };

let getToken: () => Promise<string | null> = async () => null;
export const setTokenGetter = (f: () => Promise<string | null>) => { getToken = f; };

const load = <T,>(k: string): T[] => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const readActions = () => load<Action>(ACTIONS);
export const readConflicts = () => load<Conflict>(CONFLICTS);
export const clearConflicts = () => save(CONFLICTS, []);
export const dropConflict = (id: string) => { save(CONFLICTS, readConflicts().filter((c) => c.id !== id)); notify(); };
// Redo a refused action against the situation as it is now. The server decides again; if it refuses, the reason is updated.
export async function redoConflict(id: string): Promise<string | null> {
  const c = readConflicts().find((x) => x.id === id);
  if (!c || !c.url || !c.method) return "Action introuvable.";
  const token = await getToken(); if (!token) return "Connectez-vous d'abord.";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "Pas de réseau.";
  let res: Response;
  try { res = await fetch(c.url, { method: c.method, headers: [...(c.headers ?? []), ["Authorization", `Bearer ${token}`]], body: c.body ?? null }); }
  catch { return "Pas de réseau."; }
  if (res.ok) { dropConflict(id); return null; }
  let reason = ""; try { reason = (await res.json()).message ?? ""; } catch {}
  reason = reason || `erreur ${res.status}`;
  save(CONFLICTS, readConflicts().map((x) => x.id === id ? { ...x, reason } : x)); notify();
  return reason;
}
const notify = () => { try { window.dispatchEvent(new Event("bos-offline-change")); } catch {} };

const rpcName = (url: string) => /\/rest\/v1\/rpc\/([a-z_0-9]+)/.exec(url)?.[1] ?? "";
const label = (url: string, method: string) => rpcName(url) || `${method} ${/\/rest\/v1\/([a-z_0-9]+)/.exec(url)?.[1] ?? "?"}`;

export async function offlineFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init);
  const url = req.url; const method = req.method.toUpperCase();
  const rest = url.includes("/rest/v1/");
  const name = rpcName(url);
  const isRead = rest && (method === "GET" || method === "HEAD" || (method === "POST" && READ_RPC.has(name)));
  const isWrite = rest && !isRead && !/\/rest\/v1\/message(\?|$)/.test(url) && !(name && NEVER_QUEUE_RPC.has(name));
  const body = !rest || method === "GET" || method === "HEAD" ? null : await req.clone().text();
  const cacheKey = `https://bos.local/${encodeURIComponent(url + "|" + (body ?? ""))}`;
  try {
    // On a weak network a request can hang instead of failing. Reads give up after 8 s and use the local copy;
    // when the phone itself says it is offline, nothing waits at all.
    if (rest && typeof navigator !== "undefined" && navigator.onLine === false) throw new TypeError("offline");
    let res: Response;
    if (isRead) {
      const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 8000);
      try { res = await fetch(new Request(req.clone(), { signal: ac.signal })); } finally { clearTimeout(timer); }
    } else res = await fetch(req.clone());
    if (isRead && res.ok && typeof caches !== "undefined") { try { (await caches.open(CACHE)).put(cacheKey, res.clone()); } catch {} }
    return res;
  } catch (e) {
    // fetch only throws when the network is unreachable
    if (isRead && typeof caches !== "undefined") {
      const hit = await (await caches.open(CACHE)).match(cacheKey);
      if (hit) return hit;
    }
    if (isWrite) {
      const headers: [string, string][] = []; req.headers.forEach((v, k) => { if (k.toLowerCase() !== "authorization") headers.push([k, v]); });
      save(ACTIONS, [...readActions(), { id: crypto.randomUUID(), at: new Date().toISOString(), name: label(url, method), method, url, headers, body }]);
      notify();
      return new Response(null, { status: 204 });
    }
    throw e;
  }
}

let flushing = false;
export async function flushActions(): Promise<void> {
  if (flushing) return; flushing = true;
  try {
    for (const a of readActions()) {
      const token = await getToken(); if (!token) break;
      let res: Response;
      try { res = await fetch(a.url, { method: a.method, headers: [...a.headers, ["Authorization", `Bearer ${token}`]], body: a.body }); }
      catch { break; } // still offline: keep it and the rest
      save(ACTIONS, readActions().filter((x) => x.id !== a.id));
      if (!res.ok) {
        let reason = ""; try { reason = (await res.json()).message ?? ""; } catch {}
        save(CONFLICTS, [...readConflicts(), { id: a.id, at: a.at, name: a.name, reason: reason || `erreur ${res.status}`, method: a.method, url: a.url, headers: a.headers, body: a.body }]);
      }
      notify();
    }
  } finally { flushing = false; }
}

export async function wipeLocalCopy() { try { await caches.delete(CACHE); } catch {} try { localStorage.removeItem(ACTIONS); localStorage.removeItem(CONFLICTS); } catch {} }
