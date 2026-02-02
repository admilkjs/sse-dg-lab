/**
 * @module waveform-parser
 * @description 波形解析器，解析 Dungeonlab+pulse 格式并转换为 HEX 波形
 */

import { WaveformError, ErrorCode } from "./errors";

// 从数据集模块导入并重新导出（保持向后兼容）
import {
  FREQUENCY_DATASET,
  DURATION_DATASET,
  getFrequencyFromIndex,
  getDurationFromIndex,
  getOutputValue,
  isValidHexWaveform,
} from "./waveform-datasets";

// 重新导出数据集和辅助函数
export {
  FREQUENCY_DATASET,
  DURATION_DATASET,
  getFrequencyFromIndex,
  getDurationFromIndex,
  getOutputValue,
  isValidHexWaveform,
};

// --- 接口定义 ---

/**
 * 全局波形设置
 * 
 * 这些设置影响整个波形的播放行为，在波形数据的开头定义。
 */
export interface WaveformGlobalSettings {
  /** 
   * 小节休息时长
   * 范围 0-100，对应 0-10 秒。小节播放完毕后的静默时间。
   */
  sectionRestTime: number;
  /** 
   * 播放速率
   * 1=100ms, 2=50ms, 4=25ms 采样间隔。仅 3.0 设备支持。
   */
  playbackSpeed: number;
  /** 
   * 高低频平衡
   * 范围 1-16，影响输出的频率特性。仅 2.0 设备使用。
   */
  frequencyBalance: number;
}

/**
 * 波形元数据
 * 
 * 包含波形的全局设置和各小节的参数索引。
 * 这些数据用于重建波形或进行分析。
 */
export interface WaveformMetadata {
  /** 全局设置 */
  globalSettings: WaveformGlobalSettings;
  /** 各小节的起始频率索引（0-83） */
  startFrequencyIndices: number[];
  /** 各小节的结束频率索引（0-83） */
  endFrequencyIndices: number[];
  /** 各小节的时长索引（0-99） */
  durationIndices: number[];
  /** 各小节的频率模式（1-4） */
  frequencyModes: number[];
  /** 各小节的启用状态 */
  sectionEnabled: boolean[];
  // 兼容性字段
  startFrequencies: [number, number, number];
  endFrequencies: [number, number, number];
  durations: [number, number, number];
  frequencyModes_legacy: [number, number, number];
  section2Enabled: boolean;
  section3Enabled: boolean;
  playbackSpeed: number;
}

/**
 * 波形形状数据点
 * 
 * 定义脉冲元中单个时间点的输出强度。
 * 每个形状点对应 100ms 的输出时间。
 */
export interface WaveformShapePoint {
  /** 
   * 强度值
   * 范围 0-100，表示该时间点的输出强度百分比。
   */
  strength: number;
  /** 
   * 是否为锚点
   * 锚点在 APP 编辑器中用于固定关键帧，不影响实际输出。
   */
  isAnchor: boolean;
  /** 兼容性字段：与 isAnchor 相同，0=普通点, 1=锚点 */
  shapeType: number;
}

/**
 * 波形小节
 * 
 * 小节是波形的基本组成单位，包含频率范围、时长和形状数据。
 * 一个波形可以包含多个小节，按顺序播放。
 */
export interface WaveformSection {
  /** 小节索引 */
  index: number;
  /** 是否启用 */
  enabled: boolean;
  /** 频率范围 1 索引（0-83） */
  frequencyRange1Index: number;
  /** 频率范围 2 索引（0-83） */
  frequencyRange2Index: number;
  /** 小节时长索引（0-99） */
  durationIndex: number;
  /** 频率模式（1-4） */
  frequencyMode: number;
  /** 形状数据点 */
  shape: WaveformShapePoint[];
  // 计算值（兼容性）
  startFrequency: number;
  endFrequency: number;
  duration: number;
}

/**
 * 完整的解析后波形
 * 
 * 包含波形的所有信息：元数据、小节、原始数据和转换后的 HEX 波形。
 * 这是波形解析的最终输出，可以直接用于设备控制。
 */
export interface ParsedWaveform {
  /** 波形名称 */
  name: string;
  /** 元数据 */
  metadata: WaveformMetadata;
  /** 小节数组 */
  sections: WaveformSection[];
  /** 原始数据 */
  rawData: string;
  /** HEX 波形数组 */
  hexWaveforms: string[];
  /** 创建时间 */
  createdAt: Date;
}

// --- 解析函数 ---

/**
 * 解析 Dungeonlab+pulse: 文本格式的波形数据
 * 
 * 这是波形解析的主入口函数。它将 APP 导出的文本格式波形数据
 * 解析为结构化的 ParsedWaveform 对象，并生成可直接发送到设备的 HEX 波形。
 * 
 * 解析流程：
 * 1. 验证格式前缀
 * 2. 提取全局设置（休息时长、播放速率、频率平衡）
 * 3. 解析各小节（频率范围、时长、频率模式、形状数据）
 * 4. 转换为 HEX 波形数组
 * 
 * @param data - 波形数据字符串，必须以 'Dungeonlab+pulse:' 开头
 * @param name - 波形名称，用于标识和存储
 * @returns 解析后的完整波形对象
 * @throws Error 当格式无效或数据不完整时
 * 
 * @example
 * const waveform = parseWaveform(
 *   "Dungeonlab+pulse:18,1,8=27,7,32,3,1/0-1,50-0,100-1",
 *   "我的波形"
 * );
 * console.log(waveform.hexWaveforms); // 可直接发送到设备
 */
export function parseWaveform(data: string, name: string): ParsedWaveform {
  // 验证格式
  if (!data.startsWith("Dungeonlab+pulse:")) {
    throw new WaveformError("无效的波形格式: 必须以 'Dungeonlab+pulse:' 开头", {
      code: ErrorCode.WAVEFORM_INVALID_FORMAT,
      context: { name, prefix: data.substring(0, 20) },
    });
  }

  // 移除前缀
  const cleanData = data.replace(/^Dungeonlab\+pulse:/i, "");
  
  // 按 +section+ 分割获取各小节
  const sectionParts = cleanData.split("+section+");
  
  if (sectionParts.length === 0 || !sectionParts[0]) {
    throw new WaveformError("无效的波形数据: 未找到小节", {
      code: ErrorCode.WAVEFORM_PARSE_FAILED,
      context: { name },
    });
  }

  // 解析全局设置和第一个小节
  const firstPart = sectionParts[0];
  const equalIdx = firstPart.indexOf("=");
  
  if (equalIdx === -1) {
    throw new WaveformError("无效的波形格式: 缺少全局设置的 '=' 分隔符", {
      code: ErrorCode.WAVEFORM_INVALID_FORMAT,
      context: { name },
    });
  }

  // 解析全局设置: sectionRestTime,playbackSpeed,frequencyBalance
  const settingsPart = firstPart.substring(0, equalIdx);
  const settingsValues = settingsPart.split(",");
  
  const globalSettings: WaveformGlobalSettings = {
    sectionRestTime: Number(settingsValues[0]) || 0,
    playbackSpeed: Number(settingsValues[1]) || 1,
    frequencyBalance: Number(settingsValues[2]) || 8,
  };

  // 解析各小节
  const sections: WaveformSection[] = [];
  const startFrequencyIndices: number[] = [];
  const endFrequencyIndices: number[] = [];
  const durationIndices: number[] = [];
  const frequencyModes: number[] = [];
  const sectionEnabled: boolean[] = [];

  // 第一个小节数据在 '=' 之后
  const firstSectionData = firstPart.substring(equalIdx + 1);
  const allSectionData = [firstSectionData, ...sectionParts.slice(1)];

  for (let i = 0; i < allSectionData.length && i < 10; i++) {
    const sectionData = allSectionData[i];
    if (!sectionData) continue;
    
    // 按 '/' 分割，分离头部和形状数据
    const slashIdx = sectionData.indexOf("/");
    if (slashIdx === -1) {
      throw new WaveformError(`无效的小节 ${i + 1}: 缺少 '/' 分隔符`, {
        code: ErrorCode.WAVEFORM_INVALID_FORMAT,
        context: { name, sectionIndex: i + 1 },
      });
    }

    const headerPart = sectionData.substring(0, slashIdx);
    const shapePart = sectionData.substring(slashIdx + 1);

    // 解析小节头部: freqRange1,freqRange2,duration,freqMode,enabled
    const headerValues = headerPart.split(",");
    
    const freqRange1Index = Number(headerValues[0]) || 0;
    const freqRange2Index = Number(headerValues[1]) || 0;
    const durationIndex = Number(headerValues[2]) || 0;
    const freqMode = Number(headerValues[3]) || 1;
    const enabled = headerValues[4] !== "0";

    startFrequencyIndices.push(freqRange1Index);
    endFrequencyIndices.push(freqRange2Index);
    durationIndices.push(durationIndex);
    frequencyModes.push(freqMode);
    sectionEnabled.push(enabled);

    // 解析形状数据: strength-anchor,strength-anchor,...
    const shapePoints: WaveformShapePoint[] = [];
    const shapeItems = shapePart.split(",");
    
    for (const item of shapeItems) {
      if (!item) continue;
      const [strengthStr, anchorStr] = item.split("-");
      const strength = Math.round(Number(strengthStr) || 0);
      const isAnchor = anchorStr === "1";
      
      shapePoints.push({
        strength: Math.max(0, Math.min(100, strength)),
        isAnchor,
        shapeType: isAnchor ? 1 : 0, // 兼容性
      });
    }

    // 验证形状数据
    if (shapePoints.length < 2) {
      throw new WaveformError(`无效的小节 ${i + 1}: 必须至少有 2 个形状点`, {
        code: ErrorCode.WAVEFORM_INVALID_FORMAT,
        context: { name, sectionIndex: i + 1, shapePointCount: shapePoints.length },
      });
    }

    // 获取计算值
    const startFreq = getFrequencyFromIndex(freqRange1Index);
    const endFreq = getFrequencyFromIndex(freqRange2Index);
    const duration = getDurationFromIndex(durationIndex);

    if (enabled) {
      sections.push({
        index: i,
        enabled: true,
        frequencyRange1Index: freqRange1Index,
        frequencyRange2Index: freqRange2Index,
        durationIndex,
        frequencyMode: freqMode,
        shape: shapePoints,
        startFrequency: startFreq,
        endFrequency: endFreq,
        duration,
      });
    }
  }

  if (sections.length === 0) {
    throw new WaveformError("无效的波形数据: 没有启用的小节", {
      code: ErrorCode.WAVEFORM_PARSE_FAILED,
      context: { name },
    });
  }

  // 构建兼容性元数据
  const metadata: WaveformMetadata = {
    globalSettings,
    startFrequencyIndices,
    endFrequencyIndices,
    durationIndices,
    frequencyModes,
    sectionEnabled,
    // 兼容性字段
    startFrequencies: [
      getFrequencyFromIndex(startFrequencyIndices[0] ?? 0),
      getFrequencyFromIndex(startFrequencyIndices[1] ?? 0),
      getFrequencyFromIndex(startFrequencyIndices[2] ?? 0),
    ],
    endFrequencies: [
      getFrequencyFromIndex(endFrequencyIndices[0] ?? 0),
      getFrequencyFromIndex(endFrequencyIndices[1] ?? 0),
      getFrequencyFromIndex(endFrequencyIndices[2] ?? 0),
    ],
    durations: [
      getDurationFromIndex(durationIndices[0] ?? 0),
      getDurationFromIndex(durationIndices[1] ?? 0),
      getDurationFromIndex(durationIndices[2] ?? 0),
    ],
    frequencyModes_legacy: [
      frequencyModes[0] ?? 1,
      frequencyModes[1] ?? 1,
      frequencyModes[2] ?? 1,
    ] as [number, number, number],
    section2Enabled: sectionEnabled[1] ?? false,
    section3Enabled: sectionEnabled[2] ?? false,
    playbackSpeed: globalSettings.playbackSpeed,
  };

  // 从小节生成 HEX 波形
  const hexWaveforms = convertToHexWaveforms(sections, globalSettings.playbackSpeed);

  return {
    name,
    metadata,
    sections,
    rawData: data,
    hexWaveforms,
    createdAt: new Date(),
  };
}

/**
 * 将小节转换为设备用的 HEX 波形
 * 
 * 核心概念：
 * - 每个形状点 = 100ms 的输出强度（4 个 25ms 采样）
 * - 脉冲元 = 所有形状点组成的一个完整波形周期
 * - 小节 = 脉冲元循环重复播放，直到小节时长结束
 * - 脉冲元会完整播放，即使超过设定的小节时长
 * 
 * 每个 HEX 波形是 16 个字符（8 字节）:
 * - 4 字节: 频率值（4 x 25ms = 100ms）
 * - 4 字节: 强度值（4 x 25ms = 100ms）
 * 
 * @param sections - 小节数组
 * @param _playbackSpeed - 播放速率（保留参数，当前未使用）
 * @returns HEX 波形数组
 */
function convertToHexWaveforms(sections: WaveformSection[], _playbackSpeed: number = 1): string[] {
  const hexWaveforms: string[] = [];

  for (const section of sections) {
    if (section.shape.length === 0) continue;

    const shapeCount = section.shape.length; // 脉冲元的形状点数量
    const pulseElementDuration = shapeCount; // 脉冲元时长 = 形状点数 x 100ms
    const sectionDuration = section.duration; // 小节设定时长（单位 100ms）
    const startFreq = section.startFrequency;
    const endFreq = section.endFrequency;
    const freqMode = section.frequencyMode;

    // 计算需要多少个完整的脉冲元来覆盖小节时长
    // 脉冲元总是会完整播放，即使超过设定时长
    const pulseElementCount = Math.max(1, Math.ceil(sectionDuration / pulseElementDuration));
    const actualDuration = pulseElementCount * pulseElementDuration; // 实际播放时长

    const waveformFreq: number[] = [];
    const waveformStrength: number[] = [];

    // 遍历每个脉冲元
    for (let elementIdx = 0; elementIdx < pulseElementCount; elementIdx++) {
      // 遍历脉冲元内的每个形状点（每个形状点 = 100ms）
      for (let shapeIdx = 0; shapeIdx < shapeCount; shapeIdx++) {
        const currentPoint = section.shape[shapeIdx];
        const strength = currentPoint?.strength ?? 0;

        // 当前在整个小节中的时间位置（单位 100ms）
        const currentTime = elementIdx * pulseElementDuration + shapeIdx;
        // 小节内的进度（0-1）
        const sectionProgress = currentTime / actualDuration;
        // 脉冲元内的进度（0-1）
        const elementProgress = shapeIdx / shapeCount;

        // 根据频率模式计算频率
        let freq: number;
        switch (freqMode) {
          case 1: // 固定 - 使用起始频率
            freq = getOutputValue(startFreq);
            break;
          case 2: // 节内渐变 - 整个小节内频率从 startFreq 渐变到 endFreq
            freq = getOutputValue(startFreq + (endFreq - startFreq) * sectionProgress);
            break;
          case 3: // 元内渐变 - 每个脉冲元内频率从 startFreq 渐变到 endFreq，然后重置
            freq = getOutputValue(startFreq + (endFreq - startFreq) * elementProgress);
            break;
          case 4: // 元间渐变 - 脉冲元内频率固定，但从第一个脉冲元到最后一个脉冲元频率渐变
            {
              const elementProgress4 = pulseElementCount > 1 
                ? elementIdx / (pulseElementCount - 1) 
                : 0;
              freq = getOutputValue(startFreq + (endFreq - startFreq) * elementProgress4);
            }
            break;
          default:
            freq = getOutputValue(startFreq);
        }

        // 每个形状点生成 4 个 25ms 采样（强度相同，频率相同）
        for (let n = 0; n < 4; n++) {
          waveformStrength.push(Math.max(0, Math.min(100, Math.round(strength))));
          waveformFreq.push(Math.round(freq));
        }
      }
    }

    // 组合成 8 字节 HEX 字符串（每 100ms = 4 个频率 + 4 个强度）
    for (let i = 0; i < waveformFreq.length; i += 4) {
      const freqHex = [
        waveformFreq[i] ?? 10,
        waveformFreq[i + 1] ?? 10,
        waveformFreq[i + 2] ?? 10,
        waveformFreq[i + 3] ?? 10,
      ]
        .map((v) => Math.max(10, Math.min(240, v)).toString(16).padStart(2, "0"))
        .join("");

      const strengthHex = [
        waveformStrength[i] ?? 0,
        waveformStrength[i + 1] ?? 0,
        waveformStrength[i + 2] ?? 0,
        waveformStrength[i + 3] ?? 0,
      ]
        .map((v) => Math.max(0, Math.min(100, v)).toString(16).padStart(2, "0"))
        .join("");

      hexWaveforms.push(freqHex + strengthHex);
    }
  }

  return hexWaveforms;
}

/**
 * 将波形编码回 Dungeonlab+pulse: 文本格式
 * 
 * 这是 parseWaveform 的逆操作，用于将解析后的波形重新编码为文本格式。
 * 主要用于往返测试（round-trip testing）验证解析器的正确性。
 * 
 * 注意：由于浮点数精度和格式化差异，编码后的字符串可能与原始输入略有不同，
 * 但解析后应该产生等效的波形数据。
 * 
 * @param waveform - 解析后的波形对象
 * @returns 编码后的 Dungeonlab+pulse: 格式字符串
 */
export function encodeWaveform(waveform: ParsedWaveform): string {
  const { metadata, sections } = waveform;
  const { globalSettings } = metadata;

  // 构建全局设置部分
  const settingsPart = [
    globalSettings.sectionRestTime,
    globalSettings.playbackSpeed,
    globalSettings.frequencyBalance,
  ].join(",");

  // 构建小节字符串
  const sectionStrings: string[] = [];

  // 使用原始索引（如果可用），否则从小节重建
  const allSectionCount = Math.max(
    metadata.startFrequencyIndices.length,
    sections.length
  );

  for (let i = 0; i < allSectionCount; i++) {
    const section = sections.find(s => s.index === i);
    
    let headerPart: string;
    let shapePart: string;

    if (section) {
      // 从小节数据构建头部
      headerPart = [
        section.frequencyRange1Index,
        section.frequencyRange2Index,
        section.durationIndex,
        section.frequencyMode,
        section.enabled ? 1 : 0,
      ].join(",");

      // 构建形状数据
      shapePart = section.shape
        .map((p) => `${p.strength}-${p.isAnchor ? 1 : 0}`)
        .join(",");
    } else {
      // 对禁用的小节使用元数据索引
      headerPart = [
        metadata.startFrequencyIndices[i] ?? 0,
        metadata.endFrequencyIndices[i] ?? 0,
        metadata.durationIndices[i] ?? 0,
        metadata.frequencyModes[i] ?? 1,
        0, // 禁用
      ].join(",");

      // 禁用小节的最小形状数据
      shapePart = "0-1,100-1";
    }

    sectionStrings.push(`${headerPart}/${shapePart}`);
  }

  // 组合: settings=firstSection+section+secondSection+section+...
  const firstSection = sectionStrings[0] ?? "0,0,0,1,0/0-1,100-1";
  const remainingSections = sectionStrings.slice(1);

  let result = `Dungeonlab+pulse:${settingsPart}=${firstSection}`;
  
  for (const section of remainingSections) {
    result += `+section+${section}`;
  }

  return result;
}
