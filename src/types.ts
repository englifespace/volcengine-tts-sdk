/**
 * TTS系统共享类型定义
 */

/**
 * 音频时间戳信息
 */
export interface AudioTimestamp {
  char: string;          // 字符
  startTime: number;     // 开始时间(毫秒)
  endTime: number;       // 结束时间(毫秒)
}

/**
 * 发送给前端的事件类型
 */
export interface ClientEvent {
  type: 'text_chunk' | 'sentence_start' | 'audio_chunk' | 'sentence_complete' | 'chat_complete' | 'error' | 'connection_established' | 'conversation_started' | 'synthesis_complete' | 'synthesis_error' | 'pong';
  data: any;
  timestamp: number;
}

/**
 * 句子开始事件
 */
export interface SentenceStartEvent extends ClientEvent {
  type: 'sentence_start';
  data: {
    sentenceId: number;
    sentence: string;
  };
}

/**
 * 音频片段事件
 */
export interface AudioChunkEvent extends ClientEvent {
  type: 'audio_chunk';
  data: {
    sentenceId: number;
    chunkIndex: number;
    audioData: Uint8Array | number[]; // 服务端为Uint8Array，客户端序列化为number[]
    isLast: boolean;
  };
}

/**
 * 句子完成事件
 */
export interface SentenceCompleteEvent extends ClientEvent {
  type: 'sentence_complete';
  data: {
    sentenceId: number;
    sentence: string;
    totalChunks: number;
    duration: number;
    audioTimestamps?: AudioTimestamp[];
    totalAudioDuration?: number;
  };
}

/**
 * AI文本片段事件
 */
export interface TextChunkEvent extends ClientEvent {
  type: 'text_chunk';
  data: {
    content: string;
  };
}

/**
 * 聊天完成事件
 */
export interface ChatCompleteEvent extends ClientEvent {
  type: 'chat_complete';
  data: {
    fullText: string;
    totalSentences: number;
  };
}

/**
 * 错误事件
 */
export interface ErrorEvent extends ClientEvent {
  type: 'error';
  data: {
    message: string;
    code?: string;
  };
}

/**
 * 连接建立事件
 */
export interface ConnectionEstablishedEvent extends ClientEvent {
  type: 'connection_established';
  data: {
    message: string;
    clientId?: string;
  };
}

/**
 * 对话开始事件
 */
export interface ConversationStartedEvent extends ClientEvent {
  type: 'conversation_started';
  data: {
    message: string;
    userMessage?: string;
  };
}

/**
 * 客户端发送的消息类型
 */
export interface ClientMessage {
  type: 'start_conversation' | 'ping' | 'synthesize_text';
  payload?: {
    userMessage?: string;
    requestId?: string;
    text?: string;
    options?: {
      voice?: string;
      rate?: number;
      pitch?: number;
      volume?: number;
    };
    [key: string]: any;
  };
}

/**
 * 句子数据结构
 */
export interface SentenceData {
  id: number;
  text: string;
  audioChunks: AudioChunkData[];
  status: 'pending' | 'collecting' | 'completed';
  startTime: number;
  endTime?: number;
  duration?: number;
  audioTimestamps?: AudioTimestamp[];
  totalAudioDuration?: number;
  typingState?: TypingState;
}

/**
 * 音频片段数据
 */
export interface AudioChunkData {
  index: number;
  data: Uint8Array;
  timestamp: number;
}

/**
 * 打字效果状态
 */
export interface TypingState {
  isPlaying: boolean;
  isPaused: boolean;
  currentIndex: number;
  timeouts: number[];
  startTime: number;
  syncMode?: boolean;
}

/**
 * 统计信息
 */
export interface Stats {
  totalSentences: number;
  completedSentences: number;
  totalChunks: number;
}

/**
 * SDK 配置
 */
export interface TTSConfig {
  // 服务端配置
  server?: {
    port?: number;
    host?: string;
    corsOrigin?: string | string[];
  };
  
  // AI 配置
  ai?: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
    systemPrompt?: string;
  };
  
  // TTS 配置 (火山引擎)
  tts?: {
    provider?: 'volcengine' | 'custom';
    /** 火山引擎 App ID */
    appId?: string;
    /** 火山引擎 Access Key */
    accessKey?: string;
    /** 火山引擎 TTS WebSocket URL */
    wsUrl?: string;
    /** 默认发音人 */
    speaker?: string;
    /** 音频格式 */
    audioFormat?: 'mp3' | 'pcm' | 'wav';
    /** 采样率 */
    sampleRate?: number;
  };
  
  // 客户端配置
  client?: {
    serverUrl?: string;
    autoConnect?: boolean;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
  };
}

/**
 * 事件回调接口
 */
export interface EventCallbacks {
  onTextChunk?: (event: TextChunkEvent) => void;
  onSentenceStart?: (event: SentenceStartEvent) => void;
  onAudioChunk?: (event: AudioChunkEvent) => void;
  onSentenceComplete?: (event: SentenceCompleteEvent) => void;
  onChatComplete?: (event: ChatCompleteEvent) => void;
  onError?: (error: ErrorEvent) => void;
  onConnectionEstablished?: (event: ConnectionEstablishedEvent) => void;
  onConversationStarted?: (event: ConversationStartedEvent) => void;
}

/**
 * 服务端事件回调接口
 */
export interface ServerEventCallbacks extends EventCallbacks {
  onClientConnected?: (clientId: string) => void;
  onClientDisconnected?: (clientId: string) => void;
}

/**
 * 导出的数据格式
 */
export interface ExportData {
  timestamp: string;
  stats: Stats;
  sentences: Array<{
    id: number;
    text: string;
    status: string;
    audioChunks: number;
    startTime: number;
    endTime?: number;
    duration?: number;
    audioTimestamps?: AudioTimestamp[];
    totalAudioDuration?: number;
  }>;
}

/**
 * 连接状态
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'processing' | 'error';

/**
 * 服务器状态
 */
export interface ServerStatus {
  isRunning: boolean;
  clientCount: number;
  config: TTSConfig;
}

/**
 * 客户端信息
 */
export interface ClientInfo {
  id: string;
  ip: string;
  connectedAt: Date;
}

/**
 * TTS 服务配置（火山引擎）
 */
export interface VolcengineTTSConfig {
  /** 火山引擎 App ID */
  appId: string;
  /** 火山引擎 Access Key */
  accessKey: string;
  /** 火山引擎 TTS WebSocket URL */
  wsUrl: string;
  /** 默认发音人 */
  speaker?: string;
  /** 音频格式 */
  audioFormat?: 'mp3' | 'pcm' | 'wav';
  /** 采样率 */
  sampleRate?: number;
}

