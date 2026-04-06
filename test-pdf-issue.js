// 测试PDF显示问题
const { createClient } = require('@supabase/supabase-js');

// 直接使用配置
const supabaseUrl = 'https://ogctmgdomkktuynsiwmf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testPdfIssue() {
  try {
    console.log('Testing PDF issue...');
    
    // 获取所有文章
    const { data: articles, error } = await supabase
      .from('articles')
      .select('*')
      .limit(10);
    
    if (error) {
      console.error('Error fetching articles:', error);
      return;
    }
    
    console.log(`Found ${articles.length} articles`);
    
    // 检查每篇文章的pdf_url和content字段
    articles.forEach((article, index) => {
      console.log(`\nArticle ${index + 1}: ${article.title}`);
      console.log(`ID: ${article.id}`);
      console.log(`PDF URL: ${article.pdf_url}`);
      console.log(`PDF URL type: ${typeof article.pdf_url}`);
      console.log(`PDF URL length: ${article.pdf_url ? article.pdf_url.length : 0}`);
      console.log(`Content: ${article.content ? article.content.substring(0, 100) + '...' : 'Empty'}`);
      console.log(`Content length: ${article.content ? article.content.length : 0}`);
      console.log(`Should show PDF: ${article.pdf_url && article.pdf_url.trim() !== ''}`);
    });
    
    // 测试getArticleById函数
    if (articles.length > 0) {
      const testArticle = articles[0];
      console.log(`\nTesting getArticleById for article: ${testArticle.title}`);
      
      const { data: fetchedArticle, error: fetchError } = await supabase
        .from('articles')
        .select('*')
        .eq('id', testArticle.id)
        .single();
      
      if (fetchError) {
        console.error('Error fetching article by id:', fetchError);
      } else {
        console.log('Fetched article PDF URL:', fetchedArticle.pdf_url);
        console.log('Fetched article content length:', fetchedArticle.content ? fetchedArticle.content.length : 0);
      }
    }
    
  } catch (error) {
    console.error('Error in test:', error);
  }
}

testPdfIssue();
