/**
 * @module utils/validators
 * @description 参数验证工具函数，提供通道、强度、模式、波形等参数的验证
 */

/**
 * 强度调节模式
 * - increase: 在当前值基础上增加
 * - decrease: 在当前值基础上减少
 * - set: 直接设置为指定值
 */
export type StrengthMode = "increase" | "decrease" | "set";

/**
 * 验证通道参数
 *
 * DG-LAB 设备有两个独立的输出通道 A 和 B，
 * 每个通道可以独立控制强度和波形。
 *
 * @param channel - 待验证的通道值
 * @returns 包含错误信息的对象，或包含规范化通道值的对象
 */
export function validateChannel(
  channel: string | undefined
): { error: string } | { channel: "A" | "B" } {
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
 *
 * 强度值范围为 0-200，但实际可用范围受 APP 设置的上限限制。
 * 超过上限的值会被设备自动截断。
 *
 * @param value - 待验证的强度值
 * @returns 包含错误信息的对象，或包含数值类型强度值的对象
 */
export function validateStrengthValue(
  value: unknown
): { error: string } | { value: number } {
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
 * 验证强度调节模式
 *
 * @param mode - 待验证的模式值
 * @returns 包含错误信息的对象，或包含类型安全模式值的对象
 */
export function validateStrengthMode(
  mode: string | undefined
): { error: string } | { mode: StrengthMode } {
  if (!mode) {
    return { error: "缺少必需参数: mode" };
  }
  if (mode !== "increase" && mode !== "decrease" && mode !== "set") {
    return { error: `无效的模式: ${mode}，必须是 "increase"、"decrease" 或 "set"` };
  }
  return { mode };
}

/**
 * 验证波形数据数组
 *
 * 波形数据是 DG-LAB 协议的核心，每个波形由 8 字节（16 个十六进制字符）组成，
 * 包含频率、脉宽、强度等参数。
 *
 * @param waveforms - 待验证的波形数组
 * @returns 包含错误信息的对象，或包含验证通过的波形数组的对象
 */
export function validateWaveforms(
  waveforms: unknown
): { error: string } | { waveforms: string[] } {
  if (!waveforms) {
    return { error: "缺少必需参数: waveforms" };
  }
  if (!Array.isArray(waveforms)) {
    return { error: "waveforms 必须是数组" };
  }
  if (waveforms.length === 0) {
    return { error: "waveforms 数组不能为空" };
  }
  // 限制单次发送的波形数量，避免内存问题
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
