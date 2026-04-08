import { supabase } from './supabase'
import { isArticleUuid } from './short-id'

// 文章数据管理
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
  /** 外链 HTML 文件的 URL（上传到 Supabase Storage article-htmls 桶） */
  html_url?: string | null
  /** 前端显示/下载用的原始文件名 */
  html_original_name?: string | null
  is_review?: boolean  // 是否为每日复盘文章
}

export interface Category {
  id: string
  name: string
  icon: string
  description: string
  href: string
  parentId?: string // 父分类ID，支持分级分类
  children?: Category[] // 子分类
}

// 分类数据 - 不再使用硬编码，从数据库读取

// 初始化分类表
export async function initCategoriesTable() {
  try {
    // 尝试获取分类列表，测试连接
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .limit(1)

    if (error && error.code === '42P01') {
      // 表不存在，需要在Supabase控制台手动创建表
      console.error('Categories table does not exist. Please create it in Supabase console with the following schema:');
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
        
        CREATE OR REPLACE FUNCTION update_categories_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        
        CREATE OR REPLACE TRIGGER update_categories_updated_at
        BEFORE UPDATE ON categories
        FOR EACH ROW
        EXECUTE FUNCTION update_categories_updated_at();
      `);
    } else if (error) {
      console.error('Error initializing categories table:', error);
    }
  } catch (error) {
    console.error('Error in initCategoriesTable:', error);
  }
}

// 获取所有分类
export async function getAllCategories(): Promise<Category[]> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching categories:', error)
      return [] // 返回空数组
    }

    if (data && data.length > 0) {
      // 转换返回的数据格式并构建树形结构
      const categories = data.map((item) => ({
        id: item.id,
        name: item.name,
        icon: item.icon,
        description: item.description,
        href: item.href,
        parentId: item.parent_id
      }))
      
      // 构建树形结构
      const buildTree = (categories: Category[], parentId?: string): Category[] => {
        return categories
          .filter(cat => (cat.parentId === parentId) || (parentId === undefined && cat.parentId === null))
          .map(cat => ({
            ...cat,
            children: buildTree(categories, cat.id)
          }))
      }
      
      return buildTree(categories)
    }

    return []
  } catch (error) {
    console.error('Error fetching categories:', error)
    return []
  }
}

// 创建分类
export async function createCategory(category: Omit<Category, 'id' | 'children'>): Promise<Category | null> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .insert({
        name: category.name,
        icon: category.icon,
        description: category.description,
        href: category.href,
        parent_id: category.parentId
      })
      .select('*')
      .single()

    if (error) {
      console.error('Error creating category:', error)
      // 如果表不存在，显示弹窗提示
      if (error.code === '42P01') {
        if (typeof window !== 'undefined') {
          console.error('表不存在，请在Supabase控制台创建: categories');
        }
        return null
      }
      return null
    }

    if (data) {
      return {
        id: data.id,
        name: data.name,
        icon: data.icon,
        description: data.description,
        href: data.href,
        parentId: data.parent_id
      }
    }

    return null
  } catch (error) {
    console.error('Error creating category:', error)
    // 如果表不存在，显示弹窗提示
    if (typeof window !== 'undefined') {
        console.error('表不存在，请在Supabase控制台创建: categories');
    }
    return null
  }
}

// 更新分类
export async function updateCategory(id: string, updates: Partial<Category>): Promise<Category | null> {
  try {
    const dbUpdates: any = {}
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
      console.error('Error updating category:', error)
      // 如果表不存在，显示弹窗提示
      if (error.code === '42P01') {
        if (typeof window !== 'undefined') {
          console.error('表不存在，请在Supabase控制台创建: categories');
        }
        return null
      }
      return null
    }

    if (data) {
      return {
        id: data.id,
        name: data.name,
        icon: data.icon,
        description: data.description,
        href: data.href,
        parentId: data.parent_id
      }
    }

    return null
  } catch (error) {
    console.error('Error updating category:', error)
    // 如果表不存在，显示弹窗提示
    if (typeof window !== 'undefined') {
        console.error('表不存在，请在Supabase控制台创建: categories');
    }
    return null
  }
}

// 删除分类
export async function deleteCategory(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting category:', error)
      // 如果表不存在，显示弹窗提示
      if (error.code === '42P01') {
        if (typeof window !== 'undefined') {
          console.error('表不存在，请在Supabase控制台创建: categories');
        }
        return false
      }
      return false
    }

    return true
  } catch (error) {
    console.error('Error deleting category:', error)
    // 如果表不存在，显示弹窗提示
    if (typeof window !== 'undefined') {
        console.error('表不存在，请在Supabase控制台创建: categories');
    }
    return false
  }
}

// 初始化文章表
export async function initArticlesTable() {
  try {
    // 尝试获取文章列表，测试连接
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .limit(1)

    if (error && error.code === '42P01') {
      // 表不存在，需要在Supabase控制台手动创建表
      console.error('Articles table does not exist. Please create it in Supabase console with the following schema:');
      console.error(`
        CREATE TABLE articles (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          category TEXT NOT NULL,
          subcategory TEXT,
          author TEXT NOT NULL,
          publishDate DATE NOT NULL,
          readingCount INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        
        CREATE OR REPLACE TRIGGER update_articles_updated_at
        BEFORE UPDATE ON articles
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
      `);
    } else if (error) {
      console.error('Error initializing articles table:', error);
    }
  } catch (error) {
    console.error('Error in initArticlesTable:', error);
  }
}



// 获取所有文章
export async function getAllArticles(): Promise<Article[]> {
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching articles:', error)
      return []
    }

    // 转换返回的数据格式
    return (data || []).map((item) => ({
      id: item.id,
      short_id: item.short_id,
      title: item.title,
      content: item.content,
      category: item.category,
      subcategory: item.subcategory,
      author: item.author,
      publishDate: item.publishdate || item.publishDate || '',
      readingCount: Number(item.readingcount ?? item.readingCount ?? 0),
      created_at: item.created_at,
      updated_at: item.updated_at,
      pdf_url: item.pdf_url,
      pdf_original_name: item.pdf_original_name,
      html_url: item.html_url,
      html_original_name: item.html_original_name,
      is_review: item.is_review,
    }))
  } catch (error) {
    console.error('Error fetching articles:', error)
    return []
  }
}

// 根据分类获取文章，包括子分类下的文章
export async function getArticlesByCategory(category: string): Promise<Article[]> {
  try {
    // 首先获取所有分类，构建分类树
    const { data: categoriesData, error: categoriesError } = await supabase
      .from('categories')
      .select('*')

    if (categoriesError) {
      console.error('Error fetching categories:', categoriesError)
      return []
    }

    // 构建分类映射，用于查找分类信息
    const categoryMap: Record<string, { name: string; parentId?: string }> = {}
    const nameToIdMap: Record<string, string> = {}
    
    // 递归构建分类映射（兼容 Supabase 扁平行与带 children 的树）
    const buildCategoryMap = (categories: any[]) => {
      if (!Array.isArray(categories)) return
      for (const cat of categories) {
        if (!cat?.id) continue
        categoryMap[cat.id] = {
          name: cat.name ?? "",
          parentId: cat.parent_id ?? cat.parentId,
        }
        if (cat.name) nameToIdMap[cat.name] = cat.id
        if (Array.isArray(cat.children) && cat.children.length > 0) {
          buildCategoryMap(cat.children)
        }
      }
    }

    buildCategoryMap(categoriesData || [])

    // 获取所有文章
    const { data: allArticles, error: articlesError } = await supabase
      .from('articles')
      .select('*')
      .order('created_at', { ascending: false })

    if (articlesError) {
      console.error('Error fetching articles:', articlesError)
      return []
    }

    // 过滤出属于目标分类或其子分类的文章
    const filteredArticles = (allArticles || []).filter(article => {
      if (article.category === category) return true

      let currentCategoryName = article.category
      while (currentCategoryName) {
        const categoryId = nameToIdMap[currentCategoryName]
        if (!categoryId) break
        const categoryInfo = categoryMap[categoryId]
        if (!categoryInfo) break
        let parentId = categoryInfo.parentId
        while (parentId) {
          const parentInfo = categoryMap[parentId]
          if (!parentInfo) break
          if (parentInfo.name === category) return true
          parentId = parentInfo.parentId
        }
        break
      }
      return false
    })

    return filteredArticles.map((item) => ({
      id: item.id,
      short_id: item.short_id,
      title: item.title,
      content: item.content,
      category: item.category,
      subcategory: item.subcategory,
      author: item.author,
      publishDate: item.publishdate || item.publishDate || '',
      readingCount: Number(item.readingcount ?? item.readingCount ?? 0),
      created_at: item.created_at,
      updated_at: item.updated_at,
      pdf_url: item.pdf_url,
      pdf_original_name: item.pdf_original_name,
      html_url: item.html_url,
      html_original_name: item.html_original_name,
      is_review: item.is_review,
    }))
  } catch (error) {
    console.error('Error fetching articles by category:', error)
    return []
  }
}

// 创建新文章
export async function createArticle(article: Omit<Article, 'id' | 'readingCount' | 'created_at' | 'updated_at'>): Promise<Article | null> {
  try {
    // 导入短ID生成函数
    const { generateShortId } = await import('./short-id')
    const shortId = generateShortId()

    const { data, error } = await supabase
      .from('articles')
      .insert({
        title: article.title,
        content: article.content,
        category: article.category,
        subcategory: article.subcategory,
        author: article.author,
        publishdate: article.publishDate,
        readingcount: 0,
        short_id: shortId,
        pdf_url: (article as any).pdf_url,
        pdf_original_name: (article as any).pdf_original_name,
        html_url: (article as any).html_url,
        html_original_name: (article as any).html_original_name,
        is_review: (article as any).is_review ?? false,
      })
      .select('*')
      .single()

    if (error) {
      console.error('Error creating article:', error)
      // 如果表不存在，显示弹窗提示
      if (error.code === '42P01') {
        if (typeof window !== 'undefined') {
          console.error('表不存在，请在Supabase控制台创建: articles');
        }
        return null
      }
      return null
    }

    // 转换返回的数据格式
    if (data) {
      return {
        id: data.id,
        short_id: data.short_id,
        title: data.title,
        content: data.content,
        category: data.category,
        subcategory: data.subcategory,
        author: data.author,
        publishDate: data.publishdate || data.publishDate,
        readingCount: data.readingcount || data.readingCount,
        created_at: data.created_at,
        updated_at: data.updated_at,
        pdf_url: data.pdf_url
      } as Article
    }

    return null
  } catch (error) {
    console.error('Error creating article:', error)
    // 如果表不存在，显示弹窗提示
    if (typeof window !== 'undefined') {
        console.error('表不存在，请在Supabase控制台创建: articles');
    }
    return null
  }
}

// 更新文章
export async function updateArticle(id: string, updates: Partial<Article>): Promise<Article | null> {
  try {
    // 转换更新数据格式
    const dbUpdates: any = {}
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

    const { data, error } = await supabase
      .from('articles')
      .update(dbUpdates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('Error updating article:', error)
      // 如果表不存在，显示弹窗提示
      if (error.code === '42P01') {
        if (typeof window !== 'undefined') {
          console.error('表不存在，请在Supabase控制台创建: articles');
        }
        return null
      }
      return null
    }

    // 转换返回的数据格式
    if (data) {
      return {
        id: data.id,
        short_id: data.short_id,
        title: data.title,
        content: data.content,
        category: data.category,
        subcategory: data.subcategory,
        author: data.author,
        publishDate: data.publishdate || data.publishDate,
        readingCount: data.readingcount || data.readingCount,
        created_at: data.created_at,
        updated_at: data.updated_at,
        pdf_url: data.pdf_url
      } as Article
    }

    return null
  } catch (error) {
    console.error('Error updating article:', error)
    // 如果表不存在，显示弹窗提示
    if (typeof window !== 'undefined') {
        console.error('表不存在，请在Supabase控制台创建: articles');
    }
    return null
  }
}

// 删除文章
export async function deleteArticle(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('articles')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting article:', error)
      // 如果表不存在，显示弹窗提示
      if (error.code === '42P01') {
        if (typeof window !== 'undefined') {
          console.error('表不存在，请在Supabase控制台创建: articles');
        }
        return false
      }
      return false
    }

    return true
  } catch (error) {
    console.error('Error deleting article:', error)
    // 如果表不存在，显示弹窗提示
    if (typeof window !== 'undefined') {
        console.error('表不存在，请在Supabase控制台创建: articles');
    }
    return false
  }
}

// 增加阅读量（原子更新，避免竞态）
export async function incrementReadingCount(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('increment_reading_count', { article_id: id })
    if (error) {
      // 若 RPC 未定义，fallback 到 select→update 方案
      const { data, error: fetchError } = await supabase
        .from('articles')
        .select('readingcount')
        .eq('id', id)
        .single()

      if (fetchError || !data) return false
      const { error: updateError } = await supabase
        .from('articles')
        .update({ readingcount: (Number(data.readingcount) || 0) + 1 })
        .eq('id', id)
      return !updateError
    }
    return true
  } catch {
    return false
  }
}

function isSupabaseNoRow(err: { code?: string } | null): boolean {
  return err?.code === 'PGRST116'
}

// 根据 URL 片段解析文章：UUID → id；否则一律按 short_id 查（避免误判导致走 id 查询报错）
export async function getArticleBySlugOrId(slug: string): Promise<Article | null> {
  const s = slug.trim()
  if (!s) return null
  if (isArticleUuid(s)) return getArticleById(s)
  return getArticleByShortId(s)
}

// 根据ID获取文章
export async function getArticleById(id: string): Promise<Article | null> {
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (!isSupabaseNoRow(error)) {
        console.error('Error fetching article by id:', error.message || error.code || error)
      }
      return null
    }

    // 转换返回的数据格式
    if (data) {
      return {
        id: data.id,
        short_id: data.short_id,
        title: data.title,
        content: data.content,
        category: data.category,
        subcategory: data.subcategory,
        author: data.author,
        publishDate: data.publishdate || data.publishDate || '',
        readingCount: Number(data.readingcount ?? data.readingCount ?? 0),
        created_at: data.created_at,
        updated_at: data.updated_at,
        pdf_url: data.pdf_url,
        pdf_original_name: data.pdf_original_name,
        html_url: data.html_url,
        html_original_name: data.html_original_name,
        is_review: data.is_review,
      } as Article
    }

    return null
  } catch (error) {
    console.error('Error fetching article by id:', error)
    return null
  }
}

// 根据短ID获取文章
export async function getArticleByShortId(shortId: string): Promise<Article | null> {
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('short_id', shortId)
      .single()

    if (error) {
      if (!isSupabaseNoRow(error)) {
        console.error(
          'Error fetching article by short id:',
          error.message || error.code || error
        )
      }
      return null
    }

    // 转换返回的数据格式
    if (data) {
      return {
        id: data.id,
        short_id: data.short_id,
        title: data.title,
        content: data.content,
        category: data.category,
        subcategory: data.subcategory,
        author: data.author,
        publishDate: data.publishdate || data.publishDate || '',
        readingCount: Number(data.readingcount ?? data.readingCount ?? 0),
        created_at: data.created_at,
        updated_at: data.updated_at,
        pdf_url: data.pdf_url,
        pdf_original_name: data.pdf_original_name,
        html_url: data.html_url,
        html_original_name: data.html_original_name,
        is_review: data.is_review,
      } as Article
    }

    return null
  } catch (error) {
    console.error('Error fetching article by short id:', error)
    return null
  }
}
