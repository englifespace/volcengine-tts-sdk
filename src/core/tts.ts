import WebSocket from 'ws'
import * as uuid from 'uuid'
import {
  MsgType,
  ReceiveMessage,
  EventType,
  StartConnection,
  StartSession,
  TaskRequest,
  FinishSession,
  FinishConnection,
  WaitForEvent,
  type Message,
} from './protocols'
import type { VolcengineTTSConfig } from '../types'

function VoiceToResourceId(voice: string): string {
  if (voice.startsWith('S_')) {
    return 'volc.megatts.default'
  }
  return 'volc.service_type.10029'
}

/**
 * 初始化火山引擎 TTS WebSocket 连接
 * @param config 火山引擎 TTS 配置
 */
export const initWebScoketInstance = async (config: VolcengineTTSConfig) => {
  if (!config.appId || !config.accessKey || !config.wsUrl) {
    throw new Error('火山引擎 TTS 配置不完整，需要 appId、accessKey 和 wsUrl');
  }

  const headers = {
    'X-Api-App-Key': config.appId,
    'X-Api-Access-Key': config.accessKey,
    'X-Api-Resource-Id': 'volc.service_type.10029',
    'X-Api-Connect-Id': uuid.v4(),
  };

  const ws = new WebSocket(config.wsUrl, {
    headers,
    // 跳过 WebSocket 数据的 UTF-8 校验，加快二进制数据（如音频流）传输速度，适用于只关心原始数据、不需要文本解析的场景
    skipUTF8Validation: true,
  });

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  // 发送连接握手自定义协议
  await StartConnection(ws);
  // 等待服务端握手确认
  await WaitForEvent(
    ws,
    MsgType.FullServerResponse,
    EventType.ConnectionStarted,
  ).then((msg) => msg.toString());

  return ws;
};

/**
 * 启动 TTS 会话
 * @param ws WebSocket 连接实例
 * @param config 可选的 TTS 配置
 */
export const startSession = async (ws: WebSocket, config?: Partial<VolcengineTTSConfig>) => {
  const sessionId = uuid.v4();
  const requestTemplate = {
    user: {
      uid: sessionId,
    },
    req_params: {
      speaker: config?.speaker || 'zh_female_gaolengyujie_emo_v2_mars_bigtts',
      audio_params: {
        format: config?.audioFormat || 'mp3',
        sample_rate: config?.sampleRate || 24000,
        enable_timestamp: true,
      },
      additions: JSON.stringify({
        disable_markdown_filter: true,
      }),
    },
  }

  await StartSession(
    ws,
    new TextEncoder().encode(
      JSON.stringify({
        ...requestTemplate,
        event: EventType.StartSession,
      }),
    ),
    sessionId,
  );

  return {
    sessionId,
    send: async (text: string) => {
      await TaskRequest(
        ws,
        new TextEncoder().encode(
          JSON.stringify({
            ...requestTemplate,
            req_params: {
              ...requestTemplate.req_params,
              text,
            },
            event: EventType.TaskRequest,
          }),
        ),
        sessionId,
      )
    },
    receive: async () => {
      return await ReceiveMessage(ws);
    },
    finished: async () => {
      await FinishSession(ws, sessionId);
      await FinishConnection(ws);
      await WaitForEvent(
        ws,
        MsgType.FullServerResponse,
        EventType.ConnectionFinished,
      );
      ws.close();
    },
  }
};