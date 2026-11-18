"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function JoinForm({ token }: { token: string }) {
  const [pin, setPin] = useState(""); const [pin2, setPin2] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  async function go() {
    setErr("");
    if (!/^\d{6}$/.test(pin)) return setErr("Le code doit avoir 6 chiffres.");
    if (pin !== pin2) return setErr("Les deux codes ne sont pas identiques.");
    const weak = /^(\d)\1{5}$/.test(pin) || "0123456789012".includes(pin) || "9876543210987".includes(pin) || ["123123", "112233", "121212", "000111", "654321"].includes(pin);
    if (weak) return setErr("Ce code est trop facile à deviner. Choisissez-en un autre.");
    setBusy(true);
    const email = `${crypto.randomUUID()}@members.business-os.test`;
    const { data, error } = await supabase.auth.signUp({ email, password: pin });
    if (error || !data.session) { setBusy(false); return setErr(error?.message || "Connexion impossible."); }
    const { error: e2 } = await supabase.rpc("claim_invite", { p_token: token });
    if (e2) { setBusy(false); return setErr("Invitation invalide ou déjà utilisée."); }
    window.location.href = "/";
  }
  return (
    <div className="shell"><div className="top">Business OS</div>
      <div className="body">
        <div className="card">
          <h3>Bienvenue</h3>
          <p className="muted">Choisissez un code à 6 chiffres. Il restera sur ce téléphone.</p>
          <p><input inputMode="numeric" type="password" maxLength={6} placeholder="Code" value={pin} onChange={(e) => setPin(e.target.value)} /></p>
          <p><input inputMode="numeric" type="password" maxLength={6} placeholder="Répétez le code" value={pin2} onChange={(e) => setPin2(e.target.value)} /></p>
          {err && <p style={{ color: "var(--error)" }}>{err}</p>}
          <button className="primary big" disabled={busy} onClick={go}>Entrer</button>
        </div>
      </div>
    </div>
  );
}
