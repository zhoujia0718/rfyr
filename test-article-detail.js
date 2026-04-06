import { supabase } from './lib/supabase.ts';

async function testArticleDetail() {
  try {
    console.log('开始测试文章详情...');
    
    // 获取文章 "测试四下"
    const { data: articles, error: articlesError } = await supabase
      .from('articles')
      .select('*')
      .eq('title', '测试四下');
    
    if (articlesError) {
      console.error('获取文章数据失败:', articlesError);
      return;
    }
    
    if (articles && articles.length > 0) {
      const article = articles[0];
      console.log('文章详情:');
      console.log('标题:', article.title);
      console.log('ID:', article.id);
      console.log('PDF URL:', article.pdf_url);
      console.log('Content 字段长度:', article.content ? article.content.length : 0);
      console.log('Content 字段前 100 个字符:', article.content ? article.content.substring(0, 100) : '');
      
      // 测试 PDF URL 是否可以访问
      try {
        const response = await fetch(article.pdf_url);
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
      console.log('没有找到文章 "测试四下"');
    }
    
    console.log('\n测试完成！');
    
  } catch (error) {
    console.error('测试文章详情失败:', error);
  }
}

testArticleDetail();
