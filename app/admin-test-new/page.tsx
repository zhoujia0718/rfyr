import { redirect } from "next/navigation"
import { createClient } from "@supabase/supabase-js"
import { createHmac } from "crypto"
import { cookies } from "next/headers"

const HMAC_SECRET = process.env.HMAC_SECRET ?? ""
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)

function verifyCookie(v: string): string | null {
  if (!HMAC_SECRET) return null
  try {
    const d = Buffer.from(v, "base64").toString("utf-8")
    const p = d.split("_")
    if (p.length === 4 && p[0].length === 16) {
      const [salt, uid, exp, sig] = p
      if (Date.now() / 1000 > parseInt(exp)) return null
      const msg = Buffer.from(salt + "_" + uid + "_" + exp, "utf-8")
      const expected = createHmac("sha256", Buffer.from(HMAC_SECRET, "utf-8")).update(msg).digest("hex")
      if (sig !== expected) return null
      return uid
    }
  } catch {}
  return null
}

export default async function AdminTestPage() {
  const cs = await cookies()
  const sess = cs.get("admin-session-local")
  const userId = sess?.value ? verifyCookie(sess.value) : null

  const debug: Record<string, unknown> = {
    cookieExists: !!sess,
    hmacSecretExists: !!HMAC_SECRET,
    adminEmails: ADMIN_EMAILS,
  }

  if (!userId) {
    return <pre>{JSON.stringify({ ...debug, stage: "no-userId" }, null, 2)}</pre>
  }

  debug.userId = userId

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data: user, error } = await supabase
    .from("users").select("id, email").eq("id", userId).maybeSingle()

  debug.dbUser = user
  debug.dbError = error?.message

  if (error || !user) {
    return <pre>{JSON.stringify({ ...debug, stage: "db-error" }, null, 2)}</pre>
  }

  const isAdminByEmail = ADMIN_EMAILS.length > 0 && ADMIN_EMAILS.includes((user.email ?? "").toLowerCase())
  debug.isAdminByEmail = isAdminByEmail

  if (ADMIN_EMAILS.length > 0 && !isAdminByEmail) {
    return <pre>{JSON.stringify({ ...debug, stage: "not-admin" }, null, 2)}</pre>
  }

  // SUCCESS - should show the dashboard
  return <pre>{JSON.stringify({ ...debug, stage: "SUCCESS - should render dashboard", user }, null, 2)}</pre>
}
