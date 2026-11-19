"use client";
// Turn on push notifications on this phone: you are told when someone @mentions you, even with the app closed.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const PUBLIC_KEY = "BFsFDbaKKxFLgkB5wkZ42u4h4LijYKr_06yWdInR90EeyLqLj9Z2GWqhX715uhPRdBW3v_2Qbq9RrVq8jOmuzFs";
const key = () => { const p = "=".repeat((4 - (PUBLIC_KEY.length % 4)) % 4); const b = atob((PUBLIC_KEY + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };

export default function Notifications({ businessId }: { businessId: string }) {
  const [state, setState] = useState<"checking" | "unsupported" | "install" | "denied" | "off" | "on">("checking");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (ios && !standalone) return setState("install");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub && Notification.permission === "granted" ? "on" : "off");
    })();
  }, []);
  async function enable() {
    setBusy(true); setErr("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key() }));
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const { error } = await supabase.rpc("save_push_subscription", { p_business: businessId, p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
      if (error) throw error;
      setState("on");
    } catch { setErr("Impossible d'activer les notifications sur ce téléphone."); }
    finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true);
    const reg = await navigator.serviceWorker.getRegistration("/sw.js"); const sub = await reg?.pushManager.getSubscription();
    if (sub) { await supabase.rpc("remove_push_subscription", { p_endpoint: sub.endpoint }); await sub.unsubscribe(); }
    setBusy(false); setState("off");
  }
  if (state === "checking") return null;
  return (
    <div className="card"><h3>Notifications</h3>
      {state === "install" && <p className="muted">Sur iPhone, ajoutez d'abord l'application à l'écran d'accueil : bouton Partager, puis « Sur l'écran d'accueil ». Ouvrez-la depuis l'icône, puis revenez ici pour activer les notifications.</p>}
      {state === "unsupported" && <p className="muted">Ce navigateur ne gère pas les notifications.</p>}
      {state === "denied" && <p className="muted">Les notifications sont bloquées. Autorisez-les dans les réglages du téléphone pour cette application.</p>}
      {state === "off" && <><p className="muted">Recevez une notification quand quelqu'un vous mentionne avec @.</p><button className="primary big" disabled={busy} onClick={enable}>Activer les notifications</button></>}
      {state === "on" && <><p className="muted">Les notifications sont actives sur ce téléphone.</p><button disabled={busy} onClick={disable}>Désactiver</button></>}
      {err && <p style={{ color: "var(--error)" }}>{err}</p>}
    </div>);
}
