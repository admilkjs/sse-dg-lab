/**
 * Waveform Parser Module
 * Feature: dg-lab-sse-tool
 * 
 * Handles waveform data parsing for Dungeonlab+pulse: text format (APP v2.0+)
 * 
 * Format: Dungeonlab+pulse:setting=section+section+section...
 * - header: Dungeonlab+pulse:
 * - setting: 小节休息时长,播放速率,高低频平衡=
 * - section: 频率范围1,频率范围2,小节时长,频率模式,小节开关/脉冲元形状值-是否锚点,...
 * - section-split: +section+
 * 
 * Example: Dungeonlab+pulse:18,1,8=27,7,32,3,1/0-1,11.1-0,22.2-0,...+section+0,20,39,2,1/0-1,100-1
 */

// ============================================================================
// Data Sets
// ============================================================================

/**
 * Frequency dataset (index 0-83 → actual frequency value 10-1000)
 * Based on DG-LAB APP specification
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
  1000, 1000, 1000, 1000 // 80-83 (capped at 1000)
];

/**
 * Duration dataset (index 0-99 → actual duration in 100ms units)
 * Based on DG-LAB APP specification
 */
export const DURATION_DATASET: number[] = Array.from({ length: 100 }, (_, i) => {
  // Duration increases with index, typical values:
  // 0-9: 1-10 (100ms - 1s)
  // 10-29: 11-30 (1.1s - 3s)
  // 30-59: 31-60 (3.1s - 6s)
  // 60-99: 61-100 (6.1s - 10s)
  return i + 1;
});

// ============================================================================
// Interfaces
// ============================================================================

/** Global waveform settings */
export interface WaveformGlobalSettings {
  /** Section rest time (0-100 → 0-10 seconds) */
  sectionRestTime: number;
  /** Playback speed (1,2,4 → 100ms,50ms,25ms) - 3.0 device only */
  playbackSpeed: number;
  /** Frequency balance (1-16) - 2.0 device only */
  frequencyBalance: number;
}

/** Waveform metadata */
export interface WaveformMetadata {
  /** Global settings */
  globalSettings: WaveformGlobalSettings;
  /** Start frequency indices for each section (0-83) */
  startFrequencyIndices: number[];
  /** End frequency indices for each section (0-83) */
  endFrequencyIndices: number[];
  /** Duration indices for each section (0-99) */
  durationIndices: number[];
  /** Frequency modes for each section (1-4) */
  frequencyModes: number[];
  /** Section enabled flags */
  sectionEnabled: boolean[];
  // Legacy compatibility fields
  startFrequencies: [number, number, number];
  endFrequencies: [number, number, number];
  durations: [number, number, number];
  frequencyModes_legacy: [number, number, number];
  section2Enabled: boolean;
  section3Enabled: boolean;
  playbackSpeed: number;
}

/** Waveform shape data point */
export interface WaveformShapePoint {
  /** Strength value (0-100 for 3.0 device) */
  strength: number;
  /** Is anchor point (0=normal, 1=anchor) */
  isAnchor: boolean;
  /** Legacy: shape type (same as isAnchor for compatibility) */
  shapeType: number;
}

/** Waveform section */
export interface WaveformSection {
  index: number;
  enabled: boolean;
  /** Frequency range 1 index (0-83) */
  frequencyRange1Index: number;
  /** Frequency range 2 index (0-83) */
  frequencyRange2Index: number;
  /** Section duration index (0-99) */
  durationIndex: number;
  /** Frequency mode (1-4) */
  frequencyMode: number;
  /** Shape data points */
  shape: WaveformShapePoint[];
  // Computed values for legacy compatibility
  startFrequency: number;
  endFrequency: number;
  duration: number;
}

/** Complete parsed waveform */
export interface ParsedWaveform {
  name: string;
  metadata: WaveformMetadata;
  sections: WaveformSection[];
  rawData: string;
  hexWaveforms: string[];
  createdAt: Date;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get frequency value from index (0-83)
 */
export function getFrequencyFromIndex(index: number): number {
  const clampedIndex = Math.max(0, Math.min(83, Math.floor(index)));
  return FREQUENCY_DATASET[clampedIndex] ?? 10;
}

/**
 * Get duration value from index (0-99) in 100ms units
 */
export function getDurationFromIndex(index: number): number {
  const clampedIndex = Math.max(0, Math.min(99, Math.floor(index)));
  return DURATION_DATASET[clampedIndex] ?? 1;
}


/**
 * Frequency conversion function
 * Converts frequency value (10-1000) to output value (10-240) for device
 * Based on V3 protocol specification
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
  
  // Clamp to valid range (10-240)
  return Math.max(10, Math.min(240, Math.round(output)));
}

/**
 * Validate hex waveform format (16 hex characters = 8 bytes)
 */
export function isValidHexWaveform(hex: string): boolean {
  return /^[0-9a-fA-F]{16}$/.test(hex);
}

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Parse Dungeonlab+pulse: text format waveform data
 * 
 * Format: Dungeonlab+pulse:setting=section+section+section...
 * - setting: sectionRestTime,playbackSpeed,frequencyBalance=
 * - section: freqRange1,freqRange2,duration,freqMode,enabled/strength-anchor,...
 */
export function parseWaveform(data: string, name: string): ParsedWaveform {
  // Validate format
  if (!data.startsWith("Dungeonlab+pulse:")) {
    throw new Error("Invalid waveform format: must start with 'Dungeonlab+pulse:'");
  }

  // Remove prefix
  const cleanData = data.replace(/^Dungeonlab\+pulse:/i, "");
  
  // Split by +section+ to get sections
  const sectionParts = cleanData.split("+section+");
  
  if (sectionParts.length === 0 || !sectionParts[0]) {
    throw new Error("Invalid waveform data: no sections found");
  }

  // Parse global settings and first section
  const firstPart = sectionParts[0];
  const equalIdx = firstPart.indexOf("=");
  
  if (equalIdx === -1) {
    throw new Error("Invalid waveform format: missing '=' separator for global settings");
  }

  // Parse global settings: sectionRestTime,playbackSpeed,frequencyBalance
  const settingsPart = firstPart.substring(0, equalIdx);
  const settingsValues = settingsPart.split(",");
  
  const globalSettings: WaveformGlobalSettings = {
    sectionRestTime: Number(settingsValues[0]) || 0,
    playbackSpeed: Number(settingsValues[1]) || 1,
    frequencyBalance: Number(settingsValues[2]) || 8,
  };

  // Parse sections
  const sections: WaveformSection[] = [];
  const startFrequencyIndices: number[] = [];
  const endFrequencyIndices: number[] = [];
  const durationIndices: number[] = [];
  const frequencyModes: number[] = [];
  const sectionEnabled: boolean[] = [];

  // First section data starts after '='
  const firstSectionData = firstPart.substring(equalIdx + 1);
  const allSectionData = [firstSectionData, ...sectionParts.slice(1)];

  for (let i = 0; i < allSectionData.length && i < 10; i++) {
    const sectionData = allSectionData[i];
    if (!sectionData) continue;
    
    // Split by '/' to separate header from shape data
    const slashIdx = sectionData.indexOf("/");
    if (slashIdx === -1) {
      throw new Error(`Invalid section ${i + 1}: missing '/' separator`);
    }

    const headerPart = sectionData.substring(0, slashIdx);
    const shapePart = sectionData.substring(slashIdx + 1);

    // Parse section header: freqRange1,freqRange2,duration,freqMode,enabled
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

    // Parse shape data: strength-anchor,strength-anchor,...
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
        shapeType: isAnchor ? 1 : 0, // Legacy compatibility
      });
    }

    // Validate shape data
    if (shapePoints.length < 2) {
      throw new Error(`Invalid section ${i + 1}: must have at least 2 shape points`);
    }

    // Get computed values
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
    throw new Error("Invalid waveform data: no enabled sections found");
  }

  // Build legacy-compatible metadata
  const metadata: WaveformMetadata = {
    globalSettings,
    startFrequencyIndices,
    endFrequencyIndices,
    durationIndices,
    frequencyModes,
    sectionEnabled,
    // Legacy fields
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

  // Generate hex waveforms from sections
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
 * Convert sections to hex waveforms for device
 * Each hex waveform is 16 characters (8 bytes):
 * - 4 bytes: frequency values (4 x 25ms = 100ms)
 * - 4 bytes: strength values (4 x 25ms = 100ms)
 */
function convertToHexWaveforms(sections: WaveformSection[], playbackSpeed: number = 1): string[] {
  const hexWaveforms: string[] = [];
  
  // Playback speed determines ms per bar
  // 1 = 100ms per bar, 2 = 50ms per bar, 4 = 25ms per bar
  // Note: msPerBar is currently unused but kept for future playback speed support
  const _msPerBar = playbackSpeed === 4 ? 25 : playbackSpeed === 2 ? 50 : 100;

  for (const section of sections) {
    if (section.shape.length === 0) continue;

    const shapeCount = section.shape.length;
    const duration = section.duration; // in 100ms units
    const startFreq = section.startFrequency;
    const endFreq = section.endFrequency;
    const freqMode = section.frequencyMode;

    const waveformFreq: number[] = [];
    const waveformStrength: number[] = [];

    // Generate samples for each 100ms period
    for (let t = 0; t < duration; t++) {
      // Generate 4 samples per 100ms (each 25ms)
      for (let n = 0; n < 4; n++) {
        // Calculate progress through the section
        const totalProgress = (t + n / 4) / duration;
        
        // Calculate shape index based on progress
        const shapeProgress = totalProgress * shapeCount;
        const shapeIdx = Math.min(Math.floor(shapeProgress), shapeCount - 1);
        const nextShapeIdx = Math.min(shapeIdx + 1, shapeCount - 1);
        const interpFactor = shapeProgress - shapeIdx;

        // Get shape points
        const currentPoint = section.shape[shapeIdx];
        const nextPoint = section.shape[nextShapeIdx];
        
        // Interpolate strength
        const startStrength = currentPoint?.strength ?? 0;
        const endStrength = nextPoint?.strength ?? startStrength;
        const strength = Math.round(startStrength + (endStrength - startStrength) * interpFactor);
        waveformStrength.push(Math.max(0, Math.min(100, strength)));

        // Calculate frequency based on mode
        let freq: number;
        switch (freqMode) {
          case 1: // Fixed - use start frequency
            freq = getOutputValue(startFreq);
            break;
          case 2: // Section gradient - gradual change across entire section
            freq = getOutputValue(startFreq + (endFreq - startFreq) * totalProgress);
            break;
          case 3: // Element gradient - change within each shape element
            freq = getOutputValue(startFreq + (endFreq - startFreq) * interpFactor);
            break;
          case 4: // Inter-element gradient - step change between elements
            freq = getOutputValue(startFreq + (endFreq - startFreq) * (shapeIdx / shapeCount));
            break;
          default:
            freq = getOutputValue(startFreq);
        }
        waveformFreq.push(Math.round(freq));
      }
    }

    // Combine into 8-byte HEX strings (4 freq + 4 strength per 100ms)
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
 * Encode waveform back to Dungeonlab+pulse: text format (for round-trip testing)
 */
export function encodeWaveform(waveform: ParsedWaveform): string {
  const { metadata, sections } = waveform;
  const { globalSettings } = metadata;

  // Build global settings part
  const settingsPart = [
    globalSettings.sectionRestTime,
    globalSettings.playbackSpeed,
    globalSettings.frequencyBalance,
  ].join(",");

  // Build section strings
  const sectionStrings: string[] = [];

  // Use original indices if available, otherwise reconstruct from sections
  const allSectionCount = Math.max(
    metadata.startFrequencyIndices.length,
    sections.length
  );

  for (let i = 0; i < allSectionCount; i++) {
    const section = sections.find(s => s.index === i);
    
    let headerPart: string;
    let shapePart: string;

    if (section) {
      // Build header from section data
      headerPart = [
        section.frequencyRange1Index,
        section.frequencyRange2Index,
        section.durationIndex,
        section.frequencyMode,
        section.enabled ? 1 : 0,
      ].join(",");

      // Build shape data
      shapePart = section.shape
        .map((p) => `${p.strength}-${p.isAnchor ? 1 : 0}`)
        .join(",");
    } else {
      // Use metadata indices for disabled sections
      headerPart = [
        metadata.startFrequencyIndices[i] ?? 0,
        metadata.endFrequencyIndices[i] ?? 0,
        metadata.durationIndices[i] ?? 0,
        metadata.frequencyModes[i] ?? 1,
        0, // disabled
      ].join(",");

      // Minimal shape data for disabled section
      shapePart = "0-1,100-1";
    }

    sectionStrings.push(`${headerPart}/${shapePart}`);
  }

  // Combine: settings=firstSection+section+secondSection+section+...
  const firstSection = sectionStrings[0] ?? "0,0,0,1,0/0-1,100-1";
  const remainingSections = sectionStrings.slice(1);

  let result = `Dungeonlab+pulse:${settingsPart}=${firstSection}`;
  
  for (const section of remainingSections) {
    result += `+section+${section}`;
  }

  return result;
}
