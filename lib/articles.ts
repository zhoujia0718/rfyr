/**
 * 文章数据管理模块
 * 统一管理文章和分类的 CRUD 操作
 */

import { supabase } from './supabase'
import { isArticleUuid } from './short-id'
import {
  buildCategoryMaps,
  isInCategoryTree,
  filterArticlesBySection,
  toCategoryNode,
} from './category-utils'
import { NotFoundError, DatabaseError } from './errors'

// ========================
// 类型定义
// ========================

export interface Article {
  id: string
  short_id?: string
  title: string
  content: string
  category: string
  subcategory?: string
  author: string
  publishDate: string
  readingCount: number
  created_at: string
  updated_at: string
  pdf_url?: string | null
  pdf_original_name?: string | null
  /** 外链 HTML 文件的 URL */
  html_url?: string | null
  /** 前端显示/下载用的原始文件名 */
  html_original_name?: string | null
  is_review?: boolean
  /** 访问权限级别: free=免费(所有人), monthly=月卡可见, yearly=年卡专属 */
  access_level?: 'free' | 'monthly' | 'yearly'
  /** 文章标签 */
  tags?: string[]
}

export interface Category {
  id: string
  name: string
  icon: string
  description: string
  href: string
  parentId?: string | null
  children?: Category[]
}

// ========================
// 常量
// ========================

/** 文章列表默认上限（列表页不需要 content 全文） */
export const DEFAULT_ARTICLE_LIST_LIMIT = 200

// ========================
// 文章映射工具
// ========================

/**
 * 将数据库行映射为 Article 对象
 */
function mapArticleRow(item: Record<string, unknown>): Article {
  return {
    id: String(item.id),
    short_id: item.short_id as string | undefined,
    title: String(item.title ?? ''),
    content: String(item.content ?? ''),
    category: String(item.category ?? ''),
    subcategory: item.subcategory as string | undefined,
    author: String(item.author ?? ''),
    publishDate: String(item.publishdate ?? item.publishDate ?? ''),
    readingCount: Number(item.readingcount ?? item.readingCount ?? 0),
    created_at: String(item.created_at ?? ''),
    updated_at: String(item.updated_at ?? ''),
    pdf_url: item.pdf_url as string | null | undefined,
    pdf_original_name: item.pdf_original_name as string | null | undefined,
    html_url: item.html_url as string | null | undefined,
    html_original_name: item.html_original_name as string | null | undefined,
    is_review: item.is_review as boolean | undefined,
    access_level: (item.access_level as 'free' | 'monthly' | 'yearly') || 'monthly',
    tags: (item.tags as string[]) || [],
  }
}


/**
 * 将 Article 转换为数据库插入格式
 */
function articleToDbInsert(article: Omit<Article, 'id' | 'readingCount' | 'created_at' | 'updated_at'>): Record<string, unknown> {
  return {
    title: article.title,
    content: article.content,
    category: article.category,
    subcategory: article.subcategory,
    author: article.author,
    publishdate: article.publishDate,
    readingcount: 0,
    short_id: article.short_id,
    pdf_url: article.pdf_url,
    pdf_original_name: article.pdf_original_name,
    html_url: article.html_url,
    html_original_name: article.html_original_name,
    is_review: article.is_review ?? false,
    access_level: article.access_level ?? 'monthly',
  }
}

/**
 * 将 Article 部分更新转换为数据库格式
 */
function articleToDbUpdate(updates: Partial<Article>): Record<string, unknown> {
  const dbUpdates: Record<string, unknown> = {}

  if (updates.title !== undefined) dbUpdates.title = updates.title
  if (updates.content !== undefined) dbUpdates.content = updates.content
  if (updates.category !== undefined) dbUpdates.category = updates.category
  if (updates.subcategory !== undefined) dbUpdates.subcategory = updates.subcategory
  if (updates.author !== undefined) dbUpdates.author = updates.author
  if (updates.publishDate !== undefined) dbUpdates.publishdate = updates.publishDate
  if (updates.readingCount !== undefined) dbUpdates.readingcount = updates.readingCount
  if (updates.pdf_url !== undefined) dbUpdates.pdf_url = updates.pdf_url
  if (updates.pdf_original_name !== undefined) dbUpdates.pdf_original_name = updates.pdf_original_name
  if (updates.html_url !== undefined) dbUpdates.html_url = updates.html_url
  if (updates.html_original_name !== undefined) dbUpdates.html_original_name = updates.html_original_name
  if (updates.is_review !== undefined) dbUpdates.is_review = updates.is_review
  if (updates.access_level !== undefined) dbUpdates.access_level = updates.access_level

  return dbUpdates
}

// ========================
// 数据库错误处理
// ========================

function isSupabaseNoRow(err: { code?: string } | null): boolean {
  return err?.code === 'PGRST116'
}

// ========================
// 分类操作
// ========================

/**
 * 初始化分类表（仅用于测试连接）
 */
export async function initCategoriesTable(): Promise<void> {
  try {
    const { error } = await supabase.from('categories').select('*').limit(1)

    if (error && error.code === '42P01') {
      console.error('Categories table does not exist. Please create it in Supabase console.')
      console.error(`
        CREATE TABLE categories (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          name TEXT NOT NULL,
          icon TEXT NOT NULL,
          description TEXT,
          href TEXT,
          parent_id UUID REFERENCES categories(id),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `)
    }
  } catch (error) {
    console.error('Error in initCategoriesTable:', error)
  }
}

/**
 * 获取所有分类（树形结构）
 */
export async function getAllCategories(): Promise<Category[]> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching categories:', error)
      return []
    }

    if (!data || data.length === 0) {
      return []
    }

    // 转换为扁平结构
    const nodes = data.map(toCategoryNode)

    // 使用共享工具构建树形结构
    const buildTree = (categories: typeof nodes, parentId?: string): Category[] => {
      return categories
        .filter((cat) => {
          if (parentId === undefined) {
            return cat.parentId === null || cat.parentId === undefined || cat.parentId === ''
          }
          return cat.parentId === parentId
        })
        .map((cat) => ({
          id: cat.id,
          name: cat.name,
          icon: cat.icon || '',
          description: cat.description || '',
          href: cat.href || '',
          parentId: cat.parentId,
          children: buildTree(categories, cat.id),
        }))
    }

    return buildTree(nodes)
  } catch (error) {
    console.error('Error fetching categories:', error)
    return []
  }
}

/**
 * 创建分类
 */
export async function createCategory(
  category: Omit<Category, 'id' | 'children'>
): Promise<Category | null> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .insert({
        name: category.name,
        icon: category.icon,
        description: category.description,
        href: category.href,
        parent_id: category.parentId,
      })
      .select('*')
      .single()

    if (error) {
      if (error.code === '42P01') {
        if (typeof window !== 'undefined') {
          console.error('表不存在，请在Supabase控制台创建: categories')
        }
        return null
      }
      console.error('Error creating category:', error)
      return null
    }

    if (data) {
      return {
        id: data.id,
        name: data.name,
        icon: data.icon,
        description: data.description,
        href: data.href,
        parentId: data.parent_id,
      }
    }

    return null
  } catch (error) {
    console.error('Error creating category:', error)
    return null
  }
}

/**
 * 更新分类
 */
export async function updateCategory(
  id: string,
  updates: Partial<Category>
): Promise<Category | null> {
  try {
    const dbUpdates: Record<string, unknown> = {}
    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.icon !== undefined) dbUpdates.icon = updates.icon
    if (updates.description !== undefined) dbUpdates.description = updates.description
    if (updates.href !== undefined) dbUpdates.href = updates.href
    if (updates.parentId !== undefined) dbUpdates.parent_id = updates.parentId

    const { data, error } = await supabase
      .from('categories')
      .update(dbUpdates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      if (error.code === '42P01') {
        if (typeof window !== 'undefined') {
          console.error('表不存在，请在Supabase控制台创建: categories')
        }
        return null
      }
      console.error('Error updating category:', error)
      return null
    }

    if (data) {
      return {
        id: data.id,
        name: data.name,
        icon: data.icon,
        description: data.description,
        href: data.href,
        parentId: data.parent_id,
      }
    }

    return null
  } catch (error) {
    console.error('Error updating category:', error)
    return null
  }
}

/**
 * 删除分类
 */
export async function deleteCategory(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('categories').delete().eq('id', id)

    if (error) {
      if (error.code === '42P01') {
        if (typeof window !== 'undefined') {
          console.error('表不存在，请在Supabase控制台创建: categories')
        }
        return false
      }
      console.error('Error deleting category:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error deleting category:', error)
    return false
  }
}

// ========================
// 文章操作
// ========================

/**
 * 初始化文章表（仅用于测试连接）
 */
export async function initArticlesTable(): Promise<void> {
  try {
    const { error } = await supabase.from('articles').select('*').limit(1)

    if (error && error.code === '42P01') {
      console.error('Articles table does not exist. Please create it in Supabase console.')
      console.error(`
        CREATE TABLE articles (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          short_id TEXT UNIQUE,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          category TEXT NOT NULL,
          subcategory TEXT,
          author TEXT NOT NULL,
          publishdate DATE NOT NULL,
          readingcount INTEGER DEFAULT 0,
          pdf_url TEXT,
          pdf_original_name TEXT,
          html_url TEXT,
          html_original_name TEXT,
          is_review BOOLEAN DEFAULT FALSE,
          access_level TEXT DEFAULT 'monthly',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `)
    }
  } catch (error) {
    console.error('Error in initArticlesTable:', error)
  }
}

/**
 * 获取所有文章（首页分类展示用）
 * select('*') + 后处理剔除 content 正文，避免无谓的数据传输
 */
export async function getAllArticles(): Promise<Article[]> {
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(DEFAULT_ARTICLE_LIST_LIMIT)

    if (error) {
      console.error('Error fetching articles:', error)
      return []
    }

    return (data || []).map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { content: _content, ...rest } = row as Record<string, unknown>
      return mapArticleRow(rest)
    })
  } catch (error) {
    console.error('Error fetching articles:', error)
    return []
  }
}

/**
 * 根据分类获取文章（包括子分类）
 * 使用 select('*') + 后处理裁掉 content 正文，避免拉取大字段
 */
export async function getArticlesByCategory(categoryName: string): Promise<Article[]> {
  try {
    // 并行获取分类和文章
    const [{ data: categoriesData }, { data: allArticles }] = await Promise.all([
      supabase.from('categories').select('*'),
      supabase
        .from('articles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(DEFAULT_ARTICLE_LIST_LIMIT),
    ])

    // dev 环境 categories 表可能不存在，改为直接按 category 字段过滤
    if (categoriesData === null) {
      if (allArticles === null) return []
      const filtered = allArticles.filter((a) => a.category === categoryName)
      return filtered.map((row) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { content: _content, ...rest } = row as Record<string, unknown>
        return mapArticleRow(rest)
      })
    }

    if (allArticles === null) return []

    // 构建分类映射
    const { categoryMap, nameToIdMap } = buildCategoryMaps(categoriesData.map(toCategoryNode))

    // 过滤文章
    const filtered = allArticles.filter((article) =>
      isInCategoryTree(article.category, categoryName, categoryMap, nameToIdMap)
    )

    // 裁掉 content 正文，避免无谓的数据传输
    return filtered.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { content: _content, ...rest } = row as Record<string, unknown>
      return mapArticleRow(rest)
    })
  } catch (error) {
    console.error('Error fetching articles by category:', error)
    return []
  }
}

/**
 * 获取短线笔记（使用 /notes href 匹配 + 兜底逻辑）
 * select('*') + 后处理剔除 content 正文
 */
export async function getArticlesForNotesSection(): Promise<Article[]> {
  const SECTION_HREF = '/notes'
  const FALLBACK_ROOTS = ['短线笔记', '短线学习笔记']

  try {
    // 并行获取分类和文章
    const [{ data: categoriesData }, { data: allArticles }] = await Promise.all([
      supabase.from('categories').select('*'),
      supabase
        .from('articles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(DEFAULT_ARTICLE_LIST_LIMIT),
    ])

    // dev 环境 categories 表可能不存在，改为直接按 category 字段过滤
    if (categoriesData === null) {
      if (allArticles === null) return getArticlesByCategory('短线笔记')
      const filtered = allArticles.filter((a) => FALLBACK_ROOTS.includes(a.category))
      return filtered.map((row) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { content: _content, ...rest } = row as Record<string, unknown>
        return mapArticleRow(rest)
      })
    }

    if (allArticles === null) return getArticlesByCategory('短线笔记')

    // 使用共享的过滤函数（内部使用 allArticles 中已有的字段）
    const rows = categoriesData.map(toCategoryNode)
    const filtered = filterArticlesBySection(
      allArticles,
      SECTION_HREF,
      rows,
      FALLBACK_ROOTS,
      buildCategoryMaps(rows).categoryMap,
      buildCategoryMaps(rows).nameToIdMap
    )

    // 裁掉 content 正文
    return filtered.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { content: _content, ...rest } = row as Record<string, unknown>
      return mapArticleRow(rest)
    })
  } catch (error) {
    console.error('Error in getArticlesForNotesSection:', error)
    return getArticlesByCategory('短线笔记')
  }
}

/**
 * 创建文章
 */
export async function createArticle(
  article: Omit<Article, 'id' | 'readingCount' | 'created_at' | 'updated_at'>
): Promise<Article | null> {
  try {
    // 导入短ID生成函数
    const { generateShortId } = await import('./short-id')
    const shortId = generateShortId()

    const insertData = {
      ...articleToDbInsert(article),
      short_id: shortId,
    }

    const { data, error } = await supabase
      .from('articles')
      .insert(insertData)
      .select('*')
      .single()

    if (error) {
      if (error.code === '42P01') {
        if (typeof window !== 'undefined') {
          console.error('表不存在，请在Supabase控制台创建: articles')
        }
        return null
      }
      console.error('Error creating article:', error)
      return null
    }

    if (data) {
      return mapArticleRow(data as Record<string, unknown>)
    }

    return null
  } catch (error) {
    console.error('Error creating article:', error)
    return null
  }
}

/**
 * 更新文章
 */
export async function updateArticle(
  id: string,
  updates: Partial<Article>
): Promise<Article | null> {
  try {
    const dbUpdates = articleToDbUpdate(updates)

    const { data, error } = await supabase
      .from('articles')
      .update(dbUpdates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      if (error.code === '42P01') {
        if (typeof window !== 'undefined') {
          console.error('表不存在，请在Supabase控制台创建: articles')
        }
        return null
      }
      console.error('Error updating article:', error)
      return null
    }

    if (data) {
      return mapArticleRow(data as Record<string, unknown>)
    }

    return null
  } catch (error) {
    console.error('Error updating article:', error)
    return null
  }
}

/**
 * 删除文章
 */
export async function deleteArticle(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('articles').delete().eq('id', id)

    if (error) {
      if (error.code === '42P01') {
        if (typeof window !== 'undefined') {
          console.error('表不存在，请在Supabase控制台创建: articles')
        }
        return false
      }
      console.error('Error deleting article:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error deleting article:', error)
    return false
  }
}

/**
 * 增加文章阅读量（原子更新）
 */
export async function incrementReadingCount(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('increment_reading_count', { article_id: id })
    if (error) {
      // RPC 不存在或调用失败：阅读量计数可以略过，不使用非原子 fallback
      console.warn('[articles] increment_reading_count RPC 不可用，跳过计数:', error.message)
      return false
    }
    return true
  } catch {
    return false
  }
}

// ========================
// 查询单个文章
// ========================

/**
 * 根据 slug 或 id 获取文章
 * UUID 格式 -> id 查询
 * 其他格式 -> short_id 查询
 */
export async function getArticleBySlugOrId(slug: string): Promise<Article | null> {
  const s = slug.trim()
  if (!s) return null
  if (isArticleUuid(s)) return getArticleById(s)
  return getArticleByShortId(s)
}

/**
 * 根据 ID 获取文章
 */
export async function getArticleById(id: string): Promise<Article | null> {
  try {
    const { data, error } = await supabase.from('articles').select('*').eq('id', id).single()

    if (error) {
      if (!isSupabaseNoRow(error)) {
        console.error('Error fetching article by id:', error.message || error.code || error)
      }
      return null
    }

    if (data) {
      return mapArticleRow(data as Record<string, unknown>)
    }

    return null
  } catch (error) {
    console.error('Error fetching article by id:', error)
    return null
  }
}

/**
 * 根据 short_id 获取文章
 */
export async function getArticleByShortId(shortId: string): Promise<Article | null> {
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('short_id', shortId)
      .single()

    if (error) {
      if (!isSupabaseNoRow(error)) {
        console.error('Error fetching article by short id:', error.message || error.code || error)
      }
      return null
    }

    if (data) {
      return mapArticleRow(data as Record<string, unknown>)
    }

    return null
  } catch (error) {
    console.error('Error fetching article by short id:', error)
    return null
  }
}

// ========================
// 导出类型（向后兼容）
// ========================

// 保留旧接口的别名以保持向后兼容
export type { Article as ArticleData, Category as CategoryData }
