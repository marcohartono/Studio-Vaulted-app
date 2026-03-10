var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { app, BrowserWindow, safeStorage, protocol, ipcMain, dialog, shell } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promises, existsSync } from "node:fs";
import os from "node:os";
import crypto, { randomUUID } from "node:crypto";
import sqlite3 from "sqlite3";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
const PROJECT_FILE_EXTS = /* @__PURE__ */ new Set([".als", ".flp", ".ptx"]);
const JUNK_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "library",
  "system volume information",
  "$recycle.bin"
]);
async function scanForProjects(roots, options = {}) {
  const maxDepth = options.maxDepth ?? 6;
  const maxConcurrency = options.maxConcurrency ?? 8;
  const results = [];
  const queue2 = roots.map((root) => ({
    dirPath: root,
    depth: 0
  }));
  if (queue2.length === 0) {
    return results;
  }
  let active2 = 0;
  return await new Promise((resolve) => {
    const pump2 = () => {
      while (active2 < maxConcurrency && queue2.length > 0) {
        const next = queue2.shift();
        if (!next) break;
        active2 += 1;
        processDirectory(next.dirPath, next.depth).catch(() => void 0).finally(() => {
          active2 -= 1;
          if (queue2.length === 0 && active2 === 0) {
            resolve(results);
            return;
          }
          pump2();
        });
      }
    };
    const processDirectory = async (dirPath, depth) => {
      let entries;
      try {
        entries = await promises.readdir(dirPath, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        const lowerName = entry.name.toLowerCase();
        if (entry.isDirectory()) {
          if (JUNK_DIRS.has(lowerName)) {
            continue;
          }
          if (lowerName.endsWith(".logicx")) {
            const hit2 = await buildHit(entryPath, entry.name, ".logicx");
            if (hit2) {
              results.push(hit2);
            }
            continue;
          }
          if (depth >= maxDepth) {
            continue;
          }
          queue2.push({ dirPath: entryPath, depth: depth + 1 });
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (!PROJECT_FILE_EXTS.has(ext)) {
          continue;
        }
        if (ext === ".flp" && (lowerName.includes("(overwritten") || lowerName.includes("(autosaved"))) {
          continue;
        }
        const hit = await buildHit(entryPath, entry.name, ext);
        if (hit) {
          results.push(hit);
        }
      }
    };
    pump2();
  });
}
async function buildHit(entryPath, entryName, ext) {
  try {
    const stats = await promises.stat(entryPath);
    return {
      name: ext === ".logicx" ? entryName.slice(0, -ext.length) : path.basename(entryName, ext),
      filePath: entryPath,
      ext: ext.replace(".", ""),
      lastModifiedMs: stats.mtimeMs,
      fileSize: stats.size
    };
  } catch {
    return null;
  }
}
const VERSION_REGEX = /^(.*?)[\s_-]*\[(\d{4})\s(\d{2})\s(\d{2})\s(\d{6})\]\.als$/i;
function parseAbletonVersionFile(filePath) {
  const fileName = path.basename(filePath);
  const match = fileName.match(VERSION_REGEX);
  if (!match) return null;
  const baseName = match[1].trim();
  const year = Number(match[2]);
  const month = Number(match[3]);
  const day = Number(match[4]);
  const time = match[5];
  if (!baseName || time.length !== 6) return null;
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(2, 4));
  const second = Number(time.slice(4, 6));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) {
    return null;
  }
  const versionTimestampMs = new Date(year, month - 1, day, hour, minute, second).getTime();
  if (!Number.isFinite(versionTimestampMs)) return null;
  return { baseName, versionTimestampMs };
}
function parseFlpVersionFile(filePath) {
  const fileName = path.basename(filePath);
  const match = fileName.match(/^(.*)\s\(([^)]+)\)\.flp$/i);
  if (!match) return null;
  const suffix = match[2].toLowerCase();
  if (suffix.includes("overwritten") || suffix.includes("autosaved")) {
    return null;
  }
  const baseName = match[1].trim();
  if (!baseName) return null;
  return { baseName };
}
function normalizeTrackName(name) {
  let cleaned = name.toLowerCase().trim();
  cleaned = cleaned.replace(/[_\-.]+/g, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  const suffixPatterns = [
    /\b(v|ver|version|rev|r)\s?\d+\b$/i,
    /\bfinal\s?\d*\b$/i,
    /\bcopy\s?\d*\b$/i,
    /\bduplicate\s?\d*\b$/i,
    /\(\s*copy\s*\d*\s*\)$/i,
    /\[\s*\d{4}[-_/ ]\d{1,2}[-_/ ]\d{1,2}\s*\]$/i,
    /\[\s*\d{1,2}[-_/ ]\d{1,2}[-_/ ]\d{2,4}\s*\]$/i,
    /\[\s*\d{4}\s\d{2}\s\d{2}\s\d{6}\s*\]$/i,
    /\b\d{4}[-_]\d{1,2}[-_]\d{1,2}\b$/i,
    /\b\d{1,2}[-_]\d{1,2}[-_]\d{2,4}\b$/i
  ];
  let stripped = cleaned;
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of suffixPatterns) {
      const next = stripped.replace(pattern, "").trim();
      if (next !== stripped) {
        stripped = next;
        changed = true;
      }
    }
    stripped = stripped.replace(/\s+/g, " ").trim();
  }
  return stripped;
}
function computeGroupKey(filePath) {
  const parentDir = path.dirname(filePath);
  const parsedAls = parseAbletonVersionFile(filePath);
  const parsedFlp = parseFlpVersionFile(filePath);
  const baseName = parsedAls ? parsedAls.baseName : parsedFlp ? parsedFlp.baseName : path.basename(filePath, path.extname(filePath));
  const normalized = normalizeTrackName(baseName);
  return `${parentDir}::${normalized}`;
}
function computeDisplayTitle(filePath) {
  const parsedAls = parseAbletonVersionFile(filePath);
  const parsedFlp = parseFlpVersionFile(filePath);
  const baseName = parsedAls ? parsedAls.baseName : parsedFlp ? parsedFlp.baseName : path.basename(filePath, path.extname(filePath));
  const cleaned = baseName.replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
  const suffixPatterns = [
    /\b(v|ver|version|rev|r)\s?\d+\b$/i,
    /\bfinal\s?\d*\b$/i,
    /\bcopy\s?\d*\b$/i,
    /\bduplicate\s?\d*\b$/i,
    /\(\s*copy\s*\d*\s*\)$/i,
    /\[\s*\d{4}[-_/ ]\d{1,2}[-_/ ]\d{1,2}\s*\]$/i,
    /\[\s*\d{1,2}[-_/ ]\d{1,2}[-_/ ]\d{2,4}\s*\]$/i,
    /\[\s*\d{4}\s\d{2}\s\d{2}\s\d{6}\s*\]$/i,
    /\b\d{4}[-_]\d{1,2}[-_]\d{1,2}\b$/i,
    /\b\d{1,2}[-_]\d{1,2}[-_]\d{2,4}\b$/i
  ];
  let stripped = cleaned;
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of suffixPatterns) {
      const next = stripped.replace(pattern, "").trim();
      if (next !== stripped) {
        stripped = next;
        changed = true;
      }
    }
    stripped = stripped.replace(/\s+/g, " ").trim();
  }
  return stripped || cleaned || baseName;
}
const IGNORED_DIRS$1 = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  ".idea",
  ".next",
  "dist",
  "build"
]);
function cleanAbletonDisplayName(baseName) {
  return baseName.replace(/\s*\[\d{4}\s\d{2}\s\d{2}\s\d{6}\]\s*$/i, "").trim();
}
function shouldIgnoreDir(name) {
  if (!name) return true;
  if (name.startsWith(".")) return true;
  return IGNORED_DIRS$1.has(name.toLowerCase());
}
async function scanAbletonProjects(root, options) {
  const maxDepth = options.maxDepth;
  const results = [];
  const startRoot = path.resolve(root);
  const walk = async (dirPath, depth) => {
    let entries;
    try {
      entries = await promises.readdir(dirPath, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryName = entry.name;
      const entryPath = path.join(dirPath, entryName);
      if (entry.isDirectory()) {
        if (!options.recursive || depth >= maxDepth || shouldIgnoreDir(entryName)) {
          continue;
        }
        await walk(entryPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entryName.startsWith(".")) continue;
      if (!entryName.toLowerCase().endsWith(".als")) continue;
      try {
        const stats = await promises.stat(entryPath);
        const displayName = cleanAbletonDisplayName(
          path.basename(entryName, path.extname(entryName))
        );
        results.push({
          filePath: entryPath,
          displayName: displayName || path.basename(entryName, ".als"),
          modifiedTime: stats.mtimeMs,
          folderPath: path.dirname(entryPath),
          fileSize: stats.size
        });
      } catch {
      }
    }
  };
  await walk(startRoot, 0);
  return results;
}
const DEFAULT_SETTINGS = {
  projectRootDir: null,
  scanSubfolders: true,
  lastScanAt: null,
  recentProjectRoots: [],
  templateRootDirs: [],
  scanTemplateSubfolders: true,
  recentTemplatePaths: [],
  newProjectDefaults: {
    createStandardFolders: true,
    openAfterCreate: false,
    lastUsedTemplatePath: null
  }
};
let writeQueue = Promise.resolve();
function getSettingsFilePath() {
  return path.join(app.getPath("userData"), "studio-vaulted-settings.json");
}
function toRecentRoots(value) {
  if (!Array.isArray(value)) return [];
  const deduped = /* @__PURE__ */ new Set();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const next = item.trim();
    if (!next) continue;
    deduped.add(path.resolve(next));
    if (deduped.size >= 5) break;
  }
  return Array.from(deduped);
}
function toRecentTemplatePaths(value) {
  if (!Array.isArray(value)) return [];
  const deduped = /* @__PURE__ */ new Set();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const next = item.trim();
    if (!next) continue;
    deduped.add(path.resolve(next));
    if (deduped.size >= 10) break;
  }
  return Array.from(deduped);
}
function toTemplateRoots(value) {
  if (!Array.isArray(value)) return [];
  const deduped = /* @__PURE__ */ new Set();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const next = item.trim();
    if (!next) continue;
    deduped.add(path.resolve(next));
  }
  return Array.from(deduped);
}
function normalizeSettings(input) {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_SETTINGS };
  }
  const source = input;
  const projectRootRaw = source.projectRootDir;
  const projectRootDir = typeof projectRootRaw === "string" && projectRootRaw.trim().length > 0 ? path.resolve(projectRootRaw) : null;
  const scanSubfolders = typeof source.scanSubfolders === "boolean" ? source.scanSubfolders : DEFAULT_SETTINGS.scanSubfolders;
  const lastScanAt = typeof source.lastScanAt === "string" && source.lastScanAt.trim().length > 0 ? source.lastScanAt : null;
  const recentProjectRoots = toRecentRoots(source.recentProjectRoots);
  const templateRootDirs = toTemplateRoots(source.templateRootDirs);
  const scanTemplateSubfolders = typeof source.scanTemplateSubfolders === "boolean" ? source.scanTemplateSubfolders : DEFAULT_SETTINGS.scanTemplateSubfolders;
  const recentTemplatePaths = toRecentTemplatePaths(source.recentTemplatePaths);
  const rawDefaults = source.newProjectDefaults && typeof source.newProjectDefaults === "object" ? source.newProjectDefaults : {};
  const createStandardFolders = typeof rawDefaults.createStandardFolders === "boolean" ? rawDefaults.createStandardFolders : DEFAULT_SETTINGS.newProjectDefaults.createStandardFolders;
  const openAfterCreate = typeof rawDefaults.openAfterCreate === "boolean" ? rawDefaults.openAfterCreate : DEFAULT_SETTINGS.newProjectDefaults.openAfterCreate;
  const lastUsedTemplatePathRaw = rawDefaults.lastUsedTemplatePath;
  const lastUsedTemplatePath = typeof lastUsedTemplatePathRaw === "string" && lastUsedTemplatePathRaw.trim().length > 0 ? path.resolve(lastUsedTemplatePathRaw) : null;
  if (projectRootDir && !recentProjectRoots.includes(projectRootDir)) {
    recentProjectRoots.unshift(projectRootDir);
  }
  const normalizedRecentTemplates = recentTemplatePaths.filter((item) => item !== lastUsedTemplatePath);
  if (lastUsedTemplatePath) {
    normalizedRecentTemplates.unshift(lastUsedTemplatePath);
  }
  return {
    projectRootDir,
    scanSubfolders,
    lastScanAt,
    recentProjectRoots: recentProjectRoots.slice(0, 5),
    templateRootDirs,
    scanTemplateSubfolders,
    recentTemplatePaths: normalizedRecentTemplates.slice(0, 10),
    newProjectDefaults: {
      createStandardFolders,
      openAfterCreate,
      lastUsedTemplatePath
    }
  };
}
async function writeAtomic(filePath, content) {
  const dir = path.dirname(filePath);
  await promises.mkdir(dir, { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await promises.writeFile(tempPath, content, "utf8");
  await promises.rename(tempPath, filePath);
}
async function backupCorruptSettings(filePath) {
  try {
    const backupName = `${path.basename(filePath, ".json")}.corrupt-${Date.now()}.json`;
    const backupPath = path.join(path.dirname(filePath), backupName);
    await promises.rename(filePath, backupPath);
  } catch {
  }
}
async function getSettings() {
  const filePath = getSettingsFilePath();
  try {
    const raw = await promises.readFile(filePath, "utf8");
    return normalizeSettings(JSON.parse(raw));
  } catch (error) {
    const nodeError = error;
    if ((nodeError == null ? void 0 : nodeError.code) === "ENOENT") {
      const defaults2 = { ...DEFAULT_SETTINGS };
      await writeAtomic(filePath, JSON.stringify(defaults2, null, 2));
      return defaults2;
    }
    await backupCorruptSettings(filePath);
    const defaults = { ...DEFAULT_SETTINGS };
    await writeAtomic(filePath, JSON.stringify(defaults, null, 2));
    return defaults;
  }
}
async function updateSettings(patch) {
  const current = await getSettings();
  const next = normalizeSettings({ ...current, ...patch });
  if (next.projectRootDir) {
    next.recentProjectRoots = [
      next.projectRootDir,
      ...next.recentProjectRoots.filter((item) => item !== next.projectRootDir)
    ].slice(0, 5);
  }
  if (next.newProjectDefaults.lastUsedTemplatePath) {
    next.recentTemplatePaths = [
      next.newProjectDefaults.lastUsedTemplatePath,
      ...next.recentTemplatePaths.filter(
        (item) => item !== next.newProjectDefaults.lastUsedTemplatePath
      )
    ].slice(0, 10);
  }
  const filePath = getSettingsFilePath();
  writeQueue = writeQueue.then(
    () => writeAtomic(filePath, JSON.stringify(next, null, 2))
  );
  await writeQueue;
  return next;
}
const IGNORED_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  ".idea",
  ".next",
  "dist",
  "build",
  "__pycache__",
  "$recycle.bin",
  "system volume information"
]);
function cleanTemplateDisplayName(fileName) {
  const withoutExt = path.basename(fileName, path.extname(fileName));
  return withoutExt.replace(/\s*\[\d{4}\s\d{2}\s\d{2}\s\d{6}\]\s*$/i, "").trim();
}
function shouldIgnoreDirectory(name) {
  if (!name) return true;
  if (name.startsWith(".")) return true;
  return IGNORED_DIRS.has(name.toLowerCase());
}
function uniqResolvedPaths(paths) {
  const seen = /* @__PURE__ */ new Set();
  const resolved = [];
  for (const entry of paths) {
    const next = entry.trim();
    if (!next) continue;
    const normalized = path.resolve(next);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    resolved.push(normalized);
  }
  return resolved;
}
function defaultAbletonTemplateDirs() {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return [
      path.join(home, "Music", "Ableton", "User Library", "Templates"),
      path.join(home, "Music", "Ableton", "User Library", "Templates", "Set")
    ];
  }
  if (process.platform === "win32") {
    return [
      path.join(home, "Documents", "Ableton", "User Library", "Templates"),
      path.join(home, "Documents", "Ableton", "User Library", "Templates", "Set")
    ];
  }
  return [path.join(home, "Music", "Ableton", "User Library", "Templates")];
}
async function pathExistsAndDir(absPath) {
  try {
    const stat = await promises.stat(absPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
async function scanTemplateRoot(root, recursive) {
  const found = [];
  const walk = async (dirPath) => {
    let entries;
    try {
      entries = await promises.readdir(dirPath, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (!recursive || shouldIgnoreDirectory(entry.name)) continue;
        await walk(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.startsWith(".")) continue;
      if (!entry.name.toLowerCase().endsWith(".als")) continue;
      try {
        const stats = await promises.stat(entryPath);
        const displayName = cleanTemplateDisplayName(entry.name);
        found.push({
          id: entryPath,
          displayName: displayName || path.basename(entry.name, ".als"),
          sourcePath: entryPath,
          folderLabel: path.basename(path.dirname(entryPath)) || null,
          modifiedAt: new Date(stats.mtimeMs).toISOString()
        });
      } catch {
      }
    }
  };
  await walk(root);
  return found;
}
function sortTemplates(records, recent) {
  const recentLookup = /* @__PURE__ */ new Map();
  recent.forEach((item, index) => {
    recentLookup.set(path.resolve(item), index);
  });
  return [...records].sort((a, b) => {
    const aRecent = recentLookup.get(path.resolve(a.sourcePath));
    const bRecent = recentLookup.get(path.resolve(b.sourcePath));
    const aIsRecent = typeof aRecent === "number";
    const bIsRecent = typeof bRecent === "number";
    if (aIsRecent && bIsRecent) return aRecent - bRecent;
    if (aIsRecent) return -1;
    if (bIsRecent) return 1;
    return a.displayName.localeCompare(b.displayName, void 0, { sensitivity: "base" });
  });
}
async function discoverTemplates(settings) {
  const candidateRoots = uniqResolvedPaths([
    ...settings.templateRootDirs,
    ...defaultAbletonTemplateDirs()
  ]);
  const existingRoots = [];
  for (const root of candidateRoots) {
    if (await pathExistsAndDir(root)) {
      existingRoots.push(root);
    }
  }
  if (existingRoots.length === 0) return [];
  const byPath = /* @__PURE__ */ new Map();
  for (const root of existingRoots) {
    const templates = await scanTemplateRoot(root, settings.scanTemplateSubfolders);
    for (const template of templates) {
      const key = path.resolve(template.sourcePath);
      if (byPath.has(key)) continue;
      byPath.set(key, template);
    }
  }
  return sortTemplates(Array.from(byPath.values()), settings.recentTemplatePaths);
}
let db = null;
let initPromise = null;
function getDbPath() {
  return path.join(app.getPath("userData"), "studio-vaulted.db");
}
function openDatabase() {
  if (!db) {
    db = new sqlite3.Database(getDbPath());
    db.exec("PRAGMA foreign_keys = ON;");
  }
  return db;
}
async function initDatabase() {
  if (initPromise) return initPromise;
  initPromise = new Promise((resolve, reject) => {
    const instance = openDatabase();
    instance.exec(
      `
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        group_key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        latest_version_id TEXT,
        root_path TEXT,
        ableton_project_path TEXT,
        daw_format TEXT NOT NULL DEFAULT 'als',
        creation_mode TEXT NOT NULL DEFAULT 'blank',
        source_template_path TEXT,
        source_template_name TEXT,
        project_type_label TEXT,
        audio_path TEXT,
        background_image_path TEXT,
        folder_id TEXT,
        status TEXT NOT NULL DEFAULT 'Idea',
        genre TEXT,
        notes TEXT NOT NULL DEFAULT '',
        trashed INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS track_versions (
        id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        file_path TEXT NOT NULL UNIQUE,
        saved_at INTEGER NOT NULL,
        file_size INTEGER NOT NULL,
        bpm INTEGER,
        bpm_source TEXT NOT NULL DEFAULT 'auto',
        content_hash TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_track_versions_track_saved
        ON track_versions (track_id, saved_at DESC);

      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS track_notes (
        id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL UNIQUE,
        content_json TEXT NOT NULL,
        plain_text_preview TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_track_notes_track_id
        ON track_notes (track_id);

      CREATE TABLE IF NOT EXISTS note_media (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('image', 'audio')),
        file_path TEXT NOT NULL,
        original_name TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(note_id) REFERENCES track_notes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_note_media_note_id
        ON note_media (note_id);
      `,
      async (err) => {
        if (err) {
          reject(err);
          return;
        }
        try {
          await maybeMigrateLegacyTracks(instance);
          await maybeAddColumn(instance, "tracks", "root_path", "TEXT");
          await maybeAddColumn(instance, "tracks", "audio_path", "TEXT");
          await maybeAddColumn(instance, "tracks", "ableton_project_path", "TEXT");
          await maybeAddColumn(instance, "tracks", "daw_format", "TEXT NOT NULL DEFAULT 'als'");
          await maybeAddColumn(instance, "tracks", "creation_mode", "TEXT NOT NULL DEFAULT 'blank'");
          await maybeAddColumn(instance, "tracks", "source_template_path", "TEXT");
          await maybeAddColumn(instance, "tracks", "source_template_name", "TEXT");
          await maybeAddColumn(instance, "tracks", "project_type_label", "TEXT");
          await maybeAddColumn(instance, "tracks", "genre", "TEXT");
          await maybeAddColumn(instance, "tracks", "background_image_path", "TEXT");
          await new Promise((resolveIndex, rejectIndex) => {
            instance.exec(
              `
              CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_ableton_project_path_unique
                ON tracks (ableton_project_path)
                WHERE ableton_project_path IS NOT NULL;
              `,
              (indexErr) => {
                if (indexErr) {
                  rejectIndex(indexErr);
                  return;
                }
                resolveIndex();
              }
            );
          });
          resolve(void 0);
        } catch (error) {
          reject(error);
        }
      }
    );
  }).catch((error) => {
    initPromise = null;
    throw error;
  });
  return initPromise;
}
function getDb() {
  return openDatabase();
}
function getTableColumns(dbInstance, table) {
  return new Promise((resolve, reject) => {
    dbInstance.all(`PRAGMA table_info(${table})`, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      const cols = /* @__PURE__ */ new Set();
      for (const row of rows) {
        cols.add(row.name);
      }
      resolve(cols);
    });
  });
}
async function maybeAddColumn(dbInstance, table, column, columnType) {
  const columns = await getTableColumns(dbInstance, table);
  if (columns.has(column)) return;
  await new Promise((resolve, reject) => {
    dbInstance.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${columnType}`, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}
async function maybeMigrateLegacyTracks(dbInstance) {
  const columns = await getTableColumns(dbInstance, "tracks");
  if (columns.has("group_key")) {
    return;
  }
  const rows = await new Promise((resolve, reject) => {
    dbInstance.all("SELECT * FROM tracks", (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(data ?? []);
    });
  });
  await new Promise((resolve, reject) => {
    dbInstance.serialize(() => {
      dbInstance.exec(
        `
        DROP TABLE IF EXISTS tracks_new;

        CREATE TABLE IF NOT EXISTS track_versions (
          id TEXT PRIMARY KEY,
          track_id TEXT NOT NULL,
          file_path TEXT NOT NULL UNIQUE,
          saved_at INTEGER NOT NULL,
          file_size INTEGER NOT NULL,
          bpm INTEGER,
          bpm_source TEXT NOT NULL DEFAULT 'auto',
          content_hash TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_track_versions_track_saved
          ON track_versions (track_id, saved_at DESC);

        CREATE TABLE tracks_new (
          id TEXT PRIMARY KEY,
          group_key TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          latest_version_id TEXT,
          audio_path TEXT,
          folder_id TEXT,
          status TEXT NOT NULL DEFAULT 'Idea',
          notes TEXT NOT NULL DEFAULT '',
          trashed INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        `,
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          const grouped = /* @__PURE__ */ new Map();
          const insertTrack = dbInstance.prepare(
            `
            INSERT INTO tracks_new (
              id, group_key, title, latest_version_id, audio_path, folder_id,
              status, notes, trashed, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          );
          const insertVersion = dbInstance.prepare(
            `
            INSERT OR IGNORE INTO track_versions (
              id, track_id, file_path, saved_at, file_size,
              bpm, bpm_source, content_hash, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          );
          for (const row of rows) {
            const filePath = row.file_path ?? row.filePath;
            if (!filePath) continue;
            const savedAt = Number(row.last_modified_ms ?? row.lastModifiedMs ?? Date.now());
            const fileSize = Number(row.file_size ?? row.fileSize ?? 0);
            const bpm = row.bpm === null || row.bpm === void 0 ? null : Number(row.bpm);
            const folderId = row.folder_id ?? row.folderId ?? null;
            const status = row.status ?? "Idea";
            const notes = row.notes ?? "";
            const trashed = Number(row.trashed ?? 0);
            const groupKey = computeGroupKey(filePath);
            const title = computeDisplayTitle(filePath);
            let group = grouped.get(groupKey);
            if (!group) {
              group = {
                trackId: randomUUID(),
                title,
                folderId,
                status,
                notes,
                trashed,
                latestSavedAt: savedAt,
                latestVersionId: null,
                metaSavedAt: savedAt,
                createdAt: savedAt,
                updatedAt: Date.now()
              };
              grouped.set(groupKey, group);
            } else {
              if (!group.folderId && folderId) {
                group.folderId = folderId;
                group.metaSavedAt = savedAt;
              }
              if (!group.notes && notes) {
                group.notes = notes;
                group.metaSavedAt = savedAt;
              }
              if (!group.status && status) {
                group.status = status;
                group.metaSavedAt = savedAt;
              }
              if (trashed) {
                group.trashed = 1;
              }
            }
            const versionId = randomUUID();
            insertVersion.run([
              versionId,
              group.trackId,
              filePath,
              savedAt,
              fileSize,
              bpm,
              "auto",
              null,
              Date.now()
            ]);
            if (savedAt >= group.latestSavedAt) {
              group.latestSavedAt = savedAt;
              group.latestVersionId = versionId;
              group.title = title || group.title;
            }
          }
          for (const [groupKey, group] of grouped.entries()) {
            insertTrack.run([
              group.trackId,
              groupKey,
              group.title,
              group.latestVersionId,
              null,
              group.folderId,
              group.status || "Idea",
              group.notes || "",
              group.trashed,
              group.createdAt,
              group.updatedAt
            ]);
          }
          insertVersion.finalize();
          insertTrack.finalize();
          dbInstance.exec(
            `
            DROP TABLE tracks;
            ALTER TABLE tracks_new RENAME TO tracks;
            `,
            (dropErr) => {
              if (dropErr) {
                reject(dropErr);
                return;
              }
              resolve();
            }
          );
        }
      );
    });
  });
}
var validator$2 = {};
var util$3 = {};
(function(exports$1) {
  const nameStartChar = ":A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
  const nameChar = nameStartChar + "\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040";
  const nameRegexp = "[" + nameStartChar + "][" + nameChar + "]*";
  const regexName = new RegExp("^" + nameRegexp + "$");
  const getAllMatches = function(string, regex) {
    const matches = [];
    let match = regex.exec(string);
    while (match) {
      const allmatches = [];
      allmatches.startIndex = regex.lastIndex - match[0].length;
      const len = match.length;
      for (let index = 0; index < len; index++) {
        allmatches.push(match[index]);
      }
      matches.push(allmatches);
      match = regex.exec(string);
    }
    return matches;
  };
  const isName = function(string) {
    const match = regexName.exec(string);
    return !(match === null || typeof match === "undefined");
  };
  exports$1.isExist = function(v) {
    return typeof v !== "undefined";
  };
  exports$1.isEmptyObject = function(obj) {
    return Object.keys(obj).length === 0;
  };
  exports$1.merge = function(target, a, arrayMode) {
    if (a) {
      const keys = Object.keys(a);
      const len = keys.length;
      for (let i = 0; i < len; i++) {
        if (arrayMode === "strict") {
          target[keys[i]] = [a[keys[i]]];
        } else {
          target[keys[i]] = a[keys[i]];
        }
      }
    }
  };
  exports$1.getValue = function(v) {
    if (exports$1.isExist(v)) {
      return v;
    } else {
      return "";
    }
  };
  exports$1.isName = isName;
  exports$1.getAllMatches = getAllMatches;
  exports$1.nameRegexp = nameRegexp;
})(util$3);
const util$2 = util$3;
const defaultOptions$2 = {
  allowBooleanAttributes: false,
  //A tag can have attributes without any value
  unpairedTags: []
};
validator$2.validate = function(xmlData, options) {
  options = Object.assign({}, defaultOptions$2, options);
  const tags = [];
  let tagFound = false;
  let reachedRoot = false;
  if (xmlData[0] === "\uFEFF") {
    xmlData = xmlData.substr(1);
  }
  for (let i = 0; i < xmlData.length; i++) {
    if (xmlData[i] === "<" && xmlData[i + 1] === "?") {
      i += 2;
      i = readPI(xmlData, i);
      if (i.err) return i;
    } else if (xmlData[i] === "<") {
      let tagStartPos = i;
      i++;
      if (xmlData[i] === "!") {
        i = readCommentAndCDATA(xmlData, i);
        continue;
      } else {
        let closingTag = false;
        if (xmlData[i] === "/") {
          closingTag = true;
          i++;
        }
        let tagName = "";
        for (; i < xmlData.length && xmlData[i] !== ">" && xmlData[i] !== " " && xmlData[i] !== "	" && xmlData[i] !== "\n" && xmlData[i] !== "\r"; i++) {
          tagName += xmlData[i];
        }
        tagName = tagName.trim();
        if (tagName[tagName.length - 1] === "/") {
          tagName = tagName.substring(0, tagName.length - 1);
          i--;
        }
        if (!validateTagName(tagName)) {
          let msg;
          if (tagName.trim().length === 0) {
            msg = "Invalid space after '<'.";
          } else {
            msg = "Tag '" + tagName + "' is an invalid name.";
          }
          return getErrorObject("InvalidTag", msg, getLineNumberForPosition(xmlData, i));
        }
        const result = readAttributeStr(xmlData, i);
        if (result === false) {
          return getErrorObject("InvalidAttr", "Attributes for '" + tagName + "' have open quote.", getLineNumberForPosition(xmlData, i));
        }
        let attrStr = result.value;
        i = result.index;
        if (attrStr[attrStr.length - 1] === "/") {
          const attrStrStart = i - attrStr.length;
          attrStr = attrStr.substring(0, attrStr.length - 1);
          const isValid = validateAttributeString(attrStr, options);
          if (isValid === true) {
            tagFound = true;
          } else {
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, attrStrStart + isValid.err.line));
          }
        } else if (closingTag) {
          if (!result.tagClosed) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' doesn't have proper closing.", getLineNumberForPosition(xmlData, i));
          } else if (attrStr.trim().length > 0) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, tagStartPos));
          } else if (tags.length === 0) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' has not been opened.", getLineNumberForPosition(xmlData, tagStartPos));
          } else {
            const otg = tags.pop();
            if (tagName !== otg.tagName) {
              let openPos = getLineNumberForPosition(xmlData, otg.tagStartPos);
              return getErrorObject(
                "InvalidTag",
                "Expected closing tag '" + otg.tagName + "' (opened in line " + openPos.line + ", col " + openPos.col + ") instead of closing tag '" + tagName + "'.",
                getLineNumberForPosition(xmlData, tagStartPos)
              );
            }
            if (tags.length == 0) {
              reachedRoot = true;
            }
          }
        } else {
          const isValid = validateAttributeString(attrStr, options);
          if (isValid !== true) {
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i - attrStr.length + isValid.err.line));
          }
          if (reachedRoot === true) {
            return getErrorObject("InvalidXml", "Multiple possible root nodes found.", getLineNumberForPosition(xmlData, i));
          } else if (options.unpairedTags.indexOf(tagName) !== -1) ;
          else {
            tags.push({ tagName, tagStartPos });
          }
          tagFound = true;
        }
        for (i++; i < xmlData.length; i++) {
          if (xmlData[i] === "<") {
            if (xmlData[i + 1] === "!") {
              i++;
              i = readCommentAndCDATA(xmlData, i);
              continue;
            } else if (xmlData[i + 1] === "?") {
              i = readPI(xmlData, ++i);
              if (i.err) return i;
            } else {
              break;
            }
          } else if (xmlData[i] === "&") {
            const afterAmp = validateAmpersand(xmlData, i);
            if (afterAmp == -1)
              return getErrorObject("InvalidChar", "char '&' is not expected.", getLineNumberForPosition(xmlData, i));
            i = afterAmp;
          } else {
            if (reachedRoot === true && !isWhiteSpace(xmlData[i])) {
              return getErrorObject("InvalidXml", "Extra text at the end", getLineNumberForPosition(xmlData, i));
            }
          }
        }
        if (xmlData[i] === "<") {
          i--;
        }
      }
    } else {
      if (isWhiteSpace(xmlData[i])) {
        continue;
      }
      return getErrorObject("InvalidChar", "char '" + xmlData[i] + "' is not expected.", getLineNumberForPosition(xmlData, i));
    }
  }
  if (!tagFound) {
    return getErrorObject("InvalidXml", "Start tag expected.", 1);
  } else if (tags.length == 1) {
    return getErrorObject("InvalidTag", "Unclosed tag '" + tags[0].tagName + "'.", getLineNumberForPosition(xmlData, tags[0].tagStartPos));
  } else if (tags.length > 0) {
    return getErrorObject("InvalidXml", "Invalid '" + JSON.stringify(tags.map((t) => t.tagName), null, 4).replace(/\r?\n/g, "") + "' found.", { line: 1, col: 1 });
  }
  return true;
};
function isWhiteSpace(char) {
  return char === " " || char === "	" || char === "\n" || char === "\r";
}
function readPI(xmlData, i) {
  const start = i;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] == "?" || xmlData[i] == " ") {
      const tagname = xmlData.substr(start, i - start);
      if (i > 5 && tagname === "xml") {
        return getErrorObject("InvalidXml", "XML declaration allowed only at the start of the document.", getLineNumberForPosition(xmlData, i));
      } else if (xmlData[i] == "?" && xmlData[i + 1] == ">") {
        i++;
        break;
      } else {
        continue;
      }
    }
  }
  return i;
}
function readCommentAndCDATA(xmlData, i) {
  if (xmlData.length > i + 5 && xmlData[i + 1] === "-" && xmlData[i + 2] === "-") {
    for (i += 3; i < xmlData.length; i++) {
      if (xmlData[i] === "-" && xmlData[i + 1] === "-" && xmlData[i + 2] === ">") {
        i += 2;
        break;
      }
    }
  } else if (xmlData.length > i + 8 && xmlData[i + 1] === "D" && xmlData[i + 2] === "O" && xmlData[i + 3] === "C" && xmlData[i + 4] === "T" && xmlData[i + 5] === "Y" && xmlData[i + 6] === "P" && xmlData[i + 7] === "E") {
    let angleBracketsCount = 1;
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === "<") {
        angleBracketsCount++;
      } else if (xmlData[i] === ">") {
        angleBracketsCount--;
        if (angleBracketsCount === 0) {
          break;
        }
      }
    }
  } else if (xmlData.length > i + 9 && xmlData[i + 1] === "[" && xmlData[i + 2] === "C" && xmlData[i + 3] === "D" && xmlData[i + 4] === "A" && xmlData[i + 5] === "T" && xmlData[i + 6] === "A" && xmlData[i + 7] === "[") {
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === "]" && xmlData[i + 1] === "]" && xmlData[i + 2] === ">") {
        i += 2;
        break;
      }
    }
  }
  return i;
}
const doubleQuote = '"';
const singleQuote = "'";
function readAttributeStr(xmlData, i) {
  let attrStr = "";
  let startChar = "";
  let tagClosed = false;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === doubleQuote || xmlData[i] === singleQuote) {
      if (startChar === "") {
        startChar = xmlData[i];
      } else if (startChar !== xmlData[i]) ;
      else {
        startChar = "";
      }
    } else if (xmlData[i] === ">") {
      if (startChar === "") {
        tagClosed = true;
        break;
      }
    }
    attrStr += xmlData[i];
  }
  if (startChar !== "") {
    return false;
  }
  return {
    value: attrStr,
    index: i,
    tagClosed
  };
}
const validAttrStrRegxp = new RegExp(`(\\s*)([^\\s=]+)(\\s*=)?(\\s*(['"])(([\\s\\S])*?)\\5)?`, "g");
function validateAttributeString(attrStr, options) {
  const matches = util$2.getAllMatches(attrStr, validAttrStrRegxp);
  const attrNames = {};
  for (let i = 0; i < matches.length; i++) {
    if (matches[i][1].length === 0) {
      return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' has no space in starting.", getPositionFromMatch(matches[i]));
    } else if (matches[i][3] !== void 0 && matches[i][4] === void 0) {
      return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' is without value.", getPositionFromMatch(matches[i]));
    } else if (matches[i][3] === void 0 && !options.allowBooleanAttributes) {
      return getErrorObject("InvalidAttr", "boolean attribute '" + matches[i][2] + "' is not allowed.", getPositionFromMatch(matches[i]));
    }
    const attrName = matches[i][2];
    if (!validateAttrName(attrName)) {
      return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is an invalid name.", getPositionFromMatch(matches[i]));
    }
    if (!attrNames.hasOwnProperty(attrName)) {
      attrNames[attrName] = 1;
    } else {
      return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is repeated.", getPositionFromMatch(matches[i]));
    }
  }
  return true;
}
function validateNumberAmpersand(xmlData, i) {
  let re = /\d/;
  if (xmlData[i] === "x") {
    i++;
    re = /[\da-fA-F]/;
  }
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === ";")
      return i;
    if (!xmlData[i].match(re))
      break;
  }
  return -1;
}
function validateAmpersand(xmlData, i) {
  i++;
  if (xmlData[i] === ";")
    return -1;
  if (xmlData[i] === "#") {
    i++;
    return validateNumberAmpersand(xmlData, i);
  }
  let count = 0;
  for (; i < xmlData.length; i++, count++) {
    if (xmlData[i].match(/\w/) && count < 20)
      continue;
    if (xmlData[i] === ";")
      break;
    return -1;
  }
  return i;
}
function getErrorObject(code, message, lineNumber) {
  return {
    err: {
      code,
      msg: message,
      line: lineNumber.line || lineNumber,
      col: lineNumber.col
    }
  };
}
function validateAttrName(attrName) {
  return util$2.isName(attrName);
}
function validateTagName(tagname) {
  return util$2.isName(tagname);
}
function getLineNumberForPosition(xmlData, index) {
  const lines = xmlData.substring(0, index).split(/\r?\n/);
  return {
    line: lines.length,
    // column number is last line's length + 1, because column numbering starts at 1:
    col: lines[lines.length - 1].length + 1
  };
}
function getPositionFromMatch(match) {
  return match.startIndex + match[1].length;
}
var OptionsBuilder = {};
const defaultOptions$1 = {
  preserveOrder: false,
  attributeNamePrefix: "@_",
  attributesGroupName: false,
  textNodeName: "#text",
  ignoreAttributes: true,
  removeNSPrefix: false,
  // remove NS from tag name or attribute name if true
  allowBooleanAttributes: false,
  //a tag can have attributes without any value
  //ignoreRootElement : false,
  parseTagValue: true,
  parseAttributeValue: false,
  trimValues: true,
  //Trim string values of tag and attributes
  cdataPropName: false,
  numberParseOptions: {
    hex: true,
    leadingZeros: true,
    eNotation: true
  },
  tagValueProcessor: function(tagName, val) {
    return val;
  },
  attributeValueProcessor: function(attrName, val) {
    return val;
  },
  stopNodes: [],
  //nested tags will not be parsed even for errors
  alwaysCreateTextNode: false,
  isArray: () => false,
  commentPropName: false,
  unpairedTags: [],
  processEntities: true,
  htmlEntities: false,
  ignoreDeclaration: false,
  ignorePiTags: false,
  transformTagName: false,
  transformAttributeName: false,
  updateTag: function(tagName, jPath, attrs) {
    return tagName;
  }
  // skipEmptyListItem: false
};
const buildOptions$1 = function(options) {
  return Object.assign({}, defaultOptions$1, options);
};
OptionsBuilder.buildOptions = buildOptions$1;
OptionsBuilder.defaultOptions = defaultOptions$1;
class XmlNode {
  constructor(tagname) {
    this.tagname = tagname;
    this.child = [];
    this[":@"] = {};
  }
  add(key, val) {
    if (key === "__proto__") key = "#__proto__";
    this.child.push({ [key]: val });
  }
  addChild(node) {
    if (node.tagname === "__proto__") node.tagname = "#__proto__";
    if (node[":@"] && Object.keys(node[":@"]).length > 0) {
      this.child.push({ [node.tagname]: node.child, [":@"]: node[":@"] });
    } else {
      this.child.push({ [node.tagname]: node.child });
    }
  }
}
var xmlNode$1 = XmlNode;
const util$1 = util$3;
function readDocType$1(xmlData, i) {
  const entities = {};
  if (xmlData[i + 3] === "O" && xmlData[i + 4] === "C" && xmlData[i + 5] === "T" && xmlData[i + 6] === "Y" && xmlData[i + 7] === "P" && xmlData[i + 8] === "E") {
    i = i + 9;
    let angleBracketsCount = 1;
    let hasBody = false, comment = false;
    let exp = "";
    for (; i < xmlData.length; i++) {
      if (xmlData[i] === "<" && !comment) {
        if (hasBody && isEntity(xmlData, i)) {
          i += 7;
          let entityName, val;
          [entityName, val, i] = readEntityExp(xmlData, i + 1);
          if (val.indexOf("&") === -1)
            entities[validateEntityName(entityName)] = {
              regx: RegExp(`&${entityName};`, "g"),
              val
            };
        } else if (hasBody && isElement(xmlData, i)) i += 8;
        else if (hasBody && isAttlist(xmlData, i)) i += 8;
        else if (hasBody && isNotation(xmlData, i)) i += 9;
        else if (isComment) comment = true;
        else throw new Error("Invalid DOCTYPE");
        angleBracketsCount++;
        exp = "";
      } else if (xmlData[i] === ">") {
        if (comment) {
          if (xmlData[i - 1] === "-" && xmlData[i - 2] === "-") {
            comment = false;
            angleBracketsCount--;
          }
        } else {
          angleBracketsCount--;
        }
        if (angleBracketsCount === 0) {
          break;
        }
      } else if (xmlData[i] === "[") {
        hasBody = true;
      } else {
        exp += xmlData[i];
      }
    }
    if (angleBracketsCount !== 0) {
      throw new Error(`Unclosed DOCTYPE`);
    }
  } else {
    throw new Error(`Invalid Tag instead of DOCTYPE`);
  }
  return { entities, i };
}
function readEntityExp(xmlData, i) {
  let entityName = "";
  for (; i < xmlData.length && (xmlData[i] !== "'" && xmlData[i] !== '"'); i++) {
    entityName += xmlData[i];
  }
  entityName = entityName.trim();
  if (entityName.indexOf(" ") !== -1) throw new Error("External entites are not supported");
  const startChar = xmlData[i++];
  let val = "";
  for (; i < xmlData.length && xmlData[i] !== startChar; i++) {
    val += xmlData[i];
  }
  return [entityName, val, i];
}
function isComment(xmlData, i) {
  if (xmlData[i + 1] === "!" && xmlData[i + 2] === "-" && xmlData[i + 3] === "-") return true;
  return false;
}
function isEntity(xmlData, i) {
  if (xmlData[i + 1] === "!" && xmlData[i + 2] === "E" && xmlData[i + 3] === "N" && xmlData[i + 4] === "T" && xmlData[i + 5] === "I" && xmlData[i + 6] === "T" && xmlData[i + 7] === "Y") return true;
  return false;
}
function isElement(xmlData, i) {
  if (xmlData[i + 1] === "!" && xmlData[i + 2] === "E" && xmlData[i + 3] === "L" && xmlData[i + 4] === "E" && xmlData[i + 5] === "M" && xmlData[i + 6] === "E" && xmlData[i + 7] === "N" && xmlData[i + 8] === "T") return true;
  return false;
}
function isAttlist(xmlData, i) {
  if (xmlData[i + 1] === "!" && xmlData[i + 2] === "A" && xmlData[i + 3] === "T" && xmlData[i + 4] === "T" && xmlData[i + 5] === "L" && xmlData[i + 6] === "I" && xmlData[i + 7] === "S" && xmlData[i + 8] === "T") return true;
  return false;
}
function isNotation(xmlData, i) {
  if (xmlData[i + 1] === "!" && xmlData[i + 2] === "N" && xmlData[i + 3] === "O" && xmlData[i + 4] === "T" && xmlData[i + 5] === "A" && xmlData[i + 6] === "T" && xmlData[i + 7] === "I" && xmlData[i + 8] === "O" && xmlData[i + 9] === "N") return true;
  return false;
}
function validateEntityName(name) {
  if (util$1.isName(name))
    return name;
  else
    throw new Error(`Invalid entity name ${name}`);
}
var DocTypeReader = readDocType$1;
const hexRegex = /^[-+]?0x[a-fA-F0-9]+$/;
const numRegex = /^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/;
const consider = {
  hex: true,
  // oct: false,
  leadingZeros: true,
  decimalPoint: ".",
  eNotation: true
  //skipLike: /regex/
};
function toNumber$1(str, options = {}) {
  options = Object.assign({}, consider, options);
  if (!str || typeof str !== "string") return str;
  let trimmedStr = str.trim();
  if (options.skipLike !== void 0 && options.skipLike.test(trimmedStr)) return str;
  else if (str === "0") return 0;
  else if (options.hex && hexRegex.test(trimmedStr)) {
    return parse_int(trimmedStr, 16);
  } else if (trimmedStr.search(/[eE]/) !== -1) {
    const notation = trimmedStr.match(/^([-\+])?(0*)([0-9]*(\.[0-9]*)?[eE][-\+]?[0-9]+)$/);
    if (notation) {
      if (options.leadingZeros) {
        trimmedStr = (notation[1] || "") + notation[3];
      } else {
        if (notation[2] === "0" && notation[3][0] === ".") ;
        else {
          return str;
        }
      }
      return options.eNotation ? Number(trimmedStr) : str;
    } else {
      return str;
    }
  } else {
    const match = numRegex.exec(trimmedStr);
    if (match) {
      const sign = match[1];
      const leadingZeros = match[2];
      let numTrimmedByZeros = trimZeros(match[3]);
      if (!options.leadingZeros && leadingZeros.length > 0 && sign && trimmedStr[2] !== ".") return str;
      else if (!options.leadingZeros && leadingZeros.length > 0 && !sign && trimmedStr[1] !== ".") return str;
      else if (options.leadingZeros && leadingZeros === str) return 0;
      else {
        const num = Number(trimmedStr);
        const numStr = "" + num;
        if (numStr.search(/[eE]/) !== -1) {
          if (options.eNotation) return num;
          else return str;
        } else if (trimmedStr.indexOf(".") !== -1) {
          if (numStr === "0" && numTrimmedByZeros === "") return num;
          else if (numStr === numTrimmedByZeros) return num;
          else if (sign && numStr === "-" + numTrimmedByZeros) return num;
          else return str;
        }
        if (leadingZeros) {
          return numTrimmedByZeros === numStr || sign + numTrimmedByZeros === numStr ? num : str;
        } else {
          return trimmedStr === numStr || trimmedStr === sign + numStr ? num : str;
        }
      }
    } else {
      return str;
    }
  }
}
function trimZeros(numStr) {
  if (numStr && numStr.indexOf(".") !== -1) {
    numStr = numStr.replace(/0+$/, "");
    if (numStr === ".") numStr = "0";
    else if (numStr[0] === ".") numStr = "0" + numStr;
    else if (numStr[numStr.length - 1] === ".") numStr = numStr.substr(0, numStr.length - 1);
    return numStr;
  }
  return numStr;
}
function parse_int(numStr, base) {
  if (parseInt) return parseInt(numStr, base);
  else if (Number.parseInt) return Number.parseInt(numStr, base);
  else if (window && window.parseInt) return window.parseInt(numStr, base);
  else throw new Error("parseInt, Number.parseInt, window.parseInt are not supported");
}
var strnum = toNumber$1;
function getIgnoreAttributesFn$2(ignoreAttributes2) {
  if (typeof ignoreAttributes2 === "function") {
    return ignoreAttributes2;
  }
  if (Array.isArray(ignoreAttributes2)) {
    return (attrName) => {
      for (const pattern of ignoreAttributes2) {
        if (typeof pattern === "string" && attrName === pattern) {
          return true;
        }
        if (pattern instanceof RegExp && pattern.test(attrName)) {
          return true;
        }
      }
    };
  }
  return () => false;
}
var ignoreAttributes = getIgnoreAttributesFn$2;
const util = util$3;
const xmlNode = xmlNode$1;
const readDocType = DocTypeReader;
const toNumber = strnum;
const getIgnoreAttributesFn$1 = ignoreAttributes;
let OrderedObjParser$1 = class OrderedObjParser {
  constructor(options) {
    this.options = options;
    this.currentNode = null;
    this.tagsNodeStack = [];
    this.docTypeEntities = {};
    this.lastEntities = {
      "apos": { regex: /&(apos|#39|#x27);/g, val: "'" },
      "gt": { regex: /&(gt|#62|#x3E);/g, val: ">" },
      "lt": { regex: /&(lt|#60|#x3C);/g, val: "<" },
      "quot": { regex: /&(quot|#34|#x22);/g, val: '"' }
    };
    this.ampEntity = { regex: /&(amp|#38|#x26);/g, val: "&" };
    this.htmlEntities = {
      "space": { regex: /&(nbsp|#160);/g, val: " " },
      // "lt" : { regex: /&(lt|#60);/g, val: "<" },
      // "gt" : { regex: /&(gt|#62);/g, val: ">" },
      // "amp" : { regex: /&(amp|#38);/g, val: "&" },
      // "quot" : { regex: /&(quot|#34);/g, val: "\"" },
      // "apos" : { regex: /&(apos|#39);/g, val: "'" },
      "cent": { regex: /&(cent|#162);/g, val: "¢" },
      "pound": { regex: /&(pound|#163);/g, val: "£" },
      "yen": { regex: /&(yen|#165);/g, val: "¥" },
      "euro": { regex: /&(euro|#8364);/g, val: "€" },
      "copyright": { regex: /&(copy|#169);/g, val: "©" },
      "reg": { regex: /&(reg|#174);/g, val: "®" },
      "inr": { regex: /&(inr|#8377);/g, val: "₹" },
      "num_dec": { regex: /&#([0-9]{1,7});/g, val: (_, str) => String.fromCharCode(Number.parseInt(str, 10)) },
      "num_hex": { regex: /&#x([0-9a-fA-F]{1,6});/g, val: (_, str) => String.fromCharCode(Number.parseInt(str, 16)) }
    };
    this.addExternalEntities = addExternalEntities;
    this.parseXml = parseXml;
    this.parseTextData = parseTextData;
    this.resolveNameSpace = resolveNameSpace;
    this.buildAttributesMap = buildAttributesMap;
    this.isItStopNode = isItStopNode;
    this.replaceEntitiesValue = replaceEntitiesValue$1;
    this.readStopNodeData = readStopNodeData;
    this.saveTextToParentTag = saveTextToParentTag;
    this.addChild = addChild;
    this.ignoreAttributesFn = getIgnoreAttributesFn$1(this.options.ignoreAttributes);
  }
};
function addExternalEntities(externalEntities) {
  const entKeys = Object.keys(externalEntities);
  for (let i = 0; i < entKeys.length; i++) {
    const ent = entKeys[i];
    this.lastEntities[ent] = {
      regex: new RegExp("&" + ent + ";", "g"),
      val: externalEntities[ent]
    };
  }
}
function parseTextData(val, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
  if (val !== void 0) {
    if (this.options.trimValues && !dontTrim) {
      val = val.trim();
    }
    if (val.length > 0) {
      if (!escapeEntities) val = this.replaceEntitiesValue(val);
      const newval = this.options.tagValueProcessor(tagName, val, jPath, hasAttributes, isLeafNode);
      if (newval === null || newval === void 0) {
        return val;
      } else if (typeof newval !== typeof val || newval !== val) {
        return newval;
      } else if (this.options.trimValues) {
        return parseValue(val, this.options.parseTagValue, this.options.numberParseOptions);
      } else {
        const trimmedVal = val.trim();
        if (trimmedVal === val) {
          return parseValue(val, this.options.parseTagValue, this.options.numberParseOptions);
        } else {
          return val;
        }
      }
    }
  }
}
function resolveNameSpace(tagname) {
  if (this.options.removeNSPrefix) {
    const tags = tagname.split(":");
    const prefix = tagname.charAt(0) === "/" ? "/" : "";
    if (tags[0] === "xmlns") {
      return "";
    }
    if (tags.length === 2) {
      tagname = prefix + tags[1];
    }
  }
  return tagname;
}
const attrsRegx = new RegExp(`([^\\s=]+)\\s*(=\\s*(['"])([\\s\\S]*?)\\3)?`, "gm");
function buildAttributesMap(attrStr, jPath, tagName) {
  if (this.options.ignoreAttributes !== true && typeof attrStr === "string") {
    const matches = util.getAllMatches(attrStr, attrsRegx);
    const len = matches.length;
    const attrs = {};
    for (let i = 0; i < len; i++) {
      const attrName = this.resolveNameSpace(matches[i][1]);
      if (this.ignoreAttributesFn(attrName, jPath)) {
        continue;
      }
      let oldVal = matches[i][4];
      let aName = this.options.attributeNamePrefix + attrName;
      if (attrName.length) {
        if (this.options.transformAttributeName) {
          aName = this.options.transformAttributeName(aName);
        }
        if (aName === "__proto__") aName = "#__proto__";
        if (oldVal !== void 0) {
          if (this.options.trimValues) {
            oldVal = oldVal.trim();
          }
          oldVal = this.replaceEntitiesValue(oldVal);
          const newVal = this.options.attributeValueProcessor(attrName, oldVal, jPath);
          if (newVal === null || newVal === void 0) {
            attrs[aName] = oldVal;
          } else if (typeof newVal !== typeof oldVal || newVal !== oldVal) {
            attrs[aName] = newVal;
          } else {
            attrs[aName] = parseValue(
              oldVal,
              this.options.parseAttributeValue,
              this.options.numberParseOptions
            );
          }
        } else if (this.options.allowBooleanAttributes) {
          attrs[aName] = true;
        }
      }
    }
    if (!Object.keys(attrs).length) {
      return;
    }
    if (this.options.attributesGroupName) {
      const attrCollection = {};
      attrCollection[this.options.attributesGroupName] = attrs;
      return attrCollection;
    }
    return attrs;
  }
}
const parseXml = function(xmlData) {
  xmlData = xmlData.replace(/\r\n?/g, "\n");
  const xmlObj = new xmlNode("!xml");
  let currentNode = xmlObj;
  let textData = "";
  let jPath = "";
  for (let i = 0; i < xmlData.length; i++) {
    const ch = xmlData[i];
    if (ch === "<") {
      if (xmlData[i + 1] === "/") {
        const closeIndex = findClosingIndex(xmlData, ">", i, "Closing Tag is not closed.");
        let tagName = xmlData.substring(i + 2, closeIndex).trim();
        if (this.options.removeNSPrefix) {
          const colonIndex = tagName.indexOf(":");
          if (colonIndex !== -1) {
            tagName = tagName.substr(colonIndex + 1);
          }
        }
        if (this.options.transformTagName) {
          tagName = this.options.transformTagName(tagName);
        }
        if (currentNode) {
          textData = this.saveTextToParentTag(textData, currentNode, jPath);
        }
        const lastTagName = jPath.substring(jPath.lastIndexOf(".") + 1);
        if (tagName && this.options.unpairedTags.indexOf(tagName) !== -1) {
          throw new Error(`Unpaired tag can not be used as closing tag: </${tagName}>`);
        }
        let propIndex = 0;
        if (lastTagName && this.options.unpairedTags.indexOf(lastTagName) !== -1) {
          propIndex = jPath.lastIndexOf(".", jPath.lastIndexOf(".") - 1);
          this.tagsNodeStack.pop();
        } else {
          propIndex = jPath.lastIndexOf(".");
        }
        jPath = jPath.substring(0, propIndex);
        currentNode = this.tagsNodeStack.pop();
        textData = "";
        i = closeIndex;
      } else if (xmlData[i + 1] === "?") {
        let tagData = readTagExp(xmlData, i, false, "?>");
        if (!tagData) throw new Error("Pi Tag is not closed.");
        textData = this.saveTextToParentTag(textData, currentNode, jPath);
        if (this.options.ignoreDeclaration && tagData.tagName === "?xml" || this.options.ignorePiTags) ;
        else {
          const childNode = new xmlNode(tagData.tagName);
          childNode.add(this.options.textNodeName, "");
          if (tagData.tagName !== tagData.tagExp && tagData.attrExpPresent) {
            childNode[":@"] = this.buildAttributesMap(tagData.tagExp, jPath, tagData.tagName);
          }
          this.addChild(currentNode, childNode, jPath);
        }
        i = tagData.closeIndex + 1;
      } else if (xmlData.substr(i + 1, 3) === "!--") {
        const endIndex = findClosingIndex(xmlData, "-->", i + 4, "Comment is not closed.");
        if (this.options.commentPropName) {
          const comment = xmlData.substring(i + 4, endIndex - 2);
          textData = this.saveTextToParentTag(textData, currentNode, jPath);
          currentNode.add(this.options.commentPropName, [{ [this.options.textNodeName]: comment }]);
        }
        i = endIndex;
      } else if (xmlData.substr(i + 1, 2) === "!D") {
        const result = readDocType(xmlData, i);
        this.docTypeEntities = result.entities;
        i = result.i;
      } else if (xmlData.substr(i + 1, 2) === "![") {
        const closeIndex = findClosingIndex(xmlData, "]]>", i, "CDATA is not closed.") - 2;
        const tagExp = xmlData.substring(i + 9, closeIndex);
        textData = this.saveTextToParentTag(textData, currentNode, jPath);
        let val = this.parseTextData(tagExp, currentNode.tagname, jPath, true, false, true, true);
        if (val == void 0) val = "";
        if (this.options.cdataPropName) {
          currentNode.add(this.options.cdataPropName, [{ [this.options.textNodeName]: tagExp }]);
        } else {
          currentNode.add(this.options.textNodeName, val);
        }
        i = closeIndex + 2;
      } else {
        let result = readTagExp(xmlData, i, this.options.removeNSPrefix);
        let tagName = result.tagName;
        const rawTagName = result.rawTagName;
        let tagExp = result.tagExp;
        let attrExpPresent = result.attrExpPresent;
        let closeIndex = result.closeIndex;
        if (this.options.transformTagName) {
          tagName = this.options.transformTagName(tagName);
        }
        if (currentNode && textData) {
          if (currentNode.tagname !== "!xml") {
            textData = this.saveTextToParentTag(textData, currentNode, jPath, false);
          }
        }
        const lastTag = currentNode;
        if (lastTag && this.options.unpairedTags.indexOf(lastTag.tagname) !== -1) {
          currentNode = this.tagsNodeStack.pop();
          jPath = jPath.substring(0, jPath.lastIndexOf("."));
        }
        if (tagName !== xmlObj.tagname) {
          jPath += jPath ? "." + tagName : tagName;
        }
        if (this.isItStopNode(this.options.stopNodes, jPath, tagName)) {
          let tagContent = "";
          if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
            if (tagName[tagName.length - 1] === "/") {
              tagName = tagName.substr(0, tagName.length - 1);
              jPath = jPath.substr(0, jPath.length - 1);
              tagExp = tagName;
            } else {
              tagExp = tagExp.substr(0, tagExp.length - 1);
            }
            i = result.closeIndex;
          } else if (this.options.unpairedTags.indexOf(tagName) !== -1) {
            i = result.closeIndex;
          } else {
            const result2 = this.readStopNodeData(xmlData, rawTagName, closeIndex + 1);
            if (!result2) throw new Error(`Unexpected end of ${rawTagName}`);
            i = result2.i;
            tagContent = result2.tagContent;
          }
          const childNode = new xmlNode(tagName);
          if (tagName !== tagExp && attrExpPresent) {
            childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
          }
          if (tagContent) {
            tagContent = this.parseTextData(tagContent, tagName, jPath, true, attrExpPresent, true, true);
          }
          jPath = jPath.substr(0, jPath.lastIndexOf("."));
          childNode.add(this.options.textNodeName, tagContent);
          this.addChild(currentNode, childNode, jPath);
        } else {
          if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
            if (tagName[tagName.length - 1] === "/") {
              tagName = tagName.substr(0, tagName.length - 1);
              jPath = jPath.substr(0, jPath.length - 1);
              tagExp = tagName;
            } else {
              tagExp = tagExp.substr(0, tagExp.length - 1);
            }
            if (this.options.transformTagName) {
              tagName = this.options.transformTagName(tagName);
            }
            const childNode = new xmlNode(tagName);
            if (tagName !== tagExp && attrExpPresent) {
              childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
            }
            this.addChild(currentNode, childNode, jPath);
            jPath = jPath.substr(0, jPath.lastIndexOf("."));
          } else {
            const childNode = new xmlNode(tagName);
            this.tagsNodeStack.push(currentNode);
            if (tagName !== tagExp && attrExpPresent) {
              childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
            }
            this.addChild(currentNode, childNode, jPath);
            currentNode = childNode;
          }
          textData = "";
          i = closeIndex;
        }
      }
    } else {
      textData += xmlData[i];
    }
  }
  return xmlObj.child;
};
function addChild(currentNode, childNode, jPath) {
  const result = this.options.updateTag(childNode.tagname, jPath, childNode[":@"]);
  if (result === false) ;
  else if (typeof result === "string") {
    childNode.tagname = result;
    currentNode.addChild(childNode);
  } else {
    currentNode.addChild(childNode);
  }
}
const replaceEntitiesValue$1 = function(val) {
  if (this.options.processEntities) {
    for (let entityName in this.docTypeEntities) {
      const entity = this.docTypeEntities[entityName];
      val = val.replace(entity.regx, entity.val);
    }
    for (let entityName in this.lastEntities) {
      const entity = this.lastEntities[entityName];
      val = val.replace(entity.regex, entity.val);
    }
    if (this.options.htmlEntities) {
      for (let entityName in this.htmlEntities) {
        const entity = this.htmlEntities[entityName];
        val = val.replace(entity.regex, entity.val);
      }
    }
    val = val.replace(this.ampEntity.regex, this.ampEntity.val);
  }
  return val;
};
function saveTextToParentTag(textData, currentNode, jPath, isLeafNode) {
  if (textData) {
    if (isLeafNode === void 0) isLeafNode = currentNode.child.length === 0;
    textData = this.parseTextData(
      textData,
      currentNode.tagname,
      jPath,
      false,
      currentNode[":@"] ? Object.keys(currentNode[":@"]).length !== 0 : false,
      isLeafNode
    );
    if (textData !== void 0 && textData !== "")
      currentNode.add(this.options.textNodeName, textData);
    textData = "";
  }
  return textData;
}
function isItStopNode(stopNodes, jPath, currentTagName) {
  const allNodesExp = "*." + currentTagName;
  for (const stopNodePath in stopNodes) {
    const stopNodeExp = stopNodes[stopNodePath];
    if (allNodesExp === stopNodeExp || jPath === stopNodeExp) return true;
  }
  return false;
}
function tagExpWithClosingIndex(xmlData, i, closingChar = ">") {
  let attrBoundary;
  let tagExp = "";
  for (let index = i; index < xmlData.length; index++) {
    let ch = xmlData[index];
    if (attrBoundary) {
      if (ch === attrBoundary) attrBoundary = "";
    } else if (ch === '"' || ch === "'") {
      attrBoundary = ch;
    } else if (ch === closingChar[0]) {
      if (closingChar[1]) {
        if (xmlData[index + 1] === closingChar[1]) {
          return {
            data: tagExp,
            index
          };
        }
      } else {
        return {
          data: tagExp,
          index
        };
      }
    } else if (ch === "	") {
      ch = " ";
    }
    tagExp += ch;
  }
}
function findClosingIndex(xmlData, str, i, errMsg) {
  const closingIndex = xmlData.indexOf(str, i);
  if (closingIndex === -1) {
    throw new Error(errMsg);
  } else {
    return closingIndex + str.length - 1;
  }
}
function readTagExp(xmlData, i, removeNSPrefix, closingChar = ">") {
  const result = tagExpWithClosingIndex(xmlData, i + 1, closingChar);
  if (!result) return;
  let tagExp = result.data;
  const closeIndex = result.index;
  const separatorIndex = tagExp.search(/\s/);
  let tagName = tagExp;
  let attrExpPresent = true;
  if (separatorIndex !== -1) {
    tagName = tagExp.substring(0, separatorIndex);
    tagExp = tagExp.substring(separatorIndex + 1).trimStart();
  }
  const rawTagName = tagName;
  if (removeNSPrefix) {
    const colonIndex = tagName.indexOf(":");
    if (colonIndex !== -1) {
      tagName = tagName.substr(colonIndex + 1);
      attrExpPresent = tagName !== result.data.substr(colonIndex + 1);
    }
  }
  return {
    tagName,
    tagExp,
    closeIndex,
    attrExpPresent,
    rawTagName
  };
}
function readStopNodeData(xmlData, tagName, i) {
  const startIndex = i;
  let openTagCount = 1;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === "<") {
      if (xmlData[i + 1] === "/") {
        const closeIndex = findClosingIndex(xmlData, ">", i, `${tagName} is not closed`);
        let closeTagName = xmlData.substring(i + 2, closeIndex).trim();
        if (closeTagName === tagName) {
          openTagCount--;
          if (openTagCount === 0) {
            return {
              tagContent: xmlData.substring(startIndex, i),
              i: closeIndex
            };
          }
        }
        i = closeIndex;
      } else if (xmlData[i + 1] === "?") {
        const closeIndex = findClosingIndex(xmlData, "?>", i + 1, "StopNode is not closed.");
        i = closeIndex;
      } else if (xmlData.substr(i + 1, 3) === "!--") {
        const closeIndex = findClosingIndex(xmlData, "-->", i + 3, "StopNode is not closed.");
        i = closeIndex;
      } else if (xmlData.substr(i + 1, 2) === "![") {
        const closeIndex = findClosingIndex(xmlData, "]]>", i, "StopNode is not closed.") - 2;
        i = closeIndex;
      } else {
        const tagData = readTagExp(xmlData, i, ">");
        if (tagData) {
          const openTagName = tagData && tagData.tagName;
          if (openTagName === tagName && tagData.tagExp[tagData.tagExp.length - 1] !== "/") {
            openTagCount++;
          }
          i = tagData.closeIndex;
        }
      }
    }
  }
}
function parseValue(val, shouldParse, options) {
  if (shouldParse && typeof val === "string") {
    const newval = val.trim();
    if (newval === "true") return true;
    else if (newval === "false") return false;
    else return toNumber(val, options);
  } else {
    if (util.isExist(val)) {
      return val;
    } else {
      return "";
    }
  }
}
var OrderedObjParser_1 = OrderedObjParser$1;
var node2json = {};
function prettify$1(node, options) {
  return compress(node, options);
}
function compress(arr, options, jPath) {
  let text;
  const compressedObj = {};
  for (let i = 0; i < arr.length; i++) {
    const tagObj = arr[i];
    const property = propName$1(tagObj);
    let newJpath = "";
    if (jPath === void 0) newJpath = property;
    else newJpath = jPath + "." + property;
    if (property === options.textNodeName) {
      if (text === void 0) text = tagObj[property];
      else text += "" + tagObj[property];
    } else if (property === void 0) {
      continue;
    } else if (tagObj[property]) {
      let val = compress(tagObj[property], options, newJpath);
      const isLeaf = isLeafTag(val, options);
      if (tagObj[":@"]) {
        assignAttributes(val, tagObj[":@"], newJpath, options);
      } else if (Object.keys(val).length === 1 && val[options.textNodeName] !== void 0 && !options.alwaysCreateTextNode) {
        val = val[options.textNodeName];
      } else if (Object.keys(val).length === 0) {
        if (options.alwaysCreateTextNode) val[options.textNodeName] = "";
        else val = "";
      }
      if (compressedObj[property] !== void 0 && compressedObj.hasOwnProperty(property)) {
        if (!Array.isArray(compressedObj[property])) {
          compressedObj[property] = [compressedObj[property]];
        }
        compressedObj[property].push(val);
      } else {
        if (options.isArray(property, newJpath, isLeaf)) {
          compressedObj[property] = [val];
        } else {
          compressedObj[property] = val;
        }
      }
    }
  }
  if (typeof text === "string") {
    if (text.length > 0) compressedObj[options.textNodeName] = text;
  } else if (text !== void 0) compressedObj[options.textNodeName] = text;
  return compressedObj;
}
function propName$1(obj) {
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key !== ":@") return key;
  }
}
function assignAttributes(obj, attrMap, jpath, options) {
  if (attrMap) {
    const keys = Object.keys(attrMap);
    const len = keys.length;
    for (let i = 0; i < len; i++) {
      const atrrName = keys[i];
      if (options.isArray(atrrName, jpath + "." + atrrName, true, true)) {
        obj[atrrName] = [attrMap[atrrName]];
      } else {
        obj[atrrName] = attrMap[atrrName];
      }
    }
  }
}
function isLeafTag(obj, options) {
  const { textNodeName } = options;
  const propCount = Object.keys(obj).length;
  if (propCount === 0) {
    return true;
  }
  if (propCount === 1 && (obj[textNodeName] || typeof obj[textNodeName] === "boolean" || obj[textNodeName] === 0)) {
    return true;
  }
  return false;
}
node2json.prettify = prettify$1;
const { buildOptions } = OptionsBuilder;
const OrderedObjParser2 = OrderedObjParser_1;
const { prettify } = node2json;
const validator$1 = validator$2;
let XMLParser$1 = class XMLParser {
  constructor(options) {
    this.externalEntities = {};
    this.options = buildOptions(options);
  }
  /**
   * Parse XML dats to JS object 
   * @param {string|Buffer} xmlData 
   * @param {boolean|Object} validationOption 
   */
  parse(xmlData, validationOption) {
    if (typeof xmlData === "string") ;
    else if (xmlData.toString) {
      xmlData = xmlData.toString();
    } else {
      throw new Error("XML data is accepted in String or Bytes[] form.");
    }
    if (validationOption) {
      if (validationOption === true) validationOption = {};
      const result = validator$1.validate(xmlData, validationOption);
      if (result !== true) {
        throw Error(`${result.err.msg}:${result.err.line}:${result.err.col}`);
      }
    }
    const orderedObjParser = new OrderedObjParser2(this.options);
    orderedObjParser.addExternalEntities(this.externalEntities);
    const orderedResult = orderedObjParser.parseXml(xmlData);
    if (this.options.preserveOrder || orderedResult === void 0) return orderedResult;
    else return prettify(orderedResult, this.options);
  }
  /**
   * Add Entity which is not by default supported by this library
   * @param {string} key 
   * @param {string} value 
   */
  addEntity(key, value) {
    if (value.indexOf("&") !== -1) {
      throw new Error("Entity value can't have '&'");
    } else if (key.indexOf("&") !== -1 || key.indexOf(";") !== -1) {
      throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'");
    } else if (value === "&") {
      throw new Error("An entity with value '&' is not permitted");
    } else {
      this.externalEntities[key] = value;
    }
  }
};
var XMLParser_1 = XMLParser$1;
const EOL = "\n";
function toXml(jArray, options) {
  let indentation = "";
  if (options.format && options.indentBy.length > 0) {
    indentation = EOL;
  }
  return arrToStr(jArray, options, "", indentation);
}
function arrToStr(arr, options, jPath, indentation) {
  let xmlStr = "";
  let isPreviousElementTag = false;
  for (let i = 0; i < arr.length; i++) {
    const tagObj = arr[i];
    const tagName = propName(tagObj);
    if (tagName === void 0) continue;
    let newJPath = "";
    if (jPath.length === 0) newJPath = tagName;
    else newJPath = `${jPath}.${tagName}`;
    if (tagName === options.textNodeName) {
      let tagText = tagObj[tagName];
      if (!isStopNode(newJPath, options)) {
        tagText = options.tagValueProcessor(tagName, tagText);
        tagText = replaceEntitiesValue(tagText, options);
      }
      if (isPreviousElementTag) {
        xmlStr += indentation;
      }
      xmlStr += tagText;
      isPreviousElementTag = false;
      continue;
    } else if (tagName === options.cdataPropName) {
      if (isPreviousElementTag) {
        xmlStr += indentation;
      }
      xmlStr += `<![CDATA[${tagObj[tagName][0][options.textNodeName]}]]>`;
      isPreviousElementTag = false;
      continue;
    } else if (tagName === options.commentPropName) {
      xmlStr += indentation + `<!--${tagObj[tagName][0][options.textNodeName]}-->`;
      isPreviousElementTag = true;
      continue;
    } else if (tagName[0] === "?") {
      const attStr2 = attr_to_str(tagObj[":@"], options);
      const tempInd = tagName === "?xml" ? "" : indentation;
      let piTextNodeName = tagObj[tagName][0][options.textNodeName];
      piTextNodeName = piTextNodeName.length !== 0 ? " " + piTextNodeName : "";
      xmlStr += tempInd + `<${tagName}${piTextNodeName}${attStr2}?>`;
      isPreviousElementTag = true;
      continue;
    }
    let newIdentation = indentation;
    if (newIdentation !== "") {
      newIdentation += options.indentBy;
    }
    const attStr = attr_to_str(tagObj[":@"], options);
    const tagStart = indentation + `<${tagName}${attStr}`;
    const tagValue = arrToStr(tagObj[tagName], options, newJPath, newIdentation);
    if (options.unpairedTags.indexOf(tagName) !== -1) {
      if (options.suppressUnpairedNode) xmlStr += tagStart + ">";
      else xmlStr += tagStart + "/>";
    } else if ((!tagValue || tagValue.length === 0) && options.suppressEmptyNode) {
      xmlStr += tagStart + "/>";
    } else if (tagValue && tagValue.endsWith(">")) {
      xmlStr += tagStart + `>${tagValue}${indentation}</${tagName}>`;
    } else {
      xmlStr += tagStart + ">";
      if (tagValue && indentation !== "" && (tagValue.includes("/>") || tagValue.includes("</"))) {
        xmlStr += indentation + options.indentBy + tagValue + indentation;
      } else {
        xmlStr += tagValue;
      }
      xmlStr += `</${tagName}>`;
    }
    isPreviousElementTag = true;
  }
  return xmlStr;
}
function propName(obj) {
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (!obj.hasOwnProperty(key)) continue;
    if (key !== ":@") return key;
  }
}
function attr_to_str(attrMap, options) {
  let attrStr = "";
  if (attrMap && !options.ignoreAttributes) {
    for (let attr in attrMap) {
      if (!attrMap.hasOwnProperty(attr)) continue;
      let attrVal = options.attributeValueProcessor(attr, attrMap[attr]);
      attrVal = replaceEntitiesValue(attrVal, options);
      if (attrVal === true && options.suppressBooleanAttributes) {
        attrStr += ` ${attr.substr(options.attributeNamePrefix.length)}`;
      } else {
        attrStr += ` ${attr.substr(options.attributeNamePrefix.length)}="${attrVal}"`;
      }
    }
  }
  return attrStr;
}
function isStopNode(jPath, options) {
  jPath = jPath.substr(0, jPath.length - options.textNodeName.length - 1);
  let tagName = jPath.substr(jPath.lastIndexOf(".") + 1);
  for (let index in options.stopNodes) {
    if (options.stopNodes[index] === jPath || options.stopNodes[index] === "*." + tagName) return true;
  }
  return false;
}
function replaceEntitiesValue(textValue, options) {
  if (textValue && textValue.length > 0 && options.processEntities) {
    for (let i = 0; i < options.entities.length; i++) {
      const entity = options.entities[i];
      textValue = textValue.replace(entity.regex, entity.val);
    }
  }
  return textValue;
}
var orderedJs2Xml = toXml;
const buildFromOrderedJs = orderedJs2Xml;
const getIgnoreAttributesFn = ignoreAttributes;
const defaultOptions = {
  attributeNamePrefix: "@_",
  attributesGroupName: false,
  textNodeName: "#text",
  ignoreAttributes: true,
  cdataPropName: false,
  format: false,
  indentBy: "  ",
  suppressEmptyNode: false,
  suppressUnpairedNode: true,
  suppressBooleanAttributes: true,
  tagValueProcessor: function(key, a) {
    return a;
  },
  attributeValueProcessor: function(attrName, a) {
    return a;
  },
  preserveOrder: false,
  commentPropName: false,
  unpairedTags: [],
  entities: [
    { regex: new RegExp("&", "g"), val: "&amp;" },
    //it must be on top
    { regex: new RegExp(">", "g"), val: "&gt;" },
    { regex: new RegExp("<", "g"), val: "&lt;" },
    { regex: new RegExp("'", "g"), val: "&apos;" },
    { regex: new RegExp('"', "g"), val: "&quot;" }
  ],
  processEntities: true,
  stopNodes: [],
  // transformTagName: false,
  // transformAttributeName: false,
  oneListGroup: false
};
function Builder(options) {
  this.options = Object.assign({}, defaultOptions, options);
  if (this.options.ignoreAttributes === true || this.options.attributesGroupName) {
    this.isAttribute = function() {
      return false;
    };
  } else {
    this.ignoreAttributesFn = getIgnoreAttributesFn(this.options.ignoreAttributes);
    this.attrPrefixLen = this.options.attributeNamePrefix.length;
    this.isAttribute = isAttribute;
  }
  this.processTextOrObjNode = processTextOrObjNode;
  if (this.options.format) {
    this.indentate = indentate;
    this.tagEndChar = ">\n";
    this.newLine = "\n";
  } else {
    this.indentate = function() {
      return "";
    };
    this.tagEndChar = ">";
    this.newLine = "";
  }
}
Builder.prototype.build = function(jObj) {
  if (this.options.preserveOrder) {
    return buildFromOrderedJs(jObj, this.options);
  } else {
    if (Array.isArray(jObj) && this.options.arrayNodeName && this.options.arrayNodeName.length > 1) {
      jObj = {
        [this.options.arrayNodeName]: jObj
      };
    }
    return this.j2x(jObj, 0, []).val;
  }
};
Builder.prototype.j2x = function(jObj, level, ajPath) {
  let attrStr = "";
  let val = "";
  const jPath = ajPath.join(".");
  for (let key in jObj) {
    if (!Object.prototype.hasOwnProperty.call(jObj, key)) continue;
    if (typeof jObj[key] === "undefined") {
      if (this.isAttribute(key)) {
        val += "";
      }
    } else if (jObj[key] === null) {
      if (this.isAttribute(key)) {
        val += "";
      } else if (key === this.options.cdataPropName) {
        val += "";
      } else if (key[0] === "?") {
        val += this.indentate(level) + "<" + key + "?" + this.tagEndChar;
      } else {
        val += this.indentate(level) + "<" + key + "/" + this.tagEndChar;
      }
    } else if (jObj[key] instanceof Date) {
      val += this.buildTextValNode(jObj[key], key, "", level);
    } else if (typeof jObj[key] !== "object") {
      const attr = this.isAttribute(key);
      if (attr && !this.ignoreAttributesFn(attr, jPath)) {
        attrStr += this.buildAttrPairStr(attr, "" + jObj[key]);
      } else if (!attr) {
        if (key === this.options.textNodeName) {
          let newval = this.options.tagValueProcessor(key, "" + jObj[key]);
          val += this.replaceEntitiesValue(newval);
        } else {
          val += this.buildTextValNode(jObj[key], key, "", level);
        }
      }
    } else if (Array.isArray(jObj[key])) {
      const arrLen = jObj[key].length;
      let listTagVal = "";
      let listTagAttr = "";
      for (let j = 0; j < arrLen; j++) {
        const item = jObj[key][j];
        if (typeof item === "undefined") ;
        else if (item === null) {
          if (key[0] === "?") val += this.indentate(level) + "<" + key + "?" + this.tagEndChar;
          else val += this.indentate(level) + "<" + key + "/" + this.tagEndChar;
        } else if (typeof item === "object") {
          if (this.options.oneListGroup) {
            const result = this.j2x(item, level + 1, ajPath.concat(key));
            listTagVal += result.val;
            if (this.options.attributesGroupName && item.hasOwnProperty(this.options.attributesGroupName)) {
              listTagAttr += result.attrStr;
            }
          } else {
            listTagVal += this.processTextOrObjNode(item, key, level, ajPath);
          }
        } else {
          if (this.options.oneListGroup) {
            let textValue = this.options.tagValueProcessor(key, item);
            textValue = this.replaceEntitiesValue(textValue);
            listTagVal += textValue;
          } else {
            listTagVal += this.buildTextValNode(item, key, "", level);
          }
        }
      }
      if (this.options.oneListGroup) {
        listTagVal = this.buildObjectNode(listTagVal, key, listTagAttr, level);
      }
      val += listTagVal;
    } else {
      if (this.options.attributesGroupName && key === this.options.attributesGroupName) {
        const Ks = Object.keys(jObj[key]);
        const L = Ks.length;
        for (let j = 0; j < L; j++) {
          attrStr += this.buildAttrPairStr(Ks[j], "" + jObj[key][Ks[j]]);
        }
      } else {
        val += this.processTextOrObjNode(jObj[key], key, level, ajPath);
      }
    }
  }
  return { attrStr, val };
};
Builder.prototype.buildAttrPairStr = function(attrName, val) {
  val = this.options.attributeValueProcessor(attrName, "" + val);
  val = this.replaceEntitiesValue(val);
  if (this.options.suppressBooleanAttributes && val === "true") {
    return " " + attrName;
  } else return " " + attrName + '="' + val + '"';
};
function processTextOrObjNode(object, key, level, ajPath) {
  const result = this.j2x(object, level + 1, ajPath.concat(key));
  if (object[this.options.textNodeName] !== void 0 && Object.keys(object).length === 1) {
    return this.buildTextValNode(object[this.options.textNodeName], key, result.attrStr, level);
  } else {
    return this.buildObjectNode(result.val, key, result.attrStr, level);
  }
}
Builder.prototype.buildObjectNode = function(val, key, attrStr, level) {
  if (val === "") {
    if (key[0] === "?") return this.indentate(level) + "<" + key + attrStr + "?" + this.tagEndChar;
    else {
      return this.indentate(level) + "<" + key + attrStr + this.closeTag(key) + this.tagEndChar;
    }
  } else {
    let tagEndExp = "</" + key + this.tagEndChar;
    let piClosingChar = "";
    if (key[0] === "?") {
      piClosingChar = "?";
      tagEndExp = "";
    }
    if ((attrStr || attrStr === "") && val.indexOf("<") === -1) {
      return this.indentate(level) + "<" + key + attrStr + piClosingChar + ">" + val + tagEndExp;
    } else if (this.options.commentPropName !== false && key === this.options.commentPropName && piClosingChar.length === 0) {
      return this.indentate(level) + `<!--${val}-->` + this.newLine;
    } else {
      return this.indentate(level) + "<" + key + attrStr + piClosingChar + this.tagEndChar + val + this.indentate(level) + tagEndExp;
    }
  }
};
Builder.prototype.closeTag = function(key) {
  let closeTag = "";
  if (this.options.unpairedTags.indexOf(key) !== -1) {
    if (!this.options.suppressUnpairedNode) closeTag = "/";
  } else if (this.options.suppressEmptyNode) {
    closeTag = "/";
  } else {
    closeTag = `></${key}`;
  }
  return closeTag;
};
Builder.prototype.buildTextValNode = function(val, key, attrStr, level) {
  if (this.options.cdataPropName !== false && key === this.options.cdataPropName) {
    return this.indentate(level) + `<![CDATA[${val}]]>` + this.newLine;
  } else if (this.options.commentPropName !== false && key === this.options.commentPropName) {
    return this.indentate(level) + `<!--${val}-->` + this.newLine;
  } else if (key[0] === "?") {
    return this.indentate(level) + "<" + key + attrStr + "?" + this.tagEndChar;
  } else {
    let textValue = this.options.tagValueProcessor(key, val);
    textValue = this.replaceEntitiesValue(textValue);
    if (textValue === "") {
      return this.indentate(level) + "<" + key + attrStr + this.closeTag(key) + this.tagEndChar;
    } else {
      return this.indentate(level) + "<" + key + attrStr + ">" + textValue + "</" + key + this.tagEndChar;
    }
  }
};
Builder.prototype.replaceEntitiesValue = function(textValue) {
  if (textValue && textValue.length > 0 && this.options.processEntities) {
    for (let i = 0; i < this.options.entities.length; i++) {
      const entity = this.options.entities[i];
      textValue = textValue.replace(entity.regex, entity.val);
    }
  }
  return textValue;
};
function indentate(level) {
  return this.options.indentBy.repeat(level);
}
function isAttribute(name) {
  if (name.startsWith(this.options.attributeNamePrefix) && name !== this.options.textNodeName) {
    return name.substr(this.attrPrefixLen);
  } else {
    return false;
  }
}
var json2xml = Builder;
const validator = validator$2;
const XMLParser2 = XMLParser_1;
const XMLBuilder = json2xml;
var fxp = {
  XMLParser: XMLParser2,
  XMLValidator: validator,
  XMLBuilder
};
const gunzipAsync = promisify(gunzip);
const debug = process.env.BPM_DEBUG === "1";
const parser = new fxp.XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: true,
  allowBooleanAttributes: true
});
async function extractBpmFromAls(filePath) {
  try {
    const data = await promises.readFile(filePath);
    let xmlText;
    try {
      const unzipped = await gunzipAsync(data);
      xmlText = unzipped.toString("utf8");
    } catch {
      xmlText = data.toString("utf8");
    }
    const regexTempo = extractTempoFromXmlText(xmlText);
    if (regexTempo !== null) {
      if (debug) console.log("[bpm] regex tempo", regexTempo, filePath);
      return clampBpm(regexTempo);
    }
    const parsed = parser.parse(xmlText);
    const direct = extractDirectTempo(parsed);
    if (direct !== null) {
      if (debug) console.log("[bpm] direct tempo", direct, filePath);
      return clampBpm(direct);
    }
    const liveSet = findLiveSet(parsed);
    const fallback = liveSet ? findTempoRecursive(liveSet) : findTempoRecursive(parsed);
    if (debug && fallback !== null) {
      console.log("[bpm] fallback tempo", fallback, filePath);
    }
    return clampBpm(fallback);
  } catch (error) {
    if (debug) {
      console.log("[bpm] failed to parse", filePath, error);
    }
    return null;
  }
}
function clampBpm(value) {
  if (value === null) return null;
  if (!Number.isFinite(value)) return null;
  if (value < 20 || value > 400) return null;
  return value;
}
function extractDirectTempo(parsed) {
  const liveSet = findLiveSet(parsed);
  const masterTrack = getFirst(liveSet, "MasterTrack");
  const deviceChain = getFirst(masterTrack, "DeviceChain");
  const mixer = getFirst(deviceChain, "Mixer");
  const tempo = getFirst(mixer, "Tempo");
  const manual = getFirst(tempo, "Manual");
  const value = getAttributeValue(manual, "Value");
  return value === null ? null : Number(value);
}
function extractTempoFromXmlText(xmlText) {
  const tempoBlockRegex = /<Tempo\b[^>]*>([\s\S]*?)<\/Tempo>/gi;
  let blockMatch;
  const tempoCandidates = [];
  while ((blockMatch = tempoBlockRegex.exec(xmlText)) !== null) {
    const block = blockMatch[1];
    const manualMatch = block.match(/<Manual[^>]*Value="([0-9]+(?:\.[0-9]+)?)"/i);
    if (!manualMatch) continue;
    const bpm = Number(manualMatch[1]);
    if (Number.isFinite(bpm) && bpm >= 20 && bpm <= 400) {
      tempoCandidates.push(bpm);
    }
  }
  if (tempoCandidates.length > 0) {
    return tempoCandidates[0];
  }
  const values = [];
  const regex = /<Manual[^>]*Value="([0-9]+(?:\.[0-9]+)?)"/gi;
  let match;
  while ((match = regex.exec(xmlText)) !== null) {
    const bpm = Number(match[1]);
    if (Number.isFinite(bpm)) values.push(bpm);
  }
  if (debug && values.length > 0) {
    console.log("[bpm] manual values found", values.slice(0, 20), "total", values.length);
  }
  const ranged = values.filter((value) => value >= 20 && value <= 400);
  if (ranged.length === 0) return null;
  return ranged[ranged.length - 1];
}
function findTempoRecursive(node) {
  if (node === null || node === void 0) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findTempoRecursive(item);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const record = node;
  if (record.Tempo && typeof record.Tempo === "object") {
    const manual = getFirst(record.Tempo, "Manual");
    const value = getAttributeValue(manual, "Value");
    if (value !== null) return Number(value);
  }
  for (const key of Object.keys(record)) {
    const found = findTempoRecursive(record[key]);
    if (found !== null) return found;
  }
  return null;
}
function findLiveSet(root) {
  const direct = getFirst(root, "LiveSet");
  if (direct && typeof direct === "object") return direct;
  const ableton = getFirst(root, "Ableton");
  if (ableton && typeof ableton === "object") {
    const liveSet = getFirst(ableton, "LiveSet");
    if (liveSet && typeof liveSet === "object") return liveSet;
  }
  return null;
}
function getFirst(node, key) {
  if (!node || typeof node !== "object") return null;
  const record = node;
  const value = record[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
function getAttributeValue(node, key) {
  if (!node || typeof node !== "object") return null;
  const record = node;
  const value = record[key];
  if (value === null || value === void 0) return null;
  return value;
}
function getDawFormatFromPath(filePath) {
  if (typeof filePath !== "string" || filePath.trim().length === 0) return "als";
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".flp") return "flp";
  if (ext === ".ptx") return "ptx";
  return "als";
}
function toLogicalTrack(row) {
  return {
    id: row.id,
    groupKey: row.group_key,
    title: row.title,
    latestVersionId: row.latest_version_id ?? null,
    rootPath: row.root_path ?? null,
    abletonProjectPath: row.ableton_project_path ?? null,
    dawFormat: row.daw_format ?? "als",
    creationMode: row.creation_mode ?? "blank",
    sourceTemplatePath: row.source_template_path ?? null,
    sourceTemplateName: row.source_template_name ?? null,
    projectTypeLabel: row.project_type_label ?? null,
    audioPath: row.audio_path ?? null,
    backgroundImagePath: row.background_image_path ?? null,
    folderId: row.folder_id ?? null,
    status: row.status ?? "Idea",
    genre: row.genre ?? null,
    notes: row.notes ?? "",
    noteId: row.note_id ?? null,
    notePreview: row.note_preview ?? null,
    trashed: Boolean(row.trashed),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}
function toTrackVersion(row) {
  return {
    id: row.id,
    trackId: row.track_id,
    filePath: row.file_path,
    savedAt: Number(row.saved_at),
    fileSize: Number(row.file_size),
    bpm: row.bpm === null || row.bpm === void 0 ? null : Number(row.bpm),
    bpmSource: row.bpm_source ?? "auto",
    createdAt: Number(row.created_at)
  };
}
async function run$2(sql, params = []) {
  await initDatabase();
  const db2 = getDb();
  return await new Promise((resolve, reject) => {
    db2.run(sql, params, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}
async function all$1(sql, params = []) {
  await initDatabase();
  const db2 = getDb();
  return await new Promise((resolve, reject) => {
    db2.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}
async function get(sql, params = []) {
  await initDatabase();
  const db2 = getDb();
  return await new Promise((resolve, reject) => {
    db2.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row ?? null);
    });
  });
}
async function listTracksWithLatest(whereClause, params) {
  const rows = await all$1(
    `
    SELECT
      t.*,
      v.id as version_id,
      v.file_path as version_file_path,
      v.saved_at as version_saved_at,
      v.file_size as version_file_size,
      v.bpm as version_bpm,
      v.bpm_source as version_bpm_source,
      v.created_at as version_created_at,
      n.id as note_id,
      n.plain_text_preview as note_preview,
      (
        SELECT COUNT(*) FROM track_versions tv
        WHERE tv.track_id = t.id
          AND LOWER(tv.file_path) NOT LIKE '%(overwritten%'
          AND LOWER(tv.file_path) NOT LIKE '%(autosaved%'
      ) as version_count
    FROM tracks t
    LEFT JOIN track_versions v ON v.id = t.latest_version_id
    LEFT JOIN track_notes n ON n.track_id = t.id
    ${whereClause}
    ORDER BY COALESCE(v.saved_at, t.updated_at) DESC
    `,
    params
  );
  return rows.map((row) => {
    const track = toLogicalTrack(row);
    const hasVersion = row.version_id !== null && row.version_id !== void 0;
    const latestVersion = hasVersion ? toTrackVersion({
      id: row.version_id,
      track_id: row.id,
      file_path: row.version_file_path,
      saved_at: row.version_saved_at,
      file_size: row.version_file_size,
      bpm: row.version_bpm,
      bpm_source: row.version_bpm_source,
      created_at: row.version_created_at
    }) : null;
    return {
      track,
      latestVersion,
      versionCount: Number(row.version_count ?? 0)
    };
  });
}
async function listTracks() {
  return listTracksWithLatest("WHERE t.trashed = 0", []);
}
async function listTracksByFolder(folderId) {
  return listTracksWithLatest("WHERE t.trashed = 0 AND t.folder_id = ?", [folderId]);
}
async function listTrashedTracks() {
  return listTracksWithLatest("WHERE t.trashed = 1", []);
}
async function listTrackVersions(trackId) {
  const rows = await all$1(
    `
    SELECT * FROM track_versions
    WHERE track_id = ?
      AND LOWER(file_path) NOT LIKE '%(overwritten%'
      AND LOWER(file_path) NOT LIKE '%(autosaved%'
    ORDER BY saved_at DESC
    `,
    [trackId]
  );
  return rows.map((row) => toTrackVersion(row));
}
async function setLatestVersion(trackId, versionId) {
  const version = await get("SELECT id, file_path FROM track_versions WHERE id = ? AND track_id = ?", [
    versionId,
    trackId
  ]);
  if (!version) return null;
  await run$2(
    "UPDATE tracks SET latest_version_id = ?, ableton_project_path = ?, updated_at = ? WHERE id = ?",
    [versionId, version.file_path, Date.now(), trackId]
  );
  const rows = await listTracksWithLatest("WHERE t.id = ?", [trackId]);
  return rows[0] ?? null;
}
async function setTrackFolder(trackId, folderId) {
  await run$2("UPDATE tracks SET folder_id = ?, updated_at = ? WHERE id = ?", [
    folderId,
    Date.now(),
    trackId
  ]);
  const row = await get("SELECT * FROM tracks WHERE id = ?", [trackId]);
  return row ? toLogicalTrack(row) : null;
}
async function setTrackStatus(trackId, status) {
  await run$2("UPDATE tracks SET status = ?, updated_at = ? WHERE id = ?", [
    status,
    Date.now(),
    trackId
  ]);
  const row = await get("SELECT * FROM tracks WHERE id = ?", [trackId]);
  return row ? toLogicalTrack(row) : null;
}
async function setTrackGenre(trackId, genre) {
  await run$2("UPDATE tracks SET genre = ?, updated_at = ? WHERE id = ?", [
    genre,
    Date.now(),
    trackId
  ]);
  const row = await get("SELECT * FROM tracks WHERE id = ?", [trackId]);
  return row ? toLogicalTrack(row) : null;
}
async function setTrackAudioPath(trackId, audioPath) {
  await run$2("UPDATE tracks SET audio_path = ?, updated_at = ? WHERE id = ?", [
    audioPath,
    Date.now(),
    trackId
  ]);
  const row = await get("SELECT * FROM tracks WHERE id = ?", [trackId]);
  return row ? toLogicalTrack(row) : null;
}
async function setTrackBpm(trackId, bpm) {
  const track = await get("SELECT latest_version_id FROM tracks WHERE id = ?", [trackId]);
  if (!(track == null ? void 0 : track.latest_version_id)) return;
  await run$2("UPDATE track_versions SET bpm = ?, bpm_source = ? WHERE id = ?", [
    bpm,
    "manual",
    track.latest_version_id
  ]);
}
async function moveToTrash(ids) {
  if (ids.length === 0) return listTracks();
  const placeholders = ids.map(() => "?").join(",");
  await run$2(`UPDATE tracks SET trashed = 1 WHERE id IN (${placeholders})`, ids);
  return listTracks();
}
async function restoreTracks(ids) {
  if (ids.length === 0) return listTracks();
  const placeholders = ids.map(() => "?").join(",");
  await run$2(`UPDATE tracks SET trashed = 0 WHERE id IN (${placeholders})`, ids);
  return listTracks();
}
async function purgeTracks(ids) {
  if (ids.length === 0) return listTracks();
  const placeholders = ids.map(() => "?").join(",");
  await run$2(`DELETE FROM track_versions WHERE track_id IN (${placeholders})`, ids);
  await run$2(`DELETE FROM tracks WHERE id IN (${placeholders})`, ids);
  return listTracks();
}
async function upsertScanResults(hits) {
  if (hits.length === 0) return listTracks();
  await initDatabase();
  const db2 = getDb();
  const groupKeys = Array.from(new Set(hits.map((hit) => computeGroupKey(hit.filePath))));
  const existingRows = groupKeys.length ? await all$1(`SELECT * FROM tracks WHERE group_key IN (${groupKeys.map(() => "?").join(",")})`, groupKeys) : [];
  const trackByGroup = /* @__PURE__ */ new Map();
  for (const row of existingRows) {
    const track = toLogicalTrack(row);
    trackByGroup.set(track.groupKey, track);
  }
  const now = Date.now();
  for (const hit of hits) {
    const groupKey = computeGroupKey(hit.filePath);
    if (!trackByGroup.has(groupKey)) {
      const trackId = randomUUID();
      const title = computeDisplayTitle(hit.filePath);
      const track = {
        id: trackId,
        groupKey,
        title,
        latestVersionId: null,
        rootPath: null,
        abletonProjectPath: null,
        dawFormat: hit.ext ?? "als",
        creationMode: "blank",
        sourceTemplatePath: null,
        sourceTemplateName: null,
        projectTypeLabel: null,
        audioPath: null,
        backgroundImagePath: null,
        folderId: null,
        status: "Idea",
        notes: "",
        noteId: null,
        notePreview: null,
        genre: null,
        trashed: false,
        createdAt: now,
        updatedAt: now
      };
      trackByGroup.set(groupKey, track);
    }
  }
  await new Promise((resolve, reject) => {
    db2.serialize(() => {
      const insertTrack = db2.prepare(
        `
        INSERT OR IGNORE INTO tracks (
          id, group_key, title, latest_version_id, ableton_project_path, audio_path, background_image_path, folder_id, status, notes, trashed, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      );
      const upsertVersion = db2.prepare(
        `
        INSERT INTO track_versions (
          id, track_id, file_path, saved_at, file_size, bpm, bpm_source, content_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(file_path) DO UPDATE SET
          saved_at = excluded.saved_at,
          file_size = excluded.file_size,
          bpm = CASE WHEN excluded.bpm IS NOT NULL THEN excluded.bpm ELSE bpm END,
          bpm_source = CASE WHEN excluded.bpm IS NOT NULL THEN excluded.bpm_source ELSE bpm_source END
        `
      );
      const updateTrackLatest = db2.prepare(
        `
        UPDATE tracks SET latest_version_id = ?, ableton_project_path = ?, daw_format = ?, updated_at = ? WHERE id = ?
        `
      );
      const updateTrackTitle = db2.prepare(
        `
        UPDATE tracks SET title = ?, updated_at = ? WHERE id = ?
        `
      );
      try {
        for (const track of trackByGroup.values()) {
          insertTrack.run([
            track.id,
            track.groupKey,
            track.title,
            track.latestVersionId,
            track.abletonProjectPath,
            track.audioPath,
            track.backgroundImagePath,
            track.folderId,
            track.status,
            track.notes,
            track.trashed ? 1 : 0,
            track.createdAt,
            track.updatedAt
          ]);
        }
        for (const hit of hits) {
          const groupKey = computeGroupKey(hit.filePath);
          const track = trackByGroup.get(groupKey);
          if (!track) continue;
          const displayTitle = computeDisplayTitle(hit.filePath);
          if (displayTitle && displayTitle !== track.title) {
            updateTrackTitle.run([displayTitle, now, track.id]);
            track.title = displayTitle;
          }
          const parsedVersion = parseAbletonVersionFile(hit.filePath);
          const savedAt = (parsedVersion == null ? void 0 : parsedVersion.versionTimestampMs) ?? hit.lastModifiedMs;
          const versionId = randomUUID();
          upsertVersion.run([
            versionId,
            track.id,
            hit.filePath,
            savedAt,
            hit.fileSize,
            null,
            "auto",
            null,
            now
          ]);
        }
        const trackIds = Array.from(new Set(Array.from(trackByGroup.values()).map((track) => track.id)));
        for (const trackId of trackIds) {
          const latestRow = db2.prepare(
            "SELECT id, file_path, saved_at FROM track_versions WHERE track_id = ? ORDER BY saved_at DESC LIMIT 1"
          ).get(trackId);
          if (latestRow && typeof latestRow.file_path === "string") {
            const dawFormat = getDawFormatFromPath(latestRow.file_path);
            updateTrackLatest.run([latestRow.id, latestRow.file_path, dawFormat, now, trackId]);
          } else if (latestRow) {
            console.warn("[trackStore] missing latest file_path during upsertScanResults", {
              trackId,
              latestVersionId: latestRow.id
            });
          }
        }
        insertTrack.finalize();
        upsertVersion.finalize();
        updateTrackLatest.finalize();
        updateTrackTitle.finalize();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
  await run$2(
    `
    DELETE FROM track_versions
    WHERE LOWER(file_path) LIKE '%.flp'
      AND (
        LOWER(file_path) LIKE '%(overwritten%'
        OR LOWER(file_path) LIKE '%(autosaved%'
      )
    `,
    []
  );
  await rebuildTracksFromVersions();
  return listTracks();
}
async function createProjectRecord(input) {
  await initDatabase();
  const now = Date.now();
  const groupKey = computeGroupKey(input.dawProjectPath);
  const versionId = randomUUID();
  await run$2(
    `
    INSERT INTO tracks (
      id, group_key, title, latest_version_id, root_path, ableton_project_path, daw_format, creation_mode, source_template_path, source_template_name, project_type_label, audio_path, background_image_path, folder_id, status, notes, trashed, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.projectId,
      groupKey,
      input.projectName,
      versionId,
      input.rootPath,
      input.dawProjectPath,
      input.dawFormat,
      input.creationMode,
      input.sourceTemplatePath,
      input.sourceTemplateName,
      input.projectTypeLabel,
      null,
      null,
      input.folderId,
      input.status,
      "",
      0,
      now,
      now
    ]
  );
  await run$2(
    `
    INSERT INTO track_versions (
      id, track_id, file_path, saved_at, file_size, bpm, bpm_source, content_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      versionId,
      input.projectId,
      input.dawProjectPath,
      input.savedAt,
      input.fileSize,
      null,
      "auto",
      null,
      now
    ]
  );
  const created = await listTracksWithLatest("WHERE t.id = ?", [input.projectId]);
  if (!created[0]) {
    throw new Error("Project row was created but could not be loaded.");
  }
  return created[0];
}
async function findVersionByPath(filePath) {
  const row = await get("SELECT * FROM track_versions WHERE file_path = ?", [filePath]);
  return row ? toTrackVersion(row) : null;
}
async function updateVersionBpm(versionId, bpm, source) {
  await run$2("UPDATE track_versions SET bpm = ?, bpm_source = ? WHERE id = ?", [bpm, source, versionId]);
  const row = await get("SELECT * FROM track_versions WHERE id = ?", [versionId]);
  return row ? toTrackVersion(row) : null;
}
async function debugComputeBpmForFileName(fileName) {
  const needle = fileName.toLowerCase();
  const row = await get(
    "SELECT * FROM track_versions WHERE LOWER(file_path) LIKE ? LIMIT 1",
    [`%${needle}`]
  );
  if (!row) return null;
  const version = toTrackVersion(row);
  const bpm = await extractBpmFromAls(version.filePath);
  if (bpm === null) return null;
  return updateVersionBpm(version.id, bpm, "als");
}
async function rebuildTracksFromVersions() {
  await initDatabase();
  const db2 = getDb();
  const tracks = await all$1("SELECT * FROM tracks", []);
  const versions = await all$1("SELECT * FROM track_versions", []);
  const trackById = /* @__PURE__ */ new Map();
  const trackByGroup = /* @__PURE__ */ new Map();
  for (const row of tracks) {
    trackById.set(row.id, row);
    if (row.group_key) {
      trackByGroup.set(row.group_key, row);
    }
  }
  const grouped = /* @__PURE__ */ new Map();
  for (const version of versions) {
    const filePath = version.file_path;
    const groupKey = computeGroupKey(filePath);
    const group = grouped.get(groupKey) ?? [];
    group.push(version);
    grouped.set(groupKey, group);
  }
  await new Promise((resolve, reject) => {
    db2.serialize(() => {
      db2.run("UPDATE tracks SET group_key = id");
      const updateVersionTrack = db2.prepare(
        "UPDATE track_versions SET track_id = ? WHERE id = ?"
      );
      const updateTrack = db2.prepare(
        `
        UPDATE tracks
        SET group_key = ?, title = ?, latest_version_id = ?, ableton_project_path = ?, daw_format = ?, audio_path = ?, background_image_path = ?, folder_id = ?, status = ?, notes = ?, trashed = ?, updated_at = ?
        WHERE id = ?
        `
      );
      const insertTrack = db2.prepare(
        `
        INSERT INTO tracks (
        id, group_key, title, latest_version_id, root_path, ableton_project_path, daw_format, creation_mode, source_template_path, source_template_name, project_type_label, audio_path, background_image_path, folder_id, status, notes, trashed, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      );
      try {
        const usedTrackIds = /* @__PURE__ */ new Set();
        for (const [groupKey, groupVersions] of grouped.entries()) {
          const sorted = [...groupVersions].sort((a, b) => {
            const aIsBackup = parseAbletonVersionFile(a.file_path) !== null;
            const bIsBackup = parseAbletonVersionFile(b.file_path) !== null;
            if (!aIsBackup && bIsBackup) return -1;
            if (aIsBackup && !bIsBackup) return 1;
            return Number(b.saved_at) - Number(a.saved_at);
          });
          const latest = sorted[0];
          const latestFilePathRaw = latest.file_path;
          if (typeof latestFilePathRaw !== "string" || latestFilePathRaw.trim().length === 0) {
            console.warn("[trackStore] skipping grouped row with invalid file_path", { groupKey });
            continue;
          }
          const latestFilePath = latestFilePathRaw;
          const existingByGroup = trackByGroup.get(groupKey);
          const fallbackTrack = trackById.get(latest.track_id);
          const chosen = existingByGroup ?? fallbackTrack;
          const trackId = (chosen == null ? void 0 : chosen.id) ?? randomUUID();
          const title = computeDisplayTitle(latestFilePath);
          const folderId = (chosen == null ? void 0 : chosen.folder_id) ?? null;
          const status = (chosen == null ? void 0 : chosen.status) ?? "Idea";
          const notes = (chosen == null ? void 0 : chosen.notes) ?? "";
          const trashed = Number((chosen == null ? void 0 : chosen.trashed) ?? 0);
          const audioPath = (chosen == null ? void 0 : chosen.audio_path) ?? null;
          const backgroundImagePath = (chosen == null ? void 0 : chosen.background_image_path) ?? null;
          const rootPath = (chosen == null ? void 0 : chosen.root_path) ?? path.dirname(latestFilePath);
          const createdAt = Number((chosen == null ? void 0 : chosen.created_at) ?? Date.now());
          const updatedAt = Date.now();
          const latestVersionId = latest.id;
          const dawFormat = getDawFormatFromPath(latestFilePath);
          const creationMode = (chosen == null ? void 0 : chosen.creation_mode) ?? "blank";
          const sourceTemplatePath = (chosen == null ? void 0 : chosen.source_template_path) ?? null;
          const sourceTemplateName = (chosen == null ? void 0 : chosen.source_template_name) ?? null;
          const projectTypeLabel = (chosen == null ? void 0 : chosen.project_type_label) ?? null;
          if (chosen) {
            updateTrack.run([
              groupKey,
              title,
              latestVersionId,
              latestFilePath,
              dawFormat,
              audioPath,
              backgroundImagePath,
              folderId,
              status,
              notes,
              trashed,
              updatedAt,
              trackId
            ]);
          } else {
            insertTrack.run([
              trackId,
              groupKey,
              title,
              latestVersionId,
              rootPath,
              latestFilePath,
              dawFormat,
              creationMode,
              sourceTemplatePath,
              sourceTemplateName,
              projectTypeLabel,
              audioPath,
              backgroundImagePath,
              folderId,
              status,
              notes,
              trashed,
              createdAt,
              updatedAt
            ]);
          }
          usedTrackIds.add(trackId);
          for (const version of groupVersions) {
            const versionId = version.id;
            const currentTrackId = version.track_id;
            if (currentTrackId !== trackId) {
              updateVersionTrack.run([trackId, versionId]);
            }
          }
        }
        if (usedTrackIds.size > 0) {
          const placeholders = Array.from(usedTrackIds).map(() => "?").join(",");
          db2.run(`DELETE FROM tracks WHERE id NOT IN (${placeholders})`, Array.from(usedTrackIds));
        }
        db2.run(
          `
          UPDATE tracks
          SET latest_version_id = (
            SELECT id FROM track_versions
            WHERE track_versions.track_id = tracks.id
            ORDER BY saved_at DESC
            LIMIT 1
          ),
          ableton_project_path = (
            SELECT file_path FROM track_versions
            WHERE track_versions.track_id = tracks.id
            ORDER BY saved_at DESC
            LIMIT 1
          )
          `
        );
        db2.run(
          `
          DELETE FROM tracks
          WHERE id NOT IN (SELECT DISTINCT track_id FROM track_versions)
          `
        );
        updateVersionTrack.finalize();
        updateTrack.finalize();
        insertTrack.finalize();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}
class ProjectCreatedOnDiskSyncError extends Error {
  constructor(message, payload) {
    super(message);
    __publicField(this, "projectId");
    __publicField(this, "projectFolderPath");
    __publicField(this, "projectFilePath");
    this.name = "ProjectCreatedOnDiskSyncError";
    this.projectId = payload.projectId;
    this.projectFolderPath = payload.projectFolderPath;
    this.projectFilePath = payload.projectFilePath;
  }
}
const STANDARD_PROJECT_FOLDERS = ["Samples", "Exports", "Stems", "Notes"];
function sanitizeProjectName(name) {
  const withoutInvalid = Array.from(name).map((char) => {
    const code = char.charCodeAt(0);
    if (code >= 0 && code <= 31) return " ";
    if ('<>:"/\\|?*'.includes(char)) return " ";
    return char;
  }).join("");
  return withoutInvalid.replace(/\s+/g, " ").trim();
}
async function ensureDirectoryExists(dirPath) {
  await promises.mkdir(dirPath, { recursive: true });
  const stat = await promises.stat(dirPath);
  if (!stat.isDirectory()) {
    throw new Error("Save location is not a directory.");
  }
}
async function ensureUniqueProjectFolder(root, baseName) {
  for (let index = 0; index < 500; index += 1) {
    const folderName = index === 0 ? baseName : `${baseName} (${index})`;
    const candidate = path.join(root, folderName);
    try {
      await promises.access(candidate);
      continue;
    } catch {
      return candidate;
    }
  }
  throw new Error("Could not resolve a unique project folder name.");
}
async function writeManifest(filePath, payload) {
  await promises.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}
function extensionForFormat(format) {
  return format;
}
async function createProject(input, deps) {
  var _a;
  const cleanName = sanitizeProjectName(input.projectName);
  if (!cleanName) {
    throw new Error("Project name is required.");
  }
  const saveRoot = path.resolve(input.saveTo);
  await ensureDirectoryExists(saveRoot);
  const mode = input.templateOptions.mode;
  const dawFormat = mode === "template" ? "als" : input.dawFormat;
  const extension = extensionForFormat(dawFormat);
  const projectFolderPath = await ensureUniqueProjectFolder(saveRoot, cleanName);
  await promises.mkdir(projectFolderPath, { recursive: true });
  const projectFilePath = path.join(projectFolderPath, `${cleanName}.${extension}`);
  if (mode === "template") {
    const templatePath = (_a = input.templateOptions.templatePath) == null ? void 0 : _a.trim();
    if (!templatePath) {
      throw new Error("Template is required for template mode.");
    }
    const resolvedTemplatePath = path.resolve(templatePath);
    const stat = await promises.stat(resolvedTemplatePath).catch(() => null);
    if (!stat || !stat.isFile()) {
      throw new Error("Selected template file could not be found.");
    }
    if (!resolvedTemplatePath.toLowerCase().endsWith(".als")) {
      throw new Error("Selected template must be an Ableton .als file.");
    }
    await promises.copyFile(resolvedTemplatePath, projectFilePath, promises.constants.COPYFILE_EXCL);
  } else {
    await promises.writeFile(projectFilePath, "", { flag: "wx" });
  }
  if (input.templateOptions.createStandardFolders) {
    await Promise.all(
      STANDARD_PROJECT_FOLDERS.map(
        (name) => promises.mkdir(path.join(projectFolderPath, name), { recursive: true })
      )
    );
  }
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const projectId = randomUUID();
  const templateSourcePath = mode === "template" ? path.resolve(input.templateOptions.templatePath ?? "") : null;
  const templateDisplayName = mode === "template" ? input.templateOptions.templateDisplayName ?? null : null;
  const projectTypeLabel = input.templateOptions.projectTypeLabel ?? null;
  await writeManifest(path.join(projectFolderPath, ".studio-vaulted.json"), {
    projectId,
    projectName: cleanName,
    createdAt: nowIso,
    mode,
    templateSourcePath,
    templateDisplayName,
    projectTypeLabel,
    dawFormat
  });
  const stats = await promises.stat(projectFilePath);
  const dbInput = {
    projectId,
    projectName: cleanName,
    rootPath: projectFolderPath,
    dawProjectPath: projectFilePath,
    dawFormat,
    folderId: input.folderId ?? null,
    status: input.initialStatus,
    creationMode: mode,
    sourceTemplatePath: templateSourcePath,
    sourceTemplateName: templateDisplayName,
    projectTypeLabel,
    fileSize: stats.size,
    savedAt: stats.mtimeMs
  };
  const createRecord = createProjectRecord;
  try {
    const track = await createRecord(dbInput);
    return {
      projectId,
      projectFolderPath,
      projectFilePath,
      createdFromTemplate: mode === "template",
      track
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";
    throw new ProjectCreatedOnDiskSyncError(
      `Project created on disk but failed to sync library: ${message}`,
      { projectId, projectFolderPath, projectFilePath }
    );
  }
}
async function readAbletonBpm(filePath) {
  return extractBpmFromAls(filePath);
}
const MAX_CONCURRENCY = 3;
const queue = [];
const queued = /* @__PURE__ */ new Set();
let active = 0;
function enqueueBpm(keys) {
  let added = 0;
  for (const key of keys) {
    if (queued.has(key)) continue;
    queued.add(key);
    queue.push(key);
    added += 1;
  }
  pump();
  return added;
}
function pump() {
  while (active < MAX_CONCURRENCY && queue.length > 0) {
    const key = queue.shift();
    if (!key) break;
    active += 1;
    processKey(key).catch(() => void 0).finally(() => {
      active -= 1;
      queued.delete(key);
      pump();
    });
  }
}
async function processKey(key) {
  const version = await findVersionByPath(key);
  if (!version) return;
  if (!version.filePath.toLowerCase().endsWith(".als")) return;
  if (version.bpm !== null && version.bpmSource === "als") return;
  const bpm = await readAbletonBpm(version.filePath);
  if (process.env.BPM_DEBUG === "1") {
    console.log("[bpm] queued", version.filePath, "->", bpm);
  }
  const updated = await updateVersionBpm(version.id, bpm, "auto");
  if (!updated) return;
  for (const win2 of BrowserWindow.getAllWindows()) {
    win2.webContents.send("bpmUpdated", { id: updated.id, bpm: updated.bpm });
  }
}
function toFolder(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}
async function run$1(sql, params = []) {
  await initDatabase();
  const db2 = getDb();
  return await new Promise((resolve, reject) => {
    db2.run(sql, params, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}
async function all(sql, params = []) {
  await initDatabase();
  const db2 = getDb();
  return await new Promise((resolve, reject) => {
    db2.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}
async function listFolders() {
  const rows = await all("SELECT * FROM folders ORDER BY updated_at DESC");
  return rows.map((row) => toFolder(row));
}
async function createFolder(name) {
  const now = Date.now();
  const id = randomUUID();
  await run$1(
    "INSERT INTO folders (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [id, name, now, now]
  );
  return listFolders();
}
async function renameFolder(id, name) {
  const now = Date.now();
  await run$1("UPDATE folders SET name = ?, updated_at = ? WHERE id = ?", [name, now, id]);
  return listFolders();
}
async function deleteFolder(id) {
  await run$1("UPDATE tracks SET folder_id = NULL WHERE folder_id = ?", [id]);
  await run$1("DELETE FROM folders WHERE id = ?", [id]);
  return listFolders();
}
function getNotesMediaRoot() {
  return path.join(app.getPath("userData"), "notes_media");
}
function getNotesMediaRootPath() {
  return getNotesMediaRoot();
}
function toTrackNote(row) {
  return {
    id: row.id,
    trackId: row.track_id,
    contentJson: row.content_json ?? '{"type":"doc","html":""}',
    plainTextPreview: row.plain_text_preview ?? "",
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}
function toNoteMedia(row) {
  return {
    id: row.id,
    noteId: row.note_id,
    type: row.type,
    filePath: row.file_path,
    originalName: row.original_name,
    sizeBytes: Number(row.size_bytes),
    createdAt: Number(row.created_at)
  };
}
async function run(sql, params = []) {
  await initDatabase();
  const db2 = getDb();
  return await new Promise((resolve, reject) => {
    db2.run(sql, params, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}
async function getRow(sql, params = []) {
  await initDatabase();
  const db2 = getDb();
  return await new Promise((resolve, reject) => {
    db2.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row ?? null);
    });
  });
}
async function allRows(sql, params = []) {
  await initDatabase();
  const db2 = getDb();
  return await new Promise((resolve, reject) => {
    db2.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows ?? []);
    });
  });
}
function sanitizeHtml(input) {
  return input.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "").replace(/on\w+="[^"]*"/gi, "").replace(/on\w+='[^']*'/gi, "");
}
function derivePlainTextPreview(contentJson, maxLength = 100) {
  try {
    const parsed = JSON.parse(contentJson);
    const html = typeof parsed.html === "string" ? parsed.html : "";
    const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return plain.slice(0, maxLength);
  } catch {
    return "";
  }
}
function normalizeContentJson(raw) {
  let html = "";
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.html === "string") {
      html = parsed.html;
    }
  } catch {
  }
  return JSON.stringify({
    type: "doc",
    version: 1,
    html: sanitizeHtml(html)
  });
}
async function getTrackNoteByTrackId(trackId) {
  if (!trackId) return null;
  const row = await getRow("SELECT * FROM track_notes WHERE track_id = ?", [trackId]);
  return row ? toTrackNote(row) : null;
}
async function createTrackNote(trackId) {
  const existing = await getTrackNoteByTrackId(trackId);
  if (existing) return existing;
  const now = Date.now();
  const noteId = randomUUID();
  const emptyContent = JSON.stringify({ type: "doc", version: 1, html: "" });
  await run(
    `
    INSERT INTO track_notes (id, track_id, content_json, plain_text_preview, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [noteId, trackId, emptyContent, "", now, now]
  );
  await ensureTrackMediaDir(trackId);
  const row = await getRow("SELECT * FROM track_notes WHERE id = ?", [noteId]);
  if (!row) throw new Error("Failed to create note.");
  return toTrackNote(row);
}
async function updateTrackNoteContent(trackId, contentJson) {
  const note = await createTrackNote(trackId);
  const normalized = normalizeContentJson(contentJson);
  const preview = derivePlainTextPreview(normalized);
  const now = Date.now();
  await run(
    "UPDATE track_notes SET content_json = ?, plain_text_preview = ?, updated_at = ? WHERE id = ?",
    [normalized, preview, now, note.id]
  );
  const updated = await getRow("SELECT * FROM track_notes WHERE id = ?", [note.id]);
  if (!updated) throw new Error("Failed to update note.");
  return toTrackNote(updated);
}
async function listNoteMedia(noteId) {
  if (!noteId) return [];
  const rows = await allRows(
    "SELECT * FROM note_media WHERE note_id = ? ORDER BY created_at DESC",
    [noteId]
  );
  return rows.map((row) => toNoteMedia(row));
}
async function ensureTrackMediaDir(trackId) {
  const dirPath = path.join(getNotesMediaRoot(), trackId);
  await promises.mkdir(dirPath, { recursive: true });
  return dirPath;
}
async function saveNoteMediaFile(params) {
  const note = await getRow("SELECT id, track_id FROM track_notes WHERE id = ?", [params.noteId]);
  if (!note || note.track_id !== params.trackId) {
    throw new Error("Note not found for track.");
  }
  const mediaId = randomUUID();
  const safeExt = params.extension.replace(/[^a-zA-Z0-9.]/g, "").replace(/^\.+/, "") || "bin";
  const fileName = `${Date.now()}-${mediaId}.${safeExt}`;
  const dirPath = await ensureTrackMediaDir(params.trackId);
  const filePath = path.join(dirPath, fileName);
  await promises.writeFile(filePath, params.bytes);
  const now = Date.now();
  await run(
    `
    INSERT INTO note_media (id, note_id, type, file_path, original_name, size_bytes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [mediaId, params.noteId, params.type, filePath, params.originalName, params.bytes.byteLength, now]
  );
  const created = await getRow("SELECT * FROM note_media WHERE id = ?", [mediaId]);
  if (!created) throw new Error("Failed to save note media metadata.");
  return toNoteMedia(created);
}
async function deleteNoteMedia(mediaId) {
  if (!mediaId) return { ok: false };
  const row = await getRow("SELECT * FROM note_media WHERE id = ?", [mediaId]);
  if (!row) return { ok: false };
  const media = toNoteMedia(row);
  await run("DELETE FROM note_media WHERE id = ?", [mediaId]);
  try {
    await promises.unlink(media.filePath);
  } catch {
  }
  return { ok: true };
}
async function renameNoteMedia(mediaId, originalName) {
  if (!mediaId) return { ok: false, error: "Media id is required." };
  const trimmed = originalName.trim();
  if (!trimmed) return { ok: false, error: "Name cannot be empty." };
  if (trimmed.length > 120) return { ok: false, error: "Name is too long." };
  const row = await getRow("SELECT * FROM note_media WHERE id = ?", [mediaId]);
  if (!row) return { ok: false, error: "Recording not found." };
  await run("UPDATE note_media SET original_name = ? WHERE id = ?", [trimmed, mediaId]);
  const updated = await getRow("SELECT * FROM note_media WHERE id = ?", [mediaId]);
  if (!updated) return { ok: false, error: "Failed to rename recording." };
  return { ok: true, media: toNoteMedia(updated) };
}
const PLANS = {
  free: {
    features: {
      notes: false,
      templates: false
    },
    limits: {
      folders: 3,
      groups: 3
    }
  },
  paid: {
    features: {
      notes: true,
      templates: true
    },
    limits: {
      folders: Infinity,
      groups: Infinity
    }
  }
};
const LICENSE_KEY_REGEX = /^SVL-[0-9A-F]{8}-[0-9A-F]{8}$/;
const APP_SECRET = "sv-2025-k9x#mLp!qR7nWz";
const LICENSE_SERVER_URL = typeof process !== "undefined" && process.env.LICENSE_SERVER_URL || "https://license.studiovaulted.com";
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1e3;
const LICENSE_FILE = "studio-vaulted.lic";
function getLicenseFilePath() {
  return path.join(app.getPath("userData"), LICENSE_FILE);
}
function xorObfuscate(input, secret) {
  return input.split("").map((char, i) => String.fromCharCode(char.charCodeAt(0) ^ secret.charCodeAt(i % secret.length))).join("");
}
function encode(data) {
  return Buffer.from(xorObfuscate(JSON.stringify(data), LICENSE_FILE)).toString("base64");
}
function decode(encoded) {
  try {
    const raw = Buffer.from(encoded, "base64").toString("utf8");
    return JSON.parse(xorObfuscate(raw, LICENSE_FILE));
  } catch {
    return null;
  }
}
function isStoredLicense(v) {
  return typeof v === "object" && v !== null && typeof v.key === "string" && typeof v.token === "string" && typeof v.machineId === "string" && typeof v.lastVerifiedAt === "number";
}
async function saveLicense(data) {
  await promises.writeFile(getLicenseFilePath(), encode(data), "utf8");
}
async function loadLicense() {
  try {
    const raw = await promises.readFile(getLicenseFilePath(), "utf8");
    const decoded = decode(raw.trim());
    return isStoredLicense(decoded) ? decoded : null;
  } catch {
    return null;
  }
}
async function clearLicense() {
  try {
    await promises.unlink(getLicenseFilePath());
  } catch {
  }
}
const MACHINE_ID_FILE = "machine.id";
function getMachineIdPath() {
  return path.join(app.getPath("userData"), MACHINE_ID_FILE);
}
let cached = null;
async function getMachineId() {
  if (cached) return cached;
  const filePath = getMachineIdPath();
  const useEncryption = safeStorage.isEncryptionAvailable();
  try {
    if (useEncryption) {
      const encrypted = await promises.readFile(filePath);
      cached = safeStorage.decryptString(encrypted);
    } else {
      cached = await promises.readFile(filePath, "utf8");
    }
    return cached;
  } catch {
    const id = crypto.randomUUID();
    try {
      if (useEncryption) {
        await promises.writeFile(filePath, safeStorage.encryptString(id));
      } else {
        await promises.writeFile(filePath, id, "utf8");
      }
    } catch (writeErr) {
      console.error("[machineId] Failed to persist machine ID:", writeErr);
    }
    cached = id;
    return id;
  }
}
async function post(endpoint, body) {
  const res = await fetch(`${LICENSE_SERVER_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(1e4)
  });
  if (!res.ok) throw new Error(`License server returned HTTP ${res.status}`);
  return res.json();
}
function apiActivate(key, machineId) {
  return post("/activate", { key, machineId });
}
function apiDeactivate(key, machineId, token) {
  return post("/deactivate", { key, machineId, token });
}
function apiVerify(key, machineId, token) {
  return post("/verify", { key, machineId, token });
}
let currentPlan = "free";
let activatedKey = null;
function maskKey(key) {
  const parts = key.split("-");
  if (parts.length !== 3) return "***";
  return `${parts[0]}-${parts[1]}-********`;
}
function validateKeyFormat(key) {
  return LICENSE_KEY_REGEX.test(key.trim().toUpperCase());
}
function validateKeySignature(key) {
  const normalized = key.trim().toUpperCase();
  const parts = normalized.split("-");
  if (parts.length !== 3) return false;
  const [, nonce, sig] = parts;
  const expected = crypto.createHmac("sha256", APP_SECRET).update(nonce).digest("hex").substring(0, 8).toUpperCase();
  return sig === expected;
}
async function initLicense() {
  const stored = await loadLicense();
  if (!stored) {
    currentPlan = "free";
    activatedKey = null;
    return;
  }
  if (!validateKeyFormat(stored.key) || !validateKeySignature(stored.key)) {
    currentPlan = "free";
    activatedKey = null;
    await clearLicense();
    return;
  }
  const age = Date.now() - stored.lastVerifiedAt;
  if (age <= OFFLINE_GRACE_MS) {
    currentPlan = "paid";
    activatedKey = stored.key;
    return;
  }
  try {
    const result = await apiVerify(stored.key, stored.machineId, stored.token);
    if (result.valid) {
      await saveLicense({ ...stored, lastVerifiedAt: Date.now() });
      currentPlan = "paid";
      activatedKey = stored.key;
    } else {
      currentPlan = "free";
      activatedKey = null;
      await clearLicense();
    }
  } catch {
    currentPlan = "paid";
    activatedKey = stored.key;
  }
}
async function activateLicense(key) {
  const normalized = key.trim().toUpperCase();
  if (!validateKeyFormat(normalized)) {
    return { success: false, error: "Invalid key format. Expected SVL-XXXXXXXX-YYYYYYYY." };
  }
  if (!validateKeySignature(normalized)) {
    return { success: false, error: "License key is not valid." };
  }
  let machineId;
  try {
    machineId = await getMachineId();
  } catch {
    return { success: false, error: "Could not identify this machine. Please try again." };
  }
  if (process.env.NODE_ENV === "development") {
    await saveLicense({ key: normalized, token: "dev-token", machineId, lastVerifiedAt: Date.now() });
    currentPlan = "paid";
    activatedKey = normalized;
    return { success: true };
  }
  try {
    const result = await apiActivate(normalized, machineId);
    if (!result.success || !result.token) {
      return { success: false, error: result.error ?? "Activation failed." };
    }
    await saveLicense({ key: normalized, token: result.token, machineId, lastVerifiedAt: Date.now() });
    currentPlan = "paid";
    activatedKey = normalized;
    return { success: true };
  } catch {
    return {
      success: false,
      error: "Could not reach the activation server. Check your internet connection and try again."
    };
  }
}
async function deactivateLicense() {
  const stored = await loadLicense();
  if (stored) {
    try {
      await apiDeactivate(stored.key, stored.machineId, stored.token);
    } catch {
    }
  }
  await clearLicense();
  currentPlan = "free";
  activatedKey = null;
}
function getLicenseStatus() {
  const plan = PLANS[currentPlan];
  return {
    plan: currentPlan,
    activatedKey: activatedKey ? maskKey(activatedKey) : null,
    features: { ...plan.features },
    limits: { ...plan.limits }
  };
}
const DEBUG_AUDIO = process.env.DEBUG_AUDIO === "1";
const AUDIO_EXTS = /* @__PURE__ */ new Set([".mp3", ".wav", ".aiff", ".aif", ".m4a", ".flac", ".webm", ".ogg", ".opus"]);
const IMAGE_EXTS = /* @__PURE__ */ new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".svg"]);
let libraryRoots = [];
let scanRootInFlight = null;
let scanRootInFlightKey = null;
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = path.dirname(__filename$1);
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
function createWindow() {
  const pngIcon = path.join(process.env.VITE_PUBLIC, "Studio-vaulted-icon-1.png");
  const icoIcon = path.join(process.env.VITE_PUBLIC, "Studio-vaulted-icon-1.ico");
  const iconPath = process.platform === "win32" && existsSync(icoIcon) ? icoIcon : pngIcon;
  win = new BrowserWindow({
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname$1, "preload.mjs")
    }
  });
  win.maximize();
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
function isPathInRoots(filePath, roots) {
  if (roots.length === 0) return false;
  const resolved = path.resolve(filePath);
  return roots.some((root) => {
    const resolvedRoot = path.resolve(root);
    if (process.platform === "win32") {
      return resolved.toLowerCase().startsWith(resolvedRoot.toLowerCase() + path.sep);
    }
    return resolved.startsWith(resolvedRoot + path.sep);
  });
}
function isPathInsideRoot(filePath, root) {
  const resolved = path.resolve(filePath);
  const resolvedRoot = path.resolve(root);
  if (process.platform === "win32") {
    const lower = resolved.toLowerCase();
    const lowerRoot = resolvedRoot.toLowerCase();
    return lower === lowerRoot || lower.startsWith(lowerRoot + path.sep);
  }
  return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
}
async function registerAudioProtocol() {
  protocol.registerFileProtocol("app", async (request, callback) => {
    try {
      const url = new URL(request.url);
      const filePath = url.searchParams.get("path");
      if (!filePath) {
        callback({ error: -6 });
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      if (url.hostname === "media") {
        if (!IMAGE_EXTS.has(ext)) {
          callback({ error: -6 });
          return;
        }
        const notesRoot = getNotesMediaRootPath();
        if (!isPathInsideRoot(filePath, notesRoot)) {
          callback({ error: -6 });
          return;
        }
        await promises.access(filePath);
        callback({ path: filePath });
        return;
      }
      if (url.hostname === "audio") {
        if (!AUDIO_EXTS.has(ext)) {
          callback({ error: -6 });
          return;
        }
        if (!isPathInRoots(filePath, libraryRoots)) {
          const notesRoot = getNotesMediaRootPath();
          if (isPathInsideRoot(filePath, notesRoot)) {
            await promises.access(filePath);
            callback({ path: filePath });
            return;
          }
          if (DEBUG_AUDIO) {
            console.warn("[audio] blocked path outside roots", filePath);
          }
          callback({ error: -6 });
          return;
        }
        await promises.access(filePath);
        callback({ path: filePath });
        return;
      }
      callback({ error: -6 });
    } catch (error) {
      if (DEBUG_AUDIO) {
        console.warn("[audio] protocol error", error);
      }
      callback({ error: -6 });
    }
  });
}
async function runRootScan(options) {
  const settings = await getSettings();
  const rootInput = (options == null ? void 0 : options.root) ?? settings.projectRootDir;
  if (!rootInput) {
    console.warn("[scanRoot] root-not-set: no project root configured");
    return {
      tracks: await listTracks(),
      found: 0,
      settings,
      error: "root-not-set"
    };
  }
  const resolvedRoot = path.resolve(rootInput);
  const recursive = (options == null ? void 0 : options.scanSubfolders) ?? settings.scanSubfolders;
  try {
    const rootStat = await promises.stat(resolvedRoot);
    if (!rootStat.isDirectory()) {
      console.warn("[scanRoot] root-not-directory:", resolvedRoot);
      return {
        tracks: await listTracks(),
        found: 0,
        settings,
        error: "root-not-directory"
      };
    }
  } catch (error) {
    const nodeError = error;
    if ((nodeError == null ? void 0 : nodeError.code) === "EACCES" || (nodeError == null ? void 0 : nodeError.code) === "EPERM") {
      console.warn("[scanRoot] root-permission-denied:", resolvedRoot, nodeError == null ? void 0 : nodeError.code);
      return {
        tracks: await listTracks(),
        found: 0,
        settings,
        error: "root-permission-denied"
      };
    }
    console.warn("[scanRoot] root-missing:", resolvedRoot, (nodeError == null ? void 0 : nodeError.code) ?? "unknown");
    return {
      tracks: await listTracks(),
      found: 0,
      settings,
      error: "root-missing"
    };
  }
  try {
    await promises.access(resolvedRoot, promises.constants.R_OK);
  } catch (error) {
    const nodeError = error;
    if ((nodeError == null ? void 0 : nodeError.code) === "EACCES" || (nodeError == null ? void 0 : nodeError.code) === "EPERM") {
      console.warn("[scanRoot] scan-permission-denied:", resolvedRoot, nodeError == null ? void 0 : nodeError.code);
      return {
        tracks: await listTracks(),
        found: 0,
        settings,
        error: "root-permission-denied"
      };
    }
    console.warn("[scanRoot] scan-failed-access:", resolvedRoot, (nodeError == null ? void 0 : nodeError.code) ?? "unknown");
    return {
      tracks: await listTracks(),
      found: 0,
      settings,
      error: "scan-failed"
    };
  }
  libraryRoots = [resolvedRoot];
  const scanned = await scanAbletonProjects(resolvedRoot, {
    recursive,
    maxDepth: 8
  });
  console.info(
    "[scanRoot] scan-complete:",
    JSON.stringify({ root: resolvedRoot, recursive, found: scanned.length })
  );
  const tracks = await upsertScanResults(
    scanned.map((item) => ({
      name: item.displayName,
      filePath: item.filePath,
      ext: "als",
      lastModifiedMs: item.modifiedTime,
      fileSize: item.fileSize
    }))
  );
  const latestAlsPaths = tracks.map((entry) => {
    var _a;
    return (_a = entry.latestVersion) == null ? void 0 : _a.filePath;
  }).filter(
    (filePath) => typeof filePath === "string" && filePath.toLowerCase().endsWith(".als")
  );
  if (latestAlsPaths.length > 0) {
    enqueueBpm(latestAlsPaths);
  }
  const nextSettings = await updateSettings({
    projectRootDir: resolvedRoot,
    scanSubfolders: recursive,
    lastScanAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  return {
    tracks,
    found: scanned.length,
    settings: nextSettings
  };
}
function extensionFromMimeType(mimeType, fallbackName) {
  const lower = mimeType.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("gif")) return "gif";
  if (lower.includes("wav")) return "wav";
  if (lower.includes("ogg")) return "ogg";
  if (lower.includes("webm")) return "webm";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
  const fromName = path.extname(fallbackName).replace(".", "").toLowerCase();
  return fromName || "bin";
}
ipcMain.handle("pickFolders", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "multiSelections"]
  });
  if (result.canceled) return [];
  libraryRoots = result.filePaths;
  return result.filePaths;
});
ipcMain.handle("settings:getAll", async () => {
  return getSettings();
});
ipcMain.handle("settings:update", async (_event, patch) => {
  return updateSettings(patch ?? {});
});
ipcMain.handle("settings:chooseDirectory", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});
ipcMain.handle("templates:list", async () => {
  const settings = await getSettings();
  return discoverTemplates(settings);
});
ipcMain.handle("templates:refresh", async () => {
  const settings = await getSettings();
  return discoverTemplates(settings);
});
ipcMain.handle("templates:chooseFolder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});
ipcMain.handle("pickAudioFile", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "Audio", extensions: Array.from(AUDIO_EXTS).map((ext) => ext.slice(1)) }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { path: null };
  }
  const filePath = result.filePaths[0];
  if (!isPathInRoots(filePath, libraryRoots)) {
    if (DEBUG_AUDIO) {
      console.warn("[audio] selected file outside roots", filePath);
    }
    return { path: null, reason: "outside-roots" };
  }
  return { path: filePath };
});
ipcMain.handle("scanProjects", async (_event, roots) => {
  if (!Array.isArray(roots)) return [];
  libraryRoots = roots;
  const hits = await scanForProjects(roots, { maxDepth: 6 });
  const tracks = await upsertScanResults(hits);
  const latestAlsPaths = tracks.map((entry) => {
    var _a;
    return (_a = entry.latestVersion) == null ? void 0 : _a.filePath;
  }).filter(
    (filePath) => typeof filePath === "string" && filePath.toLowerCase().endsWith(".als")
  );
  if (latestAlsPaths.length > 0) {
    enqueueBpm(latestAlsPaths);
  }
  return tracks;
});
ipcMain.handle(
  "projects:scanRoot",
  async (_event, options) => {
    const settings = await getSettings();
    const requestedRoot = (options == null ? void 0 : options.root) ?? settings.projectRootDir ?? "";
    const requestedRecursive = (options == null ? void 0 : options.scanSubfolders) ?? settings.scanSubfolders;
    const requestKey = JSON.stringify({
      root: path.resolve(requestedRoot || "."),
      scanSubfolders: requestedRecursive
    });
    if (scanRootInFlight) {
      if (scanRootInFlightKey === requestKey) {
        return scanRootInFlight;
      }
      await scanRootInFlight.catch(() => void 0);
    }
    scanRootInFlightKey = requestKey;
    scanRootInFlight = runRootScan(options).catch(async (error) => {
      const nodeError = error;
      console.error("[scanRoot] unhandled error:", (nodeError == null ? void 0 : nodeError.message) ?? error);
      const settings2 = await getSettings();
      return {
        tracks: await listTracks(),
        found: 0,
        settings: settings2,
        error: (nodeError == null ? void 0 : nodeError.code) === "EACCES" || (nodeError == null ? void 0 : nodeError.code) === "EPERM" ? "scan-permission-denied" : "scan-failed"
      };
    }).finally(() => {
      scanRootInFlight = null;
      scanRootInFlightKey = null;
    });
    return scanRootInFlight;
  }
);
ipcMain.handle(
  "projects:create",
  async (_event, input) => {
    try {
      const result = await createProject(input);
      const resolvedRoot = path.resolve(input.saveTo);
      if (!libraryRoots.some((root) => path.resolve(root) === resolvedRoot)) {
        libraryRoots = [resolvedRoot];
      }
      if (input.templateOptions.rememberRecentTemplate && input.templateOptions.templatePath) {
        await updateSettings({
          recentTemplatePaths: [
            path.resolve(input.templateOptions.templatePath),
            ...(await getSettings()).recentTemplatePaths
          ]
        });
      }
      if (input.templateOptions.saveAsDefaults) {
        await updateSettings({
          newProjectDefaults: {
            createStandardFolders: input.templateOptions.createStandardFolders,
            openAfterCreate: input.templateOptions.openAfterCreate,
            lastUsedTemplatePath: input.templateOptions.mode === "template" ? input.templateOptions.templatePath ?? null : null
          }
        });
      }
      if (input.templateOptions.openAfterCreate) {
        await shell.openPath(result.projectFilePath);
      }
      return { ok: true, result };
    } catch (error) {
      if (error instanceof ProjectCreatedOnDiskSyncError) {
        return {
          ok: false,
          error: error.message,
          createdOnDisk: true,
          projectId: error.projectId,
          projectFolderPath: error.projectFolderPath,
          projectFilePath: error.projectFilePath
        };
      }
      const message = error instanceof Error ? error.message : "Failed to create project.";
      return {
        ok: false,
        error: message,
        createdOnDisk: false
      };
    }
  }
);
ipcMain.handle(
  "createProject",
  async (_event, legacyInput) => {
    const input = {
      projectName: legacyInput.name,
      saveTo: legacyInput.root,
      dawFormat: legacyInput.extension,
      folderId: legacyInput.folderId ?? null,
      initialStatus: legacyInput.status ?? "Idea",
      templateOptions: {
        mode: "blank",
        createStandardFolders: true,
        openAfterCreate: false,
        rememberRecentTemplate: false,
        saveAsDefaults: false
      }
    };
    try {
      const response = await createProject(input);
      return response.track;
    } catch {
      return null;
    }
  }
);
ipcMain.handle("projects:chooseSaveDirectory", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});
ipcMain.handle("notes:getByTrackId", async (_event, trackId) => {
  if (!trackId) return null;
  const note = await getTrackNoteByTrackId(trackId);
  if (!note) return null;
  const media = await listNoteMedia(note.id);
  return { note, media };
});
ipcMain.handle("notes:createForTrack", async (_event, trackId) => {
  if (!trackId) return null;
  const note = await createTrackNote(trackId);
  const media = await listNoteMedia(note.id);
  return { note, media };
});
ipcMain.handle("notes:updateContent", async (_event, payload) => {
  if (!(payload == null ? void 0 : payload.trackId)) return null;
  const note = await updateTrackNoteContent(payload.trackId, payload.contentJson ?? "");
  return note;
});
ipcMain.handle(
  "notes:attachImage",
  async (_event, payload) => {
    var _a;
    if (!(payload == null ? void 0 : payload.noteId) || !(payload == null ? void 0 : payload.trackId) || !(payload == null ? void 0 : payload.bytes)) {
      return { ok: false, error: "Invalid image payload." };
    }
    if (!((_a = payload.mimeType) == null ? void 0 : _a.toLowerCase().startsWith("image/"))) {
      return { ok: false, error: "Only image attachments are supported." };
    }
    const media = await saveNoteMediaFile({
      trackId: payload.trackId,
      noteId: payload.noteId,
      type: "image",
      originalName: payload.originalName || "image",
      bytes: payload.bytes,
      extension: extensionFromMimeType(payload.mimeType, payload.originalName)
    });
    return { ok: true, media };
  }
);
ipcMain.handle("notes:listMedia", async (_event, noteId) => {
  if (!noteId) return [];
  return listNoteMedia(noteId);
});
ipcMain.handle("notes:deleteMedia", async (_event, mediaId) => {
  if (!mediaId) return { ok: false };
  return deleteNoteMedia(mediaId);
});
ipcMain.handle(
  "notes:renameMedia",
  async (_event, payload) => {
    if (!(payload == null ? void 0 : payload.mediaId)) return { ok: false, error: "Media id is required." };
    return renameNoteMedia(payload.mediaId, payload.originalName ?? "");
  }
);
ipcMain.handle(
  "notes:saveVoiceRecording",
  async (_event, payload) => {
    if (!(payload == null ? void 0 : payload.noteId) || !(payload == null ? void 0 : payload.trackId) || !(payload == null ? void 0 : payload.bytes)) {
      return { ok: false, error: "Invalid recording payload." };
    }
    const media = await saveNoteMediaFile({
      trackId: payload.trackId,
      noteId: payload.noteId,
      type: "audio",
      originalName: payload.originalName || "recording.webm",
      bytes: payload.bytes,
      extension: extensionFromMimeType(payload.mimeType || "", payload.originalName || "")
    });
    return { ok: true, media };
  }
);
ipcMain.handle("getTracks", async () => {
  return listTracks();
});
ipcMain.handle("getTracksByFolder", async (_event, folderId) => {
  if (!folderId) return listTracks();
  return listTracksByFolder(folderId);
});
ipcMain.handle("getTrashedTracks", async () => {
  return listTrashedTracks();
});
ipcMain.handle("upsertTracks", async () => {
  return listTracks();
});
ipcMain.handle("setTrackBpm", async (_event, id, bpm) => {
  await setTrackBpm(id, bpm);
  return null;
});
ipcMain.handle("setTrackFolder", async (_event, id, folderId) => {
  return setTrackFolder(id, folderId);
});
ipcMain.handle("setTrackStatus", async (_event, id, status) => {
  if (!id || !status) return null;
  return setTrackStatus(id, status);
});
ipcMain.handle("setTrackGenre", async (_event, id, genre) => {
  if (!id) return null;
  return setTrackGenre(id, genre ?? null);
});
ipcMain.handle("setTrackAudioPath", async (_event, id, audioPath) => {
  if (!id) return null;
  return setTrackAudioPath(id, audioPath ?? null);
});
ipcMain.handle("openProjectPath", async (_event, filePath) => {
  if (!filePath) return { ok: false };
  const parsed = parseAbletonVersionFile(filePath);
  let targetPath = filePath;
  if (parsed) {
    const canonical = path.join(path.dirname(filePath), `${parsed.baseName}.als`);
    if (existsSync(canonical)) {
      targetPath = canonical;
    }
  }
  const result = await shell.openPath(targetPath);
  return { ok: result === "", error: result || null };
});
ipcMain.handle("revealProjectPath", async (_event, filePath) => {
  if (!filePath) return { ok: false };
  shell.showItemInFolder(filePath);
  return { ok: true };
});
ipcMain.handle("system:openPath", async (_event, targetPath) => {
  if (!targetPath) return { ok: false };
  const result = await shell.openPath(targetPath);
  return { ok: result === "", error: result || null };
});
ipcMain.handle("moveToTrash", async (_event, ids) => {
  if (!Array.isArray(ids)) return listTracks();
  return moveToTrash(ids);
});
ipcMain.handle("restoreTracks", async (_event, ids) => {
  if (!Array.isArray(ids)) return listTracks();
  return restoreTracks(ids);
});
ipcMain.handle("purgeTracks", async (_event, ids) => {
  if (!Array.isArray(ids)) return listTracks();
  return purgeTracks(ids);
});
ipcMain.handle("computeBpmForTracks", async (_event, idsOrPaths) => {
  if (!Array.isArray(idsOrPaths)) return { queued: 0 };
  const queued2 = enqueueBpm(idsOrPaths);
  return { queued: queued2 };
});
ipcMain.handle("updateTrackBpm", async (_event, id, bpm) => {
  await setTrackBpm(id, bpm);
  return null;
});
ipcMain.handle("listFolders", async () => {
  return listFolders();
});
ipcMain.handle("createFolder", async (_event, name) => {
  if (!name) return listFolders();
  return createFolder(name);
});
ipcMain.handle("renameFolder", async (_event, id, name) => {
  if (!id || !name) return listFolders();
  return renameFolder(id, name);
});
ipcMain.handle("deleteFolder", async (_event, id) => {
  if (!id) return listFolders();
  return deleteFolder(id);
});
ipcMain.handle("listTrackVersions", async (_event, trackId) => {
  if (!trackId) return [];
  return listTrackVersions(trackId);
});
ipcMain.handle("setLatestVersion", async (_event, trackId, versionId) => {
  var _a;
  if (!trackId || !versionId) return null;
  const updated = await setLatestVersion(trackId, versionId);
  const latestPath = (_a = updated == null ? void 0 : updated.latestVersion) == null ? void 0 : _a.filePath;
  if (latestPath && latestPath.toLowerCase().endsWith(".als")) {
    enqueueBpm([latestPath]);
  }
  return updated;
});
ipcMain.handle("debugComputeBpmForFileName", async (_event, fileName) => {
  if (!fileName) return null;
  const updated = await debugComputeBpmForFileName(fileName);
  if (updated) {
    for (const window2 of BrowserWindow.getAllWindows()) {
      window2.webContents.send("bpmUpdated", { id: updated.id, bpm: updated.bpm });
    }
  }
  return updated;
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
ipcMain.handle("license:getStatus", () => {
  return getLicenseStatus();
});
ipcMain.handle("license:activate", async (_event, key) => {
  return activateLicense(key);
});
ipcMain.handle("license:deactivate", async () => {
  await deactivateLicense();
  return { success: true };
});
app.whenReady().then(async () => {
  await initLicense();
  const settings = await getSettings();
  if (settings.projectRootDir) {
    libraryRoots = [settings.projectRootDir];
  }
  await registerAudioProtocol();
  createWindow();
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
