/**
 * @fileoverview 设备管理工具
 * @description 实现 dg_connect, dg_list_devices, dg_set_alias, dg_find_device, dg_disconnect
 */

import type { ToolManager } from "../tool-manager";
import { createToolResult, createToolError } from "../tool-manager";
import type { SessionManager } from "../session-manager";
import type { DGLabWSServer } from "../ws-server";
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
 * @param publicIp - 公网IP（可选，用于生成二维码）
 */
export function registerDeviceTools(
  toolManager: ToolManager,
  sessionManager: SessionManager,
  wsServer: DGLabWSServer,
  publicIp?: string
): void {
  // 优先使用公网IP，否则使用本地IP
  const ipAddress = publicIp || getLocalIP();

  // dg_connect - 创建新的设备连接
  toolManager.registerTool(
    "dg_connect",
    `【第一步】创建DG-LAB设备连接。返回deviceId（后续操作必需）和qrCodeUrl（二维码链接）。
使用流程：1.调用此工具获取二维码 → 2.生成二维码后让用户用DG-LAB APP扫码 → 3.用户说扫了码后用dg_get_status检查boundToApp是否为true → 4.boundToApp为true后才能控制设备。
注意：每次调用会创建新连接，建议先用dg_list_devices检查是否已有可用连接是属于用户的。`,
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
        const qrCodeUrl = wsServer.getQRCodeUrl(clientId, ipAddress);

        return createToolResult(
          JSON.stringify({
            deviceId: session.deviceId,
            qrCodeUrl,
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
    `列出所有已创建的设备连接及其状态。
返回字段说明：
- deviceId: 设备唯一标识，用于后续所有操作
- alias: 设备别名（可选，用于方便识别）
- connected: 会话是否已建立
- boundToApp: APP是否已扫码绑定（必须为true才能控制设备）
- strengthA/B: 当前A/B通道强度(0-200)
- strengthLimitA/B: A/B通道强度上限（由APP设置）
可选参数alias用于按别名过滤设备。`,
    {
      type: "object",
      properties: {
        alias: {
          type: "string",
          description: "可选，按别名过滤设备（大小写不敏感）",
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
          alias: s.alias,
          connected: s.connected,
          boundToApp: isBound,
          strengthA: s.strengthA,
          strengthB: s.strengthB,
          strengthLimitA: s.strengthLimitA,
          strengthLimitB: s.strengthLimitB,
        };
      });

      return createToolResult(JSON.stringify({ devices, count: devices.length }));
    }
  );

  // dg_set_alias - 设置设备别名
  toolManager.registerTool(
    "dg_set_alias",
    `为设备设置自定义别名，方便后续通过别名查找和管理设备。
别名可以是用户名、昵称或任何便于识别的名称。
设置后可通过dg_find_device按别名查找，或在dg_disconnect中使用别名断开连接。`,
    {
      type: "object",
      properties: {
        deviceId: {
          type: "string",
          description: "设备ID（从dg_connect或dg_list_devices获取）",
        },
        alias: {
          type: "string",
          description: "自定义别名（如用户名、昵称等，支持中文）",
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
        })
      );
    }
  );

  // dg_find_device - 按别名查找设备
  toolManager.registerTool(
    "dg_find_device",
    `通过别名查找设备（大小写不敏感，支持模糊匹配）。
返回所有匹配的设备列表，包含完整状态信息。
适用场景：当知道用户别名但不记得deviceId时使用。
返回字段与dg_list_devices相同。`,
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
        })
      );
    }
  );

  // dg_disconnect - 断开并删除设备连接
  toolManager.registerTool(
    "dg_disconnect",
    `断开并删除设备连接，释放资源。
可通过deviceId精确删除单个设备，或通过alias删除所有匹配的设备。
注意：deviceId和alias只能二选一，不能同时提供。
删除后设备需要重新调用dg_connect创建新连接。`,
    {
      type: "object",
      properties: {
        deviceId: {
          type: "string",
          description: "设备ID（与alias二选一）",
        },
        alias: {
          type: "string",
          description: "设备别名（与deviceId二选一）",
        },
      },
      required: [],
    },
    async (params) => {
      const deviceId = params.deviceId as string | undefined;
      const alias = params.alias as string | undefined;

      // 必须提供 deviceId 或 alias 之一
      if (!deviceId && !alias) {
        return createToolError("必须提供 deviceId 或 alias 参数之一");
      }

      // 如果提供了两个参数，优先使用 deviceId
      if (deviceId && alias) {
        return createToolError("只能提供 deviceId 或 alias 参数之一，不能同时提供");
      }

      let sessionsToDelete: string[] = [];

      if (deviceId) {
        // 通过 deviceId 查找
        const session = sessionManager.getSession(deviceId);
        if (!session) {
          return createToolError(`设备不存在: ${deviceId}`);
        }
        sessionsToDelete.push(deviceId);
      } else if (alias) {
        // 通过 alias 查找
        const sessions = sessionManager.findByAlias(alias);
        if (sessions.length === 0) {
          return createToolError(`未找到别名为 "${alias}" 的设备`);
        }
        sessionsToDelete = sessions.map(s => s.deviceId);
      }

      // 删除所有匹配的会话
      const deletedDevices: Array<{ deviceId: string; alias: string | null }> = [];
      for (const id of sessionsToDelete) {
        const session = sessionManager.getSession(id);
        if (session) {
          // 先断开 WebSocket 连接
          if (session.clientId) {
            wsServer.disconnectController(session.clientId);
          }
          
          deletedDevices.push({
            deviceId: session.deviceId,
            alias: session.alias,
          });
          
          // 然后删除 session
          sessionManager.deleteSession(id);
        }
      }

      return createToolResult(
        JSON.stringify({
          success: true,
          deletedCount: deletedDevices.length,
          deletedDevices,
        })
      );
    }
  );
}
