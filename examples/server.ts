import { createTTSServer } from '../src/server';

// 检查环境变量
console.log('当前工作目录:', process.cwd());
console.log('环境变量检查:');

// 打印所有相关环境变量的键名（帮助排查拼写错误）
const relatedKeys = Object.keys(process.env).filter(k => k.includes('VOLC') || k.includes('KIMI'));
console.log('检测到的相关环境变量 Keys:', relatedKeys);

console.log('- KIMI_API_KEY:', process.env.KIMI_API_KEY ? '已设置' : '未设置');
console.log('- VOLCENGINE_APP_ID:', process.env.VOLCENGINE_APP_ID ? '已设置' : '未设置');
console.log('- VOLCENGINE_APP_KEY:', process.env.VOLCENGINE_APP_KEY ? '已设置' : '未设置');

if (!process.env.KIMI_API_KEY || !process.env.VOLCENGINE_APP_ID || !process.env.VOLCENGINE_APP_KEY) {
  console.error('❌ 请先设置环境变量！参考 .env.example');
  console.error('必需的环境变量: KIMI_API_KEY, VOLCENGINE_APP_ID, VOLCENGINE_APP_KEY');
  process.exit(1);
}

const server = createTTSServer({
  server: {
    port: 3000,
    host: '0.0.0.0',
    corsOrigin: '*'
  },
  ai: {
    apiKey: process.env.KIMI_API_KEY,
    baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
    model: 'kimi-k2-0711-preview',
    systemPrompt: '你是一个友好的英语对话助手。请用简短的句子回答，并引导用户多说英语。'
  }
});

console.log('🚀 正在启动 TTS Server...');
console.log('配置信息:', {
  port: 3000,
  model: 'kimi-k2-0711-preview',
  hasApiKey: !!process.env.KIMI_API_KEY
});

server.start().catch((error) => {
  console.error('❌ Server 启动失败:', error);
  process.exit(1);
});

