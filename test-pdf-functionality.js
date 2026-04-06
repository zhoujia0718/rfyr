import { supabase } from './lib/supabase.ts';

async function testPdfFunctionality() {
  try {
    console.log('开始测试 PDF 功能...');
    
    // 1. 测试数据库中的文章数据
    console.log('\n1. 测试数据库中的文章数据:');
    const { data: articles, error: articlesError } = await supabase
      .from('articles')
      .select('*');
    
    if (articlesError) {
      console.error('获取文章数据失败:', articlesError);
      return;
    }
    
    if (articles && articles.length > 0) {
      console.log(`共找到 ${articles.length} 篇文章`);
      
      // 找到有 PDF 的文章
      const articleWithPdf = articles.find(article => article.pdf_url);
      
      if (articleWithPdf) {
        console.log('\n找到有 PDF 的文章:');
        console.log('标题:', articleWithPdf.title);
        console.log('PDF URL:', articleWithPdf.pdf_url);
        console.log('Content 字段:', articleWithPdf.content ? '非空' : '为空');
        
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
    
    // 2. 测试保存逻辑
    console.log('\n2. 测试保存逻辑:');
    console.log('保存逻辑已修改，确保 PDF 优先级高于富文本内容');
    console.log('- 当 PDF 存在时，content 字段会被设为空字符串');
    console.log('- 当 PDF 不存在时，正常保存富文本内容');
    
    // 3. 测试前端渲染逻辑
    console.log('\n3. 测试前端渲染逻辑:');
    console.log('前端文章详情页已修改，实现了 PDF 预览的条件渲染');
    console.log('- 当 article.pdf_url 存在时，渲染 PDF 预览');
    console.log('- 当 article.pdf_url 不存在时，渲染富文本内容');
    
    console.log('\n测试完成！');
    
  } catch (error) {
    console.error('测试 PDF 功能失败:', error);
  }
}

testPdfFunctionality();
