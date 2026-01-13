/**
 * @fileoverview 会话管理器
 * @description 管理设备会话（仅内存存储，无磁盘持久化）
 * 会话在 1 小时不活动后过期
 */

import { v4 as uuidv4 } from "uuid";
import type WebSocket from "ws";

/** 会话 TTL: 1 小时 */
const SESSION_TTL_MS = 60 * 60 * 1000;
/** 清理间隔: 每 5 分钟 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * 设备会话接口
 */
export interface DeviceSession {
  /** 设备 ID */
  deviceId: string;
  /** 设备别名 */
  alias: string | null;
  /** WS 服务器分配的客户端 ID */
  clientId: string | null;
  /** APP 的 ID */
  targetId: string | null;
  /** WebSocket 连接 */
  ws: WebSocket | null;
  /** 是否已连接 */
  connected: boolean;
  /** 是否已绑定 APP */
  boundToApp: boolean;
  /** A 通道强度 */
  strengthA: number;
  /** B 通道强度 */
  strengthB: number;
  /** A 通道强度上限 */
  strengthLimitA: number;
  /** B 通道强度上限 */
  strengthLimitB: number;
  /** 最后活跃时间 */
  lastActive: Date;
  /** 创建时间 */
  createdAt: Date;
}

/**
 * 会话管理器类
 * @description 管理设备会话的创建、查询、更新和清理
 */
export class SessionManager {
  private sessions: Map<string, DeviceSession> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * 创建新的设备会话
   * @returns 新创建的会话
   */
  createSession(): DeviceSession {
    const deviceId = uuidv4();
    const now = new Date();

    const session: DeviceSession = {
      deviceId,
      alias: null,
      clientId: null,
      targetId: null,
      ws: null,
      connected: false,
      boundToApp: false,
      strengthA: 0,
      strengthB: 0,
      strengthLimitA: 200,
      strengthLimitB: 200,
      lastActive: now,
      createdAt: now,
    };

    this.sessions.set(deviceId, session);
    console.log(`[会话] 已创建: ${deviceId}`);
    return session;
  }

  /**
   * 根据 deviceId 获取会话
   * @param deviceId - 设备 ID
   * @returns 会话或 null
   */
  getSession(deviceId: string): DeviceSession | null {
    const session = this.sessions.get(deviceId);
    if (session) {
      if (this.isExpired(session)) {
        this.deleteSession(deviceId);
        return null;
      }
    }
    return session ?? null;
  }

  /**
   * 根据 clientId 获取会话
   * @param clientId - WS 服务器分配的客户端 ID
   * @returns 会话或 null
   */
  getSessionByClientId(clientId: string): DeviceSession | null {
    for (const session of this.sessions.values()) {
      if (session.clientId === clientId && !this.isExpired(session)) {
        return session;
      }
    }
    return null;
  }

  /**
   * 列出所有活跃会话
   * @returns 会话数组
   */
  listSessions(): DeviceSession[] {
    this.cleanupExpiredSessions();
    return Array.from(this.sessions.values());
  }

  /**
   * 删除会话
   * @param deviceId - 设备 ID
   * @returns 是否成功删除
   */
  deleteSession(deviceId: string): boolean {
    const session = this.sessions.get(deviceId);
    if (session) {
      if (session.ws) {
        try { session.ws.close(); } catch { /* 忽略 */ }
      }
      this.sessions.delete(deviceId);
      console.log(`[会话] 已删除: ${deviceId}`);
      return true;
    }
    return false;
  }

  /**
   * 设置设备别名
   * @param deviceId - 设备 ID
   * @param alias - 别名
   * @returns 是否成功设置
   */
  setAlias(deviceId: string, alias: string): boolean {
    const session = this.sessions.get(deviceId);
    if (session && !this.isExpired(session)) {
      session.alias = alias;
      session.lastActive = new Date();
      return true;
    }
    return false;
  }

  /**
   * 根据别名查找会话（大小写不敏感）
   * @param alias - 别名
   * @returns 匹配的会话数组
   */
  findByAlias(alias: string): DeviceSession[] {
    const lowerAlias = alias.toLowerCase();
    return Array.from(this.sessions.values()).filter(
      (s) => !this.isExpired(s) && s.alias?.toLowerCase() === lowerAlias
    );
  }

  /**
   * 更新会话连接状态
   * @param deviceId - 设备 ID
   * @param updates - 要更新的字段
   * @returns 是否成功更新
   */
  updateConnectionState(
    deviceId: string,
    updates: Partial<Pick<DeviceSession, "connected" | "boundToApp" | "clientId" | "targetId" | "ws">>
  ): boolean {
    const session = this.sessions.get(deviceId);
    if (session) {
      Object.assign(session, updates);
      session.lastActive = new Date();
      return true;
    }
    return false;
  }

  /**
   * 更新会话强度值
   * @param deviceId - 设备 ID
   * @param strengthA - A 通道强度
   * @param strengthB - B 通道强度
   * @param strengthLimitA - A 通道强度上限
   * @param strengthLimitB - B 通道强度上限
   * @returns 是否成功更新
   */
  updateStrength(
    deviceId: string,
    strengthA: number,
    strengthB: number,
    strengthLimitA: number,
    strengthLimitB: number
  ): boolean {
    const session = this.sessions.get(deviceId);
    if (session) {
      session.strengthA = strengthA;
      session.strengthB = strengthB;
      session.strengthLimitA = strengthLimitA;
      session.strengthLimitB = strengthLimitB;
      session.lastActive = new Date();
      return true;
    }
    return false;
  }

  /**
   * 触摸会话以更新 lastActive（心跳/保活）
   * @param deviceId - 设备 ID
   * @returns 是否成功
   */
  touchSession(deviceId: string): boolean {
    const session = this.sessions.get(deviceId);
    if (session) {
      session.lastActive = new Date();
      return true;
    }
    return false;
  }

  /**
   * 获取会话数量
   */
  get sessionCount(): number {
    return this.sessions.size;
  }

  /**
   * 检查会话是否过期
   * @param session - 会话
   * @returns 是否过期
   */
  private isExpired(session: DeviceSession): boolean {
    return Date.now() - session.lastActive.getTime() > SESSION_TTL_MS;
  }

  /**
   * 清理过期会话
   * @returns 清理的会话数量
   */
  cleanupExpiredSessions(): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [deviceId, session] of this.sessions) {
      const age = now - session.lastActive.getTime();
      if (age > SESSION_TTL_MS) {
        if (session.ws) {
          try { session.ws.close(); } catch { /* 忽略 */ }
        }
        this.sessions.delete(deviceId);
        console.log(`[会话] 已过期: ${deviceId} (不活跃 ${Math.round(age / 60000)} 分钟)`);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      const cleaned = this.cleanupExpiredSessions();
      if (cleaned > 0) {
        console.log(`[会话] 清理: ${cleaned} 个过期，剩余 ${this.sessions.size} 个`);
      }
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * 停止清理定时器
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 清除所有会话
   */
  clearAll(): void {
    for (const session of this.sessions.values()) {
      if (session.ws) {
        try { session.ws.close(); } catch { /* 忽略 */ }
      }
    }
    this.sessions.clear();
  }
}
