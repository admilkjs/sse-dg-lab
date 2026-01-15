/**
 * @fileoverview 设备管理工具集
 * 
 * 提供 DG-LAB 设备的连接、查询、别名管理和断开等核心功能。
 * 这些工具是 AI 与 DG-LAB 设备交互的主要入口，负责：
 * - 创建新的设备连接并生成二维码供 APP 扫描
 * - 查询和管理已连接的设备列表
 * - 为设备设置别名以便识别和管理
 * - 断开并清理设备连接
 * 
 * 典型使用流程：
 * 1. 调用 dg_connect 创建连接，获取二维码
 * 2. 用户使用 DG-LAB APP 扫描二维码
 * 3. 通过 dg_list_devices 确认设备已绑定
 * 4. 使用 control-tools 中的工具控制设备
 */

import type { ToolManager } from "../tool-manager";
import { createToolResult, createToolError } from "../tool-manager";
import type { SessionManager } from "../session-manager";
import type { DGLabWSServer } from "../ws-server";
import { getEffectiveIP, getLocalIP } from "../config";
import { ConnectionError, ToolError, ErrorCode } from "../errors";

/**
 * 注册所有设备管理相关的 MCP 工具
 * 
 * 将设备管理工具注册到工具管理器中，使 AI 能够通过 MCP 协议
 * 调用这些工具来管理 DG-LAB 设备连接。
 * 
 * @param toolManager - 工具管理器实例，用于注册工具
 * @param sessionManager - 会话管理器，维护设备会话状态
 * @param wsServer - WebSocket 服务器，处理与 APP 的实时通信
 * @param publicIp - 公网 IP 地址，用于生成可从外网访问的二维码 URL。
 *                   如果未提供，将自动检测本地 IP
 */
export function registerDeviceTools(
  toolManager: ToolManager,
  sessionManager: SessionManager,
  wsServer: DGLabWSServer,
  publicIp?: string
): void {
  // 确定用于二维码的 IP 地址
  // 优先使用显式配置的公网 IP，否则回退到自动检测的本地 IP
  const localIp = getLocalIP();
  const ipAddress = publicIp || localIp;
  
  // 记录 IP 配置，便于调试连接问题
  console.log(`[设备工具] PUBLIC_IP 配置: "${publicIp || '(未设置)'}"`);
  console.log(`[设备工具] 本地 IP: ${localIp}`);
  console.log(`[设备工具] 使用 IP: ${ipAddress}`);

  // ========== dg_connect ==========
  // 创建新的设备连接，这是使用 DG-LAB 的第一步
  toolManager.registerTool(
    "dg_connect",
    `【第一步】创建DG-LAB设备连接。返回deviceId（后续操作必需）和qrCodeUrl（二维码链接）。
使用流程：1.调用此工具获取二维码的链接，然后如果有工具能生成二维码则使用 → 2.生成二维码后让用户用DG-LAB APP扫码 → 3.用户说扫了码后用dg_get_status检查boundToApp是否为true → 4.boundToApp为true后才能控制设备。
可选参数alias：创建时直接设置别名（必须唯一，大小写不敏感）。
注意：每次调用会创建新连接，建议先用dg_list_devices检查是否已有可用连接是属于用户的。`,
    {
      type: "object",
      properties: {
        alias: {
          type: "string",
          description: "可选，创建时直接设置别名（必须唯一，大小写不敏感）",
        },
      },
      required: [],
    },
    async (params) => {
      try {
        const alias = params.alias as string | undefined;

        // 如果提供了别名，先检查是否可用
        if (alias && !sessionManager.isAliasAvailable(alias)) {
          return createToolError(`别名 "${alias}" 已被其他设备使用`);
        }

        // 创建会话：在会话管理器中分配一个新的 deviceId
        const session = sessionManager.createSession();

        // 如果提供了别名，设置别名
        if (alias) {
          sessionManager.setAlias(session.deviceId, alias);
        }

        // 创建控制器：在 WebSocket 服务器中注册，获取 clientId
        // clientId 用于 APP 扫码后建立连接
        const clientId = wsServer.createController();

        // 关联会话和控制器
        sessionManager.updateConnectionState(session.deviceId, {
          clientId,
          connected: true,
        });

        // 生成二维码 URL，APP 扫描后会连接到这个地址
        const qrCodeUrl = wsServer.getQRCodeUrl(clientId, ipAddress);

        return createToolResult(
          JSON.stringify({
            deviceId: session.deviceId,
            alias: alias || null,
            qrCodeUrl,
            message: "请使用DG-LAB APP扫描二维码进行绑定",
          })
        );
      } catch (err) {
        const error = err instanceof ConnectionError ? err : new ConnectionError(
          err instanceof Error ? err.message : "连接失败",
          { code: ErrorCode.CONN_DEVICE_NOT_FOUND, cause: err instanceof Error ? err : undefined }
        );
        return createToolError(`连接失败: ${error.message}`);
      }
    }
  );

  // ========== dg_list_devices ==========
  // 列出所有设备及其状态，用于查看当前连接情况
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
- reconnectionTimeRemaining: 剩余重连时间（秒），仅在设备断开时显示，null表示设备已连接
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

      // 支持按别名过滤，方便在多设备场景下快速定位
      const alias = params.alias as string | undefined;
      if (alias) {
        sessions = sessionManager.findByAlias(alias);
      }

      // 构建设备状态列表，合并会话信息和 WebSocket 绑定状态
      const devices = sessions.map((s) => {
        // boundToApp 表示 APP 是否已扫码并建立连接
        // 只有 boundToApp 为 true 时才能控制设备
        const isBound = s.clientId ? wsServer.isControllerBound(s.clientId) : false;
        
        // 计算剩余重连时间（秒）
        const reconnectionTimeRemaining = sessionManager.getReconnectionTimeRemaining(s.deviceId);
        const reconnectionTimeRemainingSeconds = reconnectionTimeRemaining !== null 
          ? Math.ceil(reconnectionTimeRemaining / 1000) 
          : null;
        
        return {
          deviceId: s.deviceId,
          alias: s.alias,
          connected: s.connected,
          boundToApp: isBound,
          strengthA: s.strengthA,
          strengthB: s.strengthB,
          strengthLimitA: s.strengthLimitA,
          strengthLimitB: s.strengthLimitB,
          reconnectionTimeRemaining: reconnectionTimeRemainingSeconds,
        };
      });

      return createToolResult(JSON.stringify({ devices, count: devices.length }));
    }
  );

  // ========== dg_set_alias ==========
  // 为设备设置别名，便于识别和管理多个设备
  toolManager.registerTool(
    "dg_set_alias",
    `为设备设置自定义别名，方便后续通过别名查找和管理设备。
别名可以是用户名、昵称或任何便于识别的名称。
注意：别名必须唯一，不能与其他设备的别名重复（大小写不敏感）。
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
          description: "自定义别名（如用户名、昵称等，支持中文，必须唯一）",
        },
      },
      required: ["deviceId", "alias"],
    },
    async (params) => {
      const deviceId = params.deviceId as string;
      const alias = params.alias as string;

      // 参数校验
      if (!deviceId) {
        return createToolError("缺少必需参数: deviceId");
      }
      if (!alias) {
        return createToolError("缺少必需参数: alias");
      }

      // 尝试设置别名，如果设备不存在或别名已被使用会返回错误
      const result = sessionManager.setAlias(deviceId, alias);
      if (!result.success) {
        return createToolError(result.error || `设置别名失败`);
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

  // ========== dg_find_device ==========
  // 通过别名查找设备，支持模糊匹配
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

      // 查找所有匹配的设备（支持模糊匹配）
      const sessions = sessionManager.findByAlias(alias);
      
      // 构建设备状态列表，与 dg_list_devices 格式一致
      const devices = sessions.map((s) => {
        const isBound = s.clientId ? wsServer.isControllerBound(s.clientId) : false;
        
        // 计算剩余重连时间（秒）
        const reconnectionTimeRemaining = sessionManager.getReconnectionTimeRemaining(s.deviceId);
        const reconnectionTimeRemainingSeconds = reconnectionTimeRemaining !== null 
          ? Math.ceil(reconnectionTimeRemaining / 1000) 
          : null;
        
        return {
          deviceId: s.deviceId,
          alias: s.alias,
          connected: s.connected,
          boundToApp: isBound,
          strengthA: s.strengthA,
          strengthB: s.strengthB,
          strengthLimitA: s.strengthLimitA,
          strengthLimitB: s.strengthLimitB,
          reconnectionTimeRemaining: reconnectionTimeRemainingSeconds,
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

  // ========== dg_disconnect ==========
  // 断开设备连接并清理资源
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

      // 参数校验：必须提供 deviceId 或 alias 之一
      if (!deviceId && !alias) {
        return createToolError("必须提供 deviceId 或 alias 参数之一");
      }

      // 不允许同时提供两个参数，避免歧义
      if (deviceId && alias) {
        return createToolError("只能提供 deviceId 或 alias 参数之一，不能同时提供");
      }

      // 收集要删除的设备 ID 列表
      let sessionsToDelete: string[] = [];

      if (deviceId) {
        // 通过 deviceId 精确查找
        const session = sessionManager.getSession(deviceId);
        if (!session) {
          return createToolError(`设备不存在: ${deviceId}`);
        }
        sessionsToDelete.push(deviceId);
      } else if (alias) {
        // 通过 alias 模糊查找，可能匹配多个设备
        const sessions = sessionManager.findByAlias(alias);
        if (sessions.length === 0) {
          return createToolError(`未找到别名为 "${alias}" 的设备`);
        }
        sessionsToDelete = sessions.map(s => s.deviceId);
      }

      // 逐个删除匹配的设备
      const deletedDevices: Array<{ deviceId: string; alias: string | null }> = [];
      for (const id of sessionsToDelete) {
        const session = sessionManager.getSession(id);
        if (session) {
          // 先断开 WebSocket 连接，确保 APP 端收到断开通知
          if (session.clientId) {
            wsServer.disconnectController(session.clientId);
          }
          
          deletedDevices.push({
            deviceId: session.deviceId,
            alias: session.alias,
          });
          
          // 最后删除会话记录
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
