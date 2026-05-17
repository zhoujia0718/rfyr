import { redirect } from "next/navigation"
import { createClient } from "@supabase/supabase-js"
import { createHmac } from "crypto"
import { cookies } from "next/headers"

const HMAC_SECRET = process.env.HMAC_SECRET ?? ""
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)

function verifyAdminCookie(cookieValue: string): string | null {
  if (!HMAC_SECRET) return null
  try {
    const decoded = Buffer.from(cookieValue, "base64").toString("utf-8")
    const decodedParts = decoded.split("_")
    if (decodedParts.length === 4 && decodedParts[0].length === 16) {
      const [salt, userId, expiresAtStr, signature] = decodedParts
      const expiresAt = parseInt(expiresAtStr, 10)
      if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) return null
      const msgBuf = Buffer.from(`${salt}_${userId}_${expiresAtStr}`, "utf-8")
      const expectedSig = createHmac("sha256", Buffer.from(HMAC_SECRET, "utf-8"))
        .update(msgBuf).digest("hex")
      if (signature !== expectedSig) return null
      return userId
    }
  } catch {}
  return null
}

export default async function AdminTestPage() {
  const cookieStore = await cookies()
  const adminSessionLocal = cookieStore.get("admin-session-local")

  const debug = {
    cookieExists: !!adminSessionLocal,
    cookieValue: adminSessionLocal?.value?.substring(0, 20) + "...",
    hmacSecret: !!HMAC_SECRET,
    adminEmails: ADMIN_EMAILS,
  }

  const userId = adminSessionLocal?.value ? verifyAdminCookie(adminSessionLocal.value) : null
  debug.userIdFromCookie = userId

  if (!userId) {
    return (
      <div>
        <h1>NO USER ID</h1>
        <pre>{JSON.stringify(debug, null, 2)}</pre>
      </div>
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data: user, error } = await supabase
    .from("users").select("id, email").eq("id", userId).maybeSingle() as any

  debug.user = user
  debug.userError = error?.message

  const isAdminByEmail = ADMIN_EMAILS.length > 0 && ADMIN_EMAILS.includes((user?.email ?? "").toLowerCase())
  debug.isAdminByEmail = isAdminByEmail

  const shouldAllow = ADMIN_EMAILS.length > 0 && isAdminByEmail
  debug.shouldAllow = shouldAllow

  if (!shouldAllow) {
    redirect("/admin/login")
  }

  return (
    <div>
      <h1>ACCESS GRANTED</h1>
      <pre>{JSON.stringify(debug, null, 2)}</pre>
    </div>
  )
}
