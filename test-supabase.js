import { supabase } from './lib/supabase';

async function testSupabase() {
  try {
    console.log('开始测试 Supabase 连接...');
    
    // 测试 articles 表
    console.log('\n测试 articles 表:');
    const { data: articles, error: articlesError } = await supabase
      .from('articles')
      .select('*')
      .limit(3);
    
    if (articlesError) {
      console.error('Articles 表错误:', articlesError);
    } else {
      console.log('Articles 表数据:', articles);
      if (articles && articles.length > 0) {
        console.log('Article 字段:', Object.keys(articles[0]));
      }
    }
    
    // 测试 categories 表
    console.log('\n测试 categories 表:');
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('*')
      .limit(3);
    
    if (categoriesError) {
      console.error('Categories 表错误:', categoriesError);
    } else {
      console.log('Categories 表数据:', categories);
    }
    
    // 测试统计查询
    console.log('\n测试统计查询:');
    const { count: articlesCount, error: countError } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('统计查询错误:', countError);
    } else {
      console.log('文章总数:', articlesCount);
    }
    
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testSupabase();