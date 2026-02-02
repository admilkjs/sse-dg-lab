/**
 * @module control-tools
 * @description 设备控制工具集，提供强度调节、波形发送、状态查询等功能
 */

import type { ToolManager } from "../tool-manager";
import { createToolResult, createToolError } from "../tool-manager";
import type { SessionManager } from "../session-manager";
import type { DGLabWSServer } from "../ws-server";
import { getWaveformStorage } from "./waveform-tools";

// 从公共模块导入验证函数并重新导出（保持向后兼容）
import {
  validateChannel,
  validateStrengthValue,
  validateStrengthMode,
  validateWaveforms,
} from "../utils/validators";

// 从公共模块导入设备解析函数
import {
  resolveDevice,
  validateDeviceId,
  ensureDeviceReady,
  resolveWaveformData,
} from "../utils/device-resolver";

// 重新导出验证函数（向后兼容）
export {
  validateChannel,
  validateStrengthValue,
  validateStrengthMode,
  validateWaveforms,
  resolveDevice,
  validateDeviceId,
};

// --- 工具注册 ---

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
        deviceId: {
          type: "string",
          description: "设备ID（与alias二选一，优先使用）",
        },
        alias: { type: "string", description: "设备别名（与deviceId二选一）" },
        channel: { type: "string", enum: ["A", "B"], description: "通道" },
        mode: {
          type: "string",
          enum: ["increase", "decrease", "set"],
          description: "模式",
        },
        value: {
          type: "number",
          minimum: 0,
          maximum: 200,
          description: "强度值",
        },
      },
      required: ["channel", "mode", "value"],
    },
    async (params) => {
      // 解析设备
      const deviceResult = resolveDevice(
        sessionManager,
        params.deviceId as string | undefined,
        params.alias as string | undefined
      );
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session;

      // 验证参数
      const channelResult = validateChannel(params.channel as string);
      if ("error" in channelResult)
        return createToolError(channelResult.error);
      const channel = channelResult.channel;

      const modeResult = validateStrengthMode(params.mode as string);
      if ("error" in modeResult) return createToolError(modeResult.error);
      const mode = modeResult.mode;

      const valueResult = validateStrengthValue(params.value);
      if ("error" in valueResult) return createToolError(valueResult.error);
      const value = valueResult.value;

      // 检查设备状态
      const readyResult = ensureDeviceReady(session, wsServer);
      if ("error" in readyResult) return createToolError(readyResult.error);

      // 发送强度命令到设备
      const success = wsServer.sendStrength(
        session.clientId!,
        channel,
        mode,
        value
      );
      if (!success) {
        return createToolError("发送强度命令失败");
      }

      // 更新会话活跃时间
      sessionManager.touchSession(session.deviceId);

      // 返回更新后的强度值
      const updated = sessionManager.getSession(session.deviceId);
      const newStrength =
        channel === "A" ? updated?.strengthA : updated?.strengthB;

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
        deviceId: {
          type: "string",
          description: "设备ID（与alias二选一，优先使用）",
        },
        alias: { type: "string", description: "设备别名（与deviceId二选一）" },
        channel: { type: "string", enum: ["A", "B"], description: "通道" },
        waveforms: {
          type: "array",
          items: { type: "string" },
          maxItems: 100,
          description:
            "波形数据数组，每项为8字节HEX字符串（16个十六进制字符）。与waveformName二选一",
        },
        waveformName: {
          type: "string",
          description:
            "已保存的波形名称（通过dg_parse_waveform保存）。与waveforms二选一",
        },
      },
      required: ["channel"],
    },
    async (params) => {
      // 解析设备
      const deviceResult = resolveDevice(
        sessionManager,
        params.deviceId as string | undefined,
        params.alias as string | undefined
      );
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session;

      // 验证通道
      const channelResult = validateChannel(params.channel as string);
      if ("error" in channelResult)
        return createToolError(channelResult.error);
      const channel = channelResult.channel;

      // 获取波形数据
      const rawWaveforms = params.waveforms as string[] | undefined;
      const waveformName = params.waveformName as string | undefined;

      let waveforms: string[];
      if (rawWaveforms) {
        const waveformsResult = validateWaveforms(rawWaveforms);
        if ("error" in waveformsResult)
          return createToolError(waveformsResult.error);
        waveforms = waveformsResult.waveforms;
      } else {
        const waveformResult = resolveWaveformData(
          rawWaveforms,
          waveformName,
          getWaveformStorage()
        );
        if ("error" in waveformResult)
          return createToolError(waveformResult.error);
        waveforms = waveformResult.waveforms;
      }

      // 检查设备状态
      const readyResult = ensureDeviceReady(session, wsServer);
      if ("error" in readyResult) return createToolError(readyResult.error);

      // 发送波形数据到设备
      const success = wsServer.sendWaveform(session.clientId!, channel, waveforms);
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
        deviceId: {
          type: "string",
          description: "设备ID（与alias二选一，优先使用）",
        },
        alias: { type: "string", description: "设备别名（与deviceId二选一）" },
        channel: { type: "string", enum: ["A", "B"], description: "通道" },
      },
      required: ["channel"],
    },
    async (params) => {
      // 解析设备
      const deviceResult = resolveDevice(
        sessionManager,
        params.deviceId as string | undefined,
        params.alias as string | undefined
      );
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session;

      // 验证通道
      const channelResult = validateChannel(params.channel as string);
      if ("error" in channelResult)
        return createToolError(channelResult.error);
      const channel = channelResult.channel;

      // 检查设备状态
      const readyResult = ensureDeviceReady(session, wsServer);
      if ("error" in readyResult) return createToolError(readyResult.error);

      // 发送清空命令
      const success = wsServer.clearWaveform(session.clientId!, channel);
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
- connected: 设备是否已连接
- strengthA/B: 当前A/B通道强度
- strengthLimitA/B: A/B通道强度上限（由APP设置，不可超过）
- disconnectedAt: 设备断开连接的时间戳（仅在断开时显示）
- reconnectionTimeRemaining: 剩余重连时间（秒），仅在设备断开时显示
建议在dg_connect后在用户说已完成后使用此接口检查boundToApp状态。`,
    {
      type: "object",
      properties: {
        deviceId: {
          type: "string",
          description: "设备ID（与alias二选一，优先使用）",
        },
        alias: { type: "string", description: "设备别名（与deviceId二选一）" },
      },
      required: [],
    },
    async (params) => {
      // 解析设备
      const deviceResult = resolveDevice(
        sessionManager,
        params.deviceId as string | undefined,
        params.alias as string | undefined
      );
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session;

      // 检查 APP 绑定状态
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
          disconnectedAt: session.disconnectedAt
            ? session.disconnectedAt.toISOString()
            : null,
          reconnectionTimeRemaining: reconnectionTimeRemainingSeconds,
        })
      );
    }
  );

  // ========== dg_start_continuous_playback ==========
  // 启动持续播放，循环发送波形直到手动停止
  toolManager.registerTool(
    "dg_start_continuous_playback",
    `启动持续播放模式，循环发送波形数据直到手动停止。

功能：
- 自动循环发送波形，适合需要持续输出的场景
- 使用动态等待机制，根据实际播放时长和发送耗时计算等待时间
- 每个 hexWaveform 代表 100ms 的播放时间

参数：
- deviceId 或 alias: 设备标识（二选一，deviceId优先）
- channel: A或B通道
- waveforms 或 waveformName: 波形数据来源（二选一）

与 dg_send_waveform 的区别：
- dg_send_waveform: 一次性发送，播放完毕后停止
- dg_start_continuous_playback: 循环发送，直到手动停止`,
    {
      type: "object",
      properties: {
        deviceId: {
          type: "string",
          description: "设备ID（与alias二选一，优先使用）",
        },
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
      },
      required: ["channel"],
    },
    async (params) => {
      // 解析设备
      const deviceResult = resolveDevice(
        sessionManager,
        params.deviceId as string | undefined,
        params.alias as string | undefined
      );
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session;

      // 验证通道
      const channelResult = validateChannel(params.channel as string);
      if ("error" in channelResult)
        return createToolError(channelResult.error);
      const channel = channelResult.channel;

      // 获取波形数据
      const rawWaveforms = params.waveforms as string[] | undefined;
      const waveformName = params.waveformName as string | undefined;

      let waveforms: string[];
      if (rawWaveforms) {
        const waveformsResult = validateWaveforms(rawWaveforms);
        if ("error" in waveformsResult)
          return createToolError(waveformsResult.error);
        waveforms = waveformsResult.waveforms;
      } else {
        const waveformResult = resolveWaveformData(
          rawWaveforms,
          waveformName,
          getWaveformStorage()
        );
        if ("error" in waveformResult)
          return createToolError(waveformResult.error);
        waveforms = waveformResult.waveforms;
      }

      // 检查设备状态
      const readyResult = ensureDeviceReady(session, wsServer);
      if ("error" in readyResult) return createToolError(readyResult.error);

      // 使用内部默认值（不暴露给 AI）
      const batchSize = 5;
      const bufferRatio = 0.9;

      // 启动持续播放
      const success = wsServer.startContinuousPlayback(
        session.clientId!,
        channel,
        waveforms,
        batchSize,
        bufferRatio
      );

      if (!success) {
        return createToolError("启动持续播放失败");
      }

      sessionManager.touchSession(session.deviceId);

      // 计算播放时长
      const playbackDuration = batchSize * 100;

      return createToolResult(
        JSON.stringify({
          success: true,
          deviceId: session.deviceId,
          channel,
          waveformCount: waveforms.length,
          playbackDuration,
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
        deviceId: {
          type: "string",
          description: "设备ID（与alias二选一，优先使用）",
        },
        alias: { type: "string", description: "设备别名（与deviceId二选一）" },
        channel: { type: "string", enum: ["A", "B"], description: "通道" },
      },
      required: ["channel"],
    },
    async (params) => {
      // 解析设备
      const deviceResult = resolveDevice(
        sessionManager,
        params.deviceId as string | undefined,
        params.alias as string | undefined
      );
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session;

      // 验证通道
      const channelResult = validateChannel(params.channel as string);
      if ("error" in channelResult)
        return createToolError(channelResult.error);
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

返回 A 和 B 通道的播放状态，包括：
- playing: 是否正在播放
- waveformCount: 波形数量
- batchSize: 每次发送的波形数量
- bufferRatio: 缓冲比例
- playbackDuration: 播放时长（毫秒）
- stats: 统计信息（发送次数、平均耗时）`,
    {
      type: "object",
      properties: {
        deviceId: {
          type: "string",
          description: "设备ID（与alias二选一，优先使用）",
        },
        alias: { type: "string", description: "设备别名（与deviceId二选一）" },
      },
      required: [],
    },
    async (params) => {
      // 解析设备
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
          channelA: statusA
            ? {
                playing: statusA.active,
                waveformCount: statusA.waveformCount,
                batchSize: statusA.batchSize,
                bufferRatio: statusA.bufferRatio,
                playbackDuration: statusA.playbackDuration,
                stats: statusA.stats,
              }
            : { playing: false },
          channelB: statusB
            ? {
                playing: statusB.active,
                waveformCount: statusB.waveformCount,
                batchSize: statusB.batchSize,
                bufferRatio: statusB.bufferRatio,
                playbackDuration: statusB.playbackDuration,
                stats: statusB.stats,
              }
            : { playing: false },
        })
      );
    }
  );
}
