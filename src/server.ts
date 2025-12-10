/**
 * TTS 服务端 SDK
 * 封装WebSocket服务器和AI TTS处理功能
 */

import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import OpenAI from 'openai';
import type {
  TTSConfig,
  ServerEventCallbacks,
  ClientEvent,
  SentenceStartEvent,
  AudioChunkEvent,
  SentenceCompleteEvent,
  TextChunkEvent,
  ChatCompleteEvent,
  ErrorEvent,
  ClientMessage,
  AudioTimestamp,
  ServerStatus,
  ClientInfo,
  VolcengineTTSConfig
} from './types';

// 导入TTS相关模块
import { initWebScoketInstance, startSession } from './core/tts';
import { EventType, type Message } from './core/protocols';

/**
 * 流式音频-文本处理器（服务端版本）
 */
class ServerStreamingAudioTextProcessor {
  private callbacks: ServerEventCallbacks;
  private currentSentenceId?: number;
  private currentSentence = "";
  private audioChunkCount = 0;
  private sentenceStartTime = 0;
  public fullText = ""; // 改为public以便外部访问
  private totalSentences = 0;

  constructor(callbacks: ServerEventCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * 处理AI文本输出
   */
  handleTextChunk(content: string): void {
    this.fullText += content;
    
    const event: TextChunkEvent = {
      type: 'text_chunk',
      data: { content },
      timestamp: Date.now()
    };
    
    this.callbacks.onTextChunk?.(event);
  }

  /**
   * 处理TTS句子开始事件
   */
  handleSentenceStart(msg: Message): void {
    if (msg.event === EventType.TTSSentenceStart) {
      this.currentSentenceId = this.extractSentenceId(msg);
      this.currentSentence = this.extractSentenceText(msg);

      this.audioChunkCount = 0;
      this.sentenceStartTime = Date.now();
      this.totalSentences++;
      
      if (this.currentSentenceId) {
        const event: SentenceStartEvent = {
          type: 'sentence_start',
          data: {
            sentenceId: this.currentSentenceId,
            sentence: this.currentSentence
          },
          timestamp: this.sentenceStartTime
        };
        
        this.callbacks.onSentenceStart?.(event);
      }
    }
  }

  /**
   * 处理TTS音频响应事件
   */
  handleAudioResponse(msg: Message): void {
    if (msg.event === EventType.TTSResponse && this.currentSentenceId && msg.payload?.length > 0) {
      const event: AudioChunkEvent = {
        type: 'audio_chunk',
        data: {
          sentenceId: this.currentSentenceId,
          chunkIndex: this.audioChunkCount,
          audioData: msg.payload,
          isLast: false
        },
        timestamp: Date.now()
      };
      
      this.callbacks.onAudioChunk?.(event);
      this.audioChunkCount++;
    }
  }

  /**
   * 处理TTS句子结束事件
   */
  handleSentenceEnd(msg: Message): void {
    if (msg.event === EventType.TTSSentenceEnd && this.currentSentenceId) {
      const endTime = Date.now();
      const duration = endTime - this.sentenceStartTime;
      
      const timestampInfo = this.extractTimestampInfo(msg);
      
      const event: SentenceCompleteEvent = {
        type: 'sentence_complete',
        data: {
          sentenceId: this.currentSentenceId,
          sentence: this.currentSentence,
          totalChunks: this.audioChunkCount,
          duration,
          audioTimestamps: timestampInfo.timestamps,
          totalAudioDuration: timestampInfo.totalDuration
        },
        timestamp: endTime
      };
      
      this.callbacks.onSentenceComplete?.(event);

      // 清理当前句子状态
      this.currentSentenceId = undefined;
      this.currentSentence = "";
      this.audioChunkCount = 0;
      this.sentenceStartTime = 0;
    }
  }

  /**
   * 处理聊天完成事件
   */
  handleChatComplete(): void {
    const event: ChatCompleteEvent = {
      type: 'chat_complete',
      data: {
        fullText: this.fullText,
        totalSentences: this.totalSentences
      },
      timestamp: Date.now()
    };
    
    this.callbacks.onChatComplete?.(event);
  }

  /**
   * 重置处理器状态
   */
  reset(): void {
    this.currentSentenceId = undefined;
    this.currentSentence = "";
    this.audioChunkCount = 0;
    this.sentenceStartTime = 0;
    this.fullText = "";
    this.totalSentences = 0;
  }

  // 私有方法 - 复用kimi.ts中的逻辑
  private extractSentenceId(msg: Message): number | undefined {
    try {
      if (msg.sequence !== undefined) {
        return msg.sequence;
      }
      
      if (msg.payload?.length > 0) {
        const decoder = new TextDecoder();
        const text = decoder.decode(msg.payload);
        const parsed = JSON.parse(text);
        if (parsed.sentence_id !== undefined) {
          return parsed.sentence_id;
        }
      }
      
      return Date.now() + Math.random();
    } catch (error) {
      return Date.now() + Math.random();
    }
  }

  private extractSentenceText(msg: Message): string {
    try {
      if (msg.payload?.length > 0) {
        const decoder = new TextDecoder();
        const text = decoder.decode(msg.payload);
        
        try {
          const parsed = JSON.parse(text);
          return parsed.sentence || parsed.text || parsed.content || "未知句子";
        } catch {
          return text || "未知句子";
        }
      }
      
      return "空句子";
    } catch (error) {
      return "解析失败";
    }
  }

  private extractTimestampInfo(msg: Message): { timestamps: AudioTimestamp[], totalDuration: number } {
    try {
      if (msg.payload?.length > 0) {
        const decoder = new TextDecoder();
        const text = decoder.decode(msg.payload);
        const parsed = JSON.parse(text);
        
        if (parsed.words && Array.isArray(parsed.words)) {
          const text = parsed.text || this.currentSentence;
          const timestamps: AudioTimestamp[] = this.convertWordsToCharTimestamps(parsed.words, text);
          const totalDuration = timestamps.length > 0 ? Math.max(...timestamps.map(t => t.endTime)) : 0;
          return { timestamps, totalDuration };
        }
        
        if (parsed.timestamps && Array.isArray(parsed.timestamps)) {
          const timestamps: AudioTimestamp[] = parsed.timestamps.map((ts: any) => ({
            char: ts.char || ts.character || '',
            startTime: ts.start_time || ts.startTime || 0,
            endTime: ts.end_time || ts.endTime || 0
          }));
          
          const totalDuration = parsed.total_duration || parsed.totalDuration || 
                               (timestamps.length > 0 ? Math.max(...timestamps.map(t => t.endTime)) : 0);
          
          return { timestamps, totalDuration };
        }
        
        if (parsed.sentence || parsed.text) {
          const sentence = parsed.sentence || parsed.text;
          const totalDuration = parsed.duration || parsed.total_duration || 2000;
          return this.generateEstimatedTimestamps(sentence, totalDuration);
        }
      }
      
      return this.generateEstimatedTimestamps(this.currentSentence, 2000);
      
    } catch (error) {
      return this.generateEstimatedTimestamps(this.currentSentence, 2000);
    }
  }

  private convertWordsToCharTimestamps(words: any[], text: string): AudioTimestamp[] {
    const timestamps: AudioTimestamp[] = [];
    const cleanText = text.replace(/^\s*\n*/, '').replace(/\s+/g, ' ').trim();
    let textIndex = 0;
    const textChars = Array.from(cleanText);
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const wordText = word.word || '';
      const startTime = (word.startTime || 0) * 1000;
      const endTime = (word.endTime || 0) * 1000;
      
      if (!wordText || wordText.trim().length === 0) {
        continue;
      }
      
      const cleanWord = wordText.replace(/[，。！？；：""''（）【】《》、]+$/, '');
      const punctuation = wordText.slice(cleanWord.length);
      
      if (cleanWord.length > 0) {
        const wordDuration = endTime - startTime - (punctuation.length * 100);
        const timePerChar = wordDuration / cleanWord.length;
        
        for (let j = 0; j < cleanWord.length; j++) {
          if (textIndex < textChars.length) {
            const char = textChars[textIndex];
            const charStartTime = startTime + (j * timePerChar);
            const charEndTime = startTime + ((j + 1) * timePerChar);
            
            timestamps.push({
              char: char,
              startTime: Math.round(charStartTime),
              endTime: Math.round(charEndTime)
            });
            
            textIndex++;
          }
        }
      }
      
      if (punctuation.length > 0) {
        const punctStartTime = endTime - (punctuation.length * 100);
        for (let k = 0; k < punctuation.length; k++) {
          if (textIndex < textChars.length) {
            const punctChar = textChars[textIndex];
            const punctCharStartTime = punctStartTime + (k * 100);
            const punctCharEndTime = punctCharStartTime + 100;
            
            timestamps.push({
              char: punctChar,
              startTime: Math.round(punctCharStartTime),
              endTime: Math.round(punctCharEndTime)
            });
            
            textIndex++;
          }
        }
      }
      
      while (textIndex < textChars.length && textChars[textIndex] === ' ') {
        timestamps.push({
          char: ' ',
          startTime: Math.round(endTime),
          endTime: Math.round(endTime + 50)
        });
        textIndex++;
      }
    }
    
    while (textIndex < textChars.length) {
      const char = textChars[textIndex];
      const lastTime = timestamps.length > 0 ? timestamps[timestamps.length - 1].endTime : 0;
      timestamps.push({
        char: char,
        startTime: lastTime,
        endTime: lastTime + 200
      });
      textIndex++;
    }
    
    return timestamps;
  }

  private generateEstimatedTimestamps(sentence: string, totalDuration: number): { timestamps: AudioTimestamp[], totalDuration: number } {
    const chars = Array.from(sentence);
    const timestamps: AudioTimestamp[] = [];
    
    if (chars.length === 0) {
      return { timestamps: [], totalDuration: 0 };
    }
    
    const timePerChar = totalDuration / chars.length;
    let currentTime = 0;
    
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const isPunctuation = /[，。！？；：""''（）【】《》、]/.test(char);
      const charDuration = isPunctuation ? timePerChar * 0.3 : timePerChar;
      
      timestamps.push({
        char,
        startTime: Math.round(currentTime),
        endTime: Math.round(currentTime + charDuration)
      });
      
      currentTime += charDuration;
    }
    
    return { timestamps, totalDuration };
  }
}

/**
 * TTS 服务端 SDK 主类
 */
export class TTSServerSDK {
  private config: TTSConfig;
  private ttsConfig: VolcengineTTSConfig;
  private wss?: WebSocketServer;
  private server?: any;
  private clients = new Map<string, any>();
  private kimiClient?: OpenAI;
  private isRunning = false;

  constructor(config: TTSConfig = {}) {
    this.config = {
      server: {
        port: 8080,
        host: '0.0.0.0',
        corsOrigin: '*',
        ...config.server
      },
      ai: {
        model: 'kimi-k2-0711-preview',
        ...config.ai
      },
      tts: {
        provider: 'volcengine',
        ...config.tts
      },
      ...config
    };

    // 构建 TTS 配置
    this.ttsConfig = {
      appId: config.tts?.appId || '',
      accessKey: config.tts?.accessKey || '',
      wsUrl: config.tts?.wsUrl || '',
      speaker: config.tts?.speaker,
      audioFormat: config.tts?.audioFormat,
      sampleRate: config.tts?.sampleRate,
    };

    // 如果没有配置 systemPrompt，则设置一个默认值
    if (!this.config.ai!.systemPrompt) {
      this.config.ai!.systemPrompt = '你是 Kimi，由 Moonshot AI 提供的人工智能助手，你更擅长中文和英文的对话。你会为用户提供安全，有帮助，准确的回答。同时，你会拒绝一切涉及恐怖主义，种族歧视，黄色暴力等问题的回答。Moonshot AI 为专有名词，不可翻译成其他语言。';
    }

    this.initializeAI();
  }

  /**
   * 初始化AI客户端
   */
  private initializeAI(): void {
    if (!this.config.ai?.apiKey || !this.config.ai?.baseURL) {
      console.warn('⚠️ AI配置不完整，请设置API Key和Base URL');
      return;
    }

    this.kimiClient = new OpenAI({
      apiKey: this.config.ai.apiKey,
      baseURL: this.config.ai.baseURL,
    });
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('服务器已在运行中');
    }

    // 验证 TTS 配置
    if (!this.ttsConfig.appId || !this.ttsConfig.accessKey || !this.ttsConfig.wsUrl) {
      throw new Error('TTS 配置不完整，需要提供 tts.appId、tts.accessKey 和 tts.wsUrl');
    }

    try {
      // 创建HTTP服务器
      this.server = createServer();
      
      // 创建WebSocket服务器
      this.wss = new WebSocketServer({ 
        server: this.server,
        path: '/tts'
      });

      // 处理WebSocket连接
      this.wss.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });

      // 启动HTTP服务器
      await new Promise<void>((resolve, reject) => {
        this.server!.listen(this.config.server!.port, this.config.server!.host, (err: any) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      this.isRunning = true;
      console.log(`🚀 TTS服务器已启动: ws://${this.config.server!.host}:${this.config.server!.port}/tts`);

    } catch (error) {
      console.error('❌ 服务器启动失败:', error);
      throw error;
    }
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // 关闭所有客户端连接
      this.clients.forEach((client, clientId) => {
        try {
          client.ws.close();
        } catch (error) {
          console.warn(`⚠️ 关闭客户端 ${clientId} 连接失败:`, error);
        }
      });
      this.clients.clear();

      // 关闭WebSocket服务器
      if (this.wss) {
        await new Promise<void>((resolve) => {
          this.wss!.close(() => {
            resolve();
          });
        });
      }

      // 关闭HTTP服务器
      if (this.server) {
        await new Promise<void>((resolve) => {
          this.server!.close(() => {
            resolve();
          });
        });
      }

      this.isRunning = false;
      console.log('🛑 TTS服务器已停止');

    } catch (error) {
      console.error('❌ 服务器停止失败:', error);
      throw error;
    }
  }

  /**
   * 处理WebSocket连接
   */
  private handleConnection(ws: any, req: any): void {
    const clientId = this.generateClientId();
    const clientInfo = {
      id: clientId,
      ws: ws,
      ip: req.socket.remoteAddress,
      connectedAt: new Date()
    };

    this.clients.set(clientId, clientInfo);
    console.log(`📱 客户端连接: ${clientId} (${clientInfo.ip})`);

    // 发送连接确认
    this.sendToClient(clientId, {
      type: 'connection_established',
      data: {
        message: '连接已建立',
        clientId: clientId
      },
      timestamp: Date.now()
    });

    // 处理消息
    ws.on('message', (data: Buffer) => {
      this.handleClientMessage(clientId, data);
    });

    // 处理断开连接
    ws.on('close', () => {
      this.clients.delete(clientId);
      console.log(`📱 客户端断开: ${clientId}`);
    });

    // 处理错误
    ws.on('error', (error: Error) => {
      console.error(`❌ 客户端错误 ${clientId}:`, error);
      this.sendErrorToClient(clientId, '连接错误', error.message);
    });
  }

  /**
   * 处理客户端消息
   */
  private async handleClientMessage(clientId: string, data: Buffer): Promise<void> {
    try {
      const message: ClientMessage = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'start_conversation':
          await this.handleStartConversation(clientId, message.payload?.userMessage);
          break;
          
        case 'synthesize_text':
          await this.handleSynthesizeText(clientId, message.payload);
          break;
          
        case 'ping':
          this.sendToClient(clientId, {
            type: 'pong' as any,
            data: { timestamp: Date.now() },
            timestamp: Date.now()
          });
          break;
          
        default:
          console.warn(`⚠️ 未知消息类型: ${message.type}`);
      }
      
    } catch (error) {
      console.error(`❌ 处理客户端消息失败:`, error);
      this.sendErrorToClient(clientId, '消息处理失败', (error as Error).message);
    }
  }

  /**
   * 处理开始对话请求
   */
  private async handleStartConversation(clientId: string, userMessage?: string): Promise<void> {
    if (!this.kimiClient) {
      this.sendErrorToClient(clientId, 'AI服务未配置', '请检查AI配置');
      return;
    }

    if (!userMessage) {
      this.sendErrorToClient(clientId, '参数错误', '用户消息不能为空');
      return;
    }

    try {
      // 发送对话开始事件
      this.sendToClient(clientId, {
        type: 'conversation_started',
        data: {
          message: '开始处理对话',
          userMessage: userMessage
        },
        timestamp: Date.now()
      });

      // 创建事件回调
      const callbacks: ServerEventCallbacks = {
        onTextChunk: (event) => this.sendToClient(clientId, event),
        onSentenceStart: (event) => this.sendToClient(clientId, event),
        onAudioChunk: (event) => {
          // 转换音频数据为数组格式以便JSON序列化
          const eventToSend = {
            ...event,
            data: {
              ...event.data,
              audioData: Array.from(event.data.audioData as Uint8Array)
            }
          };
          this.sendToClient(clientId, eventToSend);
        },
        onSentenceComplete: (event) => this.sendToClient(clientId, event),
        onChatComplete: (event) => this.sendToClient(clientId, event),
        onError: (error) => this.sendErrorToClient(clientId, '处理错误', error.data.message)
      };

      // 执行对话处理
      await this.processConversation(userMessage, callbacks);

    } catch (error) {
      console.error(`❌ 对话处理失败:`, error);
      this.sendErrorToClient(clientId, '对话处理失败', (error as Error).message);
    }
  }

  /**
   * 处理客户端TTS合成请求
   */
  private async handleSynthesizeText(clientId: string, payload?: any): Promise<void> {
    if (!payload?.requestId || !payload?.text) {
      this.sendErrorToClient(clientId, '参数错误', 'requestId和text是必需的')
      return
    }

    const { requestId, text } = payload

    try {
      console.log(`🔊 处理TTS合成请求: ${text} (${requestId})`)
      
      // 初始化TTS
      const ws = await initWebScoketInstance(this.ttsConfig)
      const session = await startSession(ws, this.ttsConfig)
      
      // 收集音频数据
      const audioChunks: Uint8Array[] = []
      
      // 音频处理
      const audioProcessPromise = new Promise(async (resolve, reject) => {
        try {
          while (true) {
            const msg = await session.receive()
            
            switch (msg.event) {
              case EventType.TTSResponse:
                if (msg.payload && msg.payload.length > 0) {
                  audioChunks.push(msg.payload)
                }
                break
                
              case EventType.TTSEnded:
                console.log(`✅ TTS合成完成: ${requestId}`)
                resolve(undefined)
                return
                
              default:
                // 忽略其他消息
                break
            }
          }
        } catch (error) {
          reject(error)
        }
      })
      
      // 发送文本到TTS
      await session.send(text)
      
      // 等待音频处理完成
      await audioProcessPromise
      await session.finished()
      
      // 合并音频数据
      const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const mergedAudio = new Uint8Array(totalLength)
      let offset = 0
      
      for (const chunk of audioChunks) {
        mergedAudio.set(chunk, offset)
        offset += chunk.length
      }
      
      // 发送合成完成响应
      this.sendToClient(clientId, {
        type: 'synthesis_complete' as any,
        data: {
          requestId,
          audioData: Array.from(mergedAudio), // 转换为数组以便JSON序列化
          duration: audioChunks.length * 100 // 估算持续时间
        },
        timestamp: Date.now()
      })
      
      console.log(`🎵 TTS合成完成并发送: ${requestId}, 音频大小: ${mergedAudio.length} bytes`)
      
    } catch (error) {
      console.error(`❌ TTS合成失败 (${requestId}):`, error)
      
      // 发送错误响应
      this.sendToClient(clientId, {
        type: 'synthesis_error' as any,
        data: {
          requestId,
          message: (error as Error).message
        },
        timestamp: Date.now()
      })
    }
  }

  /**
   * 处理AI对话和TTS
   */
  private async processConversation(userMessage: string, callbacks: ServerEventCallbacks): Promise<void> {
    if (!this.kimiClient) {
      throw new Error('AI客户端未初始化');
    }

    // 创建AI对话流
    const completion = await this.kimiClient.chat.completions.create({
      model: this.config.ai!.model!,
      messages: [
        { "role": "system", "content": this.config.ai!.systemPrompt! },
        { "role": "user", "content": userMessage }
      ],
      stream: true,
    });

    // 初始化TTS
    const ws = await initWebScoketInstance(this.ttsConfig);
    const session = await startSession(ws, this.ttsConfig);

    // 创建流式处理器
    const processor = new ServerStreamingAudioTextProcessor(callbacks);

    // 音频处理流
    const audioProcessPromise = new Promise(async (resolve, reject) => {
      try {
        while (true) {
          const msg = await session.receive();
            
          switch (msg.event) {
            case EventType.TTSSentenceStart:
              processor.handleSentenceStart(msg);
              break;
              
            case EventType.TTSResponse:
              processor.handleAudioResponse(msg);
              break;
              
            case EventType.TTSSentenceEnd:
              processor.handleSentenceEnd(msg);
              break;
              
            case EventType.TTSEnded:
              console.log("🏁 TTS处理完成");
              resolve(undefined);
              return;
              
            default:
              console.log(`📨 其他消息: ${msg.toString()}`);
          }
        }
      } catch (error) {
        reject(error);
      }
    });

    // AI对话处理流
    const chatProcessPromise = new Promise(async (resolve, reject) => {
      try {
        let fullAIResponse = ''
        
        // 收集完整的AI响应
        for await (const chunk of completion) {
          const content = chunk.choices[0].delta.content;
          if (content) {
            fullAIResponse += content
            // 发送文本片段事件（原始内容）
            processor.handleTextChunk(content);
          }
        }
        
        console.log('🤖 原始AI响应:', fullAIResponse)
        
        // 直接使用AI响应作为TTS内容和完整文本
        const ttsContent = fullAIResponse;
        console.log('🔊 TTS内容:', ttsContent)
        
        // 发送内容到TTS
        await session.send(ttsContent);
        
        // 发送聊天完成事件
        processor.fullText = fullAIResponse;
        processor.handleChatComplete();
        
        resolve(undefined);
      } catch (error) {
        console.error('❌ AI对话处理失败:', error)
        reject(error);
      }
    });
    
    // 等待两个流程都完成
    await Promise.all([chatProcessPromise, audioProcessPromise]);
    await session.finished();
    
    console.log("🎉 对话处理完成，服务器内存已清理");
  }

  /**
   * 发送消息到客户端
   */
  private sendToClient(clientId: string, event: ClientEvent): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === 1) { // WebSocket.OPEN
      try {
        client.ws.send(JSON.stringify(event));
      } catch (error) {
        console.error(`❌ 发送消息到客户端 ${clientId} 失败:`, error);
      }
    }
  }

  /**
   * 发送错误消息到客户端
   */
  private sendErrorToClient(clientId: string, message: string, details?: string): void {
    const errorEvent: ErrorEvent = {
      type: 'error',
      data: {
        message: message,
        code: details
      },
      timestamp: Date.now()
    };
    
    this.sendToClient(clientId, errorEvent);
  }

  /**
   * 生成客户端ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取服务器状态
   */
  getStatus(): ServerStatus {
    return {
      isRunning: this.isRunning,
      clientCount: this.clients.size,
      config: this.config
    };
  }

  /**
   * 获取连接的客户端列表
   */
  getClients(): ClientInfo[] {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      ip: client.ip,
      connectedAt: client.connectedAt
    }));
  }

  /**
   * 广播消息到所有客户端
   */
  broadcast(event: ClientEvent): void {
    this.clients.forEach((_, clientId) => {
      this.sendToClient(clientId, event);
    });
  }
}

/**
 * 创建TTS服务端SDK实例的工厂函数
 */
export function createTTSServer(config?: TTSConfig): TTSServerSDK {
  return new TTSServerSDK(config);
}