import { supabase } from './lib/supabase.ts';

async function testPdfFix() {
  try {
    console.log('开始测试 PDF 修复...');
    
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
      
      // 遍历所有文章
      articles.forEach((article, index) => {
        console.log(`\n文章 ${index + 1}:`);
        console.log('标题:', article.title);
        console.log('是否有 PDF:', !!article.pdf_url);
        console.log('PDF URL:', article.pdf_url);
        console.log('Content 字段长度:', article.content ? article.content.length : 0);
        
        // 检查是否符合预期：如果有 PDF，则 content 应该为空
        if (article.pdf_url) {
          if (article.content && article.content.length > 0) {
            console.error('❌ 有 PDF 但 content 字段不为空');
          } else {
            console.log('✅ 有 PDF 且 content 字段为空');
          }
        } else {
          if (article.content && article.content.length > 0) {
            console.log('✅ 无 PDF 且 content 字段有值');
          } else {
            console.error('❌ 无 PDF 但 content 字段为空');
          }
        }
      });
    } else {
      console.log('没有找到文章');
    }
    
    console.log('\n测试完成！');
    
  } catch (error) {
    console.error('测试 PDF 修复失败:', error);
  }
}

testPdfFix();
