"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Ctx } from "./Chats";

// True when this person holds an approve or appoint right in the business (the same rule the database applies).
export function useCanMaintain(ctx: Ctx) {
  const [can, setCan] = useState(false);
  useEffect(() => {
    (async () => {
      const { data: me } = await supabase.from("member").select("id").eq("business_id", ctx.business_id).eq("person_id", ctx.person_id).limit(1);
      if (!me?.[0]) return;
      const { data: g } = await supabase.from("role_grant").select("id").eq("member_id", me[0].id).in("permission", ["approve", "appoint"]).is("revoked_at", null).limit(1);
      setCan(!!g?.length);
    })();
  }, [ctx.business_id, ctx.person_id]);
  return can;
}
