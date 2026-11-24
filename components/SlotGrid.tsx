"use client";
// Planning publicitaire (P-019): weekly grid of ad slots, free places per slot, booking by people who can approve.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Ctx } from "./Chats";

type Slot = { id: string; name: string; weekday: number; start_time: string; price_fcfa: number; capacity: number };
type Booking = { id: string; slot_id: string; on_date: string; advertiser: string };
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const n0 = (v: number) => Math.round(v).toLocaleString("fr-FR");
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function monday(off: number) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7); return d; }

export default function SlotGrid({ ctx }: { ctx: Ctx }) {
  const [slots, setSlots] = useState<Slot[]>([]); const [bks, setBks] = useState<Booking[]>([]); const [week, setWeek] = useState(0);
  const [sel, setSel] = useState<{ slot: Slot; date: string } | null>(null); const [can, setCan] = useState(false);
  const [names, setNames] = useState<string[]>([]); const [who, setWho] = useState(""); const [err, setErr] = useState("");
  const start = monday(week); const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });

  const load = useCallback(async () => {
    const [{ data: s }, { data: b }, { data: me }, { data: ps }] = await Promise.all([
      supabase.from("ad_slot").select("id,name,weekday,start_time,price_fcfa,capacity").eq("business_id", ctx.business_id).eq("active", true).order("start_time"),
      supabase.from("slot_booking").select("id,slot_id,on_date,advertiser").eq("business_id", ctx.business_id).eq("status", "booked").gte("on_date", iso(days[0])).lte("on_date", iso(days[6])),
      supabase.from("member").select("id").eq("business_id", ctx.business_id).eq("person_id", ctx.person_id).limit(1),
      supabase.from("party").select("name").eq("business_id", ctx.business_id).eq("kind", "customer").eq("active", true).order("name"),
    ]);
    setSlots((s as Slot[]) ?? []); setBks((b as Booking[]) ?? []); setNames((ps ?? []).map((p) => p.name));
    if (me?.[0]) { const { data: g } = await supabase.from("role_grant").select("id").eq("member_id", me[0].id).in("permission", ["approve", "appoint"]).is("revoked_at", null).limit(1); setCan(!!g?.length); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.business_id, ctx.person_id, week]);
  useEffect(() => { load(); }, [load]);

  const times = [...new Map(slots.map((s) => [s.start_time, s.name])).entries()];
  const slotAt = (tm: string, wd: number) => slots.find((s) => s.start_time === tm && s.weekday === wd);
  const taken = (s: Slot, date: string) => bks.filter((b) => b.slot_id === s.id && b.on_date === date);
  const total = slots.reduce((a, s) => a + s.capacity, 0), used = bks.length;

  async function book() {
    if (!sel || !who.trim()) return; setErr("");
    const { error } = await supabase.rpc("book_slot", { p_slot: sel.slot.id, p_date: sel.date, p_advertiser: who });
    if (error) return setErr(error.message.includes("complet") ? "Ce créneau est complet." : error.message.includes("passée") ? "Cette date est passée." : "Réservation impossible.");
    setWho(""); await load();
  }
  async function cancel(id: string) { if (!window.confirm("Annuler cette réservation ?")) return; await supabase.rpc("cancel_booking", { p_id: id }); load(); }

  if (!slots.length) return null;
  const cur = sel ? taken(sel.slot, sel.date) : [];
  return (
    <div className="card">
      <h3 style={{ marginBottom: 2 }}>Planning publicitaire</h3>
      <div className="muted" style={{ marginBottom: 8 }}>{used} réservations sur {total} places cette semaine · touchez une case</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
        <button style={{ minHeight: 36 }} onClick={() => { setWeek(week - 1); setSel(null); }} aria-label="Semaine précédente">←</button>
        <b style={{ flex: 1, textAlign: "center", fontSize: 14 }}>{days[0].toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} – {days[6].toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</b>
        <button style={{ minHeight: 36 }} onClick={() => { setWeek(week + 1); setSel(null); }} aria-label="Semaine suivante">→</button>
      </div>
      <div style={{ overflowX: "auto", margin: "0 -6px" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 3, width: "100%", fontSize: 12 }}>
          <thead><tr><th /> {days.map((d, i) => <th key={i} style={{ fontWeight: 600, color: "var(--muted)" }}>{DAYS[i]}<div style={{ fontWeight: 400 }}>{d.getDate()}</div></th>)}</tr></thead>
          <tbody>{times.map(([tm, name]) => <tr key={tm}>
            <td style={{ whiteSpace: "nowrap", color: "var(--muted)", paddingRight: 4 }}>{tm}<div style={{ fontSize: 10, maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div></td>
            {days.map((d, i) => {
              const s = slotAt(tm, i + 1); if (!s) return <td key={i} />;
              const date = iso(d), n = taken(s, date).length, free = s.capacity - n, past = date < iso(new Date());
              const full = free <= 0, on = sel?.slot.id === s.id && sel.date === date;
              return <td key={i} onClick={() => setSel({ slot: s, date })} style={{ textAlign: "center", borderRadius: 8, minWidth: 38, height: 40, cursor: "pointer", opacity: past ? 0.5 : 1,
                background: full ? "var(--surface2)" : free === 1 ? "var(--warn-bg)" : "var(--soft)", color: full ? "var(--muted)" : free === 1 ? "var(--warn-text)" : "var(--primary)", fontWeight: 600, outline: on ? "2px solid var(--primary)" : undefined }}>
                {full ? "Complet" : `${free} libre${free > 1 ? "s" : ""}`}</td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Vert : places libres · Orange : dernière place · Gris : complet (le texte le dit aussi)</div>
      {sel && <div className="quote" style={{ borderLeftColor: "var(--primary)" }}>
        <b>{sel.slot.name}</b> · {new Date(sel.date + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} à {sel.slot.start_time}
        <div className="muted">{n0(sel.slot.price_fcfa)} FCFA par passage · {sel.slot.capacity - cur.length} place(s) libre(s) sur {sel.slot.capacity}</div>
        {cur.map((b) => <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}><span>{b.advertiser}</span>{can && <button style={{ minHeight: 32, fontSize: 12 }} onClick={() => cancel(b.id)}>Annuler</button>}</div>)}
        {can && cur.length < sel.slot.capacity && sel.date >= iso(new Date()) && <div style={{ marginTop: 6 }}>
          <input list="adv-names" placeholder="Annonceur" value={who} onChange={(e) => setWho(e.target.value)} />
          <datalist id="adv-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
          {err && <p style={{ color: "var(--error)" }}>{err}</p>}
          <button className="primary big" style={{ marginTop: 8 }} disabled={!who.trim()} onClick={book}>Réserver ce créneau</button></div>}
      </div>}
    </div>
  );
}
