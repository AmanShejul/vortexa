export interface ClipboardShortcutEvent {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export function isClipboardShortcut(event: ClipboardShortcutEvent): boolean {
  const key = event.key.toLowerCase();
  const code = event.code?.toLowerCase();

  if ((event.ctrlKey || event.metaKey) && (key === "c" || key === "x" || key === "v")) {
    return true;
  }

  const isInsert = key === "insert" || code === "insert";
  return isInsert && (event.ctrlKey || event.metaKey || event.shiftKey);
}
