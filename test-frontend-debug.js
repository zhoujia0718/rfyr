async function testFrontendDebug() {
  try {
    console.log('开始测试前端调试信息...');
    
    const articleId = '75fb7286-1e00-455d-a79f-fa80307db59f';
    const url = `http://localhost:3000/article/${articleId}`;
    
    console.log('访问 URL:', url);
    
    const response = await fetch(url);
    const html = await response.text();
    
    console.log('响应状态:', response.status);
    console.log('响应状态文本:', response.statusText);
    
    // 检查 HTML 内容中是否包含调试信息
    if (html.includes('调试信息')) {
      console.log('✅ HTML 内容中包含 "调试信息" 文本');
      
      // 提取调试信息
      const debugInfoMatch = html.match(/<div class="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">[\s\S]*?<\/div>/);
      if (debugInfoMatch) {
        console.log('调试信息:', debugInfoMatch[0]);
      }
    } else {
      console.error('❌ HTML 内容中不包含 "调试信息" 文本');
    }
    
    console.log('\n测试完成！');
    
  } catch (error) {
    console.error('测试前端调试信息失败:', error);
  }
}

testFrontendDebug();
