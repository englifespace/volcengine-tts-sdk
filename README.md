# TTS System SDK

这是一个集成了 Kimi AI 和火山引擎 (Volcengine) TTS 的全栈 SDK，提供了开箱即用的服务端和客户端解决方案，支持流式对话和语音合成。

## 特性

- 🚀 **全栈解决方案**：包含服务端和客户端 SDK
- 🤖 **AI 集成**：内置 Kimi AI (Moonshot AI) 支持
- 🗣️ **高质量语音**：集成火山引擎 TTS，支持流式语音合成
- 📡 **WebSocket 通信**：基于 WebSocket 的实时双向通信
- 📝 **流式文本**：支持 AI 回复的流式输出
- 🎵 **流式音频**：支持音频数据的流式传输和播放
- 🔌 **自动重连**：客户端支持断线自动重连
- 📊 **统计数据**：提供详细的性能和使用统计
- 📦 **类型安全**：完全使用 TypeScript 编写，提供完整的类型定义

## 安装

```bash
npm install @englifespace/volcengine-tts-sdk
# 或
bun add @englifespace/volcengine-tts-sdk
```

## 快速开始

### 服务端

服务端 SDK 负责处理 WebSocket 连接、与 Kimi AI 对话以及调用火山引擎 TTS 服务。

**前置要求**：
确保设置了以下环境变量：
- `KIMI_API_KEY`: Moonshot AI API Key
- `KIMI_BASE_URL`: Moonshot AI Base URL (例如 `https://api.moonshot.cn/v1`)
- `VOLCENGINE_APP_ID`: 火山引擎 App ID
- `VOLCENGINE_APP_KEY`: 火山引擎 Access Token
- `VOLCENGINE_TTS_WS`: 火山引擎 TTS WebSocket URL (例如 `wss://openspeech.bytedance.com/api/v1/tts/ws_binary`)

```typescript
import { createTTSServer } from '@englifespace/volcengine-tts-sdk/server';

const server = createTTSServer({
  server: {
    port: 8080,
    host: '0.0.0.0'
  },
  ai: {
    model: 'kimi-k2-0711-preview',
    systemPrompt: '你是一个友好的助手...'
  }
});

async function start() {
  try {
    await server.start();
    console.log('Server running on port 8080');
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}

start();
```

### 客户端

客户端 SDK 负责连接服务端、发送消息、接收音频流并播放。

```typescript
import { createTTSClient } from '@englifespace/volcengine-tts-sdk/client';

const client = createTTSClient({
  client: {
    serverUrl: 'ws://localhost:8080/tts',
    autoConnect: true
  }
});

// 设置事件回调
client.setCallbacks({
  onConnectionEstablished: () => {
    console.log('Connected!');
  },
  onTextChunk: (event) => {
    console.log('AI Text:', event.data.content);
  },
  onAudioChunk: (event) => {
    // SDK 内部会自动处理音频缓冲，这里可以获取原始数据
  },
  onSentenceComplete: (event) => {
    console.log('Sentence finished:', event.data.sentence);
  }
});

// 开始连接（如果在配置中设置了 autoConnect: true 则不需要手动调用）
// await client.connect();

// 发送消息开始对话
async function chat() {
  try {
    await client.startConversation('你好，请用英语介绍一下你自己。');
  } catch (error) {
    console.error('Chat error:', error);
  }
}
```

## 本地开发

如果你想在本地开发或修改此 SDK：

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd volcengine-tts-sdk
   ```

2. **安装依赖**
   本项目使用 [Bun](https://bun.sh) 进行包管理。
   ```bash
   bun install
   ```

3. **构建项目**
   ```bash
   bun run build
   ```
   构建产物将输出到 `dist/` 目录。

## API 参考

### 服务端配置 (`TTSConfig`)

```typescript
interface TTSConfig {
  server?: {
    port?: number;      // 默认 8080
    host?: string;      // 默认 '0.0.0.0'
    corsOrigin?: string; // 默认 '*'
  };
  ai?: {
    apiKey?: string;
    baseURL?: string;
    model?: string;     // 默认 'kimi-k2-0711-preview'
    systemPrompt?: string;
  };
  tts?: {
    provider?: 'volcengine';
    // 其他 TTS 配置...
  };
}
```

### 客户端 API

#### `startConversation(userMessage: string)`
开始一轮新的对话。

#### `synthesizeText(text: string, options?: SynthesisOptions)`
仅进行文字转语音合成（不经过 AI 对话）。

#### `stop()` / `disconnect()`
断开连接并停止当前播放。

#### 事件回调

- `onConnectionEstablished`: 连接建立
- `onConversationStarted`: 对话开始
- `onTextChunk`: 收到 AI 文本片段
- `onSentenceStart`: 句子开始处理
- `onAudioChunk`: 收到音频片段
- `onSentenceComplete`: 句子处理完成
- `onChatComplete`: 整轮对话完成
- `onError`: 发生错误

## License

ISC
