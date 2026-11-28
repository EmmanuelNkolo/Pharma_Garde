// ============================================================================
// Pharma-Garde v16.0 — Edge Function : Authentification Super-Admin Serveur
// ────────────────────────────────────────────────────────────────────────────
// Déplace 100 % de la vérification Super-Admin, de la gestion `platform_admins`
// et du journal `admin_audit_logs` côté serveur (zéro hash/mot de passe dans le JS client).
//
// Variables secrètes recommandées (Supabase Secrets) :
//   ADMIN_MASTER_CODE_HASH (optionnel : SHA-256 salé avec PG_CM_SUPERADMIN_V10::)
//   ADMIN_TOKEN_SECRET     (optionnel : secret HMAC, repli sur SUPABASE_SERVICE_ROLE_KEY)
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SALT = "PG_CM_SUPERADMIN_V10::";
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 heures
// Hash serveur de bootstrap (jamais exposé dans le bundle frontend) ; surchargeable via Secret ADMIN_MASTER_CODE_HASH
const BOOTSTRAP_SERVER_HASH = "7ffec7cb477954650c215b3ef13ae2d04b15e7d70d25003096fe290a628f0c22";

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(SALT + String(text || "").trim());
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signToken(payloadObj: Record<string, unknown>, secret: string): Promise<string> {
  const payloadB64 = btoa(JSON.stringify(payloadObj));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  const sigHex = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `PGADM.${payloadB64}.${sigHex}`;
}

async function verifyToken(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3 || parts[0] !== "PGADM") return null;
    const [, payloadB64, sigHex] = parts;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const expectedBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
    const expectedHex = Array.from(new Uint8Array(expectedBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (expectedHex !== sigHex) return null;
    const payload = JSON.parse(atob(payloadB64));
    if (!payload || Number(payload.expiresAt || 0) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = String(body?.action || "login");

    const sbUrl = Deno.env.get("SUPABASE_URL") || "";
    const sbServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const tokenSecret = (Deno.env.get("ADMIN_TOKEN_SECRET") || sbServiceKey || "pg_admin_fallback").trim();
    const envHash = (Deno.env.get("ADMIN_MASTER_CODE_HASH") || "").replace(/^["']|["']$/g, "").trim();
    const envPlain = (Deno.env.get("ADMIN_MASTER_CODE") || "").replace(/^["']|["']$/g, "").trim();
    const masterHash = envHash || (envPlain ? await sha256Hex(envPlain) : BOOTSTRAP_SERVER_HASH);

    const sb = (sbUrl && sbServiceKey) ? createClient(sbUrl, sbServiceKey) : null;

    if (action === "login") {
      const code = String(body?.code || "").trim();
      const email = String(body?.email || "").trim().toLowerCase();
      const space = String(body?.space || "client");
      if (!code) {
        return new Response(JSON.stringify({ success: false, error: "Code d'accès administrateur requis." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const computedHash = await sha256Hex(code);
      let matched: Record<string, unknown> | null = null;

      // 1. Vérifier dans la table PostgreSQL `platform_admins`
      if (sb) {
        const { data: rows } = await sb
          .from("platform_admins")
          .select("id, user_id, email, full_name, role, is_active, access_code_hash")
          .eq("is_active", true);

        if (rows && rows.length > 0) {
          const byHash = rows.find((r: any) =>
            r.access_code_hash &&
            r.access_code_hash === computedHash &&
            (!email || String(r.email || "").toLowerCase() === email)
          );
          if (byHash) matched = byHash;
        }
      }

      // 2. Vérifier contre le hash maître serveur (secret ADMIN_MASTER_CODE_HASH / ADMIN_MASTER_CODE / bootstrap)
      if (!matched && computedHash === masterHash) {
        matched = {
          id: "adm_founder",
          full_name: "Administrateur Principal (Fondateur)",
          email: email || "admin@pharmagarde.cm",
          role: "super_admin",
        };
      }

      if (!matched) {
        return new Response(JSON.stringify({ success: false, error: "Code ou identifiant Administrateur invalide." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const now = Date.now();
      const sessionPayload = {
        id: String(matched.id || "adm_session"),
        full_name: String(matched.full_name || "Super Administrateur"),
        email: String(email || matched.email || "admin@pharmagarde.cm"),
        role: String(matched.role || "super_admin"),
        startedAt: now,
        expiresAt: now + SESSION_TTL_MS,
      };
      const token = await signToken(sessionPayload, tokenSecret);

      if (sb) {
        await sb.from("admin_audit_logs").insert([{
          admin_email: sessionPayload.email,
          space,
          action: "ADMIN_LOGIN_SERVER",
          details: `Authentification serveur vérifiée (${sessionPayload.role})`,
        }]).catch(() => {});
      }

      return new Response(JSON.stringify({
        success: true,
        token,
        admin: sessionPayload,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "verify_token") {
      const payload = await verifyToken(String(body?.token || ""), tokenSecret);
      return new Response(JSON.stringify({
        success: Boolean(payload),
        valid: Boolean(payload),
        admin: payload,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Actions protégées par token signé Super-Admin
    const caller = await verifyToken(String(body?.token || ""), tokenSecret);
    if (!caller || caller.role !== "super_admin") {
      return new Response(JSON.stringify({ success: false, error: "Session Super-Administrateur requise." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (action === "list_admins" && sb) {
      const { data } = await sb
        .from("platform_admins")
        .select("id, full_name, email, role, is_active, created_at, added_by")
        .order("created_at", { ascending: true });
      return new Response(JSON.stringify({ success: true, admins: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (action === "add_admin" && sb) {
      const fullName = String(body?.full_name || "").trim();
      const email = String(body?.email || "").trim().toLowerCase();
      const role = body?.role === "moderator" ? "moderator" : "super_admin";
      const accessCode = String(body?.access_code || "").trim();
      if (!fullName || !email.includes("@") || accessCode.length < 8) {
        return new Response(JSON.stringify({ success: false, error: "Nom, email valide et code d'accès (8+ car.) requis." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const hash = await sha256Hex(accessCode);
      const { data, error } = await sb.from("platform_admins").upsert([{
        full_name: fullName,
        email,
        role,
        is_active: true,
        access_code_hash: hash,
        added_by: String(caller.email || "super_admin"),
      }], { onConflict: "email" }).select("id, full_name, email, role, is_active, created_at").single();
      if (error) throw error;

      await sb.from("admin_audit_logs").insert([{
        admin_email: String(caller.email),
        space: String(body?.space || "admin"),
        action: "ADMIN_ADDED_SERVER",
        details: `${fullName} <${email}> (${role})`,
      }]).catch(() => {});

      return new Response(JSON.stringify({ success: true, admin: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (action === "remove_admin" && sb) {
      const targetEmail = String(body?.email || "").trim().toLowerCase();
      if (!targetEmail) {
        return new Response(JSON.stringify({ success: false, error: "Email cible requis." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      await sb.from("platform_admins").delete().eq("email", targetEmail);
      await sb.from("admin_audit_logs").insert([{
        admin_email: String(caller.email),
        space: String(body?.space || "admin"),
        action: "ADMIN_REMOVED_SERVER",
        details: `Révocation de ${targetEmail}`,
      }]).catch(() => {});

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (action === "change_master_code" && sb) {
      const newCode = String(body?.new_code || "").trim();
      if (newCode.length < 8) {
        return new Response(JSON.stringify({ success: false, error: "Minimum 8 caractères requis." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const newHash = await sha256Hex(newCode);
      await sb.from("platform_admins").upsert([{
        email: String(caller.email || "admin@pharmagarde.cm"),
        full_name: String(caller.full_name || "Administrateur Principal"),
        role: "super_admin",
        is_active: true,
        access_code_hash: newHash,
        added_by: String(caller.email || "super_admin"),
      }], { onConflict: "email" });

      await sb.from("admin_audit_logs").insert([{
        admin_email: String(caller.email),
        space: String(body?.space || "admin"),
        action: "ADMIN_CODE_ROTATED_SERVER",
        details: "Empreinte SHA-256 mise à jour en base sécurisée",
      }]).catch(() => {});

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Action non reconnue." }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || String(err) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
