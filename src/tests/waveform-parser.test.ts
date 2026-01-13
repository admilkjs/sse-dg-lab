/**
 * Waveform Parser Tests
 * Feature: dg-lab-sse-tool
 * Tests for Dungeonlab+pulse: text format parsing
 * 
 * Format: Dungeonlab+pulse:setting=section+section+section...
 * - setting: sectionRestTime,playbackSpeed,frequencyBalance=
 * - section: freqRange1,freqRange2,duration,freqMode,enabled/strength-anchor,...
 */

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import {
  parseWaveform,
  encodeWaveform,
  getOutputValue,
  getFrequencyFromIndex,
  getDurationFromIndex,
  isValidHexWaveform,
  FREQUENCY_DATASET,
  DURATION_DATASET,
} from "../waveform-parser";

// Sample waveform data from specification (经典波形挑逗2)
const SAMPLE_WAVEFORM = "Dungeonlab+pulse:18,1,8=27,7,32,3,1/0-1,11.1-0,22.2-0,33.3-0,44.4-0,55.5-0,66.6-0,77.7-0,88.8-0,100-1+section+0,20,39,2,1/0-1,100-1";

// Simple single-section waveform
const SIMPLE_WAVEFORM = "Dungeonlab+pulse:0,1,8=10,20,4,1,1/0-1,50-0,100-1";

// Multi-section waveform with disabled section
const MULTI_SECTION_WAVEFORM = "Dungeonlab+pulse:10,2,8=5,15,8,1,1/0-1,100-1+section+20,30,16,2,1/0-1,50-0,100-1+section+0,0,0,1,0/0-1,100-1";

describe("Waveform Parser - Dungeonlab+pulse Format", () => {
  describe("Basic Parsing", () => {
    test("Parses sample waveform correctly", () => {
      const waveform = parseWaveform(SAMPLE_WAVEFORM, "test-wave");

      expect(waveform.name).toBe("test-wave");
      expect(waveform.rawData).toBe(SAMPLE_WAVEFORM);
      expect(waveform.sections.length).toBeGreaterThan(0);
      expect(waveform.hexWaveforms.length).toBeGreaterThan(0);
      expect(waveform.createdAt).toBeInstanceOf(Date);
    });

    test("Parses global settings correctly", () => {
      const waveform = parseWaveform(SAMPLE_WAVEFORM, "settings-test");

      expect(waveform.metadata.globalSettings.sectionRestTime).toBe(18);
      expect(waveform.metadata.globalSettings.playbackSpeed).toBe(1);
      expect(waveform.metadata.globalSettings.frequencyBalance).toBe(8);
    });

    test("Parses simple waveform correctly", () => {
      const waveform = parseWaveform(SIMPLE_WAVEFORM, "simple");

      expect(waveform.name).toBe("simple");
      expect(waveform.sections.length).toBe(1);
      
      const section = waveform.sections[0];
      expect(section).toBeDefined();
      expect(section!.frequencyRange1Index).toBe(10);
      expect(section!.frequencyRange2Index).toBe(20);
      expect(section!.durationIndex).toBe(4);
      expect(section!.frequencyMode).toBe(1);
      expect(section!.enabled).toBe(true);
      expect(section!.shape.length).toBe(3);
    });

    test("Parses multi-section waveform", () => {
      const waveform = parseWaveform(MULTI_SECTION_WAVEFORM, "multi");

      // First two sections are enabled, third is disabled
      expect(waveform.sections.length).toBe(2);
      expect(waveform.metadata.sectionEnabled[0]).toBe(true);
      expect(waveform.metadata.sectionEnabled[1]).toBe(true);
      expect(waveform.metadata.sectionEnabled[2]).toBe(false);
    });

    test("Extracts shape points correctly", () => {
      const waveform = parseWaveform(SIMPLE_WAVEFORM, "shapes");
      const section = waveform.sections[0];

      expect(section).toBeDefined();
      expect(section!.shape.length).toBe(3);
      
      // First point: 0-1 (strength=0, anchor=true)
      expect(section!.shape[0]).toEqual({ strength: 0, isAnchor: true, shapeType: 1 });
      // Second point: 50-0 (strength=50, anchor=false)
      expect(section!.shape[1]).toEqual({ strength: 50, isAnchor: false, shapeType: 0 });
      // Third point: 100-1 (strength=100, anchor=true)
      expect(section!.shape[2]).toEqual({ strength: 100, isAnchor: true, shapeType: 1 });
    });

    test("Parses section parameters correctly", () => {
      const waveform = parseWaveform(SAMPLE_WAVEFORM, "params");
      
      // First section: 27,7,32,3,1
      expect(waveform.metadata.startFrequencyIndices[0]).toBe(27);
      expect(waveform.metadata.endFrequencyIndices[0]).toBe(7);
      expect(waveform.metadata.durationIndices[0]).toBe(32);
      expect(waveform.metadata.frequencyModes[0]).toBe(3);
      expect(waveform.metadata.sectionEnabled[0]).toBe(true);

      // Second section: 0,20,39,2,1
      expect(waveform.metadata.startFrequencyIndices[1]).toBe(0);
      expect(waveform.metadata.endFrequencyIndices[1]).toBe(20);
      expect(waveform.metadata.durationIndices[1]).toBe(39);
      expect(waveform.metadata.frequencyModes[1]).toBe(2);
      expect(waveform.metadata.sectionEnabled[1]).toBe(true);
    });
  });

  describe("Error Handling", () => {
    test("Throws error for invalid format prefix", () => {
      expect(() => parseWaveform("invalid data", "test")).toThrow("Invalid waveform format");
    });

    test("Throws error for missing equals separator", () => {
      expect(() => parseWaveform("Dungeonlab+pulse:0,1,8", "test")).toThrow("missing '=' separator");
    });

    test("Throws error for missing slash separator", () => {
      expect(() => parseWaveform("Dungeonlab+pulse:0,1,8=10,20,4,1,1", "test")).toThrow("missing '/' separator");
    });

    test("Throws error for insufficient shape points", () => {
      expect(() => parseWaveform("Dungeonlab+pulse:0,1,8=10,20,4,1,1/50-1", "test")).toThrow("at least 2 shape points");
    });

    test("Throws error for no enabled sections", () => {
      expect(() => parseWaveform("Dungeonlab+pulse:0,1,8=10,20,4,1,0/0-1,100-1", "test")).toThrow("no enabled sections");
    });
  });


  describe("Data Sets", () => {
    test("Frequency dataset has correct length", () => {
      expect(FREQUENCY_DATASET.length).toBe(84);
    });

    test("Duration dataset has correct length", () => {
      expect(DURATION_DATASET.length).toBe(100);
    });

    test("getFrequencyFromIndex returns valid values", () => {
      expect(getFrequencyFromIndex(0)).toBe(10);
      expect(getFrequencyFromIndex(83)).toBe(1000);
      expect(getFrequencyFromIndex(-1)).toBe(10); // Clamped
      expect(getFrequencyFromIndex(100)).toBe(1000); // Clamped
    });

    test("getDurationFromIndex returns valid values", () => {
      expect(getDurationFromIndex(0)).toBe(1);
      expect(getDurationFromIndex(99)).toBe(100);
      expect(getDurationFromIndex(-1)).toBe(1); // Clamped
      expect(getDurationFromIndex(150)).toBe(100); // Clamped
    });
  });

  describe("Frequency Conversion", () => {
    test("getOutputValue returns values in valid range (10-240)", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1200 }), (x) => {
          const output = getOutputValue(x);
          expect(output).toBeGreaterThanOrEqual(10);
          expect(output).toBeLessThanOrEqual(240);
        }),
        { numRuns: 100 }
      );
    });

    test("getOutputValue follows V3 protocol formula", () => {
      // Range 10-100: output = input
      expect(getOutputValue(10)).toBe(10);
      expect(getOutputValue(50)).toBe(50);
      expect(getOutputValue(100)).toBe(100);
      
      // Range 101-600: output = (input - 100) / 5 + 100
      expect(getOutputValue(150)).toBe(110); // (150-100)/5 + 100 = 110
      expect(getOutputValue(350)).toBe(150); // (350-100)/5 + 100 = 150
      expect(getOutputValue(600)).toBe(200); // (600-100)/5 + 100 = 200
      
      // Range 601-1000: output = (input - 600) / 10 + 200
      expect(getOutputValue(700)).toBe(210); // (700-600)/10 + 200 = 210
      expect(getOutputValue(1000)).toBe(240); // (1000-600)/10 + 200 = 240
    });

    test("getOutputValue clamps out-of-range values", () => {
      expect(getOutputValue(5)).toBe(10); // Below minimum
      expect(getOutputValue(1500)).toBe(240); // Above maximum
    });
  });

  describe("Round-Trip Encoding", () => {
    test("Encode and parse preserves structure", () => {
      const original = parseWaveform(SIMPLE_WAVEFORM, "roundtrip");
      const encoded = encodeWaveform(original);
      const reparsed = parseWaveform(encoded, "roundtrip");

      expect(reparsed.sections.length).toBe(original.sections.length);
      expect(reparsed.sections[0]!.frequencyRange1Index).toBe(original.sections[0]!.frequencyRange1Index);
      expect(reparsed.sections[0]!.frequencyRange2Index).toBe(original.sections[0]!.frequencyRange2Index);
      expect(reparsed.sections[0]!.durationIndex).toBe(original.sections[0]!.durationIndex);
      expect(reparsed.sections[0]!.frequencyMode).toBe(original.sections[0]!.frequencyMode);
    });

    test("Encode and parse preserves global settings", () => {
      const original = parseWaveform(SAMPLE_WAVEFORM, "settings-roundtrip");
      const encoded = encodeWaveform(original);
      const reparsed = parseWaveform(encoded, "settings-roundtrip");

      expect(reparsed.metadata.globalSettings.sectionRestTime).toBe(original.metadata.globalSettings.sectionRestTime);
      expect(reparsed.metadata.globalSettings.playbackSpeed).toBe(original.metadata.globalSettings.playbackSpeed);
      expect(reparsed.metadata.globalSettings.frequencyBalance).toBe(original.metadata.globalSettings.frequencyBalance);
    });

    test("Property 18: Round-trip preserves section count", () => {
      /**
       * Feature: dg-lab-sse-tool, Property 18: Waveform Parsing Round-Trip
       * Validates: Requirements 14.9
       */
      fc.assert(
        fc.property(
          fc.record({
            restTime: fc.integer({ min: 0, max: 100 }),
            speed: fc.constantFrom(1, 2, 4),
            balance: fc.integer({ min: 1, max: 16 }),
            freqRange1: fc.integer({ min: 0, max: 83 }),
            freqRange2: fc.integer({ min: 0, max: 83 }),
            duration: fc.integer({ min: 0, max: 99 }),
            mode: fc.integer({ min: 1, max: 4 }),
            shapeCount: fc.integer({ min: 2, max: 20 }),
          }),
          (input) => {
            // Generate shape data with anchors at start and end
            const shapes: string[] = [];
            for (let i = 0; i < input.shapeCount; i++) {
              const strength = Math.round((i / (input.shapeCount - 1)) * 100);
              const isAnchor = i === 0 || i === input.shapeCount - 1 ? 1 : 0;
              shapes.push(`${strength}-${isAnchor}`);
            }

            const waveformData = `Dungeonlab+pulse:${input.restTime},${input.speed},${input.balance}=${input.freqRange1},${input.freqRange2},${input.duration},${input.mode},1/${shapes.join(",")}`;
            
            const parsed = parseWaveform(waveformData, "prop-test");
            const encoded = encodeWaveform(parsed);
            const reparsed = parseWaveform(encoded, "prop-test");

            expect(reparsed.sections.length).toBe(parsed.sections.length);
            expect(reparsed.metadata.globalSettings.sectionRestTime).toBe(parsed.metadata.globalSettings.sectionRestTime);
            expect(reparsed.metadata.globalSettings.playbackSpeed).toBe(parsed.metadata.globalSettings.playbackSpeed);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe("Hex Waveform Validation", () => {
    test("Valid 16-char hex strings are accepted", () => {
      const hexCharArb = fc.constantFrom(
        "0", "1", "2", "3", "4", "5", "6", "7",
        "8", "9", "a", "b", "c", "d", "e", "f"
      );
      const hex16Arb = fc.array(hexCharArb, { minLength: 16, maxLength: 16 })
        .map((chars) => chars.join(""));

      fc.assert(
        fc.property(hex16Arb, (hex) => {
          expect(isValidHexWaveform(hex)).toBe(true);
        }),
        { numRuns: 50 }
      );
    });

    test("Invalid hex strings are rejected", () => {
      expect(isValidHexWaveform("")).toBe(false);
      expect(isValidHexWaveform("0123456789abcde")).toBe(false); // 15 chars
      expect(isValidHexWaveform("0123456789abcdef0")).toBe(false); // 17 chars
      expect(isValidHexWaveform("0123456789abcdeg")).toBe(false); // invalid char
    });
  });

  describe("HEX Waveform Generation", () => {
    test("Generated hex waveforms have correct format", () => {
      const waveform = parseWaveform(SIMPLE_WAVEFORM, "hex-test");

      expect(waveform.hexWaveforms.length).toBeGreaterThan(0);

      for (const hex of waveform.hexWaveforms) {
        expect(isValidHexWaveform(hex)).toBe(true);
      }
    });

    test("Property: All generated hex waveforms are valid", () => {
      /**
       * Feature: dg-lab-sse-tool, Property 20: Waveform Section Parsing
       * Validates: Requirements 14.3, 14.4
       */
      fc.assert(
        fc.property(
          fc.record({
            freqRange1: fc.integer({ min: 0, max: 83 }),
            freqRange2: fc.integer({ min: 0, max: 83 }),
            duration: fc.integer({ min: 1, max: 20 }),
            mode: fc.integer({ min: 1, max: 4 }),
          }),
          (input) => {
            const shapes = "0-1,50-0,100-1";
            const waveformData = `Dungeonlab+pulse:0,1,8=${input.freqRange1},${input.freqRange2},${input.duration},${input.mode},1/${shapes}`;
            
            const parsed = parseWaveform(waveformData, "prop-hex");

            for (const hex of parsed.hexWaveforms) {
              expect(isValidHexWaveform(hex)).toBe(true);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe("Metadata Extraction", () => {
    test("Property 19: Metadata fields are correctly extracted", () => {
      /**
       * Feature: dg-lab-sse-tool, Property 19: Waveform Metadata Extraction
       * Validates: Requirements 14.2, 14.3
       */
      fc.assert(
        fc.property(
          fc.record({
            restTime: fc.integer({ min: 0, max: 100 }),
            speed: fc.constantFrom(1, 2, 4),
            balance: fc.integer({ min: 1, max: 16 }),
            freqRange1: fc.integer({ min: 0, max: 83 }),
            freqRange2: fc.integer({ min: 0, max: 83 }),
            duration: fc.integer({ min: 0, max: 99 }),
            mode: fc.integer({ min: 1, max: 4 }),
          }),
          (input) => {
            const waveformData = `Dungeonlab+pulse:${input.restTime},${input.speed},${input.balance}=${input.freqRange1},${input.freqRange2},${input.duration},${input.mode},1/0-1,100-1`;
            const parsed = parseWaveform(waveformData, "meta-prop");

            // Verify global settings
            expect(parsed.metadata.globalSettings.sectionRestTime).toBe(input.restTime);
            expect(parsed.metadata.globalSettings.playbackSpeed).toBe(input.speed);
            expect(parsed.metadata.globalSettings.frequencyBalance).toBe(input.balance);

            // Verify section parameters
            expect(parsed.metadata.startFrequencyIndices[0]).toBe(input.freqRange1);
            expect(parsed.metadata.endFrequencyIndices[0]).toBe(input.freqRange2);
            expect(parsed.metadata.durationIndices[0]).toBe(input.duration);
            expect(parsed.metadata.frequencyModes[0]).toBe(input.mode);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe("Invalid Data Error Handling", () => {
    test("Property 23: Invalid waveform data produces errors", () => {
      /**
       * Feature: dg-lab-sse-tool, Property 23: Invalid Waveform Data Error
       * Validates: Requirements 14.8
       */
      const invalidFormats = [
        "random string",
        "Dungeonlab+pulse:",
        "Dungeonlab+pulse:0,1,8",
        "Dungeonlab+pulse:0,1,8=",
        "Dungeonlab+pulse:0,1,8=10,20,4,1,1",
        "Dungeonlab+pulse:0,1,8=10,20,4,1,0/0-1,100-1", // No enabled sections
      ];

      for (const invalid of invalidFormats) {
        expect(() => parseWaveform(invalid, "test")).toThrow();
      }
    });
  });
});
