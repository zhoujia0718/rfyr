const { createClient } = require('@supabase/supabase-js');

// Supabase配置
const supabaseUrl = 'https://ogctmgdomkktuynsiwmf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function alterArticlesTable() {
  try {
    console.log('开始检查并修改 articles 表结构...');
    
    // 检查表结构
    const { data: tableInfo, error: infoError } = await supabase
      .from('articles')
      .select('*')
      .limit(1);
    
    if (infoError) {
      console.error('获取表信息失败:', infoError);
      return;
    }
    
    console.log('表信息:', tableInfo);
    
    // 检查是否存在 pdf_url 字段
    if (tableInfo.length > 0 && tableInfo[0].pdf_url !== undefined) {
      console.log('pdf_url 字段已存在');
      // 不 return，后面还要继续检查 pdf_original_name 字段
    }
    
    // 添加 pdf_url 字段
    const { error: alterError } = await supabase
      .rpc('alter_table_add_column', {
        table_name: 'articles',
        column_definition: 'pdf_url text'
      });
    
    if (alterError) {
      console.error('添加 pdf_url 字段失败:', alterError);
      
      // 尝试使用另一种方法
      console.log('尝试使用 SQL 语句添加字段...');
      const { error: sqlError } = await supabase
        .from('articles')
        .rpc('execute_sql', {
          sql: 'ALTER TABLE articles ADD COLUMN pdf_url text'
        });
      
      if (sqlError) {
        console.error('SQL 语句执行失败:', sqlError);
      } else {
        console.log('使用 SQL 语句添加 pdf_url 字段成功');
      }
    } else {
      console.log('添加 pdf_url 字段成功');
    }
    
    // 再次检查表结构
    const { data: updatedTableInfo } = await supabase
      .from('articles')
      .select('*')
      .limit(1);
    
    console.log('更新后的表信息:', updatedTableInfo);

    // 检查并添加 pdf_original_name 字段（用于前端显示上传文件名）
    const hasPdfOriginalName =
      updatedTableInfo &&
      updatedTableInfo.length > 0 &&
      updatedTableInfo[0].pdf_original_name !== undefined;

    if (!hasPdfOriginalName) {
      console.log('pdf_original_name 字段不存在，尝试添加...');

      // 尝试使用 RPC
      const { error: addOrigErr } = await supabase.rpc('alter_table_add_column', {
        table_name: 'articles',
        column_definition: 'pdf_original_name text',
      });

      if (addOrigErr) {
        console.error('添加 pdf_original_name 字段失败:', addOrigErr);
        console.log('尝试使用 SQL 语句添加字段...');

        const { error: sqlOrigErr } = await supabase.from('articles').rpc('execute_sql', {
          sql: 'ALTER TABLE articles ADD COLUMN pdf_original_name text',
        });

        if (sqlOrigErr) {
          console.error('SQL 语句执行失败:', sqlOrigErr);
        } else {
          console.log('使用 SQL 语句添加 pdf_original_name 字段成功');
        }
      } else {
        console.log('添加 pdf_original_name 字段成功');
      }
    } else {
      console.log('pdf_original_name 字段已存在');
    }
  } catch (error) {
    console.error('修改表结构失败:', error);
  }
}

alterArticlesTable();
