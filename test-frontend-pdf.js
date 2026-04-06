import { supabase } from './lib/supabase.ts';

async function testFrontendPdf() {
  try {
    console.log('开始测试前端 PDF 显示...');
    
    // 获取有 PDF 的文章
    const { data: articles, error: articlesError } = await supabase
      .from('articles')
      .select('*')
      .neq('pdf_url', null);
    
    if (articlesError) {
      console.error('获取文章数据失败:', articlesError);
      return;
    }
    
    if (articles && articles.length > 0) {
      console.log(`共找到 ${articles.length} 篇有 PDF 的文章`);
      
      // 遍历所有有 PDF 的文章
      articles.forEach((article, index) => {
        console.log(`\n文章 ${index + 1}:`);
        console.log('标题:', article.title);
        console.log('PDF URL:', article.pdf_url);
        console.log('Content 字段长度:', article.content ? article.content.length : 0);
        console.log('是否有 PDF:', !!article.pdf_url);
        
        // 测试 PDF URL 是否可以访问
        try {
          fetch(article.pdf_url)
            .then(response => {
              console.log(`PDF URL 状态码:`, response.status);
              console.log(`PDF URL 状态:`, response.statusText);
              
              if (response.ok) {
                console.log(`PDF URL 可以正常访问`);
              } else {
                console.error(`PDF URL 访问失败:`, response.status, response.statusText);
              }
            })
            .catch(error => {
              console.error(`测试 PDF URL 失败:`, error);
            });
        } catch (error) {
          console.error(`测试 PDF URL 失败:`, error);
        }
      });
    } else {
      console.log('没有找到有 PDF 的文章');
    }
    
    console.log('\n测试完成！');
    console.log('请在浏览器中访问以下地址，测试前端 PDF 显示:');
    console.log('http://localhost:3000/article/[id] (将 [id] 替换为有 PDF 的文章 ID)');
    
  } catch (error) {
    console.error('测试前端 PDF 显示失败:', error);
  }
}

testFrontendPdf();
