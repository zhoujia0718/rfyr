import { supabase } from './lib/supabase.ts';

async function testGetArticleById() {
  try {
    console.log('开始测试 getArticleById 函数...');
    
    const articleId = '75fb7286-1e00-455d-a79f-fa80307db59f';
    
    console.log('获取文章 ID:', articleId);
    
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('id', articleId)
      .single();
    
    if (error) {
      console.error('获取文章失败:', error);
      return;
    }
    
    if (data) {
      console.log('原始文章数据:', data);
      console.log('标题:', data.title);
      console.log('PDF URL:', data.pdf_url);
      console.log('Content 字段长度:', data.content ? data.content.length : 0);
      
      // 模拟 getArticleById 函数的数据转换逻辑
      const article = {
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
      };
      
      console.log('转换后的文章数据:', article);
      console.log('转换后的 PDF URL:', article.pdf_url);
      
      if (article.pdf_url) {
        console.log('✅ PDF URL 存在');
      } else {
        console.error('❌ PDF URL 不存在');
      }
    } else {
      console.error('文章不存在');
    }
    
    console.log('\n测试完成！');
    
  } catch (error) {
    console.error('测试 getArticleById 函数失败:', error);
  }
}

testGetArticleById();
