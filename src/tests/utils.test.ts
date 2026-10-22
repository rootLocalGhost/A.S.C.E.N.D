import { describe, expect, test } from "bun:test";
import {
  joinPath,
  escapeShellPath,
  formatBatteryStatus,
  isAdbDeviceCommand,
} from "../utils";

describe("Utility Functions", () => {
  describe("joinPath", () => {
    test("joins simple directory and filename", () => {
      expect(joinPath("/sdcard", "Download", "file.txt")).toBe(
        "/sdcard/Download/file.txt"
      );
    });

    test("handles extra leading/trailing slashes", () => {
      expect(joinPath("/sdcard/", "/Pictures///", "/Camera/")).toBe(
        "/sdcard/Pictures/Camera"
      );
    });

    test("handles root path", () => {
      expect(joinPath("/")).toBe("/");
      expect(joinPath("", "")).toBe("/");
    });
  });

  describe("escapeShellPath", () => {
    test("escapes paths with single quotes", () => {
      expect(escapeShellPath("/sdcard/Download/john's file.txt")).toBe(
        "/sdcard/Download/john'\\''s file.txt"
      );
    });

    test("leaves plain paths unchanged", () => {
      expect(escapeShellPath("/sdcard/Download/file.txt")).toBe(
        "/sdcard/Download/file.txt"
      );
    });
  });

  describe("formatBatteryStatus", () => {
    test("formats known battery status codes", () => {
      expect(formatBatteryStatus("2")).toBe("Charging");
      expect(formatBatteryStatus("3")).toBe("Discharging");
      expect(formatBatteryStatus("4")).toBe("Not Charging");
      expect(formatBatteryStatus("5")).toBe("Full");
    });

    test("handles unknown status code", () => {
      expect(formatBatteryStatus("999")).toBe("Unknown");
      expect(formatBatteryStatus(undefined)).toBe("Unknown");
    });
  });

  describe("isAdbDeviceCommand", () => {
    test("identifies device-specific commands", () => {
      expect(isAdbDeviceCommand(["shell", "ls"])).toBe(true);
      expect(isAdbDeviceCommand(["pull", "/sdcard/file.txt"])).toBe(true);
      expect(isAdbDeviceCommand(["push", "local.txt", "/sdcard/"])).toBe(true);
      expect(isAdbDeviceCommand(["reboot"])).toBe(true);
    });

    test("identifies non-device global commands", () => {
      expect(isAdbDeviceCommand(["devices"])).toBe(false);
      expect(isAdbDeviceCommand(["start-server"])).toBe(false);
      expect(isAdbDeviceCommand(["connect", "192.168.1.5:5555"])).toBe(false);
      expect(isAdbDeviceCommand([])).toBe(false);
    });
  });
});
