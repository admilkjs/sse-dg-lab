/**
 * @fileoverview 设备控制工具集
 * 
 * 提供 DG-LAB 设备的核心控制功能，包括强度调节、波形发送和状态查询。
 * 这些工具需要在设备完成绑定（boundToApp 为 true）后才能使用。
 * 
 * 主要功能：
 * - dg_set_strength: 调节通道输出强度
 * - dg_send_waveform: 发送波形数据控制输出模式
 * - dg_clear_waveform: 清空波形队列停止输出
 * - dg_get_status: 查询设备完整状态
 * 
 * 使用前提：
 * 1. 已通过 dg_connect 创建连接
 * 2. 用户已用 APP 扫码完成绑定
 * 3. 通过 dg_get_status 确认 boundToApp 为 true
 */

import type { ToolManager } from "../tool-manager";
import { createToolResult, createToolError } from "../tool-manager";
import type { SessionManager } from "../session-manager";
import type { DGLabWSServer } from "../ws-server";
import { getWaveformStorage } from "./waveform-tools";
import { ToolError, ConnectionError, ErrorCode } from "../errors";

/** 
 * 强度调节模式
 * - increase: 在当前值基础上增加
 * - decrease: 在当前值基础上减少
 * - set: 直接设置为指定值
 */
type StrengthMode = "increase" | "decrease" | "set";

// ============================================================
// 参数验证函数
// 这些函数提供统一的参数校验逻辑，返回类型安全的结果
// ============================================================

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
function resolveDevice(
  sessionManager: SessionManager,
  deviceId?: string,
  alias?: string
): { error: string } | { session: NonNullable<ReturnType<SessionManager["getSession"]>> } {
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
    return { error: `别名 "${alias}" 匹配到多个设备 (${sessions.length} 个)，请使用 deviceId 指定` };
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
function validateDeviceId(
  sessionManager: SessionManager,
  deviceId: string | undefined
): { error: string } | { session: ReturnType<SessionManager["getSession"]> } {
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
 * 验证通道参数
 * 
 * DG-LAB 设备有两个独立的输出通道 A 和 B，
 * 每个通道可以独立控制强度和波形。
 * 
 * @param channel - 待验证的通道值
 * @returns 包含错误信息的对象，或包含规范化通道值的对象
 */
function validateChannel(channel: string | undefined): { error: string } | { channel: "A" | "B" } {
  if (!channel) {
    return { error: "缺少必需参数: channel" };
  }
  if (channel !== "A" && channel !== "B") {
    return { error: `无效的通道: ${channel}，必须是 "A" 或 "B"` };
  }
  return { channel };
}

/**
 * 验证强度值
 * 
 * 强度值范围为 0-200，但实际可用范围受 APP 设置的上限限制。
 * 超过上限的值会被设备自动截断。
 * 
 * @param value - 待验证的强度值
 * @returns 包含错误信息的对象，或包含数值类型强度值的对象
 */
function validateStrengthValue(value: unknown): { error: string } | { value: number } {
  if (value === undefined || value === null) {
    return { error: "缺少必需参数: value" };
  }
  const num = Number(value);
  if (isNaN(num) || num < 0 || num > 200) {
    return { error: `无效的强度值: ${value}，必须在 0-200 范围内` };
  }
  return { value: num };
}

/**
 * 验证强度调节模式
 * 
 * @param mode - 待验证的模式值
 * @returns 包含错误信息的对象，或包含类型安全模式值的对象
 */
function validateStrengthMode(mode: string | undefined): { error: string } | { mode: StrengthMode } {
  if (!mode) {
    return { error: "缺少必需参数: mode" };
  }
  if (mode !== "increase" && mode !== "decrease" && mode !== "set") {
    return { error: `无效的模式: ${mode}，必须是 "increase"、"decrease" 或 "set"` };
  }
  return { mode };
}

/**
 * 验证波形数据数组
 * 
 * 波形数据是 DG-LAB 协议的核心，每个波形由 8 字节（16 个十六进制字符）组成，
 * 包含频率、脉宽、强度等参数。详细格式参见 waveform-parser.ts。
 * 
 * @param waveforms - 待验证的波形数组
 * @returns 包含错误信息的对象，或包含验证通过的波形数组的对象
 */
function validateWaveforms(waveforms: unknown): { error: string } | { waveforms: string[] } {
  if (!waveforms) {
    return { error: "缺少必需参数: waveforms" };
  }
  if (!Array.isArray(waveforms)) {
    return { error: "waveforms 必须是数组" };
  }
  if (waveforms.length === 0) {
    return { error: "waveforms 数组不能为空" };
  }
  // 限制单次发送的波形数量，避免内存问题
  if (waveforms.length > 100) {
    return { error: `waveforms 数组长度超过限制: ${waveforms.length}，最大 100` };
  }

  // 验证每个波形是否为有效的 16 字符 HEX 字符串
  const hexPattern = /^[0-9a-fA-F]{16}$/;
  for (let i = 0; i < waveforms.length; i++) {
    const wf = waveforms[i];
    if (typeof wf !== "string" || !hexPattern.test(wf)) {
      return { error: `无效的波形数据 [${i}]: "${wf}"，必须是16字符的HEX字符串` };
    }
  }

  return { waveforms: waveforms as string[] };
}

// ============================================================
// 工具注册
// ============================================================

/**
 * 注册所有设备控制相关的 MCP 工具
 * 
 * 将控制工具注册到工具管理器中，使 AI 能够通过 MCP 协议
 * 控制已绑定的 DG-LAB 设备。
 * 
 * @param toolManager - 工具管理器实例，用于注册工具
 * @param sessionManager - 会话管理器，维护设备会话状态
 * @param wsServer - WebSocket 服务器，处理与 APP 的实时通信
 */
export function registerControlTools(
  toolManager: ToolManager,
  sessionManager: SessionManager,
  wsServer: DGLabWSServer
): void {
  // ========== dg_set_strength ==========
  // 调节通道输出强度，支持增加、减少和直接设置三种模式
  toolManager.registerTool(
    "dg_set_strength",
    `设置设备通道强度。必须在boundToApp为true后才能使用。
参数说明：
- deviceId 或 alias: 设备标识（二选一，deviceId优先）
- channel: A或B通道
- mode: increase(增加)/decrease(减少)/set(直接设置)
- value: 强度值0-200，但实际不能超过strengthLimit
使用前请先用dg_get_status确认设备已绑定APP且了解当前强度上限。`,
    {
      type: "object",
      properties: {
        deviceId: { type: "string", description: "设备ID（与alias二选一，优先使用）" },
        alias: { type: "string", description: "设备别名（与deviceId二选一）" },
        channel: { type: "string", enum: ["A", "B"], description: "通道" },
        mode: { type: "string", enum: ["increase", "decrease", "set"], description: "模式" },
        value: { type: "number", minimum: 0, maximum: 200, description: "强度值" },
      },
      required: ["channel", "mode", "value"],
    },
    async (params) => {
      // 使用 resolveDevice 支持 deviceId 和 alias
      const deviceResult = resolveDevice(
        sessionManager,
        params.deviceId as string | undefined,
        params.alias as string | undefined
      );
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session;

      const channelResult = validateChannel(params.channel as string);
      if ("error" in channelResult) return createToolError(channelResult.error);
      const channel = channelResult.channel;

      const modeResult = validateStrengthMode(params.mode as string);
      if ("error" in modeResult) return createToolError(modeResult.error);
      const mode = modeResult.mode;

      const valueResult = validateStrengthValue(params.value);
      if ("error" in valueResult) return createToolError(valueResult.error);
      const value = valueResult.value;

      // 连接状态检查：必须有 clientId 才能发送命令
      if (!session.clientId) {
        return createToolError("设备未连接");
      }

      // 绑定状态检查：APP 必须已扫码绑定
      const isBound = wsServer.isControllerBound(session.clientId);
      if (!isBound) {
        return createToolError("设备未绑定APP");
      }

      // 发送强度命令到设备
      const success = wsServer.sendStrength(session.clientId, channel, mode, value);
      if (!success) {
        return createToolError("发送强度命令失败");
      }

      // 更新会话活跃时间，防止被清理
      sessionManager.touchSession(session.deviceId);

      // 返回更新后的强度值
      const updated = sessionManager.getSession(session.deviceId);
      const newStrength = channel === "A" ? updated?.strengthA : updated?.strengthB;

      return createToolResult(
        JSON.stringify({
          success: true,
          deviceId: session.deviceId,
          channel,
          currentStrength: newStrength,
        })
      );
    }
  );

  // ========== dg_send_waveform ==========
  // 发送波形数据控制输出模式，支持直接提供数据或引用已保存的波形
  toolManager.registerTool(
    "dg_send_waveform",
    `发送波形数据到设备，控制输出模式。必须在boundToApp为true后才能使用。
支持两种方式：
1. 直接提供waveforms数组（每项为16字符HEX字符串，最多100项）
2. 提供waveformName引用已保存的波形（通过dg_parse_waveform保存）
两种方式二选一，如果同时提供则优先使用waveforms。
波形会按顺序播放，播放完毕后停止。`,
    {
      type: "object",
      properties: {
        deviceId: { type: "string", description: "设备ID（与alias二选一，优先使用）" },
        alias: { type: "string", description: "设备别名（与deviceId二选一）" },
        channel: { type: "string", enum: ["A", "B"], description: "通道" },
        waveforms: {
          type: "array",
          items: { type: "string" },
          maxItems: 100,
          description: "波形数据数组，每项为8字节HEX字符串（16个十六进制字符）。与waveformName二选一",
        },
        waveformName: {
          type: "string",
          description: "已保存的波形名称（通过dg_parse_waveform保存）。与waveforms二选一",
        },
      },
      required: ["channel"],
    },
    async (params) => {
      // 使用 resolveDevice 支持 deviceId 和 alias
      const deviceResult = resolveDevice(
        sessionManager,
        params.deviceId as string | undefined,
        params.alias as string | undefined
      );
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session;

      const channelResult = validateChannel(params.channel as string);
      if ("error" in channelResult) return createToolError(channelResult.error);
      const channel = channelResult.channel;

      // 获取波形数据来源
      const rawWaveforms = params.waveforms as string[] | undefined;
      const waveformName = params.waveformName as string | undefined;

      // 必须提供波形数据来源之一
      if (!rawWaveforms && !waveformName) {
        return createToolError("必须提供 waveforms 或 waveformName 参数之一");
      }

      let waveforms: string[];

      if (rawWaveforms) {
        // 方式一：直接提供波形数据
        const waveformsResult = validateWaveforms(rawWaveforms);
        if ("error" in waveformsResult) return createToolError(waveformsResult.error);
        waveforms = waveformsResult.waveforms;
      } else {
        // 方式二：从存储中获取已保存的波形
        const storage = getWaveformStorage();
        const storedWaveform = storage.get(waveformName!);
        
        if (!storedWaveform) {
          return createToolError(`波形不存在: ${waveformName}`);
        }
        
        waveforms = storedWaveform.hexWaveforms;
      }

      // 连接和绑定状态检查
      if (!session.clientId) {
        return createToolError("设备未连接");
      }

      const isBound = wsServer.isControllerBound(session.clientId);
      if (!isBound) {
        return createToolError("设备未绑定APP");
      }

      // 发送波形数据到设备
      const success = wsServer.sendWaveform(session.clientId, channel, waveforms);
      if (!success) {
        return createToolError("发送波形数据失败");
      }

      sessionManager.touchSession(session.deviceId);

      return createToolResult(
        JSON.stringify({
          success: true,
          deviceId: session.deviceId,
          channel,
          waveformCount: waveforms.length,
          source: rawWaveforms ? "direct" : `waveform:${waveformName}`,
        })
      );
    }
  );

  // ========== dg_clear_waveform ==========
  // 清空波形队列，立即停止当前播放
  toolManager.registerTool(
    "dg_clear_waveform",
    `清空设备指定通道的波形队列，立即停止当前波形播放。
用于中断正在播放的波形或在发送新波形前清空队列。`,
    {
      type: "object",
      properties: {
        deviceId: { type: "string", description: "设备ID（与alias二选一，优先使用）" },
        alias: { type: "string", description: "设备别名（与deviceId二选一）" },
        channel: { type: "string", enum: ["A", "B"], description: "通道" },
      },
      required: ["channel"],
    },
    async (params) => {
      // 使用 resolveDevice 支持 deviceId 和 alias
      const deviceResult = resolveDevice(
        sessionManager,
        params.deviceId as string | undefined,
        params.alias as string | undefined
      );
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session;

      const channelResult = validateChannel(params.channel as string);
      if ("error" in channelResult) return createToolError(channelResult.error);
      const channel = channelResult.channel;

      // 连接和绑定状态检查
      if (!session.clientId) {
        return createToolError("设备未连接");
      }

      const isBound = wsServer.isControllerBound(session.clientId);
      if (!isBound) {
        return createToolError("设备未绑定APP");
      }

      // 发送清空命令
      const success = wsServer.clearWaveform(session.clientId, channel);
      if (!success) {
        return createToolError("清空波形队列失败");
      }

      sessionManager.touchSession(session.deviceId);

      return createToolResult(
        JSON.stringify({
          success: true,
          deviceId: session.deviceId,
          channel,
        })
      );
    }
  );

  // ========== dg_get_status ==========
  // 获取设备完整状态，用于检查绑定状态和当前参数
  toolManager.registerTool(
    "dg_get_status",
    `获取设备完整状态信息。
关键字段：
- boundToApp: 是否已绑定APP（必须为true才能控制设备）
- strengthA/B: 当前A/B通道强度
- strengthLimitA/B: A/B通道强度上限（由APP设置，不可超过）
建议在dg_connect后在用户说已完成后使用此接口检查boundToApp状态。`,
    {
      type: "object",
      properties: {
        deviceId: { type: "string", description: "设备ID（与alias二选一，优先使用）" },
        alias: { type: "string", description: "设备别名（与deviceId二选一）" },
      },
      required: [],
    },
    async (params) => {
      // 使用 resolveDevice 支持 deviceId 和 alias
      const deviceResult = resolveDevice(
        sessionManager,
        params.deviceId as string | undefined,
        params.alias as string | undefined
      );
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session;

      // 检查 APP 绑定状态
      const isBound = session.clientId ? wsServer.isControllerBound(session.clientId) : false;

      // 返回完整的设备状态信息
      return createToolResult(
        JSON.stringify({
          deviceId: session.deviceId,
          alias: session.alias,
          connected: session.connected,
          boundToApp: isBound,
          strengthA: session.strengthA,
          strengthB: session.strengthB,
          strengthLimitA: session.strengthLimitA,
          strengthLimitB: session.strengthLimitB,
        })
      );
    }
  );

  // ========== dg_start_continuous_playback ==========
  // 启动持续播放，循环发送波形直到手动停止
  toolManager.registerTool(
    "dg_start_continuous_playback",
    `启动持续播放模式，循环发送波形数据直到手动停止。
与dg_send_waveform不同，持续播放会自动循环发送波形，适合需要持续输出的场景。
支持两种方式提供波形：
1. 直接提供waveforms数组
2. 提供waveformName引用已保存的波形
可选参数：
- interval: 发送间隔（毫秒），默认100ms
- batchSize: 每次发送的波形数量，默认5`,
    {
      type: "object",
      properties: {
        deviceId: { type: "string", description: "设备ID（与alias二选一，优先使用）" },
        alias: { type: "string", description: "设备别名（与deviceId二选一）" },
        channel: { type: "string", enum: ["A", "B"], description: "通道" },
        waveforms: {
          type: "array",
          items: { type: "string" },
          maxItems: 100,
          description: "波形数据数组，每项为8字节HEX字符串。与waveformName二选一",
        },
        waveformName: {
          type: "string",
          description: "已保存的波形名称。与waveforms二选一",
        },
        interval: {
          type: "number",
          minimum: 50,
          maximum: 5000,
          description: "发送间隔（毫秒），默认100",
        },
        batchSize: {
          type: "number",
          minimum: 1,
          maximum: 20,
          description: "每次发送的波形数量，默认5",
        },
      },
      required: ["channel"],
    },
    async (params) => {
      // 使用 resolveDevice 支持 deviceId 和 alias
      const deviceResult = resolveDevice(
        sessionManager,
        params.deviceId as string | undefined,
        params.alias as string | undefined
      );
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session;

      const channelResult = validateChannel(params.channel as string);
      if ("error" in channelResult) return createToolError(channelResult.error);
      const channel = channelResult.channel;

      // 获取波形数据来源
      const rawWaveforms = params.waveforms as string[] | undefined;
      const waveformName = params.waveformName as string | undefined;

      if (!rawWaveforms && !waveformName) {
        return createToolError("必须提供 waveforms 或 waveformName 参数之一");
      }

      let waveforms: string[];

      if (rawWaveforms) {
        const waveformsResult = validateWaveforms(rawWaveforms);
        if ("error" in waveformsResult) return createToolError(waveformsResult.error);
        waveforms = waveformsResult.waveforms;
      } else {
        const storage = getWaveformStorage();
        const storedWaveform = storage.get(waveformName!);
        if (!storedWaveform) {
          return createToolError(`波形不存在: ${waveformName}`);
        }
        waveforms = storedWaveform.hexWaveforms;
      }

      // 连接和绑定状态检查
      if (!session.clientId) {
        return createToolError("设备未连接");
      }

      const isBound = wsServer.isControllerBound(session.clientId);
      if (!isBound) {
        return createToolError("设备未绑定APP");
      }

      // 获取可选参数
      const interval = typeof params.interval === "number" ? params.interval : 100;
      const batchSize = typeof params.batchSize === "number" ? params.batchSize : 5;

      // 启动持续播放
      const success = wsServer.startContinuousPlayback(
        session.clientId,
        channel,
        waveforms,
        interval,
        batchSize
      );

      if (!success) {
        return createToolError("启动持续播放失败");
      }

      sessionManager.touchSession(session.deviceId);

      return createToolResult(
        JSON.stringify({
          success: true,
          deviceId: session.deviceId,
          channel,
          waveformCount: waveforms.length,
          interval,
          batchSize,
          source: rawWaveforms ? "direct" : `waveform:${waveformName}`,
        })
      );
    }
  );

  // ========== dg_stop_continuous_playback ==========
  // 停止持续播放
  toolManager.registerTool(
    "dg_stop_continuous_playback",
    `停止指定通道的持续播放。
会立即停止循环发送并清空波形队列。`,
    {
      type: "object",
      properties: {
        deviceId: { type: "string", description: "设备ID（与alias二选一，优先使用）" },
        alias: { type: "string", description: "设备别名（与deviceId二选一）" },
        channel: { type: "string", enum: ["A", "B"], description: "通道" },
      },
      required: ["channel"],
    },
    async (params) => {
      // 使用 resolveDevice 支持 deviceId 和 alias
      const deviceResult = resolveDevice(
        sessionManager,
        params.deviceId as string | undefined,
        params.alias as string | undefined
      );
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session;

      const channelResult = validateChannel(params.channel as string);
      if ("error" in channelResult) return createToolError(channelResult.error);
      const channel = channelResult.channel;

      // 连接状态检查
      if (!session.clientId) {
        return createToolError("设备未连接");
      }

      // 停止持续播放
      const success = wsServer.stopContinuousPlayback(session.clientId, channel);

      if (!success) {
        return createToolError("停止持续播放失败：该通道没有正在进行的持续播放");
      }

      sessionManager.touchSession(session.deviceId);

      return createToolResult(
        JSON.stringify({
          success: true,
          deviceId: session.deviceId,
          channel,
        })
      );
    }
  );

  // ========== dg_get_playback_status ==========
  // 获取持续播放状态
  toolManager.registerTool(
    "dg_get_playback_status",
    `获取设备的持续播放状态。
返回A和B通道的播放状态，包括是否正在播放、波形数量、发送间隔等信息。`,
    {
      type: "object",
      properties: {
        deviceId: { type: "string", description: "设备ID（与alias二选一，优先使用）" },
        alias: { type: "string", description: "设备别名（与deviceId二选一）" },
      },
      required: [],
    },
    async (params) => {
      // 使用 resolveDevice 支持 deviceId 和 alias
      const deviceResult = resolveDevice(
        sessionManager,
        params.deviceId as string | undefined,
        params.alias as string | undefined
      );
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session;

      // 连接状态检查
      if (!session.clientId) {
        return createToolError("设备未连接");
      }

      // 获取两个通道的播放状态
      const statusA = wsServer.getContinuousPlaybackState(session.clientId, "A");
      const statusB = wsServer.getContinuousPlaybackState(session.clientId, "B");

      return createToolResult(
        JSON.stringify({
          deviceId: session.deviceId,
          channelA: statusA ? {
            playing: statusA.active,
            waveformCount: statusA.waveformCount,
            interval: statusA.interval,
            batchSize: statusA.batchSize,
          } : { playing: false },
          channelB: statusB ? {
            playing: statusB.active,
            waveformCount: statusB.waveformCount,
            interval: statusB.interval,
            batchSize: statusB.batchSize,
          } : { playing: false },
        })
      );
    }
  );
}

// ============================================================
// 导出验证函数供测试使用
// ============================================================

export {
  validateDeviceId,
  validateChannel,
  validateStrengthValue,
  validateStrengthMode,
  validateWaveforms,
  resolveDevice,
};
