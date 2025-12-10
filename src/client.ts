/**
 * TTS 客户端 SDK
 * 封装WebSocket客户端和数据处理功能（不含UI）
 */

import type {
  TTSConfig,
  EventCallbacks,
  ClientEvent,
  SentenceStartEvent,
  AudioChunkEvent,
  SentenceCompleteEvent,
  TextChunkEvent,
  ChatCompleteEvent,
  ErrorEvent,
  ConnectionEstablishedEvent,
  ConversationStartedEvent,
  ClientMessage,
  SentenceData,
  AudioChunkData,
  Stats,
  ExportData,
  ConnectionStatus
} from './types';

/**
 * TTS 客户端 SDK 主类
 */
export class TTSClientSDK {
  private config: TTSConfig;
  private ws?: WebSocket;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private callbacks: EventCallbacks = {};
  private sentences = new Map<number, SentenceData>();
  private stats: Stats = {
    totalSentences: 0,
    completedSentences: 0,
    totalChunks: 0
  };
  private reconnectAttempts = 0;
  private reconnectTimer?: number;
  private isManualDisconnect = false;

  constructor(config: TTSConfig = {}) {
    this.config = {
      client: {
        serverUrl: 'ws://localhost:8080/tts',
        autoConnect: false,
        reconnectInterval: 3000,
        maxReconnectAttempts: 5,
        ...config.client
      },
      ...config
    };

    if (this.config.client?.autoConnect) {
      this.connect();
    }
  }

  /**
   * 设置事件回调
   */
  setCallbacks(callbacks: EventCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * 连接到服务器
   */
  async connect(serverUrl?: string): Promise<void> {
    if (this.connectionStatus === 'connected' || this.connectionStatus === 'connecting') {
      throw new Error('已连接或正在连接中');
    }

    const url = serverUrl || this.config.client!.serverUrl!;
    this.isManualDisconnect = false;

    try {
      this.setConnectionStatus('connecting');
      
      this.ws = new WebSocket(url);
      
      // 设置连接超时
      const connectTimeout = setTimeout(() => {
        if (this.connectionStatus === 'connecting') {
          this.ws?.close();
          this.setConnectionStatus('error');
          throw new Error('连接超时');
        }
      }, 10000);

      return new Promise((resolve, reject) => {
        if (!this.ws) {
          reject(new Error('WebSocket创建失败'));
          return;
        }

        this.ws.onopen = () => {
          clearTimeout(connectTimeout);
          this.setConnectionStatus('connected');
          this.reconnectAttempts = 0;
          console.log('✅ 已连接到TTS服务器');
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleServerMessage(event);
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectTimeout);
          this.setConnectionStatus('disconnected');
          console.log(`🔌 连接已关闭 (code: ${event.code})`);
          
          // 自动重连
          if (!this.isManualDisconnect && this.config.client!.maxReconnectAttempts! > 0) {
            this.attemptReconnect();
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectTimeout);
          this.setConnectionStatus('error');
          console.error('❌ WebSocket错误:', error);
          this.callbacks.onError?.({
            type: 'error',
            data: { message: '连接错误' },
            timestamp: Date.now()
          });
          reject(error);
        };
      });

    } catch (error) {
      this.setConnectionStatus('error');
      throw error;
    }
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.isManualDisconnect = true;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    this.setConnectionStatus('disconnected');
    console.log('🔌 已断开连接');
  }

  /**
   * 开始对话
   */
  async startConversation(userMessage: string): Promise<void> {
    if (this.connectionStatus !== 'connected') {
      throw new Error('未连接到服务器');
    }

    if (!userMessage.trim()) {
      throw new Error('用户消息不能为空');
    }

    // 清空之前的数据
    this.sentences.clear();
    this.resetStats();
    this.setConnectionStatus('processing');

    // 发送开始对话消息
    const message: ClientMessage = {
      type: 'start_conversation',
      payload: {
        userMessage: userMessage.trim()
      }
    };

    this.sendMessage(message);
    console.log(`🗣️ 开始对话: "${userMessage}"`);
  }

  /**
   * 发送ping消息
   */
  ping(): void {
    if (this.connectionStatus === 'connected') {
      this.sendMessage({ type: 'ping' });
    }
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * 获取统计信息
   */
  getStats(): Stats {
    return { ...this.stats };
  }

  /**
   * 获取所有句子数据
   */
  getSentences(): SentenceData[] {
    return Array.from(this.sentences.values());
  }

  /**
   * 获取指定句子数据
   */
  getSentence(sentenceId: number): SentenceData | undefined {
    return this.sentences.get(sentenceId);
  }

  /**
   * 获取句子的合并音频数据
   */
  getMergedAudio(sentenceId: number): Uint8Array | null {
    const sentence = this.sentences.get(sentenceId);
    if (!sentence || sentence.audioChunks.length === 0) {
      return null;
    }

    // 计算总长度
    const totalLength = sentence.audioChunks.reduce((sum: number, chunk: AudioChunkData) => sum + chunk.data.length, 0);
    const mergedAudio = new Uint8Array(totalLength);
    
    // 合并音频片段
    let offset = 0;
    for (const chunk of sentence.audioChunks) {
      mergedAudio.set(chunk.data, offset);
      offset += chunk.data.length;
    }

    return mergedAudio;
  }

  /**
   * 创建音频Blob
   */
  createAudioBlob(sentenceId: number, mimeType: string = 'audio/mpeg'): Blob | null {
    const audioData = this.getMergedAudio(sentenceId);
    if (!audioData) {
      return null;
    }

    return new Blob([audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength) as ArrayBuffer], { type: mimeType });
  }

  /**
   * 创建音频URL
   */
  createAudioURL(sentenceId: number, mimeType: string = 'audio/mpeg'): string | null {
    const blob = this.createAudioBlob(sentenceId, mimeType);
    if (!blob) {
      return null;
    }

    return URL.createObjectURL(blob);
  }

  /**
   * 客户端文字转语音合成
   * @param text 要合成的文字
   * @param options 合成选项
   * @returns Promise<HTMLAudioElement | null>
   */
  async synthesizeText(text: string, options?: {
    voice?: string
    rate?: number
    pitch?: number
    volume?: number
  }): Promise<HTMLAudioElement | null> {
    if (this.connectionStatus !== 'connected') {
      console.warn('连接未建立，无法进行TTS合成')
      return null
    }

    return new Promise((resolve) => {
      // 生成唯一的请求ID
      const requestId = `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      // 创建合成请求消息
      const message: ClientMessage = {
        type: 'synthesize_text',
        payload: {
          requestId,
          text: text.trim(),
          options: options || {}
        }
      }

      // 设置响应处理器
      const handleResponse = (event: MessageEvent) => {
        try {
          const response = JSON.parse(event.data)
          
          if (response.type === 'synthesis_complete' && response.data?.requestId === requestId) {
            // 移除事件监听器
            this.ws?.removeEventListener('message', handleResponse)
            
            if (response.data.audioData) {
              // 创建音频元素
              const audioBlob = new Blob([new Uint8Array(response.data.audioData)], { type: 'audio/mpeg' })
              const audioUrl = URL.createObjectURL(audioBlob)
              const audio = new Audio(audioUrl)
              
              // 清理URL
              audio.addEventListener('ended', () => {
                URL.revokeObjectURL(audioUrl)
              })
              
              resolve(audio)
            } else {
              console.warn('TTS合成响应中没有音频数据')
              resolve(null)
            }
          } else if (response.type === 'synthesis_error' && response.data?.requestId === requestId) {
            // 移除事件监听器
            this.ws?.removeEventListener('message', handleResponse)
            console.error('TTS合成失败:', response.data.message)
            resolve(null)
          }
        } catch (error) {
          console.error('处理TTS合成响应失败:', error)
        }
      }

      // 添加响应监听器
      this.ws?.addEventListener('message', handleResponse)
      
      // 发送合成请求
      this.sendMessage(message)
      
      // 设置超时
      setTimeout(() => {
        this.ws?.removeEventListener('message', handleResponse)
        console.warn('TTS合成请求超时')
        resolve(null)
      }, 10000) // 10秒超时
    })
  }

  /**
   * 批量合成多个文字为音频
   * @param texts 文字数组
   * @param options 合成选项
   * @returns Promise<(HTMLAudioElement | null)[]>
   */
  async synthesizeMultipleTexts(
    texts: string[], 
    options?: {
      voice?: string
      rate?: number
      pitch?: number
      volume?: number
    }
  ): Promise<(HTMLAudioElement | null)[]> {
    const results: (HTMLAudioElement | null)[] = []
    
    // 串行处理以避免服务器压力
    for (const text of texts) {
      const audio = await this.synthesizeText(text, options)
      results.push(audio)
      
      // 短暂延迟避免请求过于频繁
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    return results
  }

  /**
   * 导出数据
   */
  exportData(): ExportData {
    return {
      timestamp: new Date().toISOString(),
      stats: this.getStats(),
      sentences: this.getSentences().map(sentence => ({
        id: sentence.id,
        text: sentence.text,
        status: sentence.status,
        audioChunks: sentence.audioChunks.length,
        startTime: sentence.startTime,
        endTime: sentence.endTime,
        duration: sentence.duration,
        audioTimestamps: sentence.audioTimestamps,
        totalAudioDuration: sentence.totalAudioDuration
      }))
    };
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.disconnect();
    this.sentences.clear();
    this.callbacks = {};
  }

  // 私有方法

  /**
   * 设置连接状态
   */
  private setConnectionStatus(status: ConnectionStatus): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      console.log(`🔄 连接状态变更: ${status}`);
    }
  }

  /**
   * 尝试重连
   */
  private attemptReconnect(): void {
    if (this.isManualDisconnect || this.reconnectAttempts >= this.config.client!.maxReconnectAttempts!) {
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 尝试重连 (${this.reconnectAttempts}/${this.config.client!.maxReconnectAttempts!})`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('❌ 重连失败:', error);
      }
    }, this.config.client!.reconnectInterval!) as any;
  }

  /**
   * 发送消息到服务器
   */
  private sendMessage(message: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      throw new Error('WebSocket连接未建立');
    }
  }

  /**
   * 处理服务器消息
   */
  private handleServerMessage(event: MessageEvent): void {
    try {
      const message: ClientEvent = JSON.parse(event.data);
      this.processServerEvent(message);
    } catch (error) {
      console.error('❌ 消息解析失败:', error);
      this.callbacks.onError?.({
        type: 'error',
        data: { message: '消息解析失败' },
        timestamp: Date.now()
      });
    }
  }

  /**
   * 处理服务器事件
   */
  private processServerEvent(event: ClientEvent): void {
    switch (event.type) {
      case 'connection_established':
        this.handleConnectionEstablished(event as ConnectionEstablishedEvent);
        break;
        
      case 'conversation_started':
        this.handleConversationStarted(event as ConversationStartedEvent);
        break;
        
      case 'text_chunk':
        this.handleTextChunk(event as TextChunkEvent);
        break;
        
      case 'sentence_start':
        this.handleSentenceStart(event as SentenceStartEvent);
        break;
        
      case 'audio_chunk':
        this.handleAudioChunk(event as AudioChunkEvent);
        break;
        
      case 'sentence_complete':
        this.handleSentenceComplete(event as SentenceCompleteEvent);
        break;
        
      case 'chat_complete':
        this.handleChatComplete(event as ChatCompleteEvent);
        break;
        
      case 'error':
        this.handleError(event as ErrorEvent);
        break;
        
      default:
        console.log(`📨 收到消息: ${event.type}`);
    }
  }

  /**
   * 处理连接建立事件
   */
  private handleConnectionEstablished(event: ConnectionEstablishedEvent): void {
    console.log('✅ 连接已建立');
    this.callbacks.onConnectionEstablished?.(event);
  }

  /**
   * 处理对话开始事件
   */
  private handleConversationStarted(event: ConversationStartedEvent): void {
    console.log('🗣️ 对话已开始');
    this.callbacks.onConversationStarted?.(event);
  }

  /**
   * 处理AI文本片段
   */
  private handleTextChunk(event: TextChunkEvent): void {
    console.log(`📝 AI输出: ${event.data.content}`);
    this.callbacks.onTextChunk?.(event);
  }

  /**
   * 处理句子开始事件
   */
  private handleSentenceStart(event: SentenceStartEvent): void {
    const { sentenceId, sentence } = event.data;
    
    const sentenceData: SentenceData = {
      id: sentenceId,
      text: sentence,
      audioChunks: [],
      status: 'pending',
      startTime: event.timestamp
    };
    
    this.sentences.set(sentenceId, sentenceData);
    this.stats.totalSentences++;
    
    console.log(`🎬 句子开始: [${sentenceId}] ${sentence}`);
    this.callbacks.onSentenceStart?.(event);
  }

  /**
   * 处理音频片段事件
   */
  private handleAudioChunk(event: AudioChunkEvent): void {
    const { sentenceId, chunkIndex, audioData } = event.data;
    
    const sentence = this.sentences.get(sentenceId);
    if (sentence) {
      // 将数组转换回Uint8Array
      const audioBytes = Array.isArray(audioData) ? new Uint8Array(audioData) : audioData;
      
      const chunkData: AudioChunkData = {
        index: chunkIndex,
        data: audioBytes,
        timestamp: event.timestamp
      };
      
      sentence.audioChunks.push(chunkData);
      sentence.status = 'collecting';
      this.stats.totalChunks++;
      
      console.log(`🎵 音频片段: [${sentenceId}] 第${chunkIndex + 1}片 (${audioBytes.length} bytes)`);
    }
    
    this.callbacks.onAudioChunk?.(event);
  }

  /**
   * 处理句子完成事件
   */
  private handleSentenceComplete(event: SentenceCompleteEvent): void {
    const { sentenceId, totalChunks, duration, audioTimestamps, totalAudioDuration } = event.data;
    
    const sentence = this.sentences.get(sentenceId);
    if (sentence) {
      sentence.status = 'completed';
      sentence.endTime = event.timestamp;
      sentence.duration = duration;
      sentence.audioTimestamps = audioTimestamps;
      sentence.totalAudioDuration = totalAudioDuration;
      
      // 初始化打字状态
      if (audioTimestamps && audioTimestamps.length > 0) {
        sentence.typingState = {
          isPlaying: false,
          isPaused: false,
          currentIndex: 0,
          timeouts: [],
          startTime: 0
        };
      }
      
      this.stats.completedSentences++;
      
      console.log(`✅ 句子完成: [${sentenceId}] ${totalChunks}个片段, 耗时${duration}ms`);
    }
    
    this.callbacks.onSentenceComplete?.(event);
  }

  /**
   * 处理聊天完成事件
   */
  private handleChatComplete(event: ChatCompleteEvent): void {
    const { fullText, totalSentences } = event.data;
    
    this.setConnectionStatus('connected');
    
    console.log(`🎯 聊天完成! 总共处理${totalSentences}个句子`);
    console.log(`📄 完整文本: ${fullText}`);
    
    this.callbacks.onChatComplete?.(event);
  }

  /**
   * 处理错误事件
   */
  private handleError(event: ErrorEvent): void {
    console.error(`❌ 服务器错误: ${event.data.message}`);
    
    if (this.connectionStatus === 'processing') {
      this.setConnectionStatus('connected');
    }
    
    this.callbacks.onError?.(event);
  }

  /**
   * 重置统计信息
   */
  private resetStats(): void {
    this.stats = {
      totalSentences: 0,
      completedSentences: 0,
      totalChunks: 0
    };
  }
}

/**
 * 创建TTS客户端SDK实例的工厂函数
 */
export function createTTSClient(config?: TTSConfig): TTSClientSDK {
  return new TTSClientSDK(config);
}