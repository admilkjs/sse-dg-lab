/**
 * Property-Based Tests for Waveform Tools
 * Feature: waveform-and-playback-improvements
 * 
 * Tests for dg_parse_waveform save parameter behavior
 */

import { describe, test, expect, beforeEach } from "bun:test";
import * as fc from "fast-check";
import {
  dgParseWaveformTool,
  initWaveformStorage,
  getWaveformStorage,
} from "../tools/waveform-tools";
import { WaveformStorage } from "../waveform-storage";

// Valid waveform data generator - creates valid Dungeonlab+pulse format
const validWaveformDataArb = fc.record({
  sectionRestTime: fc.integer({ min: 0, max: 100 }),
  playbackSpeed: fc.constantFrom(1, 2, 4),
  frequencyBalance: fc.integer({ min: 1, max: 16 }),
  freqRange1: fc.integer({ min: 0, max: 83 }),
  freqRange2: fc.integer({ min: 0, max: 83 }),
  duration: fc.integer({ min: 1, max: 99 }),
  freqMode: fc.integer({ min: 1, max: 4 }),
  shapePoints: fc.array(
    fc.record({
      strength: fc.integer({ min: 0, max: 100 }),
      isAnchor: fc.boolean(),
    }),
    { minLength: 2, maxLength: 10 }
  ),
}).map(({ sectionRestTime, playbackSpeed, frequencyBalance, freqRange1, freqRange2, duration, freqMode, shapePoints }) => {
  const shapePart = shapePoints.map(p => `${p.strength}-${p.isAnchor ? 1 : 0}`).join(",");
  return `Dungeonlab+pulse:${sectionRestTime},${playbackSpeed},${frequencyBalance}=${freqRange1},${freqRange2},${duration},${freqMode},1/${shapePart}`;
});

// Valid name generator
const validNameArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0)
  .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '_'));

// Save parameter generator (true, false, undefined)
const saveParamArb = fc.oneof(
  fc.constant(true),
  fc.constant(false),
  fc.constant(undefined)
);

// Invalid save parameter generator (non-boolean, non-undefined)
const invalidSaveParamArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.object(),
  fc.array(fc.anything())
);

describe("Waveform Tools Property-Based Tests", () => {
  beforeEach(() => {
    initWaveformStorage(new WaveformStorage());
  });

  // Feature: waveform-and-playback-improvements, Property 1: Save parameter acceptance
  test("Property 1: Save parameter acceptance - For any valid waveform data and name, when calling dg_parse_waveform with save parameter (true, false, or undefined), the tool should accept the parameter without type errors", async () => {
    await fc.assert(
      fc.asyncProperty(
        validWaveformDataArb,
        validNameArb,
        saveParamArb,
        async (hexData, name, save) => {
          initWaveformStorage(new WaveformStorage());
          
          const params: Record<string, unknown> = { hexData };
          if (save === true) {
            params.name = name;
            params.save = save;
          } else if (save === false) {
            params.save = save;
          }
          // When save is undefined, don't include it
          
          const result = await dgParseWaveformTool.handler(params);
          
          // Should not be a type error for save parameter
          if (result.isError) {
            expect(result.content[0]!.text).not.toContain("save 参数必须是 boolean 类型");
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: waveform-and-playback-improvements, Property 2: Default save behavior
  test("Property 2: Default save behavior - For any valid waveform data, when save parameter is undefined, the waveform should NOT be saved to storage (default false)", async () => {
    await fc.assert(
      fc.asyncProperty(
        validWaveformDataArb,
        validNameArb,
        async (hexData, name) => {
          initWaveformStorage(new WaveformStorage());
          
          const result = await dgParseWaveformTool.handler({ hexData, name });
          
          if (!result.isError) {
            const storage = getWaveformStorage();
            // Default is false, so should NOT be in storage
            expect(storage.has(name)).toBe(false);
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: waveform-and-playback-improvements, Property 3: No-save behavior
  test("Property 3: No-save behavior - For any valid waveform data, when save parameter is false, the waveform should not exist in storage after parsing", async () => {
    await fc.assert(
      fc.asyncProperty(
        validWaveformDataArb,
        validNameArb,
        async (hexData, name) => {
          initWaveformStorage(new WaveformStorage());
          
          const result = await dgParseWaveformTool.handler({ hexData, name, save: false });
          
          if (!result.isError) {
            const storage = getWaveformStorage();
            expect(storage.has(name)).toBe(false);
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: waveform-and-playback-improvements, Property 4: HexWaveforms in no-save response
  test("Property 4: HexWaveforms in no-save response - For any valid waveform data, when save is false or undefined, the response should contain a non-empty hexWaveforms array", async () => {
    await fc.assert(
      fc.asyncProperty(
        validWaveformDataArb,
        async (hexData) => {
          initWaveformStorage(new WaveformStorage());
          
          const result = await dgParseWaveformTool.handler({ hexData, save: false });
          
          if (!result.isError) {
            const data = JSON.parse(result.content[0]!.text);
            expect(data.hexWaveforms).toBeDefined();
            expect(Array.isArray(data.hexWaveforms)).toBe(true);
            expect(data.hexWaveforms.length).toBeGreaterThan(0);
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: waveform-and-playback-improvements, Property 5: Overwrite detection
  test("Property 5: Overwrite detection - For any waveform name that already exists in storage, when saving a new waveform with the same name and save=true, the response should include overwritten=true", async () => {
    await fc.assert(
      fc.asyncProperty(
        validWaveformDataArb,
        validWaveformDataArb,
        validNameArb,
        async (hexData1, hexData2, name) => {
          initWaveformStorage(new WaveformStorage());
          
          // First save
          await dgParseWaveformTool.handler({ hexData: hexData1, name, save: true });
          
          // Second save with same name
          const result = await dgParseWaveformTool.handler({ hexData: hexData2, name, save: true });
          
          if (!result.isError) {
            const data = JSON.parse(result.content[0]!.text);
            expect(data.overwritten).toBe(true);
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: waveform-and-playback-improvements, Property 6: Invalid save parameter error
  test("Property 6: Invalid save parameter error - For any non-boolean value provided as save parameter (excluding undefined), the tool should return a type error message", async () => {
    await fc.assert(
      fc.asyncProperty(
        validWaveformDataArb,
        validNameArb,
        invalidSaveParamArb,
        async (hexData, name, invalidSave) => {
          initWaveformStorage(new WaveformStorage());
          
          const result = await dgParseWaveformTool.handler({ hexData, name, save: invalidSave });
          
          expect(result.isError).toBe(true);
          expect(result.content[0]!.text).toContain("save");
          expect(result.content[0]!.text).toContain("boolean");
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: waveform-and-playback-improvements, Property 7: Metadata in success response
  test("Property 7: Metadata in success response - For any successfully parsed waveform, the response should include metadata with sectionCount and totalDuration", async () => {
    await fc.assert(
      fc.asyncProperty(
        validWaveformDataArb,
        async (hexData) => {
          initWaveformStorage(new WaveformStorage());
          
          const result = await dgParseWaveformTool.handler({ hexData });
          
          if (!result.isError) {
            const data = JSON.parse(result.content[0]!.text);
            expect(data.metadata).toBeDefined();
            expect(typeof data.metadata.sectionCount).toBe("number");
            expect(data.metadata.sectionCount).toBeGreaterThan(0);
            expect(typeof data.metadata.totalDuration).toBe("number");
            expect(data.metadata.totalDuration).toBeGreaterThan(0);
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: waveform-and-playback-improvements, Property 8: Saved flag when save=false
  test("Property 8: Saved flag when save=false - For any waveform parsed with save=false, the response should include saved=false", async () => {
    await fc.assert(
      fc.asyncProperty(
        validWaveformDataArb,
        async (hexData) => {
          initWaveformStorage(new WaveformStorage());
          
          const result = await dgParseWaveformTool.handler({ hexData, save: false });
          
          if (!result.isError) {
            const data = JSON.parse(result.content[0]!.text);
            expect(data.saved).toBe(false);
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: waveform-and-playback-improvements, Property 9: Saved flag when save=true
  test("Property 9: Saved flag when save=true - For any waveform parsed with save=true, the response should include saved=true", async () => {
    await fc.assert(
      fc.asyncProperty(
        validWaveformDataArb,
        validNameArb,
        async (hexData, name) => {
          initWaveformStorage(new WaveformStorage());
          
          const result = await dgParseWaveformTool.handler({ hexData, name, save: true });
          
          if (!result.isError) {
            const data = JSON.parse(result.content[0]!.text);
            expect(data.saved).toBe(true);
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: waveform-and-playback-improvements, Property 10: Overwrite information
  test("Property 10: Overwrite information - For any waveform that overwrites an existing one, the response should include overwritten=true", async () => {
    await fc.assert(
      fc.asyncProperty(
        validWaveformDataArb,
        validNameArb,
        async (hexData, name) => {
          initWaveformStorage(new WaveformStorage());
          
          // First save
          const result1 = await dgParseWaveformTool.handler({ hexData, name, save: true });
          if (!result1.isError) {
            const data1 = JSON.parse(result1.content[0]!.text);
            // First save should not have overwritten
            expect(data1.overwritten).toBeUndefined();
          }
          
          // Second save (overwrite)
          const result2 = await dgParseWaveformTool.handler({ hexData, name, save: true });
          if (!result2.isError) {
            const data2 = JSON.parse(result2.content[0]!.text);
            expect(data2.overwritten).toBe(true);
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
