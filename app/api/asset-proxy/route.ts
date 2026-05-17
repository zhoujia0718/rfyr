/**
 * GET /api/asset-proxy?url=<encoded>
 *
 * Proxies static assets (images, CSS, fonts) from Supabase public storage
 * through our server so the browser never directly connects to Supabase.
 * This solves "connection refused" errors for users on networks that block Supabase.
 */
import { NextRequest, NextResponse } from "next/server"

const MAX_BYTES = 50 * 1024 * 1024 // 50MB

function getAllowedSupabaseHostnames(): Set<string> {
  const set = new Set<string>()
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (raw) {
    try { set.add(new URL(raw).hostname.toLowerCase()) } catch { /* ignore */ }
  }
  set.add("ogctmgdomkktuynsiwmf.supabase.co")
  return set
}

function isAllowedStoragePublicUrl(u: URL): boolean {
  if (u.protocol !== "https:") return false
  const hosts = getAllowedSupabaseHostnames()
  if (!hosts.has(u.hostname.toLowerCase())) return false
  return u.pathname.toLowerCase().includes("/storage/v1/object/public/")
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url")
  if (!rawUrl?.trim()) {
    return NextResponse.json({ error: "缺少 url" }, { status: 400 })
  }

  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return NextResponse.json({ error: "非法 url" }, { status: 400 })
  }

  if (!isAllowedStoragePublicUrl(target)) {
    return NextResponse.json({ error: "仅允许本站 Supabase 公开存储中的资源" }, { status: 403 })
  }

  let upstream: Response
  try {
    upstream = await fetch(target.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
      next: { revalidate: 3600 },
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }

  if (!upstream.ok) {
    return new NextResponse(null, { status: upstream.status })
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream"

  // Block HTML and JS — those should go through html-proxy
  if (contentType.includes("text/html") || contentType.includes("javascript")) {
    return NextResponse.json({ error: "不允许代理此内容类型" }, { status: 403 })
  }

  const buf = await upstream.arrayBuffer()
  if (buf.byteLength > MAX_BYTES) {
    return new NextResponse(null, { status: 413 })
  }

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
