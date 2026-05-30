"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ValidationWarning } from "@/lib/artifact-validation";
import { copyFileContent, countWords, downloadSingleFile } from "@/lib/export";
import type { RunStatus, SpecFile } from "@/lib/types";

type EditorPanelProps = {
  file: SpecFile | null;
  projectName: string;
  onChange: (path: string, content: string) => void;
  onRegenerate: () => void;
  onFixWarnings: () => void;
  warnings: ValidationWarning[];
  isGenerating: boolean;
  isCurrentFileGenerating: boolean;
  runStatus: RunStatus;
  hasPartialBundle?: boolean;
};

export function EditorPanel({
  file,
  projectName,
  onChange,
  onRegenerate,
  onFixWarnings,
  warnings,
  isGenerating,
  isCurrentFileGenerating,
  runStatus,
  hasPartialBundle,
}: EditorPanelProps) {
  if (!file) {
    return (
      <div className="flex h-full items-center justify-center bg-white">
        <div className="max-w-md border border-dashed border-neutral-300 px-8 py-10 text-center">
          <p className="font-mono text-sm font-medium text-neutral-700">
            No artifact selected
          </p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-500">
            {hasPartialBundle
              ? "Compile was stopped early. Select a completed artifact from the tree to review or edit what was generated."
              : "Compile specs from the workspace panel, or select an artifact from the tree to view and edit its markdown source."}
          </p>
        </div>
      </div>
    );
  }

  const readOnly = isCurrentFileGenerating;
  const wordCount = countWords(file.content);
  const charCount = file.content.length;
  const hasWarnings = warnings.length > 0;

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="border-b border-neutral-200 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
              Current artifact
            </p>
            <p className="truncate font-mono text-sm font-semibold text-neutral-900">
              {file.path}
            </p>
            <p className="mt-1 text-xs text-neutral-500">{file.purpose}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="status-badge">{file.status}</span>
            {hasWarnings && (
              <span className="font-mono text-[10px] text-amber-700">
                {warnings.length} warning{warnings.length === 1 ? "" : "s"}
              </span>
            )}
            <span className="font-mono text-[10px] text-neutral-400">
              {wordCount} words · {charCount} chars
            </span>
          </div>
        </div>

        {hasWarnings && (
          <ul className="mt-3 space-y-1 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {warnings.map((warning) => (
              <li key={warning.id} className="leading-relaxed">
                {warning.message}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={onRegenerate}
            disabled={isGenerating}
          >
            Regenerate file
          </button>
          {hasWarnings && (
            <button
              type="button"
              className="btn-primary text-xs"
              onClick={onFixWarnings}
              disabled={isGenerating}
            >
              Fix warnings
            </button>
          )}
          <CopyButton content={file.content} disabled={!file.content.trim()} />
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={!file.content.trim()}
            onClick={() => downloadSingleFile(file.path, file.content, projectName)}
          >
            Download file
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <section className="editor-pane flex min-h-0 flex-col border-b border-neutral-200 lg:border-b-0 lg:border-r">
          <div className="border-b border-neutral-200 bg-neutral-100 px-3 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
              Source
            </span>
          </div>
          <textarea
            className="min-h-0 flex-1 resize-none bg-neutral-50 p-4 font-mono text-xs leading-relaxed text-neutral-800 outline-none"
            value={file.content}
            onChange={(e) => onChange(file.path, e.target.value)}
            readOnly={readOnly}
            spellCheck={false}
          />
        </section>

        <section className="preview-pane flex min-h-0 flex-col border-l border-neutral-100 bg-white">
          <div className="border-b border-neutral-200 px-3 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
              Preview
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-white p-4">
            {file.status === "cancelled" && !file.content.trim() ? (
              <p className="font-mono text-xs text-neutral-500">
                Generation was cancelled before this file completed.
              </p>
            ) : file.content.trim() ? (
              <article className="markdown-preview prose-spec max-w-none text-sm text-neutral-800">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {file.content}
                </ReactMarkdown>
              </article>
            ) : file.status === "generating" ? (
              <p className="font-mono text-xs text-neutral-400">
                Compiling output…
              </p>
            ) : runStatus === "error" && file.status === "error" ? (
              <p className="font-mono text-xs text-red-700">
                This file failed to compile. Regenerate to retry.
              </p>
            ) : (
              <p className="font-mono text-xs text-neutral-400">
                Waiting for compiled output…
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function CopyButton({
  content,
  disabled,
}: {
  content: string;
  disabled: boolean;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="btn-secondary text-xs"
      disabled={disabled}
      onClick={async () => {
        try {
          await copyFileContent(content);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard unavailable.
        }
      }}
    >
      {copied ? "Copied" : "Copy file"}
    </button>
  );
}
