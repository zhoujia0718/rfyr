import { supabase } from './lib/supabase.ts';

async function fixArticle() {
  try {
    console.log('开始修复文章 "测试四下"...');
    
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
      console.log('找到文章:', article.title);
      console.log('当前 PDF URL:', article.pdf_url);
      console.log('当前 Content 字段长度:', article.content ? article.content.length : 0);
      
      // 更新文章，将 content 字段设为空字符串
      console.log('更新文章，将 content 字段设为空字符串...');
      const { data: updatedArticle, error: updateError } = await supabase
        .from('articles')
        .update({
          content: ""
        })
        .eq('id', article.id)
        .select('*')
        .single();
      
      if (updateError) {
        console.error('更新文章失败:', updateError);
        return;
      }
      
      console.log('文章更新成功');
      console.log('更新后 PDF URL:', updatedArticle.pdf_url);
      console.log('更新后 Content 字段长度:', updatedArticle.content ? updatedArticle.content.length : 0);
      
      console.log('\n修复完成！');
      console.log('请在浏览器中访问以下地址，测试前端 PDF 显示:');
      console.log(`http://localhost:3000/article/${updatedArticle.id}`);
    } else {
      console.log('没有找到文章 "测试四下"');
    }
    
  } catch (error) {
    console.error('修复文章失败:', error);
  }
}

fixArticle();
