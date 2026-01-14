/**
 * @fileoverview 波形工具
 * @description MCP 波形管理工具
 * - dg_parse_waveform: 解析波形数据并保存
 * - dg_list_waveforms: 列出所有保存的波形
 * - dg_get_waveform: 按名称获取波形
 * - dg_delete_waveform: 按名称删除波形
 */

import type { Tool, ToolResult, ToolHandler } from "../tool-manager";
import { WaveformStorage, persistWaveforms } from "../waveform-storage";
import { parseWaveform } from "../waveform-parser";

/**
 * 带处理函数的工具类型（内部使用）
 */
export interface ToolWithHandler extends Tool {
  handler: ToolHandler;
}

/** 共享的波形存储实例 */
let waveformStorage: WaveformStorage | null = null;
/** 存储路径 */
let storagePath = "./data/waveforms.json";

/**
 * 初始化波形存储
 * @param storage - 波形存储实例（可选）
 * @param path - 存储路径（可选）
 */
export function initWaveformStorage(storage?: WaveformStorage, path?: string): void {
  waveformStorage = storage || new WaveformStorage();
  if (path) storagePath = path;
}

/**
 * 获取波形存储实例
 * @returns 波形存储实例
 */
export function getWaveformStorage(): WaveformStorage {
  if (!waveformStorage) {
    waveformStorage = new WaveformStorage();
  }
  return waveformStorage;
}

/**
 * 创建错误结果
 * @param message - 错误消息
 * @returns 工具结果
 */
function createToolError(message: string): ToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * 创建成功结果
 * @param data - 数据
 * @returns 工具结果
 */
function createToolSuccess(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * dg_parse_waveform 工具
 * 解析波形数据并可选保存
 */
export const dgParseWaveformTool: ToolWithHandler = {
  name: "dg_parse_waveform",
  description: `解析 DG-LAB APP 导出的波形数据。

功能：
- 解析 Dungeonlab+pulse: 格式的波形数据
- 转换为设备可用的 hexWaveforms 数组
- 可选择是否保存到存储供后续使用

参数：
- hexData (必需): 波形数据字符串，必须以 "Dungeonlab+pulse:" 开头
- name (save=true时必需): 波形名称，用于保存和后续引用
- save (可选): 是否保存到存储，默认 false

使用场景：
1. 临时解析：只需要 hexWaveforms，不保存
   → 只传 hexData，返回结果包含 hexWaveforms
2. 保存复用：解析并保存，后续通过 dg_get_waveform 获取
   → 传 hexData、name、save=true

返回值：
- success: 是否成功
- name: 波形名称
- saved: 是否已保存
- hexWaveformCount: hexWaveforms 数量
- hexWaveforms: 波形数据数组（仅当 save=false 时返回）
- metadata: 元数据（sectionCount, totalDuration）
- overwritten: 是否覆盖了已存在的波形（仅当覆盖时返回）

注意事项：
- 波形数据从 DG-LAB APP 的"分享波形"功能导出
- 每个 hexWaveform 代表 100ms 的播放时间
- 相同名称会覆盖已存在的波形`,
  inputSchema: {
    type: "object",
    properties: {
      hexData: {
        type: "string",
        description: "波形数据（Dungeonlab+pulse:格式文本）",
      },
      name: {
        type: "string",
        description: "波形名称，用于保存和后续引用。当 save=true 时必需",
      },
      save: {
        type: "boolean",
        description: "是否保存波形到存储（默认 false）。设为 true 时需要提供 name 参数",
      },
    },
    required: ["hexData"],
  },
  handler: async (params: Record<string, unknown>): Promise<ToolResult> => {
    const hexData = params.hexData as string | undefined;
    const name = params.name as string | undefined;
    const save = params.save as boolean | undefined;

    if (!hexData || typeof hexData !== "string") {
      return createToolError("hexData 是必需的且必须是字符串");
    }

    // 验证 save 参数类型
    if (save !== undefined && typeof save !== "boolean") {
      return createToolError("save 参数必须是 boolean 类型");
    }

    // 默认值为 false（不保存）
    const shouldSave = save === true;

    // 当 save=true 时，name 是必需的
    if (shouldSave && (!name || typeof name !== "string" || name.trim().length === 0)) {
      return createToolError("当 save=true 时，name 是必需的且必须是非空字符串");
    }

    // 用于解析的名称（不保存时可以使用默认名称）
    const waveformName = name?.trim() || "unnamed";

    try {
      const waveform = parseWaveform(hexData, waveformName);

      let overwritten = false;
      
      // 条件保存逻辑
      if (shouldSave) {
        // 保存到存储
        const storage = getWaveformStorage();
        overwritten = storage.has(waveformName);
        storage.save(waveform);

        // 持久化到磁盘
        persistWaveforms(storage, storagePath);
      }

      // 计算元数据
      const metadata = {
        sectionCount: waveform.sections.length,
        totalDuration: waveform.hexWaveforms.length * 100, // 每个 hexWaveform 代表 100ms
      };

      // 构建返回结果
      const result: Record<string, unknown> = {
        success: true,
        name: waveform.name,
        saved: shouldSave,
        hexWaveformCount: waveform.hexWaveforms.length,
        metadata,
      };

      // 当 save=true 且覆盖时，添加 overwritten 标记
      if (shouldSave && overwritten) {
        result.overwritten = true;
      }

      // 当不保存时，包含完整的 hexWaveforms 数组
      if (!shouldSave) {
        result.hexWaveforms = waveform.hexWaveforms;
      }

      return createToolSuccess(result);
    } catch (error) {
      if (error instanceof Error) {
        return createToolError(error.message);
      }
      return createToolError("解析波形数据失败");
    }
  },
};

/**
 * dg_list_waveforms 工具
 * 列出所有保存的波形
 */
export const dgListWaveformsTool: ToolWithHandler = {
  name: "dg_list_waveforms",
  description: `列出所有已保存的波形。

功能：
- 获取存储中所有波形的概览信息
- 显示每个波形的名称和数据量

返回值：
- count: 波形总数
- waveforms: 波形列表数组
  - name: 波形名称
  - hexWaveformCount: hexWaveforms 数量（每个代表 100ms）

典型工作流程：
1. dg_list_waveforms 查看可用波形
2. dg_get_waveform 获取具体波形数据
3. dg_send_waveform 发送到设备

注意事项：
- 只显示通过 dg_parse_waveform (save=true) 保存的波形
- hexWaveformCount × 100ms = 波形总时长`,
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  handler: async (): Promise<ToolResult> => {
    const storage = getWaveformStorage();
    const waveforms = storage.list();

    const list = waveforms.map((w) => ({
      name: w.name,
      hexWaveformCount: w.hexWaveforms.length,
    }));

    return createToolSuccess({
      count: list.length,
      waveforms: list,
    });
  },
};

/**
 * dg_get_waveform 工具
 * 按名称获取波形
 */
export const dgGetWaveformTool: ToolWithHandler = {
  name: "dg_get_waveform",
  description: `按名称获取已保存的波形数据。

功能：
- 从存储中获取指定名称的波形
- 返回完整的 hexWaveforms 数组

参数：
- name (必需): 波形名称

返回值：
- name: 波形名称
- hexWaveforms: 波形数据数组，可直接用于 dg_send_waveform

典型工作流程：
1. dg_list_waveforms 查看可用波形
2. dg_get_waveform 获取具体波形数据
3. dg_send_waveform 或 dg_start_continuous_playback 发送到设备

与其他工具配合：
- dg_send_waveform: 一次性发送波形
- dg_start_continuous_playback: 持续循环播放波形

注意事项：
- 波形必须先通过 dg_parse_waveform (save=true) 保存
- 如果波形不存在会返回错误`,
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "波形名称",
      },
    },
    required: ["name"],
  },
  handler: async (params: Record<string, unknown>): Promise<ToolResult> => {
    const name = params.name as string | undefined;

    if (!name || typeof name !== "string") {
      return createToolError("name 是必需的且必须是字符串");
    }

    const storage = getWaveformStorage();
    const waveform = storage.get(name);

    if (!waveform) {
      return createToolError(`波形未找到: ${name}`);
    }

    return createToolSuccess({
      name: waveform.name,
      hexWaveforms: waveform.hexWaveforms,
    });
  },
};

/**
 * dg_delete_waveform 工具
 * 按名称删除波形
 */
export const dgDeleteWaveformTool: ToolWithHandler = {
  name: "dg_delete_waveform",
  description: `按名称删除已保存的波形。

功能：
- 从存储中永久删除指定波形
- 同时从磁盘持久化文件中移除

参数：
- name (必需): 要删除的波形名称

返回值：
- success: 是否成功
- deleted: 被删除的波形名称

⚠️ 警告：
- 删除操作不可逆！
- 删除后需要重新用 dg_parse_waveform 解析保存
- 建议删除前确认波形名称

注意事项：
- 如果波形不存在会返回错误
- 删除不会影响正在进行的持续播放`,
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "要删除的波形名称",
      },
    },
    required: ["name"],
  },
  handler: async (params: Record<string, unknown>): Promise<ToolResult> => {
    const name = params.name as string | undefined;

    if (!name || typeof name !== "string") {
      return createToolError("name 是必需的且必须是字符串");
    }

    const storage = getWaveformStorage();

    if (!storage.has(name)) {
      return createToolError(`波形未找到: ${name}`);
    }

    storage.delete(name);

    // 持久化到磁盘
    persistWaveforms(storage, storagePath);

    return createToolSuccess({
      success: true,
      deleted: name,
    });
  },
};

/**
 * 获取所有波形工具
 * @returns 波形工具数组
 */
export function getWaveformTools(): ToolWithHandler[] {
  return [
    dgParseWaveformTool,
    dgListWaveformsTool,
    dgGetWaveformTool,
    dgDeleteWaveformTool,
  ];
}
