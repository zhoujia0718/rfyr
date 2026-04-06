import { supabase } from '@/lib/supabase'

export default async function TestPage() {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('short_id', 'EQaTwg1y')
    .single()
  
  if (error) {
    return <div>Error: {error.message}</div>
  }
  
  if (!data) {
    return <div>Article not found</div>
  }
  
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">测试页面</h1>
      <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
        <h3 className="font-bold mb-2">调试信息</h3>
        <p>标题: {data.title}</p>
        <p>PDF URL: {data.pdf_url || 'null'}</p>
        <p>PDF URL 类型: {typeof data.pdf_url}</p>
        <p>PDF URL 长度: {data.pdf_url ? data.pdf_url.length : 0}</p>
        <p>Content 字段长度: {data.content ? data.content.length : 0}</p>
        <p>条件判断结果: {data.pdf_url && data.pdf_url.trim() !== '' ? '显示 PDF' : '显示富文本'}</p>
      </div>
      {data.pdf_url && data.pdf_url.trim() !== '' ? (
        <div className="not-prose">
          <div className="border border-gray-200 rounded-md overflow-hidden shadow-sm">
            <div className="p-4 bg-gray-50 border-b border-gray-200">
              <h4 className="font-medium">PDF 内容</h4>
            </div>
            <div className="w-full" style={{ height: '800px' }}>
              <iframe 
                src={`${data.pdf_url}#toolbar=0`} 
                width="100%" 
                height="100%"
                className="border-0"
                title="PDF Content"
                style={{ display: 'block' }}
              />
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-200">
              <a 
                href={data.pdf_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center"
              >
                下载 PDF
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div dangerouslySetInnerHTML={{ __html: data.content }} />
      )}
    </div>
  )
}
