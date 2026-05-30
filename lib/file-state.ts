import type { SpecFile } from "./types";

export function markRunCancelled(
  files: SpecFile[],
  onlyPaths?: Set<string>,
): SpecFile[] {
  return files.map((file) => {
    if (onlyPaths && !onlyPaths.has(file.path)) return file;
    if (file.status === "done") return file;
    return { ...file, status: "cancelled" };
  });
}

export function applyStreamEvent(
  files: SpecFile[],
  event: import("./types").StreamEvent,
  onlyPaths?: Set<string>,
): SpecFile[] {
  switch (event.type) {
    case "file_start":
      return files.map((file) =>
        file.path === event.path
          ? { ...file, content: "", status: "generating" }
          : file,
      );
    case "file_delta":
      return files.map((file) =>
        file.path === event.path
          ? { ...file, content: file.content + event.delta }
          : file,
      );
    case "file_done":
      return files.map((file) =>
        file.path === event.path ? { ...file, status: "done" } : file,
      );
    case "error":
      if (!event.path) return files;
      return files.map((file) =>
        file.path === event.path ? { ...file, status: "error" } : file,
      );
    case "cancelled":
      return markRunCancelled(files, onlyPaths);
    default:
      return files;
  }
}

export function prepareFilesForGeneration(
  files: SpecFile[],
  targetPaths: string[],
  resetAll: boolean,
): SpecFile[] {
  const targets = new Set(targetPaths);

  if (!resetAll) {
    return files.map((file) =>
      targets.has(file.path)
        ? { ...file, content: "", status: "pending" as const }
        : file,
    );
  }

  return files.map((file) =>
    targets.has(file.path)
      ? { ...file, content: "", status: "pending" as const }
      : file,
  );
}
