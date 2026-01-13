/**
 * @fileoverview 设备管理工具
 * @description 实现 dg_connect, dg_list_devices, dg_set_alias, dg_find_device
 */

import type { ToolManager } from "../tool-manager";
import { createToolResult, createToolError } from "../tool-manager";
import type { SessionManager } from "../session-manager";
import type { DGLabWSServer } from "../ws-server";
import { getConfig } from "../config";
import * as os from "os";

/**
 * 获取本地 IP 地址（用于生成二维码）
 * @returns 本地 IP 地址
 */
function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      // 跳过内部和非 IPv4 地址
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

/**
 * 注册设备管理工具
 * @param toolManager - 工具管理器
 * @param sessionManager - 会话管理器
 * @param wsServer - WebSocket 服务器
 */
export function registerDeviceTools(
  toolManager: ToolManager,
  sessionManager: SessionManager,
  wsServer: DGLabWSServer
): void {
  const config = getConfig();
  const localIP = getLocalIP();

  // dg_connect - 创建新的设备连接
  toolManager.registerTool(
    "dg_connect",
    "建立与DG-LAB设备的连接，返回deviceId和二维码URL供APP扫描绑定",
    {
      type: "object",
      properties: {},
      required: [],
    },
    async () => {
      try {
        // 在会话管理器中创建新会话
        const session = sessionManager.createSession();

        // 在 WebSocket 服务器中创建控制器
        const clientId = wsServer.createController();

        // 更新会话的 clientId
        sessionManager.updateConnectionState(session.deviceId, {
          clientId,
          connected: true,
        });

        // 生成二维码 URL
        const qrCodeUrl = wsServer.getQRCodeUrl(clientId, localIP);
        const wsUrl = wsServer.getWSUrl(clientId, localIP);

        return createToolResult(
          JSON.stringify({
            deviceId: session.deviceId,
            clientId,
            qrCodeUrl,
            wsUrl,
            status: "waiting_for_app",
            message: "请使用DG-LAB APP扫描二维码进行绑定",
          })
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "连接失败";
        return createToolError(`连接失败: ${message}`);
      }
    }
  );

  // dg_list_devices - 列出所有设备
  toolManager.registerTool(
    "dg_list_devices",
    "列出所有已连接的设备及其状态",
    {
      type: "object",
      properties: {
        alias: {
          type: "string",
          description: "可选，按别名过滤设备",
        },
      },
      required: [],
    },
    async (params) => {
      let sessions = sessionManager.listSessions();

      // 如果提供了别名则过滤
      const alias = params.alias as string | undefined;
      if (alias) {
        sessions = sessionManager.findByAlias(alias);
      }

      const devices = sessions.map((s) => {
        // 检查控制器是否在 WS 服务器中已绑定
        const isBound = s.clientId ? wsServer.isControllerBound(s.clientId) : false;
        
        return {
          deviceId: s.deviceId,
          clientId: s.clientId,
          alias: s.alias,
          connected: s.connected,
          boundToApp: isBound,
          strengthA: s.strengthA,
          strengthB: s.strengthB,
          strengthLimitA: s.strengthLimitA,
          strengthLimitB: s.strengthLimitB,
          lastActive: s.lastActive.toISOString(),
        };
      });

      return createToolResult(JSON.stringify({ devices, count: devices.length }));
    }
  );

  // dg_set_alias - 设置设备别名
  toolManager.registerTool(
    "dg_set_alias",
    "为设备设置自定义别名，方便后续查找",
    {
      type: "object",
      properties: {
        deviceId: {
          type: "string",
          description: "设备ID",
        },
        alias: {
          type: "string",
          description: "自定义别名（如用户名、昵称等）",
        },
      },
      required: ["deviceId", "alias"],
    },
    async (params) => {
      const deviceId = params.deviceId as string;
      const alias = params.alias as string;

      if (!deviceId) {
        return createToolError("缺少必需参数: deviceId");
      }
      if (!alias) {
        return createToolError("缺少必需参数: alias");
      }

      const success = sessionManager.setAlias(deviceId, alias);
      if (!success) {
        return createToolError(`设备不存在: ${deviceId}`);
      }

      return createToolResult(
        JSON.stringify({
          success: true,
          deviceId,
          alias,
          message: `已将设备 ${deviceId} 的别名设置为 "${alias}"`,
        })
      );
    }
  );

  // dg_find_device - 按别名查找设备
  toolManager.registerTool(
    "dg_find_device",
    "通过别名查找设备（大小写不敏感）",
    {
      type: "object",
      properties: {
        alias: {
          type: "string",
          description: "要查找的别名",
        },
      },
      required: ["alias"],
    },
    async (params) => {
      const alias = params.alias as string;

      if (!alias) {
        return createToolError("缺少必需参数: alias");
      }

      const sessions = sessionManager.findByAlias(alias);
      const devices = sessions.map((s) => {
        const isBound = s.clientId ? wsServer.isControllerBound(s.clientId) : false;
        
        return {
          deviceId: s.deviceId,
          clientId: s.clientId,
          alias: s.alias,
          connected: s.connected,
          boundToApp: isBound,
          strengthA: s.strengthA,
          strengthB: s.strengthB,
          strengthLimitA: s.strengthLimitA,
          strengthLimitB: s.strengthLimitB,
        };
      });

      return createToolResult(
        JSON.stringify({
          devices,
          count: devices.length,
          searchAlias: alias,
        })
      );
    }
  );
}
