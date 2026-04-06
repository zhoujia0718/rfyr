'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Article {
  id: string
  title: string
  content: string
  category: string
  author: string
  publishdate: string
}

export default function SimpleEditorPage() {
  const [article, setArticle] = React.useState<Article | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [content, setContent] = React.useState('')
  const [imageWidth, setImageWidth] = React.useState(100)
  const [imageAlignment, setImageAlignment] = React.useState('center')

  // 从 URL 获取 ID
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const id = urlParams.get('id')
    if (id) {
      fetchArticle(id)
    } else {
      setLoading(false)
    }
  }, [])

  const fetchArticle = async (id: string) => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        console.error('Error fetching article:', error)
        toast.error('获取文章失败')
      } else {
        setArticle(data)
        setTitle(data.title)
        setContent(data.content)
      }
    } catch (error) {
      console.error('Error fetching article:', error)
      toast.error('获取文章失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!article) return

    try {
      setSaving(true)
      const { error } = await supabase
        .from('articles')
        .update({
          title,
          content,
          updated_at: new Date().toISOString()
        })
        .eq('id', article.id)

      if (error) {
        console.error('Error saving article:', error)
        toast.error('保存文章失败')
      } else {
        toast.success('保存成功')
      }
    } catch (error) {
      console.error('Error saving article:', error)
      toast.error('保存文章失败')
    } finally {
      setSaving(false)
    }
  }

  const handleImageResize = () => {
    // 替换内容中的图片宽度
    const updatedContent = content.replace(/width="[^"]*"/g, `width="${imageWidth}%"`)
    setContent(updatedContent)
  }

  const handleImageAlign = () => {
    // 替换内容中的图片对齐方式
    let updatedContent = content
    
    // 移除现有的对齐样式
    updatedContent = updatedContent.replace(/style="[^"]*"/g, '')
    
    // 添加新的对齐样式
    updatedContent = updatedContent.replace(/<img/g, `<img style="display: block; margin: 0 auto; text-align: ${imageAlignment};"`)
    
    setContent(updatedContent)
  }

  if (loading) {
    return <div>加载中...</div>
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">这是强制测试页</h1>
      <Card>
        <CardHeader>
          <CardTitle>简单编辑器</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 编辑区域 */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">标题</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="输入标题"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">内容</Label>
                <textarea
                  id="content"
                  className="w-full p-3 border border-gray-300 rounded-md min-h-[400px]"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="输入内容"
                />
              </div>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </div>
            
            {/* 图片控制区域 */}
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">图片控制</h3>
                
                {/* 图片宽度控制 */}
                <div className="space-y-2">
                  <Label>图片宽度: {imageWidth}%</Label>
                  <Slider
                    value={[imageWidth]}
                    min={20}
                    max={100}
                    step={5}
                    onValueChange={(value) => setImageWidth(value[0])}
                  />
                  <Button onClick={handleImageResize} variant="secondary" size="sm">
                    应用宽度
                  </Button>
                </div>
                
                {/* 图片对齐控制 */}
                <div className="space-y-2">
                  <Label>图片对齐</Label>
                  <Select value={imageAlignment} onValueChange={setImageAlignment}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择对齐方式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">左对齐</SelectItem>
                      <SelectItem value="center">居中</SelectItem>
                      <SelectItem value="right">右对齐</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={handleImageAlign} variant="secondary" size="sm">
                    应用对齐
                  </Button>
                </div>
              </div>
              
              {/* 预览区域 */}
              <div className="space-y-2">
                <Label>预览</Label>
                <div className="border border-gray-300 rounded-md p-4 min-h-[200px] bg-white">
                  <div dangerouslySetInnerHTML={{ __html: content }} />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}