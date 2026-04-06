'use client'

import * as React from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { Button } from '@/components/ui/button'
import { Bold, Italic, List, ListOrdered, Heading1, Heading2, Heading3, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Extension } from '@tiptap/core'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100%',
        parseHTML: element => {
          const width = (element as HTMLElement).getAttribute('width')
          return width || '100%'
        },
        renderHTML: attributes => {
          return {
            width: attributes.width
          }
        }
      },
      height: {
        default: 'auto',
        parseHTML: element => {
          const height = (element as HTMLElement).getAttribute('height')
          return height || 'auto'
        },
        renderHTML: attributes => {
          return {
            height: attributes.height
          }
        }
      }
    }
  }
})

export default function MarkdownEditor({ value, onChange, disabled = false }: MarkdownEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3]
        }
      }),
      ResizableImage.configure({
        allowBase64: true,
        inline: true,
        HTMLAttributes: {
          class: 'resizable-image'
        }
      })
    ],
    content: value || '<p></p>',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editable: !disabled,
    immediatelyRender: false
  })

  // 监听 value 变化，更新编辑器内容
  React.useEffect(() => {
    if (editor && value) {
      // 只有当编辑器内容与 value 不同时才更新，避免无限循环
      const currentContent = editor.getHTML()
      if (currentContent !== value) {
        editor.commands.setContent(value || '<p></p>')
      }
    }
  }, [editor, value])

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('请上传图片文件')
      return
    }

    try {
      // 检查 supabase 是否可用
      if (!supabase) {
        toast.error('数据库连接失败')
        return
      }

      const { data, error } = await supabase
        .storage
        .from('articles')
        .upload(`images/${Date.now()}-${file.name}`, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (error) {
        console.error('Error uploading image:', error)
        // 处理桶不存在的错误
        if (error.message.includes('Bucket not found')) {
          toast.error('图片存储桶未创建，请先在 Supabase 控制台创建 articles 桶')
        } else {
          toast.error('图片上传失败')
        }
        return
      }

      const { data: urlData } = supabase
        .storage
        .from('articles')
        .getPublicUrl(data.path)

      if (editor) {
        editor.chain().focus().insertContent({
          type: 'image',
          attrs: {
            src: urlData.publicUrl,
            alt: file.name
          }
        }).run()
      }

      toast.success('图片上传成功')
    } catch (error) {
      console.error('Error uploading image:', error)
      toast.error('图片上传失败')
    }
  }

  const handleFileInputChange = (e: Event) => {
    const target = e.target as HTMLInputElement
    const file = target.files?.[0]
    if (file) {
      handleImageUpload(file)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      handleImageUpload(file)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  if (!editor) {
    return <div className="border border-gray-300 rounded-md p-4 bg-gray-50">加载编辑器中...</div>
  }

  return (
    <div className="w-full">
      <div className="border border-gray-300 rounded-t-md bg-gray-50 p-2 flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={disabled}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={disabled}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          disabled={disabled}
        >
          <Heading1 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          disabled={disabled}
        >
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          disabled={disabled}
        >
          <Heading3 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={disabled}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={disabled}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'image/*'
            input.onchange = handleFileInputChange
            input.click()
          }}
          disabled={disabled}
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
      </div>
      <div
        className="border border-t-0 border-gray-300 rounded-b-md min-h-[400px] p-4"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
