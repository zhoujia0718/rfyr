/**
 * 批量导入「鑫多多」文章到数据库
 * 用法: node scripts/import-xinduoduo.mjs
 *
 * 环境变量（读取项目根目录 .env.local）：
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { join, basename, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = '/Users/zhoujia/Desktop/日富一日资料集/output/鑫多多'
const ASSETS = join(ROOT, 'assets')

// ─── 加载 .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = '/Users/zhoujia/Downloads/rfyr/.env.local'
  try {
    const text = readFileSync(envPath, 'utf-8')
    for (const line of text.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq < 0) continue
      const key = t.slice(0, eq).trim()
      const val = t.slice(eq + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  } catch {}
}
loadEnv()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!supabaseUrl || !serviceKey) {
  console.error('缺少 SUPABASE 环境变量，请确认 .env.local 已正确配置')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const BUCKET = 'article-pdfs'

// ─── 工具函数 ────────────────────────────────────────────────────────────────
function safeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\.+/g, '.').trim()
}

function shortHash(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0
  return Math.abs(h).toString(36).slice(0, 6)
}

/** 从 HTML 文本提取 <title> 或第一行 H1 文本作为标题 */
function extractTitle(htmlText) {
  const titleMatch = htmlText.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) return titleMatch[1].trim()
  const h1Match = htmlText.match(/<h1[^>]*>([^<]+)<\/h1>/i)
  if (h1Match) return h1Match[1].trim()
  return null
}

/** 从 HTML 提取所有图片 src（assets/ 开头或无路径） */
function extractImgRefs(htmlText) {
  const refs = new Set()
  const re = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  let m
  while ((m = re.exec(htmlText)) !== null) {
    refs.add(m[1].trim())
  }
  return [...refs]
}

/**
 * 遍历 assets 目录，将「文件名 _pNN.png」匹配到对应 HTML。
 * 返回 Map<articleName, string[]>  articleName 为不含后缀的 HTML 文件名（如"从供需角度和竞争格局来选公司"）
 */
function buildAssetsIndex() {
  const byPrefix = new Map()
  for (const file of readdirSync(ASSETS)) {
    if (!file.endsWith('.png') && !file.endsWith('.jpg') && !file.endsWith('.jpeg')) continue
    // "从供需角度和竞争格局来选公司_p01.png" → prefix = "从供需角度和竞争格局来选公司"
    const dotExt = file.lastIndexOf('.')
    const base = file.slice(0, dotExt)
    // 找最后 _p 的位置
    const upIdx = base.lastIndexOf('_p')
    if (upIdx < 0) continue
    const prefix = base.slice(0, upIdx)
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, [])
    byPrefix.get(prefix).push(file)
  }
  // 按页码排序
  for (const [, arr] of byPrefix) arr.sort()
  return byPrefix
}

/** 将 HTML 中的配图 src 改写（assets/文件名 → 实际文件名） */
function rewriteHtmlImgSrcs(htmlText, prefix, filenames) {
  // 建立 assets/xxx → 实际文件的映射（页码从小到大）
  const map = new Map()
  const pIdx = new Map()
  for (const fn of filenames) {
    const dotExt = fn.lastIndexOf('.')
    const base = fn.slice(0, dotExt)
    const upIdx = base.lastIndexOf('_p')
    const num = upIdx >= 0 ? parseInt(base.slice(upIdx + 2)) || 0 : 0
    pIdx.set(fn, num)
  }
  const sorted = filenames.sort((a, b) => (pIdx.get(a) || 0) - (pIdx.get(b) || 0))
  // 替换 assets/ 下的文件
  let i = 0
  return htmlText.replace(/src=["']assets\/([^"']+)["']/g, (_, name) => {
    const fn = sorted[i] || sorted[0] || name
    i++
    return `src="${fn}"`
  })
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== 1/4 查找「短线笔记」分类 ===')
  const { data: allCats, error: catErr } = await supabase
    .from('categories')
    .select('*')
    .order('created_at', { ascending: true })

  if (catErr) { console.error('获取分类失败', catErr); process.exit(1) }

  // 找「短线笔记」或「短线学习笔记」
  let parentCat = allCats.find(c =>
    c.name === '短线笔记' || c.name === '短线学习笔记'
  )
  if (!parentCat) {
    console.error('未找到「短线笔记」或「短线学习笔记」分类，请先在后台创建')
    process.exit(1)
  }
  console.log(`  找到父分类: ${parentCat.name} (id=${parentCat.id})`)

  console.log('\n=== 2/4 查找或创建「鑫多多」子分类 ===')
  let xinduoduoCat = allCats.find(c => c.name === '鑫多多' && c.parent_id === parentCat.id)
  if (xinduoduoCat) {
    console.log(`  已存在「鑫多多」子分类 (id=${xinduoduoCat.id})`)
  } else {
    const { data: created, error: createErr } = await supabase
      .from('categories')
      .insert({ name: '鑫多多', parent_id: parentCat.id, icon: '📈', description: '鑫多多的投资笔记' })
      .select('*')
      .single()
    if (createErr) { console.error('创建「鑫多多」失败', createErr); process.exit(1) }
    xinduoduoCat = created
    console.log(`  新建「鑫多多」(id=${xinduoduoCat.id})`)
  }

  console.log('\n=== 3/4 扫描 HTML 文件和配图 ===')
  const htmlFiles = readdirSync(ROOT).filter(f => f.endsWith('.html'))
  console.log(`  找到 ${htmlFiles.length} 个 HTML 文件`)
  const assetsIndex = buildAssetsIndex()
  console.log(`  找到 ${assetsIndex.size} 组配图`)

  console.log('\n=== 4/4 逐篇上传 ===')
  const results = []
  let ok = 0, fail = 0

  for (const htmlFile of htmlFiles) {
    const htmlName = htmlFile.replace(/\.html$/, '')
    const htmlPath = join(ROOT, htmlFile)
    const htmlText = readFileSync(htmlPath, 'utf-8')
    const title = extractTitle(htmlText) || htmlName
    const titleSafe = extractTitle(htmlText)?.replace(/[\\/:*?"<>|]/g, '_').trim() || htmlName.replace(/[\\/:*?"<>|]/g, '_').trim()
    const timestamp = Date.now()
    const folder = `h_${timestamp}`
    const htmlObjPath = `${folder}/index.html`

    console.log(`\n  ─ ${titleSafe} ─`)

    // 收集配图
    const imgs = assetsIndex.get(htmlName) || []
    console.log(`    配图 ${imgs.length} 张: ${imgs.slice(0, 3).join(', ')}${imgs.length > 3 ? '...' : ''}`)

    // 上传 HTML（原始）
    const htmlBuf = Buffer.from(htmlText, 'utf-8')
    const { error: upHtmlErr } = await supabase.storage.from(BUCKET).upload(htmlObjPath, htmlBuf, {
      upsert: true,
      cacheControl: '3600',
      contentType: 'text/html; charset=utf-8',
    })
    if (upHtmlErr) {
      console.error(`    ❌ 上传 HTML 失败: ${upHtmlErr.message}`)
      results.push({ title: titleSafe, status: 'fail', err: upHtmlErr.message })
      fail++
      continue
    }
    console.log(`    ✓ HTML 已上传 (${htmlBuf.byteLength} bytes)`)

    // 上传配图并重写 HTML img src（统一转 ASCII 名避免存储 key 中文问题）
    let rewrittenHtml = htmlText
    const prefix = `${folder}/`
    const imgMap = new Map()
    imgs.forEach((fn, i) => {
      imgMap.set(fn, `${shortHash(fn)}_p${String(i + 1).padStart(2, '0')}.png`)
    })
    for (const [fn, asciiName] of imgMap) {
      const imgBuf = readFileSync(join(ASSETS, fn))
      const imgPath = `${prefix}${asciiName}`
      const { error: upImgErr } = await supabase.storage.from(BUCKET).upload(imgPath, imgBuf, {
        upsert: true,
        cacheControl: '3600',
        contentType: 'image/png',
      })
      if (upImgErr) console.warn(`    ! 上传配图 ${fn} → ${asciiName} 失败: ${upImgErr.message}`)
      else console.log(`    ✓ 配图 ${asciiName}`)
    }
    // 重写 HTML img src（assets/xxx → ASCII 名），并上传重写后的 HTML
    rewrittenHtml = htmlText.replace(/src=["']assets\/([^"']+)["']/g, (_, name) => {
      const asciiName = imgMap.get(name) || name
      return `src="${asciiName}"`
    })
    const rewrittenBuf = Buffer.from(rewrittenHtml, 'utf-8')
    const { error: upRewriteErr } = await supabase.storage.from(BUCKET).upload(htmlObjPath, rewrittenBuf, {
      upsert: true,
      cacheControl: '3600',
      contentType: 'text/html; charset=utf-8',
    })
    if (upRewriteErr) console.warn(`    ! 重写 HTML img src 后重新上传失败: ${upRewriteErr.message}`)
    else console.log(`    ✓ HTML img src 已重写为 ASCII 名并重新上传`)

    // 获取公开 URL
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(htmlObjPath)
    const htmlUrl = pub.publicUrl

    // 写入数据库
    const { data: article, error: artErr } = await supabase
      .from('articles')
      .insert({
        title,
        content: '', // HTML 文章正文为空，由 html_url 提供
        category: '鑫多多',
        author: '鑫多多',
        publishdate: new Date().toISOString().slice(0, 10),
        html_url: htmlUrl,
        html_original_name: htmlFile,
      })
      .select('*')
      .single()

    if (artErr) {
      console.error(`    ❌ 写入数据库失败: ${artErr.message}`)
      results.push({ title: titleSafe, status: 'fail', err: artErr.message })
      fail++
    } else {
      console.log(`    ✓ 已写入数据库 (id=${article.id})`)
      results.push({ title: titleSafe, status: 'ok', id: article.id })
      ok++
    }
  }

  console.log('\n═══════════════════════════')
  console.log(`完成：成功 ${ok}，失败 ${fail}`)
  if (fail > 0) {
    console.log('失败列表:')
    for (const r of results.filter(r => r.status === 'fail')) {
      console.log(`  - ${r.title}: ${r.err}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })