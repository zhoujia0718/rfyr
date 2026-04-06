import { supabase } from './lib/supabase.ts';

async function checkArticleData() {
  try {
    console.log('开始检查文章数据...');
    
    // 获取所有文章
    const { data: articles, error: articlesError } = await supabase
      .from('articles')
      .select('*');
    
    if (articlesError) {
      console.error('获取文章数据失败:', articlesError);
      return;
    }
    
    console.log('文章数据:', articles);
    
    // 检查每篇文章的 pdf_url 字段
    articles.forEach((article, index) => {
      console.log(`文章 ${index + 1}:`, {
        id: article.id,
        title: article.title,
        pdf_url: article.pdf_url,
        has_pdf: !!article.pdf_url
      });
    });
    
  } catch (error) {
    console.error('检查文章数据失败:', error);
  }
}

checkArticleData();
