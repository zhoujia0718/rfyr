import { getArticleById } from './lib/articles.ts';

async function testGetArticleById() {
  try {
    console.log('开始测试 getArticleById 函数...');
    
    const articleId = '75fb7286-1e00-455d-a79f-fa80307db59f';
    
    console.log('获取文章 ID:', articleId);
    
    const article = await getArticleById(articleId);
    
    if (article) {
      console.log('文章数据:', article);
      console.log('标题:', article.title);
      console.log('PDF URL:', article.pdf_url);
      console.log('Content 字段长度:', article.content ? article.content.length : 0);
      
      if (article.pdf_url) {
        console.log('✅ PDF URL 存在');
      } else {
        console.error('❌ PDF URL 不存在');
      }
    } else {
      console.error('文章不存在');
    }
    
    console.log('\n测试完成！');
    
  } catch (error) {
    console.error('测试 getArticleById 函数失败:', error);
  }
}

testGetArticleById();
