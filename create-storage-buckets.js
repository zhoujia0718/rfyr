import { supabase } from './lib/supabase.ts';

async function createStorageBuckets() {
  try {
    console.log('开始创建存储桶...');
    
    // 创建 article-pdfs 存储桶
    const { data: pdfBucket, error: pdfError } = await supabase.storage.createBucket('article-pdfs', {
      public: true,
      allowedMimeTypes: ['application/pdf'],
      fileSizeLimit: 52428800, // 50MB
    });
    
    if (pdfError) {
      console.error('创建 article-pdfs 存储桶失败:', pdfError);
    } else {
      console.log('创建 article-pdfs 存储桶成功:', pdfBucket);
    }
    
    // 列出所有存储桶，确认创建成功
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('列出存储桶失败:', listError);
    } else {
      console.log('存储桶列表:', buckets);
    }
    
  } catch (error) {
    console.error('创建存储桶失败:', error);
  }
}

createStorageBuckets();
