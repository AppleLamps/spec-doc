import type { SpecFile } from "@/lib/types";

export function sanitizeProjectFilename(name: string): string {
  const trimmed = name.trim() || "project";
  return (
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "project"
  );
}

export async function copyFileContent(content: string): Promise<void> {
  await navigator.clipboard.writeText(content);
}

export function downloadSingleFile(
  path: string,
  content: string,
  projectName: string,
): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeProjectFilename(projectName)}-${path.replace(/\//g, "-")}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function shouldIncludeInZip(file: SpecFile): boolean {
  if (file.content.trim()) return true;
  return file.status === "done" || file.status === "error";
}

export async function downloadSpecZip(
  projectName: string,
  files: SpecFile[],
): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const baseName = sanitizeProjectFilename(projectName);

  for (const file of files) {
    if (!shouldIncludeInZip(file)) continue;
    zip.file(file.path, file.content);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${baseName}-specs.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function hasExportableContent(files: SpecFile[]): boolean {
  return files.some((file) => shouldIncludeInZip(file) && file.content.trim());
}
