/**
 * @fileoverview WebSocket 桥接器
 * @description 连接到 DG-LAB WebSocket 后端（官方或自托管）
 * 协议基于 temp_dg_plugin/app.js 和 temp_dg_lab/socket/README.md
 * 
 * 无重连机制 - 如果连接断开，会话将失效
 */

import WebSocket from "ws";
import type { SessionManager, DeviceSession } from "./session-manager";

/** DG-LAB WebSocket 消息类型 */
export type DGLabMessageType = "bind" | "msg" | "heartbeat" | "break" | "error";

/** DG-LAB WebSocket 消息 */
export interface DGLabMessage {
  type: DGLabMessageType | string;
  clientId: string;
  targetId: string;
  message: string;
  channel?: string;
}

/** 强度模式: 0=减少, 1=增加, 2=设置 */
export type StrengthMode = "increase" | "decrease" | "set";

const STRENGTH_MODE_MAP: Record<StrengthMode, number> = {
  decrease: 0,
  increase: 1,
  set: 2,
};

/** WebSocket 桥接器选项 */
export interface WSBridgeOptions {
  wsBackendUrl: string;
  heartbeatInterval?: number;
  onConnectionChange?: (deviceId: string, connected: boolean) => void;
  onStrengthUpdate?: (deviceId: string, a: number, b: number, limitA: number, limitB: number) => void;
  onFeedback?: (deviceId: string, index: number) => void;
  onError?: (deviceId: string, error: string) => void;
}

/**
 * WebSocket 桥接器类
 * @description 管理与 DG-LAB WebSocket 后端的连接
 */
export class WSBridge {
  private options: Required<WSBridgeOptions>;
  private sessionManager: SessionManager;
  private heartbeatTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(sessionManager: SessionManager, options: WSBridgeOptions) {
    this.sessionManager = sessionManager;
    this.options = {
      heartbeatInterval: 30000,
      onConnectionChange: () => {},
      onStrengthUpdate: () => {},
      onFeedback: () => {},
      onError: () => {},
      ...options,
    };
  }

  /**
   * 将会话连接到 DG-LAB WebSocket 后端
   * @param session - 设备会话
   * @returns WS 服务器分配的 clientId
   */
  async connect(session: DeviceSession): Promise<string> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.options.wsBackendUrl);
      let resolved = false;

      ws.on("open", () => {
        console.log(`[WS] 已连接设备 ${session.deviceId}`);
        this.sessionManager.updateConnectionState(session.deviceId, { ws, connected: true });
        this.options.onConnectionChange(session.deviceId, true);
      });

      ws.on("message", (data) => {
        const msg = this.parseMessage(data.toString());
        if (!msg) return;

        // 第一条消息应该是带有我们 clientId 的 bind
        if (!resolved && msg.type === "bind" && msg.clientId && msg.message === "targetId") {
          this.sessionManager.updateConnectionState(session.deviceId, { clientId: msg.clientId });
          this.startHeartbeat(session.deviceId);
          resolved = true;
          resolve(msg.clientId);
          return;
        }

        this.handleMessage(session.deviceId, msg);
      });

      ws.on("close", () => {
        console.log(`[WS] 断开: ${session.deviceId}`);
        this.stopHeartbeat(session.deviceId);
        this.sessionManager.updateConnectionState(session.deviceId, { ws: null, connected: false, boundToApp: false });
        this.options.onConnectionChange(session.deviceId, false);
      });

      ws.on("error", (err) => {
        console.error(`[WS] 错误 ${session.deviceId}:`, err.message);
        this.options.onError(session.deviceId, err.message);
        if (!resolved) { resolved = true; reject(err); }
      });

      // 初始连接超时
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          ws.close();
          reject(new Error("连接超时: 未收到 bind 消息"));
        }
      }, 10000);
    });
  }

  /**
   * 断开设备连接
   * @param deviceId - 设备 ID
   */
  disconnect(deviceId: string): void {
    const session = this.sessionManager.getSession(deviceId);
    if (session?.ws) {
      this.stopHeartbeat(deviceId);
      session.ws.close();
      this.sessionManager.updateConnectionState(deviceId, { ws: null, connected: false, boundToApp: false });
    }
  }

  /**
   * 发送强度控制命令
   * 协议: strength-channel+mode+value
   * @param deviceId - 设备 ID
   * @param channel - 通道 (A/B)
   * @param mode - 模式
   * @param value - 值
   * @returns 是否成功
   */
  sendStrength(deviceId: string, channel: "A" | "B", mode: StrengthMode, value: number): boolean {
    const session = this.sessionManager.getSession(deviceId);
    if (!session?.ws || !session.connected || !session.targetId) return false;

    const channelNum = channel === "A" ? 1 : 2;
    const modeNum = STRENGTH_MODE_MAP[mode];
    const message = `strength-${channelNum}+${modeNum}+${value}`;

    return this.sendToApp(session, message);
  }

  /**
   * 发送波形数据
   * 协议: pulse-channel:["hex1","hex2",...]
   * @param deviceId - 设备 ID
   * @param channel - 通道 (A/B)
   * @param waveforms - 波形数组
   * @returns 是否成功
   */
  sendWaveform(deviceId: string, channel: "A" | "B", waveforms: string[]): boolean {
    const session = this.sessionManager.getSession(deviceId);
    if (!session?.ws || !session.connected || !session.targetId) return false;

    const message = `pulse-${channel}:${JSON.stringify(waveforms)}`;
    return this.sendToApp(session, message);
  }

  /**
   * 清空波形队列
   * 协议: clear-channel
   * @param deviceId - 设备 ID
   * @param channel - 通道 (A/B)
   * @returns 是否成功
   */
  clearWaveform(deviceId: string, channel: "A" | "B"): boolean {
    const session = this.sessionManager.getSession(deviceId);
    if (!session?.ws || !session.connected || !session.targetId) return false;

    const message = `clear-${channel === "A" ? 1 : 2}`;
    return this.sendToApp(session, message);
  }

  /** 通过 WS 服务器发送消息到 APP */
  private sendToApp(session: DeviceSession, message: string): boolean {
    if (!session.ws || !session.clientId || !session.targetId) return false;

    const payload: DGLabMessage = {
      type: "msg",
      clientId: session.clientId,
      targetId: session.targetId,
      message,
    };

    try {
      session.ws.send(JSON.stringify(payload));
      this.sessionManager.touchSession(session.deviceId);
      return true;
    } catch (err) {
      console.error(`[WS] 发送失败 ${session.deviceId}:`, err);
      return false;
    }
  }

  private parseMessage(data: string): DGLabMessage | null {
    try { return JSON.parse(data) as DGLabMessage; }
    catch { return null; }
  }

  private handleMessage(deviceId: string, msg: DGLabMessage): void {
    switch (msg.type) {
      case "bind": this.handleBind(deviceId, msg); break;
      case "msg": this.handleMsg(deviceId, msg); break;
      case "heartbeat": this.sessionManager.touchSession(deviceId); break;
      case "break": this.handleBreak(deviceId, msg); break;
      case "error": this.handleError(deviceId, msg); break;
    }
  }

  private handleBind(deviceId: string, msg: DGLabMessage): void {
    if (msg.message === "200") {
      console.log(`[WS] 绑定成功 ${deviceId}: targetId=${msg.targetId}`);
      this.sessionManager.updateConnectionState(deviceId, { targetId: msg.targetId, boundToApp: true });
    } else {
      console.error(`[WS] 绑定失败 ${deviceId}: ${msg.message}`);
      this.options.onError(deviceId, `绑定失败: ${mapDGLabErrorCode(parseInt(msg.message))}`);
    }
  }

  private handleMsg(deviceId: string, msg: DGLabMessage): void {
    const { message } = msg;

    if (message.startsWith("strength-")) {
      const parsed = parseStrengthMessage(message);
      if (parsed) {
        this.sessionManager.updateStrength(deviceId, parsed.strengthA, parsed.strengthB, parsed.limitA, parsed.limitB);
        this.options.onStrengthUpdate(deviceId, parsed.strengthA, parsed.strengthB, parsed.limitA, parsed.limitB);
      }
      return;
    }

    if (message.startsWith("feedback-")) {
      const index = parseInt(message.substring(9));
      if (!isNaN(index)) this.options.onFeedback(deviceId, index);
      return;
    }
  }

  private handleBreak(deviceId: string, msg: DGLabMessage): void {
    console.log(`[WS] 断开 ${deviceId}: ${msg.message}`);
    this.sessionManager.updateConnectionState(deviceId, { boundToApp: false, targetId: null });
    this.options.onError(deviceId, `连接断开: ${mapDGLabErrorCode(parseInt(msg.message))}`);
  }

  private handleError(deviceId: string, msg: DGLabMessage): void {
    console.error(`[WS] 错误 ${deviceId}: ${msg.message}`);
    this.options.onError(deviceId, msg.message);
  }

  private startHeartbeat(deviceId: string): void {
    const timer = setInterval(() => {
      const session = this.sessionManager.getSession(deviceId);
      if (session?.ws && session.connected && session.clientId) {
        try {
          const heartbeat: DGLabMessage = { type: "heartbeat", clientId: session.clientId, targetId: session.targetId || "", message: "200" };
          session.ws.send(JSON.stringify(heartbeat));
        } catch { /* 连接丢失，将由 close 事件处理 */ }
      } else {
        this.stopHeartbeat(deviceId);
      }
    }, this.options.heartbeatInterval);
    this.heartbeatTimers.set(deviceId, timer);
  }

  private stopHeartbeat(deviceId: string): void {
    const timer = this.heartbeatTimers.get(deviceId);
    if (timer) { clearInterval(timer); this.heartbeatTimers.delete(deviceId); }
  }

  /** 停止所有心跳（用于关闭） */
  stopAll(): void {
    for (const timer of this.heartbeatTimers.values()) clearInterval(timer);
    this.heartbeatTimers.clear();
  }
}

/**
 * 解析强度消息: strength-A+B+limitA+limitB
 * @param message - 消息字符串
 * @returns 解析结果或 null
 */
export function parseStrengthMessage(message: string): { strengthA: number; strengthB: number; limitA: number; limitB: number } | null {
  const match = message.match(/^strength-(\d+)\+(\d+)\+(\d+)\+(\d+)$/);
  if (!match) return null;
  return { strengthA: parseInt(match[1]!, 10), strengthB: parseInt(match[2]!, 10), limitA: parseInt(match[3]!, 10), limitB: parseInt(match[4]!, 10) };
}

/**
 * 映射 DG-LAB 错误码到消息
 * @param code - 错误码
 * @returns 错误消息
 */
export function mapDGLabErrorCode(code: number): string {
  const errors: Record<number, string> = {
    200: "成功", 209: "对方已断开连接", 210: "二维码中没有有效的clientID", 211: "服务器未下发APP ID",
    400: "此ID已被其他客户端绑定", 401: "目标客户端不存在", 402: "双方未建立绑定关系",
    403: "消息不是有效的JSON", 404: "收信人离线", 405: "消息长度超过1950字符", 500: "服务器内部错误",
  };
  return errors[code] ?? `未知错误: ${code}`;
}
