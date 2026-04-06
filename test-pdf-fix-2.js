import { supabase } from './lib/supabase.ts';

async function testPdfFix() {
  try {
    console.log('开始测试 PDF 修复...');
    
    // 创建一个测试文章
    const testTitle = '测试 PDF 修复 ' + Date.now();
    const testContent = '这是测试内容';
    const testPdfUrl = 'https://example.com/test.pdf';
    
    // 模拟 handleSave 函数的逻辑
    const insertData = {
      title: testTitle,
      content: testPdfUrl && testPdfUrl.trim() !== '' ? "" : testContent,
      category: '测试',
      author: '测试用户',
      publishdate: new Date().toISOString().split('T')[0],
      pdf_url: testPdfUrl && testPdfUrl.trim() !== '' ? testPdfUrl : null
    };
    
    console.log('创建测试文章...');
    console.log('Insert data:', insertData);
    const { data: createdArticle, error: createError } = await supabase
      .from('articles')
      .insert(insertData)
      .select('*')
      .single();
    
    if (createError) {
      console.error('创建测试文章失败:', createError);
      return;
    }
    
    console.log('测试文章创建成功:', createdArticle.title);
    console.log('PDF URL:', createdArticle.pdf_url);
    console.log('Content 字段长度:', createdArticle.content ? createdArticle.content.length : 0);
    
    // 检查是否符合预期：如果有 PDF，则 content 应该为空
    if (createdArticle.pdf_url) {
      if (createdArticle.content && createdArticle.content.length > 0) {
        console.error('❌ 有 PDF 但 content 字段不为空');
      } else {
        console.log('✅ 有 PDF 且 content 字段为空');
      }
    } else {
      if (createdArticle.content && createdArticle.content.length > 0) {
        console.log('✅ 无 PDF 且 content 字段有值');
      } else {
        console.error('❌ 无 PDF 但 content 字段为空');
      }
    }
    
    // 更新测试文章，移除 PDF URL
    console.log('\n更新测试文章，移除 PDF URL...');
    const { data: updatedArticle, error: updateError } = await supabase
      .from('articles')
      .update({
        pdf_url: null
      })
      .eq('id', createdArticle.id)
      .select('*')
      .single();
    
    if (updateError) {
      console.error('更新测试文章失败:', updateError);
      return;
    }
    
    console.log('测试文章更新成功');
    console.log('PDF URL:', updatedArticle.pdf_url);
    console.log('Content 字段长度:', updatedArticle.content ? updatedArticle.content.length : 0);
    
    // 检查是否符合预期：如果没有 PDF，则 content 应该有值
    if (updatedArticle.pdf_url) {
      if (updatedArticle.content && updatedArticle.content.length > 0) {
        console.error('❌ 有 PDF 但 content 字段不为空');
      } else {
        console.log('✅ 有 PDF 且 content 字段为空');
      }
    } else {
      if (updatedArticle.content && updatedArticle.content.length > 0) {
        console.log('✅ 无 PDF 且 content 字段有值');
      } else {
        console.error('❌ 无 PDF 但 content 字段为空');
      }
    }
    
    // 删除测试文章
    console.log('\n删除测试文章...');
    const { error: deleteError } = await supabase
      .from('articles')
      .delete()
      .eq('id', createdArticle.id);
    
    if (deleteError) {
      console.error('删除测试文章失败:', deleteError);
      return;
    }
    
    console.log('测试文章删除成功');
    console.log('\n测试完成！');
    
  } catch (error) {
    console.error('测试 PDF 修复失败:', error);
  }
}

testPdfFix();
