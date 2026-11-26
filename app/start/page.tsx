"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

// Start an empty business (P-021): shared code, business name, your name, farm or TV channel. No data, you become the owner.
export default function Start() {
  const [code, setCode] = useState(""); const [name, setName] = useState(""); const [owner, setOwner] = useState(""); const [kind, setKind] = useState<"farm" | "tv">("farm");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr("");
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { data, error } = await supabase.auth.signUp({ email: `${crypto.randomUUID()}@members.business-os.test`, password: crypto.randomUUID() });
      if (error || !data.session) { setBusy(false); return setErr(error?.message || "Connexion impossible."); }
      session = data.session;
    }
    const { data: id, error } = await supabase.rpc("create_business", { p_name: name, p_owner: owner, p_kind: kind, p_code: code });
    if (!error && !id) { setBusy(false); return setErr("Code incorrect."); }
    if (error) { setBusy(false); return setErr(/too many attempts/.test(error.message) ? "Trop d'essais. Réessayez dans une heure." : /wrong code/.test(error.message) ? "Code incorrect." : /too many/.test(error.message) ? "Trois entreprises au maximum par compte." : "Création impossible pour le moment."); }
    try { localStorage.setItem("bos.business", id as string); } catch {}
    window.location.href = "/";
  }
  return (
    <div className="shell"><div className="main"><div className="top">Business OS</div>
      <div className="body"><div className="card">
        <h3>Créer mon entreprise</h3>
        <p className="muted">Une entreprise vide, sans aucune donnée. Vous en êtes le propriétaire.</p>
        <p><input placeholder="Code d'accès" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="none" /></p>
        <p><input placeholder="Nom de l'entreprise" value={name} onChange={(e) => setName(e.target.value)} /></p>
        <p><input placeholder="Votre prénom" value={owner} onChange={(e) => setOwner(e.target.value)} /></p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button className={kind === "farm" ? "primary" : ""} style={{ flex: 1 }} onClick={() => setKind("farm")}>Ferme</button>
          <button className={kind === "tv" ? "primary" : ""} style={{ flex: 1 }} onClick={() => setKind("tv")}>Chaîne TV</button>
        </div>
        <button className="primary big" disabled={busy || !code.trim() || name.trim().length < 2 || !owner.trim()} onClick={go}>{busy ? "Création…" : "Créer"}</button>
        {err && <p style={{ color: "var(--error)" }}>{err}</p>}
      </div></div></div></div>
  );
}
