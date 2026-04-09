// 首页（服务端组件）
// 数据在服务端获取并做初步过滤，客户端只负责渲染和交互。

import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { CategorySection, type CategoryItem } from "@/components/HomeClient"
import { getAllArticles, getAllCategories } from "@/lib/articles"

// ISR: 60 秒重新验证，不用每次访问都查数据库
export const revalidate = 60

/** 与栏目展示标题对应的「根分类名」：须与 DB articles.category / getArticlesByCategory 入参一致；可多个别名（如笔记栏常用「短线笔记」） */
const CATEGORY_MAP: (Pick<CategoryItem, "id" | "title" | "icon" | "href" | "locked"> & {
  filterRoots: string[]
})[] = [
  { id: "masters", title: "大佬合集", icon: "masters", href: "/masters", locked: false, filterRoots: ["大佬合集"] },
  {
    id: "notes",
    title: "短线学习笔记",
    icon: "notes",
    href: "/notes",
    locked: false,
    // 列表页 getArticlesByCategory("短线笔记")；历史数据可能写成「短线学习笔记」
    filterRoots: ["短线笔记", "短线学习笔记"],
  },
  { id: "stocks", title: "个股挖掘", icon: "stocks", href: "/stocks", locked: true, filterRoots: ["个股挖掘"] },
]

type FlatCat = { id: string; name: string; parentId?: string; href?: string }

/** 与 getAllCategories 返回的树结构一致，打平为列表（含 href，用于按路由对齐首页区块） */
function flattenCategoryTree(cats: unknown[]): FlatCat[] {
  const out: FlatCat[] = []
  const walk = (arr: unknown[]) => {
    if (!Array.isArray(arr)) return
    for (const raw of arr) {
      const c = raw as Record<string, unknown>
      if (!c?.id) continue
      const hrefRaw = c.href
      out.push({
        id: String(c.id),
        name: String(c.name ?? "").trim(),
        parentId: c.parent_id ? String(c.parent_id) : c.parentId ? String(c.parentId) : undefined,
        href:
          hrefRaw != null && String(hrefRaw).trim() !== ""
            ? String(hrefRaw).trim()
            : undefined,
      })
      if (Array.isArray(c.children) && (c.children as unknown[]).length > 0) {
        walk(c.children as unknown[])
      }
    }
  }
  walk(cats)
  return out
}

function normalizePath(h: string): string {
  const t = h.trim().replace(/\/$/, "")
  return t || h.trim()
}

/** 某 href 对应的根分类 id（如 /notes）；库里未配 href 时返回 [] */
function findCategoryRootIdsByHref(flat: FlatCat[], targetHref: string): string[] {
  const t = normalizePath(targetHref)
  return flat.filter((c) => c.href && normalizePath(c.href) === t).map((c) => c.id)
}

/** 根及其所有子孙分类的 name（文章 category 通常存的是选中叶子的中文名） */
function collectDescendantCategoryNames(flat: FlatCat[], rootIds: string[]): Set<string> {
  const childrenByParent = new Map<string, string[]>()
  for (const row of flat) {
    if (!row.parentId) continue
    if (!childrenByParent.has(row.parentId)) childrenByParent.set(row.parentId, [])
    childrenByParent.get(row.parentId)!.push(row.id)
  }
  const names = new Set<string>()
  const visit = (id: string) => {
    const node = flat.find((x) => x.id === id)
    if (node?.name) names.add(node.name)
    for (const cid of childrenByParent.get(id) ?? []) visit(cid)
  }
  for (const rid of rootIds) visit(rid)
  return names
}

/**
 * 判断某篇文章是否属于某个分类（支持子分类链追溯）。
 * article.category 存的是中文名如「大佬合集」或子类名。
 */
function articleBelongsToCategory(
  articleCategory: string,
  targetCategoryName: string,
  categoryMap: Record<string, { name: string; parentId?: string }>,
  nameToIdMap: Record<string, string>
): boolean {
  const ac = articleCategory.trim()
  const tc = targetCategoryName.trim()
  if (!ac) return false
  if (ac === tc) return true

  let cur = ac
  while (cur) {
    const id = nameToIdMap[cur]
    if (!id) break
    let pid = categoryMap[id]?.parentId
    while (pid) {
      if (categoryMap[pid]?.name?.trim() === tc) return true
      pid = categoryMap[pid]?.parentId
    }
    break
  }
  return false
}

export default async function HomePage() {
  const [categoriesData, articles] = await Promise.all([
    getAllCategories(),
    getAllArticles(),
  ])

  const flatCats = flattenCategoryTree(categoriesData as unknown[])

  const categoryMap: Record<string, { name: string; parentId?: string }> = {}
  const nameToIdMap: Record<string, string> = {}
  for (const row of flatCats) {
    categoryMap[row.id] = { name: row.name, parentId: row.parentId }
    if (row.name) nameToIdMap[row.name] = row.id
  }

  // 服务端过滤：每个分类取前 6 篇
  const categories: CategoryItem[] = CATEGORY_MAP.map((cat) => {
    const rootIds = findCategoryRootIdsByHref(flatCats, cat.href)
    const namesUnderHref = collectDescendantCategoryNames(flatCats, rootIds)

    return {
      ...cat,
      articles: (articles as unknown as Record<string, unknown>[])
      .filter((a) => {
        const c = String(a.category ?? "").trim()
        if (!c) return false
        // 优先：分类表上配置了与 /notes 等一致的 href，则归入该根下整棵子树
        if (namesUnderHref.size > 0 && namesUnderHref.has(c)) return true
        // 兼容：未配 href 或历史数据，仍按名称 + 父链匹配
        return cat.filterRoots.some((root) =>
          articleBelongsToCategory(c, root, categoryMap, nameToIdMap)
        )
      })
      .slice(0, 6)
      .map((a) => ({
        id: String(a.id),
        short_id: a.short_id ? String(a.short_id) : undefined,
        title: String(a.title ?? ""),
        subcategory: a.subcategory ? String(a.subcategory) : undefined,
      })),
    }
  })

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="border-b border-border bg-secondary/30">
          <div className="mx-auto max-w-6xl px-4 py-12 text-center lg:px-8 lg:py-16">
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl lg:text-4xl">
              <span className="text-primary">价值投机</span>，看长做短
            </h1>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 lg:px-8 lg:py-20">
          <div className="space-y-8">
            <CategorySection categories={categories} />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
