/**
 * Waveform Tools Tests
 * Feature: dg-lab-sse-tool
 * Tests for dg_parse_waveform, dg_list_waveforms, dg_get_waveform, dg_delete_waveform
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  dgParseWaveformTool,
  dgListWaveformsTool,
  dgGetWaveformTool,
  dgDeleteWaveformTool,
  initWaveformStorage,
  getWaveformStorage,
} from "../tools/waveform-tools";
import { WaveformStorage } from "../waveform-storage";

// Sample waveform data in new text format
const SAMPLE_WAVEFORM = "Dungeonlab+pulse:0,1,8=10,20,4,1,1/50.00-0,75.00-1,100.00-0,50.00-1";

describe("Waveform Tools", () => {
  beforeEach(() => {
    // Reset storage before each test
    initWaveformStorage(new WaveformStorage());
  });

  describe("dg_parse_waveform", () => {
    test("Parses valid waveform data and saves when save=true", async () => {
      const result = await dgParseWaveformTool.handler({ hexData: SAMPLE_WAVEFORM, name: "test-wave", save: true });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0]!.text);
      expect(data.success).toBe(true);
      expect(data.name).toBe("test-wave");
      expect(data.hexWaveformCount).toBeGreaterThan(0);
    });

    test("Returns error for missing hexData", async () => {
      const result = await dgParseWaveformTool.handler({ name: "test" });

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("hexData");
    });

    test("Returns error for missing name when save=true", async () => {
      const result = await dgParseWaveformTool.handler({ hexData: SAMPLE_WAVEFORM, save: true });

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("name");
    });

    test("Returns error for empty name when save=true", async () => {
      const result = await dgParseWaveformTool.handler({ hexData: SAMPLE_WAVEFORM, name: "   ", save: true });

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("name");
    });

    test("Returns error for invalid waveform data", async () => {
      const result = await dgParseWaveformTool.handler({ hexData: "invalid", name: "test" });

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("Error");
    });

    test("Indicates when overwriting existing waveform", async () => {
      // First save
      const result1 = await dgParseWaveformTool.handler({ hexData: SAMPLE_WAVEFORM, name: "test-wave", save: true });
      const data1 = JSON.parse(result1.content[0]!.text);
      expect(data1.overwritten).toBeUndefined();

      // Second save with same name
      const result2 = await dgParseWaveformTool.handler({ hexData: SAMPLE_WAVEFORM, name: "test-wave", save: true });
      const data2 = JSON.parse(result2.content[0]!.text);
      expect(data2.overwritten).toBe(true);
    });

    // Tests for save parameter (Feature: waveform-and-playback-improvements)
    describe("save parameter", () => {
      test("save=true saves waveform to storage", async () => {
        const result = await dgParseWaveformTool.handler({ 
          hexData: SAMPLE_WAVEFORM, 
          name: "save-true-test",
          save: true 
        });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0]!.text);
        expect(data.success).toBe(true);
        expect(data.saved).toBe(true);
        
        // Verify waveform is in storage
        const storage = getWaveformStorage();
        expect(storage.has("save-true-test")).toBe(true);
      });

      test("save=false does not save waveform to storage", async () => {
        const result = await dgParseWaveformTool.handler({ 
          hexData: SAMPLE_WAVEFORM, 
          name: "save-false-test",
          save: false 
        });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0]!.text);
        expect(data.success).toBe(true);
        expect(data.saved).toBe(false);
        
        // Verify waveform is NOT in storage
        const storage = getWaveformStorage();
        expect(storage.has("save-false-test")).toBe(false);
      });

      test("save=undefined defaults to false (does not save)", async () => {
        const result = await dgParseWaveformTool.handler({ 
          hexData: SAMPLE_WAVEFORM, 
          name: "save-undefined-test"
          // save is not provided
        });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0]!.text);
        expect(data.success).toBe(true);
        expect(data.saved).toBe(false);
        
        // Verify waveform is NOT in storage
        const storage = getWaveformStorage();
        expect(storage.has("save-undefined-test")).toBe(false);
      });

      test("name is not required when save=false or undefined", async () => {
        // Without name, save=false
        const result1 = await dgParseWaveformTool.handler({ 
          hexData: SAMPLE_WAVEFORM, 
          save: false 
        });
        expect(result1.isError).toBeUndefined();
        const data1 = JSON.parse(result1.content[0]!.text);
        expect(data1.success).toBe(true);
        expect(data1.name).toBe("unnamed");

        // Without name, save undefined
        const result2 = await dgParseWaveformTool.handler({ 
          hexData: SAMPLE_WAVEFORM
        });
        expect(result2.isError).toBeUndefined();
        const data2 = JSON.parse(result2.content[0]!.text);
        expect(data2.success).toBe(true);
        expect(data2.name).toBe("unnamed");
      });

      test("save=false returns hexWaveforms in response", async () => {
        const result = await dgParseWaveformTool.handler({ 
          hexData: SAMPLE_WAVEFORM, 
          save: false 
        });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0]!.text);
        expect(data.hexWaveforms).toBeDefined();
        expect(Array.isArray(data.hexWaveforms)).toBe(true);
        expect(data.hexWaveforms.length).toBeGreaterThan(0);
        // Each hex waveform should be 16 characters
        for (const hex of data.hexWaveforms) {
          expect(hex.length).toBe(16);
          expect(/^[0-9a-f]+$/i.test(hex)).toBe(true);
        }
      });

      test("save=true does not return hexWaveforms in response", async () => {
        const result = await dgParseWaveformTool.handler({ 
          hexData: SAMPLE_WAVEFORM, 
          name: "no-hex-return-test",
          save: true 
        });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0]!.text);
        expect(data.hexWaveforms).toBeUndefined();
      });

      test("Invalid save parameter type returns error", async () => {
        const result = await dgParseWaveformTool.handler({ 
          hexData: SAMPLE_WAVEFORM, 
          name: "invalid-save-test",
          save: "true" as unknown as boolean // string instead of boolean
        });

        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toContain("save");
        expect(result.content[0]!.text).toContain("boolean");
      });

      test("Invalid save parameter (number) returns error", async () => {
        const result = await dgParseWaveformTool.handler({ 
          hexData: SAMPLE_WAVEFORM, 
          name: "invalid-save-number-test",
          save: 1 as unknown as boolean // number instead of boolean
        });

        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toContain("save");
        expect(result.content[0]!.text).toContain("boolean");
      });

      test("Response includes metadata with sectionCount and totalDuration", async () => {
        const result = await dgParseWaveformTool.handler({ 
          hexData: SAMPLE_WAVEFORM, 
          save: false 
        });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0]!.text);
        expect(data.metadata).toBeDefined();
        expect(typeof data.metadata.sectionCount).toBe("number");
        expect(data.metadata.sectionCount).toBeGreaterThan(0);
        expect(typeof data.metadata.totalDuration).toBe("number");
        expect(data.metadata.totalDuration).toBeGreaterThan(0);
      });

      test("save=true with existing waveform returns overwritten=true", async () => {
        // First save
        await dgParseWaveformTool.handler({ 
          hexData: SAMPLE_WAVEFORM, 
          name: "overwrite-test",
          save: true 
        });

        // Second save with same name
        const result = await dgParseWaveformTool.handler({ 
          hexData: SAMPLE_WAVEFORM, 
          name: "overwrite-test",
          save: true 
        });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0]!.text);
        expect(data.overwritten).toBe(true);
      });

      test("save=false with existing waveform does not return overwritten", async () => {
        // First save
        await dgParseWaveformTool.handler({ 
          hexData: SAMPLE_WAVEFORM, 
          name: "no-overwrite-test",
          save: true 
        });

        // Second parse without save
        const result = await dgParseWaveformTool.handler({ 
          hexData: SAMPLE_WAVEFORM, 
          name: "no-overwrite-test",
          save: false 
        });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0]!.text);
        expect(data.overwritten).toBeUndefined();
        expect(data.saved).toBe(false);
      });
    });
  });

  describe("dg_list_waveforms", () => {
    test("Returns empty list when no waveforms", async () => {
      const result = await dgListWaveformsTool.handler({});

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0]!.text);
      expect(data.count).toBe(0);
      expect(data.waveforms).toEqual([]);
    });

    test("Returns all saved waveforms", async () => {
      // Save multiple waveforms
      await dgParseWaveformTool.handler({ hexData: SAMPLE_WAVEFORM, name: "wave1", save: true });
      await dgParseWaveformTool.handler({ hexData: SAMPLE_WAVEFORM, name: "wave2", save: true });
      await dgParseWaveformTool.handler({ hexData: SAMPLE_WAVEFORM, name: "wave3", save: true });

      const result = await dgListWaveformsTool.handler({});

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0]!.text);
      expect(data.count).toBe(3);
      expect(data.waveforms.map((w: { name: string }) => w.name).sort()).toEqual(["wave1", "wave2", "wave3"]);
    });

    test("List includes required fields", async () => {
      await dgParseWaveformTool.handler({ hexData: SAMPLE_WAVEFORM, name: "test-wave", save: true });

      const result = await dgListWaveformsTool.handler({});
      const data = JSON.parse(result.content[0]!.text);
      const waveform = data.waveforms[0];

      expect(waveform.name).toBe("test-wave");
      expect(waveform.hexWaveformCount).toBeDefined();
    });
  });

  describe("dg_get_waveform", () => {
    test("Returns waveform by name", async () => {
      await dgParseWaveformTool.handler({ hexData: SAMPLE_WAVEFORM, name: "test-wave", save: true });

      const result = await dgGetWaveformTool.handler({ name: "test-wave" });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0]!.text);
      expect(data.name).toBe("test-wave");
      expect(data.hexWaveforms).toBeDefined();
    });

    test("Returns error for missing name", async () => {
      const result = await dgGetWaveformTool.handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("name");
    });

    test("Returns error for non-existent waveform", async () => {
      const result = await dgGetWaveformTool.handler({ name: "non-existent" });

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("波形未找到");
    });

    test("Returns hexWaveforms for device use", async () => {
      await dgParseWaveformTool.handler({ hexData: SAMPLE_WAVEFORM, name: "test-wave", save: true });

      const result = await dgGetWaveformTool.handler({ name: "test-wave" });
      const data = JSON.parse(result.content[0]!.text);

      expect(Array.isArray(data.hexWaveforms)).toBe(true);
      expect(data.hexWaveforms.length).toBeGreaterThan(0);
      // Each hex waveform should be 16 characters
      for (const hex of data.hexWaveforms) {
        expect(hex.length).toBe(16);
        expect(/^[0-9a-f]+$/i.test(hex)).toBe(true);
      }
    });
  });

  describe("dg_delete_waveform", () => {
    test("Deletes existing waveform", async () => {
      await dgParseWaveformTool.handler({ hexData: SAMPLE_WAVEFORM, name: "test-wave", save: true });

      // Verify it exists
      const storage = getWaveformStorage();
      expect(storage.has("test-wave")).toBe(true);

      // Delete
      const result = await dgDeleteWaveformTool.handler({ name: "test-wave" });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0]!.text);
      expect(data.success).toBe(true);
      expect(data.deleted).toBe("test-wave");

      // Verify it's gone
      expect(storage.has("test-wave")).toBe(false);
    });

    test("Returns error for missing name", async () => {
      const result = await dgDeleteWaveformTool.handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("name");
    });

    test("Returns error for non-existent waveform", async () => {
      const result = await dgDeleteWaveformTool.handler({ name: "non-existent" });

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("波形未找到");
    });
  });

  describe("Tool Schema Validity", () => {
    test("All waveform tools have valid schemas", () => {
      const tools = [
        dgParseWaveformTool,
        dgListWaveformsTool,
        dgGetWaveformTool,
        dgDeleteWaveformTool,
      ];

      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
        expect(Array.isArray(tool.inputSchema.required)).toBe(true);
        expect(typeof tool.handler).toBe("function");
      }
    });
  });

  describe("Property-based tests", () => {
    test("Parse and get returns same data", async () => {
      const names = ["wave-a", "wave-b", "wave-c", "wave-d", "wave-e"];
      
      for (const name of names) {
        // Reset storage
        initWaveformStorage(new WaveformStorage());

        // Parse and save
        const parseResult = await dgParseWaveformTool.handler({ hexData: SAMPLE_WAVEFORM, name, save: true });
        expect(parseResult.isError).toBeUndefined();

        // Get
        const getResult = await dgGetWaveformTool.handler({ name });
        expect(getResult.isError).toBeUndefined();

        const data = JSON.parse(getResult.content[0]!.text);
        expect(data.name).toBe(name);
        expect(data.hexWaveforms).toBeDefined();
      }
    });

    test("Delete removes waveform from list", async () => {
      const names = ["del-a", "del-b", "del-c"];
      
      for (const name of names) {
        // Reset storage
        initWaveformStorage(new WaveformStorage());

        // Parse and save
        await dgParseWaveformTool.handler({ hexData: SAMPLE_WAVEFORM, name, save: true });

        // List should contain it
        const listResult1 = await dgListWaveformsTool.handler({});
        const list1 = JSON.parse(listResult1.content[0]!.text);
        expect(list1.count).toBe(1);

        // Delete
        await dgDeleteWaveformTool.handler({ name });

        // List should be empty
        const listResult2 = await dgListWaveformsTool.handler({});
        const list2 = JSON.parse(listResult2.content[0]!.text);
        expect(list2.count).toBe(0);
      }
    });

    test("Property: Valid names are accepted", async () => {
      const validNames = ["wave1", "test-wave", "my_waveform", "Wave123", "a1b2c3"];
      
      for (const name of validNames) {
        initWaveformStorage(new WaveformStorage());
        
        const result = await dgParseWaveformTool.handler({ hexData: SAMPLE_WAVEFORM, name, save: true });
        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0]!.text);
        expect(data.name).toBe(name);
      }
    });
  });
});
