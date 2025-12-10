/**
 * TTS SDK 入口文件
 * 统一导出服务端和客户端SDK
 */

// 服务端SDK
export { TTSServerSDK, createTTSServer } from './server';

// 客户端SDK
export { TTSClientSDK, createTTSClient } from './client';

// 从共享类型包导出所有类型
export * from './types';

// 版本信息
export const VERSION = '1.0.0';

// 默认配置
export const DEFAULT_CONFIG = {
  server: {
    port: 8080,
    host: '0.0.0.0',
    corsOrigin: '*'
  },
  client: {
    serverUrl: 'ws://localhost:8080/tts',
    autoConnect: false,
    reconnectInterval: 3000,
    maxReconnectAttempts: 5
  },
  ai: {
    model: 'kimi-k2-0711-preview',
    systemPrompt: '你是 Kimi，由 Moonshot AI 提供的人工智能助手，你更擅长中文和英文的对话。你会为用户提供安全，有帮助，准确的回答。同时，你会拒绝一切涉及恐怖主义，种族歧视，黄色暴力等问题的回答。Moonshot AI 为专有名词，不可翻译成其他语言。'
  },
  tts: {
    provider: 'volcengine'
  }
};