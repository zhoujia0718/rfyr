// 测试Supabase Storage存储桶
const { createClient } = require('@supabase/supabase-js');

// 直接使用配置
const supabaseUrl = 'https://ogctmgdomkktuynsiwmf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testStorageBucket() {
  try {
    console.log('Testing Supabase Storage bucket...');
    
    // 列出所有存储桶
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('Error listing buckets:', bucketsError);
      return;
    }
    
    console.log('Available buckets:', buckets.map(b => b.name));
    
    // 检查article-pdfs存储桶是否存在
    const articlePdfsBucket = buckets.find(b => b.name === 'article-pdfs');
    if (articlePdfsBucket) {
      console.log('article-pdfs bucket exists:', articlePdfsBucket);
      
      // 检查存储桶的访问权限
      console.log('Bucket public:', articlePdfsBucket.public);
    } else {
      console.log('article-pdfs bucket does not exist');
    }
    
    // 测试上传一个小文件
    const testFile = new Buffer.from('test content');
    const fileName = 'test.txt';
    
    console.log('Testing file upload...');
    const { data, error } = await supabase.storage
      .from('article-pdfs')
      .upload(fileName, testFile, {
        cacheControl: '3600',
        upsert: true
      });
    
    if (error) {
      console.error('Error uploading file:', error);
    } else {
      console.log('File uploaded successfully:', data);
      
      // 测试获取公共URL
      const { data: { publicUrl } } = supabase.storage
        .from('article-pdfs')
        .getPublicUrl(fileName);
      
      console.log('Public URL:', publicUrl);
    }
    
  } catch (error) {
    console.error('Error in test:', error);
  }
}

testStorageBucket();
