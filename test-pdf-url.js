import { supabase } from './lib/supabase.ts';

async function testPdfUrl() {
  try {
    console.log('开始测试 PDF URL...');
    
    // 获取所有文章
    const { data: articles, error: articlesError } = await supabase
      .from('articles')
      .select('*');
    
    if (articlesError) {
      console.error('获取文章数据失败:', articlesError);
      return;
    }
    
    // 找到有 PDF 的文章
    const articleWithPdf = articles.find(article => article.pdf_url);
    
    if (articleWithPdf) {
      console.log('找到有 PDF 的文章:', articleWithPdf.title);
      console.log('PDF URL:', articleWithPdf.pdf_url);
      
      // 测试 PDF URL 是否可以访问
      try {
        const response = await fetch(articleWithPdf.pdf_url);
        console.log('PDF URL 状态码:', response.status);
        console.log('PDF URL 状态:', response.statusText);
        
        if (response.ok) {
          console.log('PDF URL 可以正常访问');
        } else {
          console.error('PDF URL 访问失败:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('测试 PDF URL 失败:', error);
      }
    } else {
      console.error('没有找到有 PDF 的文章');
    }
    
  } catch (error) {
    console.error('测试 PDF URL 失败:', error);
  }
}

testPdfUrl();
