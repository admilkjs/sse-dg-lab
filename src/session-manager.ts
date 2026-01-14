/**
 * @fileoverview 会话管理器
 * 
 * 管理 DG-LAB 设备的会话状态，包括连接信息、强度参数和生命周期。
 * 会话数据仅存储在内存中，不做磁盘持久化，服务重启后会丢失。
 * 
 * 会话生命周期：
 * - 创建：调用 dg_connect 时创建新会话
 * - 活跃：每次操作都会更新 lastActive 时间戳
 * - 过期：1 小时不活动后自动清理
 * 
 * 主要功能：
 * - 创建和删除设备会话
 * - 通过 deviceId 或 clientId 查询会话
 * - 管理设备别名
 * - 跟踪通道强度和限制
 * - 自动清理过期会话
 */

import { v4 as uuidv4 } from "uuid";
import type WebSocket from "ws";

/** 会话过期时间：1 小时不活动后过期 */
const SESSION_TTL_MS = 60 * 60 * 1000;
/** 清理检查间隔：每 5 分钟检查一次过期会话 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * 设备会话数据结构
 * 
 * 包含设备连接的完整状态信息，从创建到断开的整个生命周期。
 */
export interface DeviceSession {
  /** 设备唯一标识符，由服务器生成 */
  deviceId: string;
  /** 用户设置的设备别名，便于识别 */
  alias: string | null;
  /** WebSocket 服务器分配的客户端 ID，用于与 APP 通信 */
  clientId: string | null;
  /** 绑定的 APP 的 ID */
  targetId: string | null;
  /** WebSocket 连接实例 */
  ws: WebSocket | null;
  /** 会话是否已建立连接 */
  connected: boolean;
  /** APP 是否已扫码绑定（必须为 true 才能控制设备） */
  boundToApp: boolean;
  /** A 通道当前强度（0-200） */
  strengthA: number;
  /** B 通道当前强度（0-200） */
  strengthB: number;
  /** A 通道强度上限（由 APP 设置） */
  strengthLimitA: number;
  /** B 通道强度上限（由 APP 设置） */
  strengthLimitB: number;
  /** 最后活跃时间，用于过期检测 */
  lastActive: Date;
  /** 会话创建时间 */
  createdAt: Date;
  /** 连接超时定时器 ID（未绑定 APP 时有效） */
  connectionTimeoutId: ReturnType<typeof setTimeout> | null;
}

/**
 * 会话管理器
 * 
 * 负责设备会话的完整生命周期管理，包括创建、查询、更新和自动清理。
 * 使用 Map 存储会话数据，支持通过 deviceId 或 clientId 快速查找。
 */
export class SessionManager {
  private sessions: Map<string, DeviceSession> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  /** 连接超时时间（毫秒） */
  private connectionTimeoutMs: number;

  constructor(connectionTimeoutMinutes: number = 5) {
    this.connectionTimeoutMs = connectionTimeoutMinutes * 60 * 1000;
    // 启动时立即开始定期清理过期会话
    this.startCleanupTimer();
    console.log(`[会话] 连接超时设置: ${connectionTimeoutMinutes} 分钟`);
  }

  /**
   * 创建新的设备会话
   * 
   * 生成唯一的 deviceId 并初始化会话状态。
   * 新会话默认未连接、未绑定，强度为 0，上限为 200。
   * 会启动连接超时计时器，如果在超时时间内未绑定 APP 则自动销毁。
   * 
   * @returns 新创建的会话对象
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
      connectionTimeoutId: null,
    };

    // 启动连接超时计时器
    session.connectionTimeoutId = setTimeout(() => {
      const currentSession = this.sessions.get(deviceId);
      if (currentSession && !currentSession.boundToApp) {
        console.log(`[会话] 连接超时: ${deviceId} (${this.connectionTimeoutMs / 60000} 分钟内未绑定 APP)`);
        this.deleteSession(deviceId);
      }
    }, this.connectionTimeoutMs);

    this.sessions.set(deviceId, session);
    console.log(`[会话] 已创建: ${deviceId}`);
    return session;
  }

  /**
   * 根据 deviceId 获取会话
   * 
   * 如果会话已过期，会自动删除并返回 null。
   * 
   * @param deviceId - 设备 ID
   * @returns 会话对象，如果不存在或已过期则返回 null
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
   * 
   * clientId 是 WebSocket 服务器分配的标识符，用于关联 MCP 会话和 WS 连接。
   * 
   * @param clientId - WebSocket 客户端 ID
   * @returns 会话对象，如果不存在或已过期则返回 null
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
   * 
   * 返回前会先清理过期会话，确保返回的都是有效会话。
   * 
   * @returns 所有活跃会话的数组
   */
  listSessions(): DeviceSession[] {
    this.cleanupExpiredSessions();
    return Array.from(this.sessions.values());
  }

  /**
   * 删除会话
   * 
   * 会关闭关联的 WebSocket 连接、清理超时计时器并从内存中移除会话数据。
   * 
   * @param deviceId - 要删除的设备 ID
   * @returns 是否成功删除（false 表示会话不存在）
   */
  deleteSession(deviceId: string): boolean {
    const session = this.sessions.get(deviceId);
    if (session) {
      // 清理连接超时计时器
      if (session.connectionTimeoutId) {
        clearTimeout(session.connectionTimeoutId);
        session.connectionTimeoutId = null;
      }
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
   * 
   * 别名用于方便识别设备，支持中文和特殊字符。
   * 设置别名会同时更新会话的活跃时间。
   * 
   * @param deviceId - 设备 ID
   * @param alias - 新的别名
   * @returns 是否成功设置（false 表示设备不存在或已过期）
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
   * 根据别名查找会话
   * 
   * 支持大小写不敏感的精确匹配。
   * 
   * @param alias - 要查找的别名
   * @returns 所有匹配的会话数组
   */
  findByAlias(alias: string): DeviceSession[] {
    const lowerAlias = alias.toLowerCase();
    return Array.from(this.sessions.values()).filter(
      (s) => !this.isExpired(s) && s.alias?.toLowerCase() === lowerAlias
    );
  }

  /**
   * 更新会话连接状态
   * 
   * 用于在 WebSocket 连接建立或断开时更新会话状态。
   * 
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
   * 
   * 当收到 APP 的强度反馈时调用，同步更新会话中的强度数据。
   * 
   * @param deviceId - 设备 ID
   * @param strengthA - A 通道当前强度
   * @param strengthB - B 通道当前强度
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
   * 触摸会话以保持活跃
   * 
   * 更新 lastActive 时间戳，防止会话因不活动而过期。
   * 每次对设备的操作都应该调用此方法。
   * 
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
   * APP 绑定成功时调用
   * 
   * 取消连接超时计时器，因为设备已成功绑定 APP。
   * 同时更新会话的 boundToApp 状态。
   * 
   * @param deviceId - 设备 ID
   * @returns 是否成功
   */
  onAppBound(deviceId: string): boolean {
    const session = this.sessions.get(deviceId);
    if (session) {
      // 取消连接超时计时器
      if (session.connectionTimeoutId) {
        clearTimeout(session.connectionTimeoutId);
        session.connectionTimeoutId = null;
        console.log(`[会话] 已取消连接超时: ${deviceId} (APP 已绑定)`);
      }
      session.boundToApp = true;
      session.lastActive = new Date();
      return true;
    }
    return false;
  }

  /**
   * 获取当前会话数量
   */
  get sessionCount(): number {
    return this.sessions.size;
  }

  /**
   * 检查会话是否已过期
   */
  private isExpired(session: DeviceSession): boolean {
    return Date.now() - session.lastActive.getTime() > SESSION_TTL_MS;
  }

  /**
   * 清理所有过期会话
   * 
   * 遍历所有会话，删除超过 TTL 的会话并关闭其 WebSocket 连接。
   * 
   * @returns 清理的会话数量
   */
  cleanupExpiredSessions(): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [deviceId, session] of this.sessions) {
      const age = now - session.lastActive.getTime();
      if (age > SESSION_TTL_MS) {
        // 清理连接超时计时器
        if (session.connectionTimeoutId) {
          clearTimeout(session.connectionTimeoutId);
        }
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
   * 启动定期清理定时器
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
   * 停止定期清理定时器
   * 
   * 在服务器关闭时调用，防止内存泄漏。
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 清除所有会话
   * 
   * 关闭所有 WebSocket 连接、清理所有计时器并清空会话存储。
   * 通常在服务器关闭或重置时调用。
   */
  clearAll(): void {
    for (const session of this.sessions.values()) {
      // 清理连接超时计时器
      if (session.connectionTimeoutId) {
        clearTimeout(session.connectionTimeoutId);
      }
      if (session.ws) {
        try { session.ws.close(); } catch { /* 忽略 */ }
      }
    }
    this.sessions.clear();
  }
}
