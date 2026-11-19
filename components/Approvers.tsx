"use client";
// Settings for the owner: who can approve each type of report. A person with "approve everything" is locked on.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type RT = { id: string; label: string };
type Mem = { id: string; name: string };
type Grant = { member_id: string; scope_record_type_id: string | null; scope_unit_id: string | null };

export default function Approvers({ businessId }: { businessId: string }) {
  const [types, setTypes] = useState<RT[]>([]); const [team, setTeam] = useState<Mem[]>([]); const [grants, setGrants] = useState<Grant[]>([]);
  const [msg, setMsg] = useState(""); const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [{ data: rt }, { data: ms }, { data: ps }, { data: gs }] = await Promise.all([
      supabase.from("record_type").select("id,label").eq("business_id", businessId).eq("active", true).order("label"),
      supabase.from("member").select("id,person_id,active").eq("business_id", businessId),
      supabase.from("person").select("id,display_name"),
      supabase.from("role_grant").select("member_id,scope_record_type_id,scope_unit_id").eq("business_id", businessId).eq("permission", "approve").is("revoked_at", null),
    ]);
    const pn = new Map((ps ?? []).map((p) => [p.id, p.display_name]));
    setTypes(rt ?? []); setTeam((ms ?? []).filter((m) => m.active).map((m) => ({ id: m.id, name: pn.get(m.person_id) ?? "?" }))); setGrants(gs ?? []);
  }, [businessId]);
  useEffect(() => { load(); }, [load]);
  const everything = (m: string) => grants.some((g) => g.member_id === m && !g.scope_record_type_id && !g.scope_unit_id);
  const scoped = (m: string, t: string) => grants.some((g) => g.member_id === m && g.scope_record_type_id === t);
  async function toggle(t: string, m: string, on: boolean) {
    const next = team.filter((x) => (x.id === m ? on : scoped(x.id, t))).map((x) => x.id);
    setMsg("");
    const { error } = await supabase.rpc("set_type_approvers", { p_record_type: t, p_members: next });
    setMsg(error ? "Échec de l'enregistrement" : "Enregistré"); load();
  }
  return (
    <div className="card"><h3>Qui peut approuver quoi</h3>
      <p className="muted">Vous décidez, type de rapport par type de rapport. Les personnes marquées « tout » approuvent tous les types. {msg && <b>{msg}</b>}</p>
      {types.map((t) => {
        const names = team.filter((m) => everything(m.id) || scoped(m.id, t.id)).map((m) => m.name);
        return (
          <div key={t.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
            <div onClick={() => setOpen(open === t.id ? null : t.id)} style={{ display: "flex", justifyContent: "space-between", gap: 8, cursor: "pointer", minHeight: 40, alignItems: "center" }}>
              <b>{t.label}</b><span className="muted" style={{ fontSize: 13, textAlign: "right" }}>{names.length ? names.join(", ") : "personne"}</span>
            </div>
            {open === t.id && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {team.map((m) => (
                <label key={m.id} className="chips" style={{ display: "inline-flex", gap: 6, alignItems: "center", minHeight: 40, opacity: everything(m.id) ? 0.6 : 1 }}>
                  <input type="checkbox" style={{ width: 22, minHeight: 22 }} disabled={everything(m.id)} checked={everything(m.id) || scoped(m.id, t.id)} onChange={(e) => toggle(t.id, m.id, e.target.checked)} />
                  {m.name}{everything(m.id) ? " (tout)" : ""}
                </label>))}
            </div>}
          </div>);
      })}
    </div>);
}
