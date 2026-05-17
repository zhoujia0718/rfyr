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
 * Rewrite resource URLs in the HTML so the browser fetches all Supabase assets
 * through our own proxy endpoints instead of connecting directly to Supabase.
 * This prevents "connection refused" errors on networks that block Supabase.
 */
function rewriteResourceUrls(html: string, base: URL, origin: string): string {
  const supabaseHosts = getAllowedSupabaseHostnames()

  function isSupabasePublicStorage(u: URL): boolean {
    return (
      supabaseHosts.has(u.hostname.toLowerCase()) &&
      u.pathname.toLowerCase().includes("/storage/v1/object/public/")
    )
  }

  function resolveUrl(val: string): URL | null {
    if (!val) return null
    const v = val.trim()
    if (v.startsWith("data:") || v.startsWith("blob:") || v.startsWith("javascript:") || v.startsWith("#")) return null
    try { return new URL(v, base) } catch { return null }
  }

  // Rewrite src="..." on resource-loading tags (img, script, source, audio, video, track)
  html = html.replace(
    /(<(?:img|script|source|audio|video|track)\b[^>]*?\s)src=(["'])([^"']*)\2/gi,
    (match, prefix, q, val) => {
      const u = resolveUrl(val)
      if (!u || !isSupabasePublicStorage(u)) return match
      return `${prefix}src=${q}${origin}/api/asset-proxy?url=${encodeURIComponent(u.toString())}${q}`
    }
  )

  // Rewrite link[href] for CSS/font files from Supabase
  html = html.replace(
    /(<link\b[^>]*?\s)href=(["'])([^"']*)\2/gi,
    (match, prefix, q, val) => {
      const u = resolveUrl(val)
      if (!u || !isSupabasePublicStorage(u)) return match
      return `${prefix}href=${q}${origin}/api/asset-proxy?url=${encodeURIComponent(u.toString())}${q}`
    }
  )

  // Rewrite a[href] for Supabase Storage links (HTML → html-proxy, others → asset-proxy)
  html = html.replace(
    /(<a\b[^>]*?\s)href=(["'])([^"']*)\2/gi,
    (match, prefix, q, val) => {
      if (!val || val.trim().startsWith("#")) return match
      const u = resolveUrl(val)
      if (!u || !isSupabasePublicStorage(u)) return match
      const p = u.pathname.toLowerCase()
      const isHtmlFile = p.endsWith(".html") || p.endsWith(".htm")
      const proxyPath = isHtmlFile ? "/api/html-proxy" : "/api/asset-proxy"
      return `${prefix}href=${q}${origin}${proxyPath}?url=${encodeURIComponent(u.toString())}${q}`
    }
  )

  return html
}

/**
 * 将 Supabase Storage 上的 HTML 经本站转发，并强制 Content-Type: text/html。
 * 解决历史上传未带 contentType 时浏览器把整页当纯文本、iframe 只显示源码的问题。
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin  // e.g. "https://rfyr.com"
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
    const status = upstream.status
    const errHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>加载失败</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f9fa;}
.box{text-align:center;padding:2rem;}.icon{font-size:3rem;}.msg{color:#666;margin-top:.5rem;font-size:.9rem;}</style></head>
<body><div class="box"><div class="icon">📄</div><h2 style="color:#333">文章内容暂时无法加载</h2>
<p class="msg">${status === 404 ? '文件不存在或已被删除' : `服务器错误 (${status})`}</p></div></body></html>`
    return new NextResponse(errHtml, {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  }

  const buf = await upstream.arrayBuffer()
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "文件过大" }, { status: 413 })
  }

  // 计算 Storage 目录 base（用于解析相对 URL）
  const baseForRelative = new URL(target)
  baseForRelative.pathname = baseForRelative.pathname.replace(/\/[^/]+$/, "/")
  const baseHref = baseForRelative.toString()

  // 将所有 Supabase 资源 URL（img src、link href、a href 等）
  // 重写为经由本站代理的路径，避免浏览器直连 Supabase 被拒连
  let html = new TextDecoder("utf-8", { fatal: false }).decode(buf)
  html = rewriteResourceUrls(html, baseForRelative, origin)

  // 保留 <base href> 作为兜底，使未被重写的相对路径仍指向 Storage 目录
  const baseTag = `<base href="${baseHref}">`

  // 拦截脚本：捕获 iframe 内点击 Storage 链接的行为，将导航路由回代理
  // 避免 iframe 绕过代理直接访问 Supabase Storage，出现原始 JSON 404 错误
  const storageHost = target.hostname
  const interceptScript = `<script>(function(){
  document.addEventListener('click',function(e){
    var el=e.target;
    while(el&&el.tagName!=='A')el=el.parentElement;
    if(!el||!el.href)return;
    var rawAttr=el.getAttribute('href')||'';
    // 纯锚点（#section）：<base href> 会让浏览器把 #section 解析为 Supabase URL 并发请求，
    // 必须 preventDefault 后手动 scrollIntoView，而不是放给浏览器自己导航
    if(rawAttr.startsWith('#')){
      e.preventDefault();
      var targetId=rawAttr.slice(1);
      var dest=document.getElementById(targetId)||document.querySelector('[name="'+targetId+'"]');
      if(dest)dest.scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }
    var href=el.href;
    // Supabase Storage 链接：强制走代理；跨文件跳转时保留 fragment 供浏览器滚动定位
    if(href.indexOf('${storageHost}')!==-1&&href.indexOf('/storage/v1/object/')!==-1){
      e.preventDefault();
      var hashIdx=href.indexOf('#');
      var baseUrl=hashIdx!==-1?href.slice(0,hashIdx):href;
      var fragment=hashIdx!==-1?href.slice(hashIdx):'';
      window.location.href='/api/html-proxy?url='+encodeURIComponent(baseUrl)+fragment;
    }
    // 其他外部链接：在新标签页打开
    else if(href.startsWith('http')){
      e.preventDefault();
      window.open(href,'_blank','noopener,noreferrer');
    }
  },true);
})();</script>`

  const headInsert = baseTag + interceptScript
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => `${m}${headInsert}`)
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html[^>]*>/i, (m) => `${m}<head>${headInsert}</head>`)
  } else {
    html = headInsert + html
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
