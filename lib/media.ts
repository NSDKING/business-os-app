// Photos and voice notes: made small on the phone so they send on weak networks (P-004).
import { supabase } from "./supabase";

export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(b); });
}
export async function dataUrlToBlob(u: string): Promise<Blob> { return (await fetch(u)).blob(); }

// Longest side 1280 px, JPEG: usually 100 to 250 KB instead of several MB.
export async function toPhoto(file: File, max = 1280): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.72);
}

export const MAX_VOICE_SECONDS = 120;
export function recorderSupported() {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}
export type Recording = { stop: () => Promise<{ dataUrl: string; seconds: number } | null>; cancel: () => void };

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 });
  const chunks: Blob[] = []; const t0 = Date.now(); let cancelled = false;
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () => new Promise((resolve) => {
      rec.onstop = async () => {
        release();
        if (cancelled || !chunks.length) return resolve(null);
        resolve({ dataUrl: await blobToDataUrl(new Blob(chunks, { type: rec.mimeType || "audio/webm" })), seconds: Math.max(1, Math.round((Date.now() - t0) / 1000)) });
      };
      if (rec.state !== "inactive") rec.stop(); else resolve(null);
    }),
    cancel: () => { cancelled = true; if (rec.state !== "inactive") rec.stop(); release(); },
  };
}

export function extOf(dataUrl: string) {
  const m = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? "";
  return m.includes("jpeg") ? "jpg" : m.includes("mp4") ? "m4a" : m.includes("webm") ? "webm" : m.includes("ogg") ? "ogg" : "bin";
}

// Signed links last one hour; kept in memory so scrolling does not ask again.
const cache = new Map<string, { url: string; at: number }>();
export async function mediaUrl(path: string): Promise<string | null> {
  if (path.startsWith("data:")) return path;
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < 50 * 60 * 1000) return hit.url;
  const { data } = await supabase.storage.from("chat-media").createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, at: Date.now() });
  return data.signedUrl;
}
