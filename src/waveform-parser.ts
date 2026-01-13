/**
 * @fileoverview 波形解析器模块
 * @description 处理 Dungeonlab+pulse: 文本格式的波形数据解析（APP v2.0+）
 * 
 * 格式: Dungeonlab+pulse:setting=section+section+section...
 * - header: Dungeonlab+pulse:
 * - setting: 小节休息时长,播放速率,高低频平衡=
 * - section: 频率范围1,频率范围2,小节时长,频率模式,小节开关/脉冲元形状值-是否锚点,...
 * - section-split: +section+
 * 
 * @example
 * Dungeonlab+pulse:18,1,8=27,7,32,3,1/0-1,11.1-0,22.2-0,...+section+0,20,39,2,1/0-1,100-1
 */

// ============================================================================
// 数据集
// ============================================================================

/**
 * 频率数据集（索引 0-83 → 实际频率值 10-1000）
 * 基于 DG-LAB APP 规范
 */
export const FREQUENCY_DATASET: number[] = [
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19,  // 0-9
  20, 22, 24, 26, 28, 30, 32, 34, 36, 38,  // 10-19
  40, 42, 44, 46, 48, 50, 52, 54, 56, 58,  // 20-29
  60, 62, 64, 66, 68, 70, 72, 74, 76, 78,  // 30-39
  80, 85, 90, 95, 100, 110, 120, 130, 140, 150, // 40-49
  160, 170, 180, 190, 200, 220, 240, 260, 280, 300, // 50-59
  320, 340, 360, 380, 400, 420, 440, 460, 480, 500, // 60-69
  550, 600, 650, 700, 750, 800, 850, 900, 950, 1000, // 70-79
  1000, 1000, 1000, 1000 // 80-83 (上限 1000)
];

/**
 * 时长数据集（索引 0-99 → 实际时长，单位 100ms）
 * 基于 DG-LAB APP 规范
 */
export const DURATION_DATASET: number[] = Array.from({ length: 100 }, (_, i) => i + 1);

// ============================================================================
// 接口定义
// ============================================================================

/**
 * 全局波形设置
 */
export interface WaveformGlobalSettings {
  /** 小节休息时长（0-100 → 0-10 秒） */
  sectionRestTime: number;
  /** 播放速率（1,2,4 → 100ms,50ms,25ms）- 仅 3.0 设备 */
  playbackSpeed: number;
  /** 高低频平衡（1-16）- 仅 2.0 设备 */
  frequencyBalance: number;
}

/**
 * 波形元数据
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
 */
export interface WaveformShapePoint {
  /** 强度值（3.0 设备为 0-100） */
  strength: number;
  /** 是否为锚点（0=普通点, 1=锚点） */
  isAnchor: boolean;
  /** 兼容性字段：形状类型（与 isAnchor 相同） */
  shapeType: number;
}

/**
 * 波形小节
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

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 根据索引获取频率值（0-83）
 * @param index - 频率索引
 * @returns 频率值
 */
export function getFrequencyFromIndex(index: number): number {
  const clampedIndex = Math.max(0, Math.min(83, Math.floor(index)));
  return FREQUENCY_DATASET[clampedIndex] ?? 10;
}

/**
 * 根据索引获取时长值（0-99），单位 100ms
 * @param index - 时长索引
 * @returns 时长值
 */
export function getDurationFromIndex(index: number): number {
  const clampedIndex = Math.max(0, Math.min(99, Math.floor(index)));
  return DURATION_DATASET[clampedIndex] ?? 1;
}

/**
 * 频率转换函数
 * 将频率值（10-1000）转换为设备输出值（10-240）
 * 基于 V3 协议规范
 * @param x - 输入频率
 * @returns 输出值
 */
export function getOutputValue(x: number): number {
  let output: number;
  
  if (x >= 10 && x <= 100) {
    output = x;
  } else if (x > 100 && x <= 600) {
    output = (x - 100) / 5 + 100;
  } else if (x > 600 && x <= 1000) {
    output = (x - 600) / 10 + 200;
  } else if (x < 10) {
    output = 10;
  } else {
    output = 240;
  }
  
  // 限制在有效范围内（10-240）
  return Math.max(10, Math.min(240, Math.round(output)));
}

/**
 * 验证 HEX 波形格式（16 个十六进制字符 = 8 字节）
 * @param hex - HEX 字符串
 * @returns 是否有效
 */
export function isValidHexWaveform(hex: string): boolean {
  return /^[0-9a-fA-F]{16}$/.test(hex);
}


// ============================================================================
// 解析函数
// ============================================================================

/**
 * 解析 Dungeonlab+pulse: 文本格式的波形数据
 * 
 * 格式: Dungeonlab+pulse:setting=section+section+section...
 * - setting: sectionRestTime,playbackSpeed,frequencyBalance=
 * - section: freqRange1,freqRange2,duration,freqMode,enabled/strength-anchor,...
 * 
 * @param data - 波形数据字符串
 * @param name - 波形名称
 * @returns 解析后的波形
 * @throws 当格式无效时抛出错误
 */
export function parseWaveform(data: string, name: string): ParsedWaveform {
  // 验证格式
  if (!data.startsWith("Dungeonlab+pulse:")) {
    throw new Error("无效的波形格式: 必须以 'Dungeonlab+pulse:' 开头");
  }

  // 移除前缀
  const cleanData = data.replace(/^Dungeonlab\+pulse:/i, "");
  
  // 按 +section+ 分割获取各小节
  const sectionParts = cleanData.split("+section+");
  
  if (sectionParts.length === 0 || !sectionParts[0]) {
    throw new Error("无效的波形数据: 未找到小节");
  }

  // 解析全局设置和第一个小节
  const firstPart = sectionParts[0];
  const equalIdx = firstPart.indexOf("=");
  
  if (equalIdx === -1) {
    throw new Error("无效的波形格式: 缺少全局设置的 '=' 分隔符");
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
      throw new Error(`无效的小节 ${i + 1}: 缺少 '/' 分隔符`);
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
      throw new Error(`无效的小节 ${i + 1}: 必须至少有 2 个形状点`);
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
    throw new Error("无效的波形数据: 没有启用的小节");
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
 * 每个 HEX 波形是 16 个字符（8 字节）:
 * - 4 字节: 频率值（4 x 25ms = 100ms）
 * - 4 字节: 强度值（4 x 25ms = 100ms）
 * 
 * @param sections - 小节数组
 * @param playbackSpeed - 播放速率
 * @returns HEX 波形数组
 */
function convertToHexWaveforms(sections: WaveformSection[], playbackSpeed: number = 1): string[] {
  const hexWaveforms: string[] = [];
  
  // 播放速率决定每个 bar 的毫秒数
  // 1 = 100ms/bar, 2 = 50ms/bar, 4 = 25ms/bar
  // 注意: _msPerBar 当前未使用，保留用于未来播放速率支持
  const _msPerBar = playbackSpeed === 4 ? 25 : playbackSpeed === 2 ? 50 : 100;

  for (const section of sections) {
    if (section.shape.length === 0) continue;

    const shapeCount = section.shape.length;
    const duration = section.duration; // 单位 100ms
    const startFreq = section.startFrequency;
    const endFreq = section.endFrequency;
    const freqMode = section.frequencyMode;

    const waveformFreq: number[] = [];
    const waveformStrength: number[] = [];

    // 为每个 100ms 周期生成采样
    for (let t = 0; t < duration; t++) {
      // 每 100ms 生成 4 个采样（每个 25ms）
      for (let n = 0; n < 4; n++) {
        // 计算小节内的进度
        const totalProgress = (t + n / 4) / duration;
        
        // 根据进度计算形状索引
        const shapeProgress = totalProgress * shapeCount;
        const shapeIdx = Math.min(Math.floor(shapeProgress), shapeCount - 1);
        const nextShapeIdx = Math.min(shapeIdx + 1, shapeCount - 1);
        const interpFactor = shapeProgress - shapeIdx;

        // 获取形状点
        const currentPoint = section.shape[shapeIdx];
        const nextPoint = section.shape[nextShapeIdx];
        
        // 插值计算强度
        const startStrength = currentPoint?.strength ?? 0;
        const endStrength = nextPoint?.strength ?? startStrength;
        const strength = Math.round(startStrength + (endStrength - startStrength) * interpFactor);
        waveformStrength.push(Math.max(0, Math.min(100, strength)));

        // 根据模式计算频率
        let freq: number;
        switch (freqMode) {
          case 1: // 固定 - 使用起始频率
            freq = getOutputValue(startFreq);
            break;
          case 2: // 节内渐变 - 整个小节内渐变
            freq = getOutputValue(startFreq + (endFreq - startFreq) * totalProgress);
            break;
          case 3: // 元内渐变 - 每个形状元素内渐变
            freq = getOutputValue(startFreq + (endFreq - startFreq) * interpFactor);
            break;
          case 4: // 元间渐变 - 元素之间阶跃变化
            freq = getOutputValue(startFreq + (endFreq - startFreq) * (shapeIdx / shapeCount));
            break;
          default:
            freq = getOutputValue(startFreq);
        }
        waveformFreq.push(Math.round(freq));
      }
    }

    // 组合成 8 字节 HEX 字符串（每 100ms 4 个频率 + 4 个强度）
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
 * 将波形编码回 Dungeonlab+pulse: 文本格式（用于往返测试）
 * @param waveform - 解析后的波形
 * @returns 编码后的字符串
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
