import { NextRequest, NextResponse } from "next/server"

const MAX_BYTES = 20 * 1024 * 1024 // 20MB

function getAllowedSupabaseHostnames(): Set<string> {
  const set = new Set<string>()
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (raw) {
    try {
      set.add(new URL(raw).hostname.toLowerCase())
    } catch {
      /* ignore */
    }
  }
  // 与 lib/supabase.ts 默认一致，避免未配 env 时代理失效
  set.add("ogctmgdomkktuynsiwmf.supabase.co")
  return set
}

function isAllowedStoragePublicHtmlUrl(u: URL): boolean {
  if (u.protocol !== "https:") return false
  const hosts = getAllowedSupabaseHostnames()
  if (!hosts.has(u.hostname.toLowerCase())) return false
  const p = u.pathname.toLowerCase()
  return (
    p.includes("/storage/v1/object/public/") &&
    (p.endsWith(".html") || p.endsWith(".htm"))
  )
}

/**
 * 将 Supabase Storage 上的 HTML 经本站转发，并强制 Content-Type: text/html。
 * 解决历史上传未带 contentType 时浏览器把整页当纯文本、iframe 只显示源码的问题。
 */
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

  if (!isAllowedStoragePublicHtmlUrl(target)) {
    return NextResponse.json({ error: "仅允许本站 Supabase 公开存储中的 .html 链接" }, { status: 403 })
  }

  let upstream: Response
  try {
    upstream = await fetch(target.toString(), {
      redirect: "follow",
      headers: { Accept: "text/html,*/*;q=0.8" },
      signal: AbortSignal.timeout(45_000),
      next: { revalidate: 0 },
    })
  } catch {
    return NextResponse.json({ error: "拉取资源失败" }, { status: 502 })
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `上游 ${upstream.status}` },
      { status: upstream.status === 404 ? 404 : 502 }
    )
  }

  const buf = await upstream.arrayBuffer()
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "文件过大" }, { status: 413 })
  }

  // 注入 <base href>，使文档内相对路径仍指向 Storage 目录（经代理打开时基准 URL 否则是本站的 /api/...）
  const baseForRelative = new URL(target)
  baseForRelative.pathname = baseForRelative.pathname.replace(/\/[^/]+$/, "/")
  const baseHref = baseForRelative.toString()
  const baseTag = `<base href="${baseHref}">`

  let html = new TextDecoder("utf-8", { fatal: false }).decode(buf)
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => `${m}${baseTag}`)
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html[^>]*>/i, (m) => `${m}<head>${baseTag}</head>`)
  } else {
    html = baseTag + html
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
