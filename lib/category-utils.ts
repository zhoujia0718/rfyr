/**
 * 分类工具模块
 * 统一管理分类相关的操作，避免代码重复
 */

import type { Article } from './articles'

/**
 * 分类节点数据结构
 */
export interface CategoryNode {
  id: string
  name: string
  icon?: string
  description?: string
  href?: string | null
  parentId?: string | null
}

/**
 * 分类映射表
 */
export interface CategoryMaps {
  /** id -> CategoryNode */
  categoryMap: Record<string, CategoryNode>
  /** name -> id */
  nameToIdMap: Record<string, string>
  /** parentId -> [childIds] */
  childrenMap: Record<string, string[]>
}

/**
 * 构建分类映射表
 * 用于快速查询分类关系
 */
export function buildCategoryMaps(rows: CategoryNode[]): CategoryMaps {
  const categoryMap: Record<string, CategoryNode> = {}
  const nameToIdMap: Record<string, string> = {}
  const childrenMap: Record<string, string[]> = {}

  for (const row of rows) {
    // 构建 id -> CategoryNode 映射
    categoryMap[row.id] = {
      id: row.id,
      name: row.name || '',
      icon: row.icon,
      description: row.description,
      href: row.href,
      parentId: row.parentId,
    }

    // 构建 name -> id 映射
    if (row.name) {
      const trimmedName = String(row.name).trim()
      if (trimmedName) {
        nameToIdMap[trimmedName] = row.id
      }
    }

    // 构建 parentId -> [childIds] 映射
    const parentId = row.parentId || ''
    if (parentId) {
      if (!childrenMap[parentId]) {
        childrenMap[parentId] = []
      }
      childrenMap[parentId].push(row.id)
    }
  }

  return { categoryMap, nameToIdMap, childrenMap }
}

/**
 * 检查文章分类是否在指定分类树下
 * 包括精确匹配和父链匹配
 *
 * @param articleCategory - 文章所属分类名称
 * @param rootCategoryName - 根分类名称
 * @param categoryMap - 分类映射表
 * @param nameToIdMap - 名称到ID映射
 * @returns 是否在分类树下
 */
export function isInCategoryTree(
  articleCategory: string,
  rootCategoryName: string,
  categoryMap: Record<string, CategoryNode>,
  nameToIdMap: Record<string, string>
): boolean {
  const ac = String(articleCategory || '').trim()
  const rn = String(rootCategoryName || '').trim()

  // 空值检查
  if (!ac) return false

  // 精确匹配
  if (ac === rn) return true

  // 向上遍历父链，直到找到匹配或无父节点
  let currentId = nameToIdMap[ac]
  while (currentId) {
    const parentId = categoryMap[currentId]?.parentId
    if (!parentId) break

    const parentInfo = categoryMap[parentId]
    if (!parentInfo) break

    const parentName = String(parentInfo.name || '').trim()
    if (parentName === rn) return true

    currentId = parentId
  }

  return false
}

/**
 * 获取分类的所有后代分类名称
 *
 * @param rootId - 根分类 ID
 * @param childrenMap - parentId -> [childIds] 映射
 * @param categoryMap - 分类映射表
 * @returns 所有后代分类名称的集合
 */
export function getDescendantCategoryNames(
  rootId: string,
  childrenMap: Record<string, string[]>,
  categoryMap: Record<string, CategoryNode>
): Set<string> {
  const names = new Set<string>()

  function visit(id: string): void {
    const childIds = childrenMap[id]
    if (!childIds) return

    for (const childId of childIds) {
      const category = categoryMap[childId]
      if (!category) continue

      const name = String(category.name || '').trim()
      if (name) {
        names.add(name)
      }

      // 递归访问子节点
      visit(childId)
    }
  }

  visit(rootId)
  return names
}

/**
 * 获取指定 href 对应的根分类 ID 列表
 *
 * @param rows - 分类数据行
 * @param targetHref - 目标 href
 * @returns 匹配的根分类 ID 列表
 */
export function findCategoryRootIdsByHref(
  rows: CategoryNode[],
  targetHref: string
): string[] {
  const normalize = (h: string): string => {
    const t = String(h || '').trim().replace(/\/$/, '')
    return t || String(h || '').trim()
  }

  const target = normalize(targetHref)

  return rows
    .filter((r) => {
      const href = r.href
      if (!href) return false
      return normalize(String(href)) === target
    })
    .map((r) => String(r.id))
}

/**
 * 过滤出属于指定分类树的所有文章
 *
 * @param articles - 文章列表
 * @param rootCategoryName - 根分类名称
 * @param categoryMap - 分类映射表
 * @param nameToIdMap - 名称到ID映射
 * @returns 过滤后的文章列表
 */
export function filterArticlesByCategory(
  articles: Article[],
  rootCategoryName: string,
  categoryMap: Record<string, CategoryNode>,
  nameToIdMap: Record<string, string>
): Article[] {
  return articles.filter((article) =>
    isInCategoryTree(article.category, rootCategoryName, categoryMap, nameToIdMap)
  )
}

/**
 * 过滤出属于指定分类树的所有文章（使用 href 匹配）
 *
 * @param articles - 文章列表
 * @param sectionHref - 分类的 href（如 /notes）
 * @param rows - 分类数据行
 * @param fallbackRoots - 兜底的根分类名称列表
 * @param categoryMap - 分类映射表
 * @param nameToIdMap - 名称到ID映射
 * @returns 过滤后的文章列表
 */
export function filterArticlesBySection(
  articles: Article[],
  sectionHref: string,
  rows: CategoryNode[],
  fallbackRoots: string[],
  categoryMap: Record<string, CategoryNode>,
  nameToIdMap: Record<string, string>
): Article[] {
  // 方法1：通过 href 匹配
  const rootIds = findCategoryRootIdsByHref(rows, sectionHref)
  const subtreeNames = new Set<string>()

  for (const rootId of rootIds) {
    const descendants = getDescendantCategoryNames(rootId, {}, categoryMap)
    descendants.forEach((name) => subtreeNames.add(name))
  }

  // 方法2：兜底名称匹配
  const fallbackMatches = new Set<string>()
  for (const root of fallbackRoots) {
    for (const [name, id] of Object.entries(nameToIdMap)) {
      if (isInCategoryTree(name, root, categoryMap, nameToIdMap)) {
        fallbackMatches.add(name)
      }
    }
  }

  // 合并结果
  const validNames = new Set([...subtreeNames, ...fallbackMatches])

  return articles.filter((article) => {
    const categoryName = String(article.category || '').trim()
    if (!categoryName) return false
    return validNames.has(categoryName)
  })
}

/**
 * 构建分类树形结构
 *
 * @param categories - 扁平分类列表
 * @param parentId - 父分类 ID（undefined 表示获取根分类）
 * @returns 树形结构的分类列表
 */
export function buildCategoryTree(
  categories: CategoryNode[],
  parentId?: string
): CategoryNode[] {
  return categories
    .filter((cat) => {
      const catParentId = cat.parentId
      if (parentId === undefined) {
        return catParentId === null || catParentId === undefined || catParentId === ''
      }
      return catParentId === parentId
    })
    .map((cat) => ({
      ...cat,
      children: buildCategoryTree(categories, cat.id),
    }))
}

/**
 * 将数据库行转换为 CategoryNode
 * 处理可能的大小写和字段名差异
 */
export function toCategoryNode(row: Record<string, unknown>): CategoryNode {
  return {
    id: String(row.id),
    name: String(row.name ?? '').trim(),
    icon: row.icon as string | undefined,
    description: row.description as string | undefined,
    href: (row.href as string | null) ?? undefined,
    parentId: (row.parent_id as string | null | undefined) ?? (row.parentId as string | null | undefined),
  }
}

/**
 * 将数据库行数组转换为 CategoryNode 数组
 */
export function toCategoryNodes(rows: Record<string, unknown>[]): CategoryNode[] {
  return rows.map(toCategoryNode)
}
