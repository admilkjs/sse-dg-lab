/**
 * @module waveform-datasets
 * @description 波形频率和时长数据集，提供索引到实际值的映射
 */

/**
 * 频率数据集（波形频率，单位 ms）
 *
 * 将索引值（0-83）映射到实际波形频率值（10-1000 ms）。
 * APP 中的频率滑块使用索引，需要通过此表转换为波形频率值。
 *
 * 波形频率 = 输出单元时长（ms），脉冲频率 = 1000 / 波形频率（Hz）
 * 例如：波形频率 10ms = 脉冲频率 100Hz，波形频率 1000ms = 脉冲频率 1Hz
 *
 * 注意：这个数据集的值是波形频率（ms），不是脉冲频率（Hz）。
 * 发送到设备前需要通过 getOutputValue() 函数转换为设备协议值（10-240）。
 *
 * 官方数据集规律：
 * - (10..50) step 1    → 索引 0-40
 * - (52..80) step 2    → 索引 41-55
 * - (85..100) step 5   → 索引 56-59
 * - (110..200) step 10 → 索引 60-69
 * - (233..400) step 33 → 索引 70-75
 * - (450..600) step 50 → 索引 76-79
 * - (700..1000) step 100 → 索引 80-83
 *
 * 来源：DG-LAB 官方提供
 */
export const FREQUENCY_DATASET: number[] = [
  // (10..50) step 1 → 索引 0-40
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
  30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  50,
  // (52..80) step 2 → 索引 41-55
  52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80,
  // (85..100) step 5 → 索引 56-59
  85, 90, 95, 100,
  // (110..200) step 10 → 索引 60-69
  110, 120, 130, 140, 150, 160, 170, 180, 190, 200,
  // (233..400) step 33 → 索引 70-75
  233, 266, 300, 333, 366, 400,
  // (450..600) step 50 → 索引 76-79
  450, 500, 550, 600,
  // (700..1000) step 100 → 索引 80-83
  700, 800, 900, 1000,
];

/**
 * 时长数据集
 *
 * 将索引值（0-99）映射到实际时长（1-100，单位 100ms）。
 * 例如：索引 32 对应 3.3 秒的小节时长。
 */
export const DURATION_DATASET: number[] = Array.from(
  { length: 100 },
  (_, i) => i + 1
);

/**
 * 根据索引获取频率值（波形频率，单位 ms）
 *
 * 将 APP 使用的频率索引（0-83）转换为实际波形频率值（10-1000 ms）。
 * 超出范围的索引会被限制在有效范围内。
 *
 * 注意：返回的是波形频率（ms），不是脉冲频率（Hz）。
 * 脉冲频率 = 1000 / 波形频率
 *
 * @param index - 频率索引，范围 0-83
 * @returns 对应的波形频率值（ms）
 */
export function getFrequencyFromIndex(index: number): number {
  const clampedIndex = Math.max(0, Math.min(83, Math.floor(index)));
  return FREQUENCY_DATASET[clampedIndex] ?? 10;
}

/**
 * 根据索引获取时长值
 *
 * 将时长索引（0-99）转换为实际时长值。
 * 返回值单位为 100ms，例如返回 32 表示 3.2 秒。
 *
 * @param index - 时长索引，范围 0-99
 * @returns 时长值（单位 100ms）
 */
export function getDurationFromIndex(index: number): number {
  const clampedIndex = Math.max(0, Math.min(99, Math.floor(index)));
  return DURATION_DATASET[clampedIndex] ?? 1;
}

/**
 * 波形频率值转换为设备输出值
 *
 * 将波形频率值（10-1000 ms）转换为设备协议使用的输出值（10-240）。
 * 这个转换基于 V3 协议规范，使用分段线性映射。
 *
 * 转换规则（参考 temp_dg_lab/coyote/v3/README_V3.md）：
 * - 10-100 ms: 直接映射（输出 10-100）
 * - 101-600 ms: 压缩映射（输出 100-200）
 * - 601-1000 ms: 进一步压缩（输出 200-240）
 *
 * @param x - 输入波形频率（ms）
 * @returns 设备输出值（10-240）
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
 * 验证 HEX 波形格式
 *
 * 检查字符串是否为有效的 HEX 波形格式：16 个十六进制字符（8 字节）。
 * 每个 HEX 波形包含 4 个频率值和 4 个强度值，对应 100ms 的输出。
 *
 * @param hex - 待验证的 HEX 字符串
 * @returns 是否为有效的 HEX 波形
 */
export function isValidHexWaveform(hex: string): boolean {
  return /^[0-9a-fA-F]{16}$/.test(hex);
}
