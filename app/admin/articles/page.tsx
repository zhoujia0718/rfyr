'use client'

import * as React from 'react'
import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronRight, Plus, FileText, Trash2, Save, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Category, Article } from '@/lib/articles'
import { toast } from 'sonner'

import RichEditor from '@/components/admin/RichEditor'

function ArticlesManagePageContent() {
  const searchParams = useSearchParams()
  const articleId = searchParams.get('id')
  
  const [articles, setArticles] = React.useState<Article[]>([])
  const [categories, setCategories] = React.useState<Category[]>([])
  const [selectedArticle, setSelectedArticle] = React.useState<Article | null>(null)
  const [isNewArticle, setIsNewArticle] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [selectedCategory, setSelectedCategory] = React.useState("all")
  const [showDeleteButtons, setShowDeleteButtons] = React.useState<Record<string, boolean>>({})
  
  const [formData, setFormData] = React.useState({
    title: "",
    content: "",
    category: "",
    subcategory: "",
    author: "",
    publishDate: new Date().toISOString().split('T')[0],
    pdfUrl: "",
    pdfOriginalName: "",
    htmlUrl: "",
    htmlOriginalName: "",
  })

  React.useEffect(() => {
    loadData()
  }, [])

  React.useEffect(() => {
    if (selectedCategory === "all") {
      loadData()
    } else {
      filterArticlesByCategory(selectedCategory)
    }
  }, [selectedCategory])

  // 当分类数据加载完成且有 articleId 参数时，自动选择文章
  React.useEffect(() => {
    const selectArticleById = async () => {
      if (articleId && categories.length > 0) {
        // 获取文章数据
        const { data: articleData } = await supabase
          .from('articles')
          .select('*')
          .eq('id', articleId)
          .single()
        
        if (articleData) {
          handleSelectArticle(articleData)
        }
      }
    }
    
    selectArticleById()
  }, [articleId, categories])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // 检查 supabase 是否可用
      if (!supabase) {
        console.error('Supabase client is not initialized')
        toast.error('数据库连接失败')
        setArticles([])
        setCategories([])
        return
      }
      
      const { data: articlesData, error: articlesError } = await supabase
        .from('articles')
        .select('*')
        .order('created_at', { ascending: false })
      
      // 更健壮的错误处理：检查 error 是否存在
      if (articlesError) {
        console.error('Error fetching articles:', articlesError)
        toast.error('获取文章列表失败')
      } else {
        // 转换返回的数据格式
        const formattedArticles = (articlesData || []).map((item) => ({
          id: item.id,
          short_id: item.short_id,
          title: item.title,
          content: item.content,
          category: item.category,
          subcategory: item.subcategory,
          author: item.author,
          publishDate: item.publishdate || item.publishDate,
          readingCount: item.readingcount || item.readingCount,
          created_at: item.created_at,
          updated_at: item.updated_at,
          pdf_url: item.pdf_url,
          pdf_original_name: item.pdf_original_name,
        }))
        setArticles(formattedArticles)
      }
      
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
        .select('*')
        .order('created_at', { ascending: true })
      
      // 更健壮的错误处理：检查 error 是否存在
      if (categoriesError) {
        console.error('Error fetching categories:', categoriesError)
        toast.error('获取分类列表失败')
      } else {
        const buildTree = (items: any[], parentId?: string): Category[] => {
          return items
            .filter(item => (item.parent_id === parentId) || (parentId === undefined && item.parent_id === null))
            .map(item => ({
              id: item.id,
              name: item.name,
              icon: item.icon,
              description: item.description,
              href: item.href,
              parentId: item.parent_id,
              children: buildTree(items, item.id)
            }))
        }
        setCategories(buildTree(categoriesData || []))
      }
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  const filterArticlesByCategory = async (categoryId: string) => {
    try {
      setLoading(true)
      
      // 防御性检查：如果 categoryId 为空或未定义，直接获取所有文章
      if (!categoryId || categoryId === 'all') {
        await loadData()
        return
      }
      
      // 根据分类ID找到对应的分类名称
      const categoryName = getCategoryName(categories, categoryId)
      if (!categoryName) {
        setArticles([])
        return
      }
      
      // 检查 supabase 是否可用
      if (!supabase) {
        console.error('Supabase client is not initialized')
        toast.error('数据库连接失败')
        setArticles([])
        return
      }
      
      const { data: articlesData, error: articlesError } = await supabase
        .from('articles')
        .select('*')
        .eq('category', categoryName)
        .order('created_at', { ascending: false })
      
      // 更健壮的错误处理：检查 error 是否存在
      if (articlesError) {
        console.error('Error fetching articles by category:', articlesError)
        toast.error('获取分类文章失败')
      } else {
        setArticles(articlesData || [])
      }
    } catch (error) {
      console.error('Error filtering articles:', error)
      toast.error('筛选文章失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectArticle = (article: Article) => {
    setSelectedArticle(article)
    setIsNewArticle(false)
    // 根据分类名称获取分类 ID
    const categoryId = article.category ? getCategoryId(categories, article.category) : ""
    setFormData({
      title: article.title,
      content: article.content || "",
      category: categoryId || article.category || "",
      subcategory: article.subcategory || "",
      author: article.author,
      publishDate: article.publishDate,
      pdfUrl: (article as any).pdf_url || "",
      pdfOriginalName: (article as any).pdf_original_name || "",
      htmlUrl: (article as any).html_url || "",
      htmlOriginalName: (article as any).html_original_name || "",
    })
  }

  const handleNewArticle = () => {
    setSelectedArticle(null)
    setIsNewArticle(true)
    setFormData({
      title: "",
      content: "",
      category: "",
      subcategory: "",
      author: "",
      publishDate: new Date().toISOString().split('T')[0],
      pdfUrl: "",
      pdfOriginalName: "",
      htmlUrl: "",
      htmlOriginalName: "",
    })
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const renderCategoryOptions = (categories: Category[], prefix = '') => {
    return categories.map(category => (
      <React.Fragment key={category.id}>
        <SelectItem value={category.id}>{prefix}{category.icon} {category.name}</SelectItem>
        {category.children && category.children.length > 0 && (
          renderCategoryOptions(category.children, prefix + '  └ ')
        )}
      </React.Fragment>
    ))
  }

  const getCategoryName = (categories: Category[], categoryId: string): string => {
    for (const category of categories) {
      if (category.id === categoryId) {
        return category.name
      }
      if (category.children && category.children.length > 0) {
        const name = getCategoryName(category.children, categoryId)
        if (name) return name
      }
    }
    return ''
  }

  // 根据分类名称获取分类 ID
  const getCategoryId = (categories: Category[], categoryName: string): string => {
    for (const category of categories) {
      if (category.name === categoryName) {
        return category.id
      }
      if (category.children && category.children.length > 0) {
        const id = getCategoryId(category.children, categoryName)
        if (id) return id
      }
    }
    return ''
  }

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast.error('请输入文章标题')
      return
    }

    try {
      setSaving(true)

      if (isNewArticle) {
        // 根据分类 ID 获取分类名称
        let categoryName = formData.category
        if (formData.category) {
          // 尝试从分类树中获取名称
          const foundName = getCategoryName(categories, formData.category)
          if (foundName) {
            categoryName = foundName
          } else {
            // 如果找不到，尝试从数据库直接查询
            try {
              const { data: categoryData } = await supabase
                .from('categories')
                .select('name')
                .eq('id', formData.category)
                .single()
              if (categoryData?.name) {
                categoryName = categoryData.name
              }
            } catch (error) {
              console.error('Error fetching category name:', error)
            }
          }
        }
        // 构建插入数据
        const insertData: any = {
          title: formData.title,
          content: formData.pdfUrl && formData.pdfUrl.trim() !== '' ? "" : formData.content,
          category: categoryName,
          author: formData.author,
          publishdate: formData.publishDate,
          pdf_url: formData.pdfUrl && formData.pdfUrl.trim() !== '' ? formData.pdfUrl : null,
          // 用于前端展示“上传时的原始文件名”
          pdf_original_name:
            formData.pdfUrl && formData.pdfUrl.trim() !== ''
              ? formData.pdfOriginalName?.trim() || null
              : null,
          html_url: null,
          html_original_name: null,
        }
        
        // 只有当 subcategory 有值时才包含该字段
        if (formData.subcategory && formData.subcategory.trim()) {
          insertData.subcategory = formData.subcategory
        }
        
        const { data, error } = await supabase
          .from('articles')
          .insert(insertData)
          .select('*')
          .single()
        
        if (error) {
          const errAny = error as any
          const errMsg = String(errAny?.message || '')
          const isMissingPdfOriginalNameColumn =
            errAny?.code === 'PGRST204' && errMsg.includes('pdf_original_name')

          // 如果列还没加到数据库，就不让创建文章彻底失败
          if (isMissingPdfOriginalNameColumn) {
            console.warn('pdf_original_name 列不存在，重试不写入文件名字段')
            toast.warning('已创建文章，但暂时无法保存文件名（请先添加 pdf_original_name 字段）')

            const retryInsertData = { ...insertData }
            delete retryInsertData.pdf_original_name

            const { data: retryData, error: retryError } = await supabase
              .from('articles')
              .insert(retryInsertData)
              .select('*')
              .single()

            if (retryError) {
              console.error('Supabase 错误(重试后):', retryError)
              toast.error('创建文章失败')
              return
            }

            if (retryData) {
              const formattedData = {
                id: retryData.id,
                short_id: retryData.short_id,
                title: retryData.title,
                content: retryData.content,
                category: retryData.category,
                subcategory: retryData.subcategory,
                author: retryData.author,
                publishDate: retryData.publishdate || retryData.publishDate,
                readingCount: retryData.readingcount || retryData.readingCount,
                created_at: retryData.created_at,
                updated_at: retryData.updated_at,
                pdf_url: retryData.pdf_url,
                pdf_original_name: (retryData as any).pdf_original_name,
                html_url: (retryData as any).html_url,
                html_original_name: (retryData as any).html_original_name,
              }
              setArticles(prev => [formattedData, ...prev])
              setSelectedArticle(formattedData)
              setIsNewArticle(false)
              window.location.reload()
            }
          } else {
            console.error('Supabase 错误:', error)
            toast.error('创建文章失败')
          }
        } else if (data) {
          toast.success('创建文章成功')
          // 格式化返回的数据
          const formattedData = {
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
            pdf_url: data.pdf_url,
            pdf_original_name: data.pdf_original_name,
            html_url: (data as any).html_url,
            html_original_name: (data as any).html_original_name,
          }
          setArticles(prev => [formattedData, ...prev])
          setSelectedArticle(formattedData)
          setIsNewArticle(false)
          // 强制刷新页面数据
          window.location.reload()
        }
      } else if (selectedArticle) {
        // 根据分类 ID 获取分类名称
        let categoryName = formData.category
        if (formData.category) {
          // 尝试从分类树中获取名称
          const foundName = getCategoryName(categories, formData.category)
          if (foundName) {
            categoryName = foundName
          } else {
            // 如果找不到，尝试从数据库直接查询
            try {
              const { data: categoryData } = await supabase
                .from('categories')
                .select('name')
                .eq('id', formData.category)
                .single()
              if (categoryData?.name) {
                categoryName = categoryData.name
              }
            } catch (error) {
              console.error('Error fetching category name:', error)
            }
          }
        }
        // 构建更新数据，只在有值时包含 subcategory 字段
        const updateData: any = {
          title: formData.title,
          content: formData.pdfUrl && formData.pdfUrl.trim() !== '' ? "" : formData.content,
          category: categoryName,
          author: formData.author,
          publishdate: formData.publishDate,
          pdf_url: formData.pdfUrl && formData.pdfUrl.trim() !== '' ? formData.pdfUrl : null,
          // 用于前端展示“上传时的原始文件名”
          pdf_original_name:
            formData.pdfUrl && formData.pdfUrl.trim() !== ''
              ? formData.pdfOriginalName?.trim() || null
              : null,
          html_url: formData.htmlUrl && formData.htmlUrl.trim() !== '' ? formData.htmlUrl : null,
          html_original_name:
            formData.htmlUrl && formData.htmlUrl.trim() !== ''
              ? formData.htmlOriginalName?.trim() || null
              : null,
        }
        
        // 只有当 subcategory 有值时才包含该字段
        if (formData.subcategory && formData.subcategory.trim()) {
          updateData.subcategory = formData.subcategory
        }
        
        const { error } = await supabase
          .from('articles')
          .update(updateData)
          .eq('id', selectedArticle.id)
        
        if (error) {
          const errAny = error as any
          const errMsg = String(errAny?.message || '')
          const isMissingPdfOriginalNameColumn =
            errAny?.code === 'PGRST204' && errMsg.includes('pdf_original_name')

          if (isMissingPdfOriginalNameColumn) {
            console.warn('pdf_original_name 列不存在，重试不写入文件名字段')
            toast.warning('已更新文章，但暂时无法保存文件名（请先添加 pdf_original_name 字段）')

            const retryUpdateData = { ...updateData }
            delete retryUpdateData.pdf_original_name

            const { error: retryError } = await supabase
              .from('articles')
              .update(retryUpdateData)
              .eq('id', selectedArticle.id)

            if (retryError) {
              console.error('Supabase 错误(重试后):', retryError)
              toast.error('更新文章失败')
              return
            }

            // 更新 articles/state：文件名先置空，等字段补齐后再显示
            setArticles(prev => prev.map(a =>
              a.id === selectedArticle.id
                ? {
                    ...a,
                    title: formData.title,
                    content: formData.pdfUrl && formData.pdfUrl.trim() !== '' ? "" : formData.content,
                    category: categoryName,
                    subcategory: formData.subcategory,
                    author: formData.author,
                    publishDate: formData.publishDate,
                    pdf_url: formData.pdfUrl && formData.pdfUrl.trim() !== '' ? formData.pdfUrl : null,
                    pdf_original_name: null,
                    html_url: null,
                    html_original_name: null,
                  }
                : a
            ))
            setSelectedArticle(prev => prev ? {
              ...prev,
              title: formData.title,
              content: formData.pdfUrl && formData.pdfUrl.trim() !== '' ? "" : formData.content,
              category: categoryName,
              subcategory: formData.subcategory,
              author: formData.author,
              publishDate: formData.publishDate,
              pdf_url: formData.pdfUrl && formData.pdfUrl.trim() !== '' ? formData.pdfUrl : null,
              pdf_original_name: null,
              html_url: null,
              html_original_name: null,
            } : null)
          } else {
            console.error('Supabase 错误:', error)
            toast.error('更新文章失败')
          }
        } else {
          toast.success('更新文章成功')
          // 更新articles状态
          setArticles(prev => prev.map(a => 
            a.id === selectedArticle.id 
              ? { 
                  ...a, 
                  title: formData.title, 
                  content: formData.pdfUrl && formData.pdfUrl.trim() !== '' ? "" : formData.content, 
                  category: categoryName, 
                  subcategory: formData.subcategory, 
                  author: formData.author, 
                  publishDate: formData.publishDate, 
                  pdf_url: formData.pdfUrl && formData.pdfUrl.trim() !== '' ? formData.pdfUrl : null,
                  pdf_original_name:
                    formData.pdfUrl && formData.pdfUrl.trim() !== ''
                      ? formData.pdfOriginalName?.trim() || null
                      : null,
                  html_url: formData.htmlUrl && formData.htmlUrl.trim() !== '' ? formData.htmlUrl : null,
                  html_original_name:
                    formData.htmlUrl && formData.htmlUrl.trim() !== ''
                      ? formData.htmlOriginalName?.trim() || null
                      : null,
                }
              : a
          ))
          // 更新selectedArticle状态，保持页面不刷新
          setSelectedArticle(prev => prev ? {
            ...prev,
            title: formData.title,
            content: formData.pdfUrl && formData.pdfUrl.trim() !== '' ? "" : formData.content,
            category: categoryName,
            subcategory: formData.subcategory,
            author: formData.author,
            publishDate: formData.publishDate,
            pdf_url: formData.pdfUrl && formData.pdfUrl.trim() !== '' ? formData.pdfUrl : null,
            pdf_original_name:
              formData.pdfUrl && formData.pdfUrl.trim() !== ''
                ? formData.pdfOriginalName?.trim() || null
                : null,
            html_url: formData.htmlUrl && formData.htmlUrl.trim() !== '' ? formData.htmlUrl : null,
            html_original_name:
              formData.htmlUrl && formData.htmlUrl.trim() !== ''
                ? formData.htmlOriginalName?.trim() || null
                : null,
          } : null)
          // 不再强制刷新页面，避免文件名重置
          // window.location.reload()
        }
      }
    } catch (error) {
      console.error('Error saving article:', error)
      toast.error('保存文章失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (article: Article) => {
    if (!confirm(`确定要删除文章"${article.title}"吗？`)) return
    
    try {
      const { error } = await supabase
        .from('articles')
        .delete()
        .eq('id', article.id)
      
      if (error) {
        console.error('Error deleting article:', error)
        toast.error('删除文章失败')
      } else {
        toast.success('删除文章成功')
        setArticles(prev => prev.filter(a => a.id !== article.id))
        // 移除被删除文章的删除按钮状态
        setShowDeleteButtons(prev => {
          const newState = { ...prev }
          delete newState[article.id]
          return newState
        })
        if (selectedArticle?.id === article.id) {
          setSelectedArticle(null)
          setIsNewArticle(false)
        }
      }
    } catch (error) {
      console.error('Error deleting article:', error)
      toast.error('删除文章失败')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2 text-primary hover:text-primary/80">
            <ChevronRight className="h-5 w-5 rotate-180" />
            <span>返回管理中心</span>
          </Link>
          <h1 className="text-xl font-bold">文章管理</h1>
          <Button onClick={handleNewArticle} className="bg-primary hover:bg-primary/90 text-white">
            <Plus className="mr-2 h-4 w-4" />
            新建文章
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-12 gap-6 h-[calc(100vh-140px)]">
          <div className="col-span-3">
            <Card className="h-full overflow-hidden flex flex-col border border-gray-200 shadow-sm">
              <CardHeader className="py-4 bg-gray-50 border-b border-gray-200">
                <CardTitle className="text-lg font-semibold">文章列表</CardTitle>
                <CardDescription>点击选择要编辑的文章</CardDescription>
                <div className="mt-4">
                  <Label htmlFor="category-filter" className="text-sm font-medium mb-2 block flex items-center gap-2 text-gray-700">
                    <Filter className="h-3 w-3 text-gray-500" />
                    按分类筛选
                  </Label>
                  <Select
                    value={selectedCategory}
                    onValueChange={setSelectedCategory}
                  >
                    <SelectTrigger id="category-filter" className="border-gray-300 focus:border-primary focus:ring-primary">
                      <SelectValue placeholder="选择分类" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部文章</SelectItem>
                      {renderCategoryOptions(categories)}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-0">
                {loading ? (
                  <div className="p-4 space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-16 bg-gray-100 rounded animate-pulse"></div>
                    ))}
                  </div>
                ) : articles.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {articles.map((article) => (
                      <div
                        key={article.id}
                        className={`p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                          selectedArticle?.id === article.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                        }`}
                        onClick={() => handleSelectArticle(article)}
                        onDoubleClick={() => setShowDeleteButtons(prev => ({
                          ...prev,
                          [article.id]: true
                        }))}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                              <span className="font-medium truncate text-gray-800">{article.title}</span>
                            </div>
                          </div>
                          {showDeleteButtons[article.id] && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDelete(article)
                                  setShowDeleteButtons(prev => ({
                                    ...prev,
                                    [article.id]: false
                                  }))
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p className="mb-2">暂无文章</p>
                    <p className="text-sm">点击右上角"新建文章"开始创作</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="col-span-9">
            <Card className="h-full overflow-hidden flex flex-col border border-gray-200 shadow-sm max-w-4xl mx-auto">
              <CardHeader className="py-4 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold">
                    {isNewArticle ? '新建文章' : selectedArticle ? '编辑文章' : '请选择或新建文章'}
                  </CardTitle>
                  {(isNewArticle || selectedArticle) && (
                    <Button 
                      onClick={handleSave} 
                      disabled={saving}
                      className="bg-primary hover:bg-primary/90 text-white"
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {saving ? '保存中...' : '保存'}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-6">
                {(isNewArticle || selectedArticle) ? (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="title" className="text-sm font-medium text-gray-700">标题</Label>
                      <Input
                        id="title"
                        name="title"
                        value={formData.title}
                        onChange={handleChange}
                        placeholder="输入文章标题"
                        className="border-gray-300 focus:border-primary focus:ring-primary"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="category" className="text-sm font-medium text-gray-700">分类</Label>
                        <Select
                          value={formData.category}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                        >
                          <SelectTrigger className="border-gray-300 focus:border-primary focus:ring-primary">
                            <SelectValue placeholder="选择分类" />
                          </SelectTrigger>
                          <SelectContent>
                            {renderCategoryOptions(categories)}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="subcategory" className="text-sm font-medium text-gray-700">子类</Label>
                        <Input
                          id="subcategory"
                          name="subcategory"
                          value={formData.subcategory}
                          onChange={handleChange}
                          placeholder="输入子类（可选）"
                          className="border-gray-300 focus:border-primary focus:ring-primary"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="author" className="text-sm font-medium text-gray-700">作者</Label>
                        <Input
                          id="author"
                          name="author"
                          value={formData.author}
                          onChange={handleChange}
                          placeholder="输入作者"
                          className="border-gray-300 focus:border-primary focus:ring-primary"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="publishDate" className="text-sm font-medium text-gray-700">发布日期</Label>
                        <Input
                          id="publishDate"
                          name="publishDate"
                          type="date"
                          value={formData.publishDate}
                          onChange={handleChange}
                          className="border-gray-300 focus:border-primary focus:ring-primary"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="content" className="text-sm font-medium text-gray-700">内容</Label>
                      <RichEditor
                        key={`${selectedArticle?.id ?? ''}-${isNewArticle ? 'new' : 'edit'}-${formData.pdfUrl ? 'pdf' : formData.htmlUrl ? 'html' : 'text'}`}
                        initialContent={formData.content}
                        initialPdfUrl={formData.pdfUrl}
                        initialPdfOriginalName={formData.pdfOriginalName}
                        initialHtmlUrl={formData.htmlUrl}
                        initialHtmlOriginalName={formData.htmlOriginalName}
                        onContentChange={(value: string) => setFormData(prev => ({ ...prev, content: value }))}
                        onPdfChange={(pdfUrl: string) => setFormData(prev => ({ ...prev, pdfUrl }))}
                        onPdfOriginalNameChange={(pdfOriginalName: string) => setFormData(prev => ({ ...prev, pdfOriginalName }))}
                        onHtmlChange={(htmlUrl: string) => setFormData(prev => ({ ...prev, htmlUrl }))}
                        onHtmlOriginalNameChange={(htmlOriginalName: string) => setFormData(prev => ({ ...prev, htmlOriginalName }))}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    <div className="text-center">
                      <FileText className="h-16 w-16 mx-auto mb-4 opacity-30" />
                      <p className="mb-2">从左侧选择一篇文章进行编辑</p>
                      <p className="text-sm">或点击右上角"新建文章"创建新文章</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function ArticlesManagePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <p className="text-muted-foreground">加载中…</p>
        </div>
      }
    >
      <ArticlesManagePageContent />
    </Suspense>
  )
}
