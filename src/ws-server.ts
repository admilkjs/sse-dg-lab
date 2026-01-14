/**
 * @fileoverview DG-LAB WebSocket 服务器
 * @description 自托管的 WebSocket 服务器，基于 temp_dg_plugin/app.js
 * 替代连接外部 WS 服务器 - 我们就是 WS 服务器
 * 支持独立端口或附加到现有 HTTP 服务器
 */

import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import type { IncomingMessage } from "http";
import type { Server as HttpServer } from "http";

/** DG-LAB WebSocket 消息类型 */
export type DGLabMessageType = "bind" | "msg" | "heartbeat" | "break" | "error";

/** DG-LAB WebSocket 消息 */
export interface DGLabMessage {
  type: DGLabMessageType | string;
  clientId: string;
  targetId: string;
  message: string;
  channel?: string;
  time?: number;
}

/** 客户端信息 */
interface ClientInfo {
  id: string;
  ws: WebSocket;
  type: "controller" | "app" | "unknown";
  boundTo: string | null;
  lastActive: number;
}

/** 波形发送定时器信息 */
interface WaveformTimer {
  timerId: ReturnType<typeof setInterval>;
  remaining: number;
}

/** 持续播放状态 */
interface ContinuousPlaybackState {
  /** 控制器 ID */
  controllerId: string;
  /** 通道 */
  channel: "A" | "B";
  /** 波形数据（循环播放） */
  waveforms: string[];
  /** 当前播放索引 */
  currentIndex: number;
  /** 每次发送的波形数量 */
  batchSize: number;
  /** 缓冲比例（0.5-1.0），用于计算等待时间 */
  bufferRatio: number;
  /** 播放时长（毫秒），= batchSize × 100 */
  playbackDuration: number;
  /** 定时器 ID（使用 setTimeout） */
  timerId: ReturnType<typeof setTimeout> | null;
  /** 是否正在播放 */
  active: boolean;
  /** 统计信息 */
  stats: {
    /** 发送次数 */
    sendCount: number;
    /** 总发送耗时（毫秒） */
    totalElapsedTime: number;
    /** 上次发送时间戳 */
    lastSendTime: number;
  };
}

/** WebSocket 服务器选项 */
export interface WSServerOptions {
  /** 独立端口（如果不附加到 HTTP 服务器） */
  port?: number;
  /** 心跳间隔（毫秒） */
  heartbeatInterval?: number;
  /** 强度更新回调 */
  onStrengthUpdate?: (controllerId: string, a: number, b: number, limitA: number, limitB: number) => void;
  /** 反馈回调 */
  onFeedback?: (controllerId: string, index: number) => void;
  /** 绑定变化回调 */
  onBindChange?: (controllerId: string, appId: string | null) => void;
  /** 控制器断开回调 */
  onControllerDisconnect?: (controllerId: string) => void;
  /** APP 断开回调 */
  onAppDisconnect?: (appId: string) => void;
}

/**
 * DG-LAB WebSocket 服务器类
 */
export class DGLabWSServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientInfo> = new Map();
  private relations: Map<string, string> = new Map();
  private waveformTimers: Map<string, WaveformTimer> = new Map();
  /** 持续播放状态 Map，key 格式: controllerId-channel */
  private continuousPlaybacks: Map<string, ContinuousPlaybackState> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private options: WSServerOptions & { heartbeatInterval: number };
  private attachedPort: number = 0;

  constructor(options: WSServerOptions) {
    this.options = {
      heartbeatInterval: 60000,
      onStrengthUpdate: () => {},
      onFeedback: () => {},
      onBindChange: () => {},
      ...options,
    };
  }

  /** 启动独立的 WebSocket 服务器（使用独立端口） */
  start(): void {
    if (!this.options.port) {
      throw new Error("独立启动需要指定 port");
    }
    this.wss = new WebSocketServer({ port: this.options.port });
    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });
    this.startHeartbeat();
    this.attachedPort = this.options.port;
    console.log(`[WS 服务器] 独立监听端口 ${this.options.port}`);
  }

  /** 附加到现有的 HTTP 服务器（共享端口） */
  attachToServer(httpServer: HttpServer, port: number): void {
    this.wss = new WebSocketServer({ noServer: true });
    
    // 处理 HTTP 服务器的 upgrade 事件
    httpServer.on("upgrade", (request, socket, head) => {
      // 所有 WebSocket 升级请求都由我们处理
      this.wss!.handleUpgrade(request, socket, head, (ws) => {
        this.wss!.emit("connection", ws, request);
      });
    });

    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.startHeartbeat();
    this.attachedPort = port;
    console.log(`[WS 服务器] 已附加到 HTTP 服务器，共享端口 ${port}`);
  }

  /** 启动心跳定时器 */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeats();
    }, this.options.heartbeatInterval);
  }

  /** 停止 WebSocket 服务器 */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const timer of this.waveformTimers.values()) {
      clearInterval(timer.timerId);
    }
    this.waveformTimers.clear();
    // 清理所有持续播放（使用 clearTimeout）
    for (const playback of this.continuousPlaybacks.values()) {
      if (playback.timerId) {
        clearTimeout(playback.timerId);
      }
    }
    this.continuousPlaybacks.clear();
    for (const client of this.clients.values()) {
      client.ws.close();
    }
    this.clients.clear();
    this.relations.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    console.log("[WS 服务器] 已停止");
  }

  /** 处理新的 WebSocket 连接 */
  private handleConnection(ws: WebSocket, _req: IncomingMessage): void {
    const clientId = uuidv4();
    const clientInfo: ClientInfo = {
      id: clientId,
      ws,
      type: "unknown",
      boundTo: null,
      lastActive: Date.now(),
    };
    this.clients.set(clientId, clientInfo);
    console.log(`[WS 服务器] 新连接: ${clientId}`);
    this.send(ws, { type: "bind", clientId, targetId: "", message: "targetId" });
    ws.on("message", (data) => this.handleMessage(clientId, data.toString()));
    ws.on("close", () => this.handleClose(clientId));
    ws.on("error", (error) => {
      console.error(`[WS 服务器] 错误 ${clientId}:`, error.message);
      this.handleError(clientId, error);
    });
  }

  /** 处理收到的消息 */
  private handleMessage(clientId: string, rawData: string): void {
    console.log(`[WS 服务器] 收到 ${clientId}: ${rawData}`);
    const client = this.clients.get(clientId);
    if (!client) return;
    client.lastActive = Date.now();

    let data: DGLabMessage;
    try {
      data = JSON.parse(rawData);
    } catch {
      this.send(client.ws, { type: "msg", clientId: "", targetId: "", message: "403" });
      return;
    }

    if (data.clientId !== clientId && data.targetId !== clientId) {
      if (!(data.type === "bind" && data.message === "DGLAB")) {
        this.send(client.ws, { type: "msg", clientId: "", targetId: "", message: "404" });
        return;
      }
    }

    switch (data.type) {
      case "bind": this.handleBind(clientId, data); break;
      case "msg": this.handleMsg(clientId, data); break;
      case "heartbeat": break;
      default: this.forwardMessage(clientId, data); break;
    }
  }

  /** 处理绑定请求 */
  private handleBind(clientId: string, data: DGLabMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (data.message === "DGLAB" && data.clientId && data.targetId) {
      const controllerId = data.clientId;
      const appId = data.targetId;

      if (!this.clients.has(controllerId) || !this.clients.has(appId)) {
        this.send(client.ws, { type: "bind", clientId: controllerId, targetId: appId, message: "401" });
        return;
      }

      const alreadyBound = [controllerId, appId].some(
        (id) => this.relations.has(id) || [...this.relations.values()].includes(id)
      );
      if (alreadyBound) {
        this.send(client.ws, { type: "bind", clientId: controllerId, targetId: appId, message: "400" });
        return;
      }

      this.relations.set(controllerId, appId);
      const controllerClient = this.clients.get(controllerId);
      const appClient = this.clients.get(appId);
      if (controllerClient) { controllerClient.type = "controller"; controllerClient.boundTo = appId; }
      if (appClient) { appClient.type = "app"; appClient.boundTo = controllerId; }

      const successMsg: DGLabMessage = { type: "bind", clientId: controllerId, targetId: appId, message: "200" };
      if (controllerClient) this.send(controllerClient.ws, successMsg);
      if (appClient) this.send(appClient.ws, successMsg);
      if (this.options.onBindChange) {
        this.options.onBindChange(controllerId, appId);
      }
      console.log(`[WS 服务器] 已绑定: ${controllerId} <-> ${appId}`);
    }
  }

  /** 处理 msg 类型消息 */
  private handleMsg(clientId: string, data: DGLabMessage): void {
    const { message } = data;

    if (message.startsWith("strength-")) {
      const parsed = this.parseStrengthMessage(message);
      if (parsed) {
        const client = this.clients.get(clientId);
        if (client?.boundTo && this.options.onStrengthUpdate) {
          this.options.onStrengthUpdate(client.boundTo, parsed.strengthA, parsed.strengthB, parsed.limitA, parsed.limitB);
        }
        this.forwardMessage(clientId, data);
      }
      return;
    }

    if (message.startsWith("feedback-")) {
      const index = parseInt(message.substring(9));
      if (!isNaN(index)) {
        const client = this.clients.get(clientId);
        if (client?.boundTo && this.options.onFeedback) {
          this.options.onFeedback(client.boundTo, index);
        }
      }
      this.forwardMessage(clientId, data);
      return;
    }

    this.forwardMessage(clientId, data);
  }

  /** 转发消息给绑定的对方 */
  private forwardMessage(fromClientId: string, data: DGLabMessage): void {
    const client = this.clients.get(fromClientId);
    if (!client?.boundTo) return;

    const boundId = this.relations.get(fromClientId) || 
      [...this.relations.entries()].find(([_, v]) => v === fromClientId)?.[0];
    if (!boundId) {
      this.send(client.ws, { type: "bind", clientId: data.clientId, targetId: data.targetId, message: "402" });
      return;
    }

    const targetClient = this.clients.get(client.boundTo);
    if (targetClient) {
      this.send(targetClient.ws, data);
    } else {
      this.send(client.ws, { type: "msg", clientId: data.clientId, targetId: data.targetId, message: "404" });
    }
  }

  /** 处理客户端断开 */
  private handleClose(clientId: string): void {
    console.log(`[WS 服务器] 断开: ${clientId}`);
    const client = this.clients.get(clientId);
    if (!client) return;

    // 清理该客户端的波形定时器
    for (const [key, timer] of this.waveformTimers.entries()) {
      if (key.startsWith(clientId + "-")) {
        clearInterval(timer.timerId);
        this.waveformTimers.delete(key);
      }
    }

    // 清理该客户端的持续播放（使用 clearTimeout）
    for (const [key, playback] of this.continuousPlaybacks.entries()) {
      if (playback.controllerId === clientId) {
        if (playback.timerId) {
          clearTimeout(playback.timerId);
        }
        this.continuousPlaybacks.delete(key);
        console.log(`[WS 服务器] 已停止持续播放: ${key}`);
      }
    }

    if (client.type === "app") {
      // APP 断开处理
      // 查找所有绑定到该 APP 的控制器
      for (const [controllerId, appId] of this.relations.entries()) {
        if (appId === clientId) {
          const controller = this.clients.get(controllerId);
          if (controller) {
            // 通知控制器 APP 已断开
            this.send(controller.ws, { 
              type: "break", 
              clientId: controllerId, 
              targetId: clientId, 
              message: "209" 
            });
            controller.boundTo = null;
          }
          // 清理绑定关系
          this.relations.delete(controllerId);
          // 触发绑定变化回调
          if (this.options.onBindChange) {
            this.options.onBindChange(controllerId, null);
          }
        }
      }
      // 触发 APP 断开回调
      if (this.options.onAppDisconnect) {
        this.options.onAppDisconnect(clientId);
      }
    } else if (client.type === "controller") {
      // 控制器断开处理
      if (client.boundTo) {
        const partner = this.clients.get(client.boundTo);
        if (partner) {
          this.send(partner.ws, { type: "break", clientId: client.boundTo, targetId: clientId, message: "209" });
          partner.boundTo = null;
        }
        this.relations.delete(clientId);
        // 触发绑定变化回调
        if (this.options.onBindChange) {
          this.options.onBindChange(clientId, null);
        }
      }
      // 触发控制器断开回调
      if (this.options.onControllerDisconnect) {
        this.options.onControllerDisconnect(clientId);
      }
    } else {
      // 未知类型客户端断开，清理可能的绑定关系
      if (client.boundTo) {
        const partner = this.clients.get(client.boundTo);
        if (partner) {
          this.send(partner.ws, { type: "break", clientId: client.boundTo, targetId: clientId, message: "209" });
          partner.boundTo = null;
        }
        this.relations.delete(clientId);
        this.relations.delete(client.boundTo);
      }
    }

    this.clients.delete(clientId);
    console.log(`[WS 服务器] 已清理 ${clientId}，客户端数: ${this.clients.size}`);
  }

  /** 处理客户端错误 */
  private handleError(clientId: string, error: Error): void {
    const client = this.clients.get(clientId);
    if (!client?.boundTo) return;
    const partner = this.clients.get(client.boundTo);
    if (partner) {
      this.send(partner.ws, { type: "error", clientId: client.boundTo, targetId: clientId, message: "500" });
    }
  }

  /** 发送心跳给所有客户端 */
  private sendHeartbeats(): void {
    if (this.clients.size === 0) return;
    console.log(`[WS 服务器] 发送心跳给 ${this.clients.size} 个客户端`);
    for (const [clientId, client] of this.clients.entries()) {
      this.send(client.ws, { type: "heartbeat", clientId, targetId: client.boundTo || "", message: "200" });
    }
  }

  /** 发送消息到 WebSocket */
  private send(ws: WebSocket, msg: DGLabMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  /** 解析强度消息 */
  private parseStrengthMessage(message: string): { strengthA: number; strengthB: number; limitA: number; limitB: number } | null {
    const match = message.match(/^strength-(\d+)\+(\d+)\+(\d+)\+(\d+)$/);
    if (!match) return null;
    return { strengthA: parseInt(match[1]!, 10), strengthB: parseInt(match[2]!, 10), limitA: parseInt(match[3]!, 10), limitB: parseInt(match[4]!, 10) };
  }

  // ============ MCP 工具公共 API ============

  /** 创建控制器（用于 dg_connect） */
  createController(): string {
    const clientId = uuidv4();
    const mockWs = this.createMockWebSocket(clientId);
    const clientInfo: ClientInfo = { id: clientId, ws: mockWs as unknown as WebSocket, type: "controller", boundTo: null, lastActive: Date.now() };
    this.clients.set(clientId, clientInfo);
    console.log(`[WS 服务器] 创建控制器: ${clientId}`);
    return clientId;
  }

  /** 创建内部控制器的模拟 WebSocket */
  private createMockWebSocket(clientId: string): object {
    return {
      readyState: WebSocket.OPEN,
      send: (data: string) => { console.log(`[WS 服务器] 发送给控制器 ${clientId}: ${data}`); },
      close: () => {},
    };
  }

  /** 检查控制器是否已绑定 APP */
  isControllerBound(controllerId: string): boolean { return this.relations.has(controllerId); }

  /** 获取绑定到控制器的 APP clientId */
  getBoundAppId(controllerId: string): string | null { return this.relations.get(controllerId) || null; }

  /** 获取控制器信息 */
  getController(controllerId: string): ClientInfo | null {
    const client = this.clients.get(controllerId);
    return client?.type === "controller" ? client : null;
  }

  /** 列出所有控制器 */
  listControllers(): Array<{ id: string; boundTo: string | null; lastActive: number }> {
    const result: Array<{ id: string; boundTo: string | null; lastActive: number }> = [];
    for (const client of this.clients.values()) {
      if (client.type === "controller") {
        result.push({ id: client.id, boundTo: client.boundTo, lastActive: client.lastActive });
      }
    }
    return result;
  }

  /** 移除控制器 */
  removeController(controllerId: string): boolean {
    const client = this.clients.get(controllerId);
    if (!client || client.type !== "controller") return false;
    this.handleClose(controllerId);
    return true;
  }

  /**
   * 断开指定控制器的连接
   * @param controllerId - 控制器 ID
   * @returns 是否成功断开
   */
  disconnectController(controllerId: string): boolean {
    const client = this.clients.get(controllerId);
    if (!client) {
      return false;
    }

    // 清理该控制器的波形定时器
    for (const [key, timer] of this.waveformTimers.entries()) {
      if (key.startsWith(controllerId + "-")) {
        clearInterval(timer.timerId);
        this.waveformTimers.delete(key);
      }
    }

    // 清理该控制器的持续播放（使用 clearTimeout）
    for (const channel of ["A", "B"] as const) {
      const key = `${controllerId}-${channel}`;
      const state = this.continuousPlaybacks.get(key);
      if (state) {
        if (state.timerId) {
          clearTimeout(state.timerId);
        }
        this.continuousPlaybacks.delete(key);
        console.log(`[WS 服务器] 已停止持续播放: ${key}`);
      }
    }

    // 如果有绑定的 APP，先解绑并通知
    if (client.boundTo) {
      const appClient = this.clients.get(client.boundTo);
      if (appClient && appClient.ws.readyState === WebSocket.OPEN) {
        // 通知 APP 控制器已断开
        this.send(appClient.ws, {
          type: "break",
          clientId: controllerId,
          targetId: client.boundTo,
          message: "209"
        });
      }
      
      // 清理绑定关系
      this.relations.delete(controllerId);
      if (appClient) {
        appClient.boundTo = null;
      }
      
      // 触发绑定变化回调
      if (this.options.onBindChange) {
        this.options.onBindChange(controllerId, null);
      }
    }

    // 关闭 WebSocket 连接（如果是真实连接）
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.close(1000, "Disconnected by user");
    }

    // 从 Map 中移除
    this.clients.delete(controllerId);

    // 触发控制器断开回调
    if (this.options.onControllerDisconnect) {
      this.options.onControllerDisconnect(controllerId);
    }

    console.log(`[WS 服务器] 控制器已断开: ${controllerId}`);
    return true;
  }

  /** 发送强度命令到 APP */
  sendStrength(controllerId: string, channel: "A" | "B", mode: "increase" | "decrease" | "set", value: number): boolean {
    const appId = this.relations.get(controllerId);
    if (!appId) return false;
    const appClient = this.clients.get(appId);
    if (!appClient) return false;
    const channelNum = channel === "A" ? 1 : 2;
    const modeNum = mode === "decrease" ? 0 : mode === "increase" ? 1 : 2;
    const message = `strength-${channelNum}+${modeNum}+${value}`;
    this.send(appClient.ws, { type: "msg", clientId: controllerId, targetId: appId, message });
    return true;
  }

  /** 发送波形到 APP */
  sendWaveform(controllerId: string, channel: "A" | "B", waveforms: string[]): boolean {
    const appId = this.relations.get(controllerId);
    if (!appId) return false;
    const appClient = this.clients.get(appId);
    if (!appClient) return false;
    const message = `pulse-${channel}:${JSON.stringify(waveforms)}`;
    this.send(appClient.ws, { type: "msg", clientId: controllerId, targetId: appId, message });
    return true;
  }

  /** 清空波形队列 */
  clearWaveform(controllerId: string, channel: "A" | "B"): boolean {
    const appId = this.relations.get(controllerId);
    if (!appId) return false;
    const appClient = this.clients.get(appId);
    if (!appClient) return false;
    const channelNum = channel === "A" ? 1 : 2;
    this.send(appClient.ws, { type: "msg", clientId: controllerId, targetId: appId, message: `clear-${channelNum}` });
    return true;
  }

  // ============ 持续播放 API ============

  /**
   * 启动持续播放
   * 
   * 循环发送波形数据到指定通道，直到手动停止。
   * 使用动态等待机制，根据实际播放时长和发送耗时计算等待时间。
   * 
   * @param controllerId - 控制器 ID
   * @param channel - 目标通道 A 或 B
   * @param waveforms - 要循环播放的波形数据
   * @param batchSize - 每次发送的波形数量，默认 5
   * @param bufferRatio - 缓冲比例（0.5-1.0），默认 0.9，用于计算等待时间
   * @returns 是否成功启动
   */
  startContinuousPlayback(
    controllerId: string,
    channel: "A" | "B",
    waveforms: string[],
    batchSize: number = 5,
    bufferRatio: number = 0.9
  ): boolean {
    // 检查控制器是否已绑定 APP
    if (!this.isControllerBound(controllerId)) {
      console.log(`[WS 服务器] 持续播放失败: 控制器 ${controllerId} 未绑定 APP`);
      return false;
    }

    // 检查波形数据是否有效
    if (!waveforms || waveforms.length === 0) {
      console.log(`[WS 服务器] 持续播放失败: 波形数据为空`);
      return false;
    }

    const key = `${controllerId}-${channel}`;

    // 如果已有持续播放，先停止
    if (this.continuousPlaybacks.has(key)) {
      this.stopContinuousPlayback(controllerId, channel);
    }

    // 验证 bufferRatio 范围（0.5-1.0），无效值使用默认值 0.9
    const validBufferRatio = (bufferRatio >= 0.5 && bufferRatio <= 1.0) ? bufferRatio : 0.9;

    // 计算播放时长：每个 hexWaveform = 100ms
    const playbackDuration = batchSize * 100;

    // 创建持续播放状态
    const state: ContinuousPlaybackState = {
      controllerId,
      channel,
      waveforms,
      currentIndex: 0,
      batchSize,
      bufferRatio: validBufferRatio,
      playbackDuration,
      timerId: null,
      active: true,
      stats: {
        sendCount: 0,
        totalElapsedTime: 0,
        lastSendTime: 0,
      },
    };

    this.continuousPlaybacks.set(key, state);
    console.log(`[WS 服务器] 已启动持续播放: ${key}，波形数: ${waveforms.length}，批次大小: ${batchSize}，播放时长: ${playbackDuration}ms，缓冲比例: ${validBufferRatio}`);

    // 使用递归 setTimeout 启动播放
    this.scheduleSend(state);
    return true;
  }

  /**
   * 调度发送波形（内部方法）
   * 
   * 使用递归 setTimeout 实现动态等待机制：
   * 1. 记录发送开始时间
   * 2. 发送波形批次
   * 3. 计算发送耗时
   * 4. 计算等待时间 = 播放时长 × 缓冲比例 - 发送耗时
   * 5. 调度下次发送
   * 
   * @param state - 持续播放状态
   */
  private scheduleSend(state: ContinuousPlaybackState): void {
    if (!state.active) {
      return;
    }

    // 记录发送开始时间
    const startTime = Date.now();

    // 获取当前批次的波形
    const batch: string[] = [];
    for (let i = 0; i < state.batchSize; i++) {
      batch.push(state.waveforms[state.currentIndex]!);
      state.currentIndex = (state.currentIndex + 1) % state.waveforms.length;
    }

    // 发送波形
    const success = this.sendWaveform(state.controllerId, state.channel, batch);
    if (!success) {
      // 发送失败，停止播放
      console.log(`[WS 服务器] 持续播放发送失败，停止播放: ${state.controllerId}-${state.channel}`);
      this.stopContinuousPlayback(state.controllerId, state.channel);
      return;
    }

    // 计算发送耗时
    const elapsedTime = Date.now() - startTime;

    // 更新统计信息
    state.stats.sendCount++;
    state.stats.totalElapsedTime += elapsedTime;
    state.stats.lastSendTime = startTime;

    // 计算等待时间
    const targetWaitTime = state.playbackDuration * state.bufferRatio - elapsedTime;
    const actualWaitTime = Math.max(10, targetWaitTime); // 最小 10ms

    // 记录性能警告
    if (targetWaitTime < 0) {
      console.warn(`[WS 服务器] 持续播放发送太慢: 耗时 ${elapsedTime}ms > 目标时间 ${state.playbackDuration * state.bufferRatio}ms`);
    }

    // 调度下次发送
    state.timerId = setTimeout(() => this.scheduleSend(state), actualWaitTime);
  }

  /**
   * 停止持续播放
   * 
   * 停止指定通道的持续播放并清空波形队列。
   * 
   * @param controllerId - 控制器 ID
   * @param channel - 目标通道 A 或 B
   * @returns 是否成功停止
   */
  stopContinuousPlayback(controllerId: string, channel: "A" | "B"): boolean {
    const key = `${controllerId}-${channel}`;
    const state = this.continuousPlaybacks.get(key);

    if (!state) {
      console.log(`[WS 服务器] 停止持续播放失败: ${key} 不存在`);
      return false;
    }

    // 记录统计信息
    if (state.stats.sendCount > 0) {
      const avgElapsedTime = state.stats.totalElapsedTime / state.stats.sendCount;
      console.log(`[WS 服务器] 持续播放统计: ${key}，发送次数: ${state.stats.sendCount}，平均耗时: ${avgElapsedTime.toFixed(2)}ms`);
    }

    // 停止定时器
    state.active = false;
    if (state.timerId) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }

    // 清空波形队列
    this.clearWaveform(controllerId, channel);

    // 移除状态
    this.continuousPlaybacks.delete(key);
    console.log(`[WS 服务器] 已停止持续播放: ${key}`);
    return true;
  }

  /**
   * 检查是否正在持续播放
   * 
   * @param controllerId - 控制器 ID
   * @param channel - 目标通道 A 或 B
   * @returns 是否正在持续播放
   */
  isContinuousPlaying(controllerId: string, channel: "A" | "B"): boolean {
    const key = `${controllerId}-${channel}`;
    const state = this.continuousPlaybacks.get(key);
    return state?.active ?? false;
  }

  /**
   * 获取持续播放状态
   * 
   * @param controllerId - 控制器 ID
   * @param channel - 目标通道 A 或 B
   * @returns 持续播放状态或 null
   */
  getContinuousPlaybackState(controllerId: string, channel: "A" | "B"): {
    waveformCount: number;
    batchSize: number;
    bufferRatio: number;
    playbackDuration: number;
    active: boolean;
    stats: {
      sendCount: number;
      totalElapsedTime: number;
      avgElapsedTime: number;
    };
  } | null {
    const key = `${controllerId}-${channel}`;
    const state = this.continuousPlaybacks.get(key);
    if (!state) return null;
    return {
      waveformCount: state.waveforms.length,
      batchSize: state.batchSize,
      bufferRatio: state.bufferRatio,
      playbackDuration: state.playbackDuration,
      active: state.active,
      stats: {
        sendCount: state.stats.sendCount,
        totalElapsedTime: state.stats.totalElapsedTime,
        avgElapsedTime: state.stats.sendCount > 0 ? state.stats.totalElapsedTime / state.stats.sendCount : 0,
      },
    };
  }

  /** 获取 APP 扫描的二维码 URL */
  getQRCodeUrl(controllerId: string, host: string): string {
    const wsUrl = `ws://${host}:${this.attachedPort}/${controllerId}`;
    return `https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#${wsUrl}`;
  }

  /** 获取 APP 连接的 WebSocket URL */
  getWSUrl(controllerId: string, host: string): string {
    return `ws://${host}:${this.attachedPort}/${controllerId}`;
  }

  /** 获取服务器端口 */
  getPort(): number { return this.attachedPort; }

  /** 获取客户端数量 */
  getClientCount(): number { return this.clients.size; }

  /** 获取绑定关系数量 */
  getRelationCount(): number { return this.relations.size; }
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
