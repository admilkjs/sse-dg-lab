/**
 * @module utils/device-resolver
 * @description 设备解析和状态检查工具函数
 */

import type { SessionManager, DeviceSession } from "../session-manager";
import type { DGLabWSServer } from "../ws-server";
import type { WaveformStorage } from "../waveform-storage";

/**
 * 解析设备标识
 *
 * 支持通过 deviceId 或 alias 查找设备。
 * deviceId 优先级高于 alias。
 *
 * @param sessionManager - 会话管理器
 * @param deviceId - 设备 ID（可选）
 * @param alias - 设备别名（可选）
 * @returns 解析结果，包含会话或错误信息
 */
export function resolveDevice(
  sessionManager: SessionManager,
  deviceId?: string,
  alias?: string
): { error: string } | { session: DeviceSession } {
  // 必须提供 deviceId 或 alias 之一
  if (!deviceId && !alias) {
    return { error: "必须提供 deviceId 或 alias 参数之一" };
  }

  // deviceId 优先级高于 alias
  if (deviceId) {
    const session = sessionManager.getSession(deviceId);
    if (!session) {
      return { error: `设备不存在: ${deviceId}` };
    }
    return { session };
  }

  // 通过 alias 查找
  const sessions = sessionManager.findByAlias(alias!);
  if (sessions.length === 0) {
    return { error: `未找到别名为 "${alias}" 的设备` };
  }
  if (sessions.length > 1) {
    return {
      error: `别名 "${alias}" 匹配到多个设备 (${sessions.length} 个)，请使用 deviceId 指定`,
    };
  }
  return { session: sessions[0] };
}

/**
 * 验证设备 ID 并获取对应的会话
 *
 * @param sessionManager - 会话管理器实例
 * @param deviceId - 待验证的设备 ID
 * @returns 包含错误信息的对象，或包含会话对象的对象
 *
 * @example
 * const result = validateDeviceId(sessionManager, params.deviceId);
 * if ("error" in result) return createToolError(result.error);
 * const session = result.session;
 */
export function validateDeviceId(
  sessionManager: SessionManager,
  deviceId: string | undefined
): { error: string } | { session: DeviceSession } {
  if (!deviceId) {
    return { error: "缺少必需参数: deviceId" };
  }

  const session = sessionManager.getSession(deviceId);
  if (!session) {
    return { error: `设备不存在: ${deviceId}` };
  }

  return { session };
}

/**
 * 确保设备已就绪（已连接且已绑定 APP）
 *
 * @param session - 设备会话
 * @param wsServer - WebSocket 服务器
 * @returns 包含错误信息的对象，或表示成功的对象
 */
export function ensureDeviceReady(
  session: DeviceSession,
  wsServer: DGLabWSServer
): { error: string } | { success: true } {
  // 连接状态检查：必须有 clientId 才能发送命令
  if (!session.clientId) {
    return { error: "设备未连接" };
  }

  // 绑定状态检查：APP 必须已扫码绑定
  const isBound = wsServer.isControllerBound(session.clientId);
  if (!isBound) {
    return { error: "设备未绑定APP" };
  }

  return { success: true };
}

/**
 * 解析波形数据来源
 *
 * 支持两种方式：
 * 1. 直接提供 waveforms 数组
 * 2. 通过 waveformName 从存储中获取
 *
 * @param rawWaveforms - 直接提供的波形数组（可选）
 * @param waveformName - 已保存的波形名称（可选）
 * @param storage - 波形存储实例
 * @returns 包含错误信息的对象，或包含波形数组的对象
 */
export function resolveWaveformData(
  rawWaveforms: string[] | undefined,
  waveformName: string | undefined,
  storage: WaveformStorage
): { error: string } | { waveforms: string[] } {
  // 必须提供波形数据来源之一
  if (!rawWaveforms && !waveformName) {
    return { error: "必须提供 waveforms 或 waveformName 参数之一" };
  }

  if (rawWaveforms) {
    // 方式一：直接提供波形数据（已经过验证）
    return { waveforms: rawWaveforms };
  }

  // 方式二：从存储中获取已保存的波形
  const storedWaveform = storage.get(waveformName!);
  if (!storedWaveform) {
    return { error: `波形不存在: ${waveformName}` };
  }

  return { waveforms: storedWaveform.hexWaveforms };
}

/**
 * 构建设备状态信息
 *
 * 合并会话信息和 WebSocket 绑定状态，生成统一的设备状态对象。
 *
 * @param session - 设备会话
 * @param wsServer - WebSocket 服务器
 * @param sessionManager - 会话管理器
 * @returns 设备状态对象
 */
export function buildDeviceStatus(
  session: DeviceSession,
  wsServer: DGLabWSServer,
  sessionManager: SessionManager
): {
  deviceId: string;
  alias: string | null;
  connected: boolean;
  boundToApp: boolean;
  strengthA: number;
  strengthB: number;
  strengthLimitA: number;
  strengthLimitB: number;
  reconnectionTimeRemaining: number | null;
} {
  // boundToApp 表示 APP 是否已扫码并建立连接
  const isBound = session.clientId
    ? wsServer.isControllerBound(session.clientId)
    : false;

  // 计算剩余重连时间（秒）
  const reconnectionTimeRemaining =
    sessionManager.getReconnectionTimeRemaining(session.deviceId);
  const reconnectionTimeRemainingSeconds =
    reconnectionTimeRemaining !== null
      ? Math.ceil(reconnectionTimeRemaining / 1000)
      : null;

  return {
    deviceId: session.deviceId,
    alias: session.alias,
    connected: session.connected,
    boundToApp: isBound,
    strengthA: session.strengthA,
    strengthB: session.strengthB,
    strengthLimitA: session.strengthLimitA,
    strengthLimitB: session.strengthLimitB,
    reconnectionTimeRemaining: reconnectionTimeRemainingSeconds,
  };
}
