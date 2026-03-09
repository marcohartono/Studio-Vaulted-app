import { promises as fs } from "fs";
import type { Dirent } from "fs";
import path from "path";

const DAW_EXTS = new Set([".als", ".flp", ".ptx", ".xpj"]); // add more later
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".DS_Store",
  "Library",
  "System Volume Information",
  "$RECYCLE.BIN",
]);

export type ProjectHit = {
  name: string;
  filePath: string;
  ext: string;
  lastModifiedMs: number;
};

export async function scanForProjects(
  roots: string[],
  maxDepth = 8
): Promise<ProjectHit[]> {
  const hits: ProjectHit[] = [];

  for (const root of roots) {
    await walk(root, 0);
  }

  return hits;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // no permission, broken symlink, etc.
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;

        // Logic projects are folders ending in .logicx
        if (entry.name.endsWith(".logicx")) {
          const stat = await safeStat(full);
          if (stat) {
            hits.push({
              name: entry.name.replace(/\.logicx$/i, ""),
              filePath: full,
              ext: ".logicx",
              lastModifiedMs: stat.mtimeMs,
            });
          }
          continue;
        }

        await walk(full, depth + 1);
        continue;
      }

      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!DAW_EXTS.has(ext)) continue;

        const stat = await safeStat(full);
        if (!stat) continue;

        hits.push({
          name: path.basename(entry.name, ext),
          filePath: full,
          ext,
          lastModifiedMs: stat.mtimeMs,
        });
      }
    }
  }

  async function safeStat(p: string) {
    try {
      return await fs.stat(p);
    } catch {
      return null;
    }
  }
}
