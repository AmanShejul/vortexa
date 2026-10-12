import { describe, expect, it } from "vitest";

import { isClipboardShortcut } from "./editor-clipboard";

describe("isClipboardShortcut", () => {
  it.each([
    ["c", false, true, false],
    ["x", false, true, false],
    ["v", false, true, false],
    ["c", true, false, false],
    ["x", true, false, false],
    ["v", true, false, false],
    ["Insert", false, true, false],
    ["Insert", true, false, false],
    ["Insert", false, false, true],
  ])("blocks %s with the required modifier", (key, metaKey, ctrlKey, shiftKey) => {
    expect(isClipboardShortcut({ key, ctrlKey, metaKey, shiftKey })).toBe(true);
  });

  it("recognizes Insert by keyboard code", () => {
    expect(isClipboardShortcut({ key: "", code: "Insert", ctrlKey: false, metaKey: false, shiftKey: true })).toBe(true);
  });

  it.each([
    ["a", false, false, false],
    ["Backspace", false, false, false],
    ["Delete", false, false, false],
    ["Tab", false, false, false],
    ["f", true, false, false],
    ["z", true, false, false],
    ["ArrowLeft", false, false, true],
  ])("leaves normal editor shortcut %s available", (key, metaKey, ctrlKey, shiftKey) => {
    expect(isClipboardShortcut({ key, ctrlKey, metaKey, shiftKey })).toBe(false);
  });
});
