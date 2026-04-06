import { supabase } from './lib/supabase.ts';

async function testArticleData() {
  try {
    console.log('开始测试文章数据...');
    
    // 获取所有文章
    const { data: articles, error: articlesError } = await supabase
      .from('articles')
      .select('*');
    
    if (articlesError) {
      console.error('获取文章数据失败:', articlesError);
      return;
    }
    
    if (articles && articles.length > 0) {
      console.log(`共找到 ${articles.length} 篇文章`);
      
      // 遍历所有文章，打印 PDF 相关信息
      articles.forEach((article, index) => {
        console.log(`\n文章 ${index + 1}:`);
        console.log('标题:', article.title);
        console.log('PDF URL:', article.pdf_url);
        console.log('Content 字段长度:', article.content ? article.content.length : 0);
        console.log('是否有 PDF:', !!article.pdf_url);
      });
      
      // 找到有 PDF 的文章
      const articleWithPdf = articles.find(article => article.pdf_url);
      
      if (articleWithPdf) {
        console.log('\n找到有 PDF 的文章:');
        console.log('标题:', articleWithPdf.title);
        console.log('PDF URL:', articleWithPdf.pdf_url);
        console.log('Content 字段:', articleWithPdf.content);
        console.log('Content 字段长度:', articleWithPdf.content ? articleWithPdf.content.length : 0);
        
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
        console.log('没有找到有 PDF 的文章');
      }
    } else {
      console.log('数据库中没有文章');
    }
    
  } catch (error) {
    console.error('测试文章数据失败:', error);
  }
}

testArticleData();
