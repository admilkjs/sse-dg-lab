/**
 * @fileoverview 波形存储模块
 * @description 管理波形的持久化存储
 * - 保存、获取、列出、删除波形
 * - 持久化到 JSON 文件
 * - 启动时从文件加载
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { ParsedWaveform, WaveformMetadata, WaveformSection } from "./waveform-parser";

/**
 * 存储格式的波形数据
 */
export interface StoredWaveform {
  /** 波形名称 */
  name: string;
  /** 元数据 */
  metadata: WaveformMetadata;
  /** 小节数据 */
  sections: WaveformSection[];
  /** 原始数据 */
  rawData: string;
  /** HEX 波形数组 */
  hexWaveforms: string[];
  /** 创建时间（ISO 8601 格式） */
  createdAt: string;
}

/**
 * 波形存储数据格式
 */
export interface WaveformStorageData {
  /** 版本号 */
  version: 1;
  /** 波形数组 */
  waveforms: StoredWaveform[];
}

/**
 * 波形存储管理器
 * @description 管理波形的内存存储和持久化
 */
export class WaveformStorage {
  private waveforms: Map<string, ParsedWaveform> = new Map();

  /**
   * 保存波形（如果名称已存在则覆盖）
   * @param waveform - 波形数据
   */
  save(waveform: ParsedWaveform): void {
    this.waveforms.set(waveform.name, waveform);
  }

  /**
   * 根据名称获取波形
   * @param name - 波形名称
   * @returns 波形数据或 null
   */
  get(name: string): ParsedWaveform | null {
    return this.waveforms.get(name) || null;
  }

  /**
   * 列出所有波形
   * @returns 波形数组
   */
  list(): ParsedWaveform[] {
    return Array.from(this.waveforms.values());
  }

  /**
   * 根据名称删除波形
   * @param name - 波形名称
   * @returns 是否成功删除
   */
  delete(name: string): boolean {
    return this.waveforms.delete(name);
  }

  /**
   * 获取波形数量
   */
  get count(): number {
    return this.waveforms.size;
  }

  /**
   * 检查波形是否存在
   * @param name - 波形名称
   * @returns 是否存在
   */
  has(name: string): boolean {
    return this.waveforms.has(name);
  }

  /**
   * 清除所有波形
   */
  clear(): void {
    this.waveforms.clear();
  }

  /**
   * 转换为存储数据格式
   * @returns 存储数据
   */
  toStorageData(): WaveformStorageData {
    const waveforms: StoredWaveform[] = [];

    for (const waveform of this.waveforms.values()) {
      waveforms.push({
        name: waveform.name,
        metadata: waveform.metadata,
        sections: waveform.sections,
        rawData: waveform.rawData,
        hexWaveforms: waveform.hexWaveforms,
        createdAt: waveform.createdAt.toISOString(),
      });
    }

    return { version: 1, waveforms };
  }

  /**
   * 从存储数据格式加载
   * @param data - 存储数据
   */
  fromStorageData(data: WaveformStorageData): void {
    this.waveforms.clear();

    for (const stored of data.waveforms) {
      const waveform: ParsedWaveform = {
        name: stored.name,
        metadata: stored.metadata,
        sections: stored.sections,
        rawData: stored.rawData,
        hexWaveforms: stored.hexWaveforms,
        createdAt: new Date(stored.createdAt),
      };
      this.waveforms.set(waveform.name, waveform);
    }
  }
}

/**
 * 将波形持久化到磁盘
 * @param storage - 波形存储实例
 * @param filePath - 文件路径
 */
export function persistWaveforms(
  storage: WaveformStorage,
  filePath: string = "./data/waveforms.json"
): void {
  const data = storage.toStorageData();
  const json = JSON.stringify(data, null, 2);

  // 确保目录存在
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(filePath, json, "utf8");
}

/**
 * 从磁盘加载波形
 * @param storage - 波形存储实例
 * @param filePath - 文件路径
 * @returns 是否成功加载
 */
export function loadWaveforms(
  storage: WaveformStorage,
  filePath: string = "./data/waveforms.json"
): boolean {
  if (!existsSync(filePath)) {
    return false;
  }

  try {
    const json = readFileSync(filePath, "utf8");
    const data = JSON.parse(json) as WaveformStorageData;

    if (data.version !== 1) {
      console.warn(`未知的波形存储版本: ${data.version}`);
      return false;
    }

    storage.fromStorageData(data);
    return true;
  } catch (error) {
    console.error("加载波形失败:", error);
    return false;
  }
}
