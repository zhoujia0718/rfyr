// 测试PDF保存功能
const { createClient } = require('@supabase/supabase-js');

// 直接使用配置
const supabaseUrl = 'https://ogctmgdomkktuynsiwmf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testPdfSave() {
  try {
    console.log('Testing PDF save functionality...');
    
    // 测试插入一篇带pdf_url的文章
    console.log('Inserting article with pdf_url...');
    const testPdfUrl = 'https://example.com/test.pdf';
    const { data: insertData, error: insertError } = await supabase
      .from('articles')
      .insert({
        title: 'Test PDF Article',
        content: '',
        category: 'Test',
        author: 'Test Author',
        publishdate: new Date().toISOString().split('T')[0],
        pdf_url: testPdfUrl
      })
      .select('*')
      .single();
    
    if (insertError) {
      console.error('Error inserting article with pdf_url:', insertError);
      return;
    }
    
    console.log('Inserted article:');
    console.log('ID:', insertData.id);
    console.log('Title:', insertData.title);
    console.log('PDF URL:', insertData.pdf_url);
    console.log('Content:', insertData.content);
    
    // 测试查询刚插入的文章
    console.log('\nQuerying the inserted article...');
    const { data: queryData, error: queryError } = await supabase
      .from('articles')
      .select('*')
      .eq('id', insertData.id)
      .single();
    
    if (queryError) {
      console.error('Error querying article:', queryError);
    } else {
      console.log('Queried article:');
      console.log('PDF URL:', queryData.pdf_url);
      console.log('Content:', queryData.content);
    }
    
    // 测试更新文章，添加pdf_url
    console.log('\nUpdating article to add pdf_url...');
    const updatedPdfUrl = 'https://example.com/updated.pdf';
    const { data: updateData, error: updateError } = await supabase
      .from('articles')
      .update({
        pdf_url: updatedPdfUrl,
        content: ''
      })
      .eq('id', insertData.id)
      .select('*')
      .single();
    
    if (updateError) {
      console.error('Error updating article:', updateError);
    } else {
      console.log('Updated article:');
      console.log('PDF URL:', updateData.pdf_url);
      console.log('Content:', updateData.content);
    }
    
    // 删除测试文章
    console.log('\nDeleting test article...');
    const { error: deleteError } = await supabase
      .from('articles')
      .delete()
      .eq('id', insertData.id);
    
    if (deleteError) {
      console.error('Error deleting article:', deleteError);
    } else {
      console.log('Test article deleted successfully');
    }
    
  } catch (error) {
    console.error('Error in test:', error);
  }
}

testPdfSave();
