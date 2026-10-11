"use client";

import Editor from "@monaco-editor/react";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onReady?: () => void;
  readOnly?: boolean;
}

export function CodeEditor({ value, onChange, onReady, readOnly = false }: CodeEditorProps) {
  return (
    <div className="h-[clamp(320px,58vh,560px)] min-h-[320px] overflow-hidden rounded-xl border border-[#292929] bg-[#080808]">
      <Editor
        height="100%"
        defaultLanguage="python"
        language="python"
        value={value}
        onChange={(nextValue) => onChange(nextValue ?? "")}
        onMount={(editor, monaco) => {
          monaco.editor.defineTheme("codequest-monochrome", {
            base: "vs-dark",
            inherit: false,
            rules: [
              { token: "", foreground: "E5E5E5" },
              { token: "keyword", foreground: "FFFFFF", fontStyle: "bold" },
              { token: "comment", foreground: "737373", fontStyle: "italic" },
              { token: "string", foreground: "A3A3A3" },
              { token: "number", foreground: "D4D4D4" },
            ],
            colors: {
              "editor.background": "#080808",
              "editor.foreground": "#E5E5E5",
              "editorLineNumber.foreground": "#525252",
              "editorLineNumber.activeForeground": "#FFFFFF",
              "editorCursor.foreground": "#FFFFFF",
              "editor.selectionBackground": "#404040",
              "editor.inactiveSelectionBackground": "#292929",
              "editorIndentGuide.background": "#1F1F1F",
              "editorIndentGuide.activeBackground": "#404040",
            },
          });
          monaco.editor.setTheme("codequest-monochrome");
          onReady?.();
        }}
        theme="codequest-monochrome"
        loading={<div className="grid h-full place-items-center font-mono text-xs text-neutral-500">Loading Python editor…</div>}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineHeight: 24,
          padding: { top: 18, bottom: 18 },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          tabSize: 4,
          fontFamily: "monospace",
          suggestOnTriggerCharacters: true,
          readOnly,
          ariaLabel: "Python code editor",
          automaticLayout: true,
        }}
      />
    </div>
  );
}
