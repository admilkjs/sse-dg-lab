/**
 * @fileoverview 设备控制工具
 * @description 实现 dg_set_strength, dg_send_waveform, dg_clear_waveform, dg_get_status
 */

import type { ToolManager } from "../tool-manager";
import { createToolResult, createToolError } from "../tool-manager";
import type { SessionManager } from "../session-manager";
import type { DGLabWSServer } from "../ws-server";
import { getWaveformStorage } from "./waveform-tools";

/** 强度模式类型 */
type StrengthMode = "increase" | "decrease" | "set";

/**
 * 验证设备 ID
 * @param sessionManager - 会话管理器
 * @param deviceId - 设备 ID
 * @returns 错误信息或会话对象
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
 * 验证通道
 * @param channel - 通道
 * @returns 错误信息或通道值
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
 * @param value - 强度值
 * @returns 错误信息或强度值
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
 * 验证强度模式
 * @param mode - 模式
 * @returns 错误信息或模式值
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
 * 验证波形数组
 * @param waveforms - 波形数组
 * @returns 错误信息或波形数组
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

/**
 * 注册设备控制工具
 * @param toolManager - 工具管理器
 * @param sessionManager - 会话管理器
 * @param wsServer - WebSocket 服务器
 */
export function registerControlTools(
  toolManager: ToolManager,
  sessionManager: SessionManager,
  wsServer: DGLabWSServer
): void {
  // dg_set_strength - 设置通道强度
  toolManager.registerTool(
    "dg_set_strength",
    `设置设备通道强度。必须在boundToApp为true后才能使用。
参数说明：
- channel: A或B通道
- mode: increase(增加)/decrease(减少)/set(直接设置)
- value: 强度值0-200，但实际不能超过strengthLimit
使用前请先用dg_get_status确认设备已绑定APP且了解当前强度上限。`,
    {
      type: "object",
      properties: {
        deviceId: { type: "string", description: "设备ID" },
        channel: { type: "string", enum: ["A", "B"], description: "通道" },
        mode: { type: "string", enum: ["increase", "decrease", "set"], description: "模式" },
        value: { type: "number", minimum: 0, maximum: 200, description: "强度值" },
      },
      required: ["deviceId", "channel", "mode", "value"],
    },
    async (params) => {
      // 验证 deviceId
      const deviceResult = validateDeviceId(sessionManager, params.deviceId as string);
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session!;

      // 验证 channel
      const channelResult = validateChannel(params.channel as string);
      if ("error" in channelResult) return createToolError(channelResult.error);
      const channel = channelResult.channel;

      // 验证 mode
      const modeResult = validateStrengthMode(params.mode as string);
      if ("error" in modeResult) return createToolError(modeResult.error);
      const mode = modeResult.mode;

      // 验证 value
      const valueResult = validateStrengthValue(params.value);
      if ("error" in valueResult) return createToolError(valueResult.error);
      const value = valueResult.value;

      // 检查连接 - 需要 clientId 来发送命令
      if (!session.clientId) {
        return createToolError("设备未连接");
      }

      // 检查是否已绑定 APP
      const isBound = wsServer.isControllerBound(session.clientId);
      if (!isBound) {
        return createToolError("设备未绑定APP");
      }

      // 通过 WS 服务器发送命令
      const success = wsServer.sendStrength(session.clientId, channel, mode, value);
      if (!success) {
        return createToolError("发送强度命令失败");
      }

      // 触摸会话
      sessionManager.touchSession(session.deviceId);

      // 获取更新后的会话用于响应
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

  // dg_send_waveform - 发送波形数据
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
        deviceId: { type: "string", description: "设备ID" },
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
      required: ["deviceId", "channel"],
    },
    async (params) => {
      // 验证 deviceId
      const deviceResult = validateDeviceId(sessionManager, params.deviceId as string);
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session!;

      // 验证 channel
      const channelResult = validateChannel(params.channel as string);
      if ("error" in channelResult) return createToolError(channelResult.error);
      const channel = channelResult.channel;

      // 获取波形数据
      const rawWaveforms = params.waveforms as string[] | undefined;
      const waveformName = params.waveformName as string | undefined;

      // 验证参数：必须提供 waveforms 或 waveformName 之一
      if (!rawWaveforms && !waveformName) {
        return createToolError("必须提供 waveforms 或 waveformName 参数之一");
      }

      let waveforms: string[];

      if (rawWaveforms) {
        // 使用直接提供的波形数据
        const waveformsResult = validateWaveforms(rawWaveforms);
        if ("error" in waveformsResult) return createToolError(waveformsResult.error);
        waveforms = waveformsResult.waveforms;
      } else {
        // 从存储中获取波形
        const storage = getWaveformStorage();
        const storedWaveform = storage.get(waveformName!);
        
        if (!storedWaveform) {
          return createToolError(`波形不存在: ${waveformName}`);
        }
        
        waveforms = storedWaveform.hexWaveforms;
      }

      // 检查连接
      if (!session.clientId) {
        return createToolError("设备未连接");
      }

      // 检查是否已绑定 APP
      const isBound = wsServer.isControllerBound(session.clientId);
      if (!isBound) {
        return createToolError("设备未绑定APP");
      }

      // 通过 WS 服务器发送波形
      const success = wsServer.sendWaveform(session.clientId, channel, waveforms);
      if (!success) {
        return createToolError("发送波形数据失败");
      }

      // 触摸会话
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

  // dg_clear_waveform - 清空波形队列
  toolManager.registerTool(
    "dg_clear_waveform",
    `清空设备指定通道的波形队列，立即停止当前波形播放。
用于中断正在播放的波形或在发送新波形前清空队列。`,
    {
      type: "object",
      properties: {
        deviceId: { type: "string", description: "设备ID" },
        channel: { type: "string", enum: ["A", "B"], description: "通道" },
      },
      required: ["deviceId", "channel"],
    },
    async (params) => {
      // 验证 deviceId
      const deviceResult = validateDeviceId(sessionManager, params.deviceId as string);
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session!;

      // 验证 channel
      const channelResult = validateChannel(params.channel as string);
      if ("error" in channelResult) return createToolError(channelResult.error);
      const channel = channelResult.channel;

      // 检查连接
      if (!session.clientId) {
        return createToolError("设备未连接");
      }

      // 检查是否已绑定 APP
      const isBound = wsServer.isControllerBound(session.clientId);
      if (!isBound) {
        return createToolError("设备未绑定APP");
      }

      // 通过 WS 服务器清空波形
      const success = wsServer.clearWaveform(session.clientId, channel);
      if (!success) {
        return createToolError("清空波形队列失败");
      }

      // 触摸会话
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

  // dg_get_status - 获取设备状态
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
        deviceId: { type: "string", description: "设备ID" },
      },
      required: ["deviceId"],
    },
    async (params) => {
      // 验证 deviceId
      const deviceResult = validateDeviceId(sessionManager, params.deviceId as string);
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session!;

      // 通过 WS 服务器检查是否已绑定 APP
      const isBound = session.clientId ? wsServer.isControllerBound(session.clientId) : false;

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
}

// 导出验证函数供测试使用
export {
  validateDeviceId,
  validateChannel,
  validateStrengthValue,
  validateStrengthMode,
  validateWaveforms,
};
