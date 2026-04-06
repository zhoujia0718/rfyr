// 测试获取文章数据
const { createClient } = require('@supabase/supabase-js');

// 直接使用配置
const supabaseUrl = 'https://ogctmgdomkktuynsiwmf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testGetArticle() {
  try {
    console.log('Testing getArticleById...');
    
    // 获取所有文章，找到带有pdf_url的文章
    const { data: articles, error: articlesError } = await supabase
      .from('articles')
      .select('*');
    
    if (articlesError) {
      console.error('Error fetching articles:', articlesError);
      return;
    }
    
    console.log(`Found ${articles.length} articles`);
    
    // 找到带有pdf_url的文章
    const pdfArticles = articles.filter(article => article.pdf_url && article.pdf_url.trim() !== '');
    console.log(`Found ${pdfArticles.length} articles with pdf_url`);
    
    if (pdfArticles.length > 0) {
      const testArticle = pdfArticles[0];
      console.log(`\nTesting article: ${testArticle.title}`);
      console.log(`ID: ${testArticle.id}`);
      console.log(`PDF URL: ${testArticle.pdf_url}`);
      console.log(`Content: ${testArticle.content}`);
      
      // 直接调用getArticleById函数的逻辑
      const { data: fetchedArticle, error: fetchError } = await supabase
        .from('articles')
        .select('*')
        .eq('id', testArticle.id)
        .single();
      
      if (fetchError) {
        console.error('Error fetching article by id:', fetchError);
      } else {
        console.log('\nFetched article:');
        console.log('Title:', fetchedArticle.title);
        console.log('PDF URL:', fetchedArticle.pdf_url);
        console.log('PDF URL type:', typeof fetchedArticle.pdf_url);
        console.log('PDF URL length:', fetchedArticle.pdf_url ? fetchedArticle.pdf_url.length : 0);
        console.log('Content:', fetchedArticle.content);
        console.log('Content length:', fetchedArticle.content ? fetchedArticle.content.length : 0);
        console.log('Should show PDF:', fetchedArticle.pdf_url && fetchedArticle.pdf_url.trim() !== '');
      }
    } else {
      console.log('No articles with pdf_url found');
    }
    
  } catch (error) {
    console.error('Error in test:', error);
  }
}

testGetArticle();
