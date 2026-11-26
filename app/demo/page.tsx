"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Demo entry (P-013): no invite and no code. Signs the visitor in quietly and puts them in the demo business.
export default function Demo() {
  const [err, setErr] = useState("");
  useEffect(() => {
    (async () => {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const email = `${crypto.randomUUID()}@members.business-os.test`;
        const password = crypto.randomUUID();
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error || !data.session) return setErr(error?.message || "Connexion impossible.");
        session = data.session;
      }
      const kind = new URLSearchParams(window.location.search).get("d") === "tv" ? "tv" : "farm";
      const { error } = await supabase.rpc("enter_demo", { p_demo: kind });
      if (error) return setErr("La démo n'est pas disponible pour le moment.");
      const vue = new URLSearchParams(window.location.search).get("vue");
      window.location.href = vue === "employe" ? "/?vue=employe" : "/";
    })();
  }, []);
  return (
    <div className="shell"><div className="top">Business OS</div>
      <div className="body"><div className="card">
        <h3>Bienvenue</h3>
        <p className="muted">{err || "Ouverture de la démo…"}</p>
      </div></div>
    </div>
  );
}
