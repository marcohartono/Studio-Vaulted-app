var en = Object.defineProperty;
var tn = (e, t, n) => t in e ? en(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : e[t] = n;
var ce = (e, t, n) => tn(e, typeof t != "symbol" ? t + "" : t, n);
import { app as U, BrowserWindow as he, safeStorage as Ne, protocol as at, ipcMain as g, dialog as re, shell as me } from "electron";
import { fileURLToPath as nn } from "node:url";
import d from "node:path";
import { promises as T, existsSync as ct } from "node:fs";
import rn from "node:os";
import lt, { randomUUID as O } from "node:crypto";
import sn from "sqlite3";
import { gunzip as on } from "node:zlib";
import { promisify as an } from "node:util";
const cn = /* @__PURE__ */ new Set([".als", ".flp", ".ptx"]), ln = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "library",
  "system volume information",
  "$recycle.bin"
]);
async function un(e, t = {}) {
  const n = t.maxDepth ?? 6, r = t.maxConcurrency ?? 8, s = [], i = e.map((c) => ({
    dirPath: c,
    depth: 0
  }));
  if (i.length === 0)
    return s;
  let a = 0;
  return await new Promise((c) => {
    const o = () => {
      for (; a < r && i.length > 0; ) {
        const l = i.shift();
        if (!l) break;
        a += 1, u(l.dirPath, l.depth).catch(() => {
        }).finally(() => {
          if (a -= 1, i.length === 0 && a === 0) {
            c(s);
            return;
          }
          o();
        });
      }
    }, u = async (l, f) => {
      let m;
      try {
        m = await T.readdir(l, { withFileTypes: !0 });
      } catch {
        return;
      }
      for (const p of m) {
        const E = d.join(l, p.name), _ = p.name.toLowerCase();
        if (p.isDirectory()) {
          if (ln.has(_))
            continue;
          if (_.endsWith(".logicx")) {
            const y = await Qe(E, p.name, ".logicx");
            y && s.push(y);
            continue;
          }
          if (f >= n)
            continue;
          i.push({ dirPath: E, depth: f + 1 });
          continue;
        }
        if (!p.isFile())
          continue;
        const N = d.extname(p.name).toLowerCase();
        if (!cn.has(N) || N === ".flp" && (_.includes("(overwritten") || _.includes("(autosaved")))
          continue;
        const v = await Qe(E, p.name, N);
        v && s.push(v);
      }
    };
    o();
  });
}
async function Qe(e, t, n) {
  try {
    const r = await T.stat(e);
    return {
      name: n === ".logicx" ? t.slice(0, -n.length) : d.basename(t, n),
      filePath: e,
      ext: n.replace(".", ""),
      lastModifiedMs: r.mtimeMs,
      fileSize: r.size
    };
  } catch {
    return null;
  }
}
const dn = /^(.*?)[\s_-]*\[(\d{4})\s(\d{2})\s(\d{2})\s(\d{6})\]\.als$/i;
function Y(e) {
  const n = d.basename(e).match(dn);
  if (!n) return null;
  const r = n[1].trim(), s = Number(n[2]), i = Number(n[3]), a = Number(n[4]), c = n[5];
  if (!r || c.length !== 6) return null;
  const o = Number(c.slice(0, 2)), u = Number(c.slice(2, 4)), l = Number(c.slice(4, 6));
  if (!Number.isFinite(s) || !Number.isFinite(i) || !Number.isFinite(a) || !Number.isFinite(o) || !Number.isFinite(u) || !Number.isFinite(l))
    return null;
  const f = new Date(s, i - 1, a, o, u, l).getTime();
  return Number.isFinite(f) ? { baseName: r, versionTimestampMs: f } : null;
}
function ut(e) {
  const n = d.basename(e).match(/^(.*)\s\(([^)]+)\)\.flp$/i);
  if (!n) return null;
  const r = n[2].toLowerCase();
  if (r.includes("overwritten") || r.includes("autosaved"))
    return null;
  const s = n[1].trim();
  return s ? { baseName: s } : null;
}
function fn(e) {
  let t = e.toLowerCase().trim();
  t = t.replace(/[_\-.]+/g, " "), t = t.replace(/\s+/g, " ").trim();
  const n = [
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
  let r = t, s = !0;
  for (; s; ) {
    s = !1;
    for (const i of n) {
      const a = r.replace(i, "").trim();
      a !== r && (r = a, s = !0);
    }
    r = r.replace(/\s+/g, " ").trim();
  }
  return r;
}
function K(e) {
  const t = d.dirname(e), n = Y(e), r = ut(e), s = n ? n.baseName : r ? r.baseName : d.basename(e, d.extname(e)), i = fn(s);
  return `${t}::${i}`;
}
function ue(e) {
  const t = Y(e), n = ut(e), r = t ? t.baseName : n ? n.baseName : d.basename(e, d.extname(e)), s = r.replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim(), i = [
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
  let a = s, c = !0;
  for (; c; ) {
    c = !1;
    for (const o of i) {
      const u = a.replace(o, "").trim();
      u !== a && (a = u, c = !0);
    }
    a = a.replace(/\s+/g, " ").trim();
  }
  return a || s || r;
}
const pn = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  ".idea",
  ".next",
  "dist",
  "build"
]);
function hn(e) {
  return e.replace(/\s*\[\d{4}\s\d{2}\s\d{2}\s\d{6}\]\s*$/i, "").trim();
}
function mn(e) {
  return !e || e.startsWith(".") ? !0 : pn.has(e.toLowerCase());
}
async function gn(e, t) {
  const n = t.maxDepth, r = [], s = d.resolve(e), i = async (a, c) => {
    let o;
    try {
      o = await T.readdir(a, { withFileTypes: !0, encoding: "utf8" });
    } catch {
      return;
    }
    for (const u of o) {
      const l = u.name, f = d.join(a, l);
      if (u.isDirectory()) {
        if (!t.recursive || c >= n || mn(l))
          continue;
        await i(f, c + 1);
        continue;
      }
      if (u.isFile() && !l.startsWith(".") && l.toLowerCase().endsWith(".als"))
        try {
          const m = await T.stat(f), p = hn(
            d.basename(l, d.extname(l))
          );
          r.push({
            filePath: f,
            displayName: p || d.basename(l, ".als"),
            modifiedTime: m.mtimeMs,
            folderPath: d.dirname(f),
            fileSize: m.size
          });
        } catch {
        }
    }
  };
  return await i(s, 0), r;
}
const B = {
  projectRootDir: null,
  scanSubfolders: !0,
  lastScanAt: null,
  recentProjectRoots: [],
  templateRootDirs: [],
  scanTemplateSubfolders: !0,
  recentTemplatePaths: [],
  newProjectDefaults: {
    createStandardFolders: !0,
    openAfterCreate: !1,
    lastUsedTemplatePath: null
  }
};
let we = Promise.resolve();
function dt() {
  return d.join(U.getPath("userData"), "studio-vaulted-settings.json");
}
function En(e) {
  if (!Array.isArray(e)) return [];
  const t = /* @__PURE__ */ new Set();
  for (const n of e) {
    if (typeof n != "string") continue;
    const r = n.trim();
    if (r && (t.add(d.resolve(r)), t.size >= 5))
      break;
  }
  return Array.from(t);
}
function Tn(e) {
  if (!Array.isArray(e)) return [];
  const t = /* @__PURE__ */ new Set();
  for (const n of e) {
    if (typeof n != "string") continue;
    const r = n.trim();
    if (r && (t.add(d.resolve(r)), t.size >= 10))
      break;
  }
  return Array.from(t);
}
function _n(e) {
  if (!Array.isArray(e)) return [];
  const t = /* @__PURE__ */ new Set();
  for (const n of e) {
    if (typeof n != "string") continue;
    const r = n.trim();
    r && t.add(d.resolve(r));
  }
  return Array.from(t);
}
function ft(e) {
  if (!e || typeof e != "object")
    return { ...B };
  const t = e, n = t.projectRootDir, r = typeof n == "string" && n.trim().length > 0 ? d.resolve(n) : null, s = typeof t.scanSubfolders == "boolean" ? t.scanSubfolders : B.scanSubfolders, i = typeof t.lastScanAt == "string" && t.lastScanAt.trim().length > 0 ? t.lastScanAt : null, a = En(t.recentProjectRoots), c = _n(t.templateRootDirs), o = typeof t.scanTemplateSubfolders == "boolean" ? t.scanTemplateSubfolders : B.scanTemplateSubfolders, u = Tn(t.recentTemplatePaths), l = t.newProjectDefaults && typeof t.newProjectDefaults == "object" ? t.newProjectDefaults : {}, f = typeof l.createStandardFolders == "boolean" ? l.createStandardFolders : B.newProjectDefaults.createStandardFolders, m = typeof l.openAfterCreate == "boolean" ? l.openAfterCreate : B.newProjectDefaults.openAfterCreate, p = l.lastUsedTemplatePath, E = typeof p == "string" && p.trim().length > 0 ? d.resolve(p) : null;
  r && !a.includes(r) && a.unshift(r);
  const _ = u.filter((N) => N !== E);
  return E && _.unshift(E), {
    projectRootDir: r,
    scanSubfolders: s,
    lastScanAt: i,
    recentProjectRoots: a.slice(0, 5),
    templateRootDirs: c,
    scanTemplateSubfolders: o,
    recentTemplatePaths: _.slice(0, 10),
    newProjectDefaults: {
      createStandardFolders: f,
      openAfterCreate: m,
      lastUsedTemplatePath: E
    }
  };
}
async function Ae(e, t) {
  const n = d.dirname(e);
  await T.mkdir(n, { recursive: !0 });
  const r = `${e}.tmp-${process.pid}-${Date.now()}`;
  await T.writeFile(r, t, "utf8"), await T.rename(r, e);
}
async function Nn(e) {
  try {
    const t = `${d.basename(e, ".json")}.corrupt-${Date.now()}.json`, n = d.join(d.dirname(e), t);
    await T.rename(e, n);
  } catch {
  }
}
async function x() {
  const e = dt();
  try {
    const t = await T.readFile(e, "utf8");
    return ft(JSON.parse(t));
  } catch (t) {
    const n = t;
    if ((n == null ? void 0 : n.code) === "ENOENT") {
      const s = { ...B };
      return await Ae(e, JSON.stringify(s, null, 2)), s;
    }
    await Nn(e);
    const r = { ...B };
    return await Ae(e, JSON.stringify(r, null, 2)), r;
  }
}
async function de(e) {
  const t = await x(), n = ft({ ...t, ...e });
  n.projectRootDir && (n.recentProjectRoots = [
    n.projectRootDir,
    ...n.recentProjectRoots.filter((s) => s !== n.projectRootDir)
  ].slice(0, 5)), n.newProjectDefaults.lastUsedTemplatePath && (n.recentTemplatePaths = [
    n.newProjectDefaults.lastUsedTemplatePath,
    ...n.recentTemplatePaths.filter(
      (s) => s !== n.newProjectDefaults.lastUsedTemplatePath
    )
  ].slice(0, 10));
  const r = dt();
  return we = we.then(
    () => Ae(r, JSON.stringify(n, null, 2))
  ), await we, n;
}
const wn = /* @__PURE__ */ new Set([
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
function bn(e) {
  return d.basename(e, d.extname(e)).replace(/\s*\[\d{4}\s\d{2}\s\d{2}\s\d{6}\]\s*$/i, "").trim();
}
function yn(e) {
  return !e || e.startsWith(".") ? !0 : wn.has(e.toLowerCase());
}
function vn(e) {
  const t = /* @__PURE__ */ new Set(), n = [];
  for (const r of e) {
    const s = r.trim();
    if (!s) continue;
    const i = d.resolve(s);
    t.has(i) || (t.add(i), n.push(i));
  }
  return n;
}
function An() {
  const e = rn.homedir();
  return process.platform === "darwin" ? [
    d.join(e, "Music", "Ableton", "User Library", "Templates"),
    d.join(e, "Music", "Ableton", "User Library", "Templates", "Set")
  ] : process.platform === "win32" ? [
    d.join(e, "Documents", "Ableton", "User Library", "Templates"),
    d.join(e, "Documents", "Ableton", "User Library", "Templates", "Set")
  ] : [d.join(e, "Music", "Ableton", "User Library", "Templates")];
}
async function Pn(e) {
  try {
    return (await T.stat(e)).isDirectory();
  } catch {
    return !1;
  }
}
async function kn(e, t) {
  const n = [], r = async (s) => {
    let i;
    try {
      i = await T.readdir(s, { withFileTypes: !0, encoding: "utf8" });
    } catch {
      return;
    }
    for (const a of i) {
      const c = d.join(s, a.name);
      if (a.isDirectory()) {
        if (!t || yn(a.name)) continue;
        await r(c);
        continue;
      }
      if (a.isFile() && !a.name.startsWith(".") && a.name.toLowerCase().endsWith(".als"))
        try {
          const o = await T.stat(c), u = bn(a.name);
          n.push({
            id: c,
            displayName: u || d.basename(a.name, ".als"),
            sourcePath: c,
            folderLabel: d.basename(d.dirname(c)) || null,
            modifiedAt: new Date(o.mtimeMs).toISOString()
          });
        } catch {
        }
    }
  };
  return await r(e), n;
}
function Rn(e, t) {
  const n = /* @__PURE__ */ new Map();
  return t.forEach((r, s) => {
    n.set(d.resolve(r), s);
  }), [...e].sort((r, s) => {
    const i = n.get(d.resolve(r.sourcePath)), a = n.get(d.resolve(s.sourcePath)), c = typeof i == "number", o = typeof a == "number";
    return c && o ? i - a : c ? -1 : o ? 1 : r.displayName.localeCompare(s.displayName, void 0, { sensitivity: "base" });
  });
}
async function pt(e) {
  const t = vn([
    ...e.templateRootDirs,
    ...An()
  ]), n = [];
  for (const s of t)
    await Pn(s) && n.push(s);
  if (n.length === 0) return [];
  const r = /* @__PURE__ */ new Map();
  for (const s of n) {
    const i = await kn(s, e.scanTemplateSubfolders);
    for (const a of i) {
      const c = d.resolve(a.sourcePath);
      r.has(c) || r.set(c, a);
    }
  }
  return Rn(Array.from(r.values()), e.recentTemplatePaths);
}
let le = null, Z = null;
function In() {
  return d.join(U.getPath("userData"), "studio-vaulted.db");
}
function ht() {
  return le || (le = new sn.Database(In()), le.exec("PRAGMA foreign_keys = ON;")), le;
}
async function S() {
  return Z || (Z = new Promise((e, t) => {
    const n = ht();
    n.exec(
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
      async (r) => {
        if (r) {
          t(r);
          return;
        }
        try {
          await Sn(n), await L(n, "tracks", "root_path", "TEXT"), await L(n, "tracks", "audio_path", "TEXT"), await L(n, "tracks", "ableton_project_path", "TEXT"), await L(n, "tracks", "daw_format", "TEXT NOT NULL DEFAULT 'als'"), await L(n, "tracks", "creation_mode", "TEXT NOT NULL DEFAULT 'blank'"), await L(n, "tracks", "source_template_path", "TEXT"), await L(n, "tracks", "source_template_name", "TEXT"), await L(n, "tracks", "project_type_label", "TEXT"), await L(n, "tracks", "genre", "TEXT"), await L(n, "tracks", "background_image_path", "TEXT"), await new Promise((s, i) => {
            n.exec(
              `
              CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_ableton_project_path_unique
                ON tracks (ableton_project_path)
                WHERE ableton_project_path IS NOT NULL;
              `,
              (a) => {
                if (a) {
                  i(a);
                  return;
                }
                s();
              }
            );
          }), e(void 0);
        } catch (s) {
          t(s);
        }
      }
    );
  }).catch((e) => {
    throw Z = null, e;
  }), Z);
}
function F() {
  return ht();
}
function mt(e, t) {
  return new Promise((n, r) => {
    e.all(`PRAGMA table_info(${t})`, (s, i) => {
      if (s) {
        r(s);
        return;
      }
      const a = /* @__PURE__ */ new Set();
      for (const c of i)
        a.add(c.name);
      n(a);
    });
  });
}
async function L(e, t, n, r) {
  (await mt(e, t)).has(n) || await new Promise((i, a) => {
    e.run(`ALTER TABLE ${t} ADD COLUMN ${n} ${r}`, (c) => {
      if (c) {
        a(c);
        return;
      }
      i();
    });
  });
}
async function Sn(e) {
  if ((await mt(e, "tracks")).has("group_key"))
    return;
  const n = await new Promise((r, s) => {
    e.all("SELECT * FROM tracks", (i, a) => {
      if (i) {
        s(i);
        return;
      }
      r(a ?? []);
    });
  });
  await new Promise((r, s) => {
    e.serialize(() => {
      e.exec(
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
        (i) => {
          if (i) {
            s(i);
            return;
          }
          const a = /* @__PURE__ */ new Map(), c = e.prepare(
            `
            INSERT INTO tracks_new (
              id, group_key, title, latest_version_id, audio_path, folder_id,
              status, notes, trashed, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          ), o = e.prepare(
            `
            INSERT OR IGNORE INTO track_versions (
              id, track_id, file_path, saved_at, file_size,
              bpm, bpm_source, content_hash, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          );
          for (const u of n) {
            const l = u.file_path ?? u.filePath;
            if (!l) continue;
            const f = Number(u.last_modified_ms ?? u.lastModifiedMs ?? Date.now()), m = Number(u.file_size ?? u.fileSize ?? 0), p = u.bpm === null || u.bpm === void 0 ? null : Number(u.bpm), E = u.folder_id ?? u.folderId ?? null, _ = u.status ?? "Idea", N = u.notes ?? "", v = Number(u.trashed ?? 0), y = K(l), k = ue(l);
            let h = a.get(y);
            h ? (!h.folderId && E && (h.folderId = E, h.metaSavedAt = f), !h.notes && N && (h.notes = N, h.metaSavedAt = f), !h.status && _ && (h.status = _, h.metaSavedAt = f), v && (h.trashed = 1)) : (h = {
              trackId: O(),
              title: k,
              folderId: E,
              status: _,
              notes: N,
              trashed: v,
              latestSavedAt: f,
              latestVersionId: null,
              metaSavedAt: f,
              createdAt: f,
              updatedAt: Date.now()
            }, a.set(y, h));
            const X = O();
            o.run([
              X,
              h.trackId,
              l,
              f,
              m,
              p,
              "auto",
              null,
              Date.now()
            ]), f >= h.latestSavedAt && (h.latestSavedAt = f, h.latestVersionId = X, h.title = k || h.title);
          }
          for (const [u, l] of a.entries())
            c.run([
              l.trackId,
              u,
              l.title,
              l.latestVersionId,
              null,
              l.folderId,
              l.status || "Idea",
              l.notes || "",
              l.trashed,
              l.createdAt,
              l.updatedAt
            ]);
          o.finalize(), c.finalize(), e.exec(
            `
            DROP TABLE tracks;
            ALTER TABLE tracks_new RENAME TO tracks;
            `,
            (u) => {
              if (u) {
                s(u);
                return;
              }
              r();
            }
          );
        }
      );
    });
  });
}
var Ce = {}, ge = {};
(function(e) {
  const t = ":A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD", n = t + "\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040", r = "[" + t + "][" + n + "]*", s = new RegExp("^" + r + "$"), i = function(c, o) {
    const u = [];
    let l = o.exec(c);
    for (; l; ) {
      const f = [];
      f.startIndex = o.lastIndex - l[0].length;
      const m = l.length;
      for (let p = 0; p < m; p++)
        f.push(l[p]);
      u.push(f), l = o.exec(c);
    }
    return u;
  }, a = function(c) {
    const o = s.exec(c);
    return !(o === null || typeof o > "u");
  };
  e.isExist = function(c) {
    return typeof c < "u";
  }, e.isEmptyObject = function(c) {
    return Object.keys(c).length === 0;
  }, e.merge = function(c, o, u) {
    if (o) {
      const l = Object.keys(o), f = l.length;
      for (let m = 0; m < f; m++)
        u === "strict" ? c[l[m]] = [o[l[m]]] : c[l[m]] = o[l[m]];
    }
  }, e.getValue = function(c) {
    return e.isExist(c) ? c : "";
  }, e.isName = a, e.getAllMatches = i, e.nameRegexp = r;
})(ge);
const je = ge, Ln = {
  allowBooleanAttributes: !1,
  //A tag can have attributes without any value
  unpairedTags: []
};
Ce.validate = function(e, t) {
  t = Object.assign({}, Ln, t);
  const n = [];
  let r = !1, s = !1;
  e[0] === "\uFEFF" && (e = e.substr(1));
  for (let i = 0; i < e.length; i++)
    if (e[i] === "<" && e[i + 1] === "?") {
      if (i += 2, i = tt(e, i), i.err) return i;
    } else if (e[i] === "<") {
      let a = i;
      if (i++, e[i] === "!") {
        i = nt(e, i);
        continue;
      } else {
        let c = !1;
        e[i] === "/" && (c = !0, i++);
        let o = "";
        for (; i < e.length && e[i] !== ">" && e[i] !== " " && e[i] !== "	" && e[i] !== `
` && e[i] !== "\r"; i++)
          o += e[i];
        if (o = o.trim(), o[o.length - 1] === "/" && (o = o.substring(0, o.length - 1), i--), !Xn(o)) {
          let f;
          return o.trim().length === 0 ? f = "Invalid space after '<'." : f = "Tag '" + o + "' is an invalid name.", w("InvalidTag", f, A(e, i));
        }
        const u = Cn(e, i);
        if (u === !1)
          return w("InvalidAttr", "Attributes for '" + o + "' have open quote.", A(e, i));
        let l = u.value;
        if (i = u.index, l[l.length - 1] === "/") {
          const f = i - l.length;
          l = l.substring(0, l.length - 1);
          const m = rt(l, t);
          if (m === !0)
            r = !0;
          else
            return w(m.err.code, m.err.msg, A(e, f + m.err.line));
        } else if (c)
          if (u.tagClosed) {
            if (l.trim().length > 0)
              return w("InvalidTag", "Closing tag '" + o + "' can't have attributes or invalid starting.", A(e, a));
            if (n.length === 0)
              return w("InvalidTag", "Closing tag '" + o + "' has not been opened.", A(e, a));
            {
              const f = n.pop();
              if (o !== f.tagName) {
                let m = A(e, f.tagStartPos);
                return w(
                  "InvalidTag",
                  "Expected closing tag '" + f.tagName + "' (opened in line " + m.line + ", col " + m.col + ") instead of closing tag '" + o + "'.",
                  A(e, a)
                );
              }
              n.length == 0 && (s = !0);
            }
          } else return w("InvalidTag", "Closing tag '" + o + "' doesn't have proper closing.", A(e, i));
        else {
          const f = rt(l, t);
          if (f !== !0)
            return w(f.err.code, f.err.msg, A(e, i - l.length + f.err.line));
          if (s === !0)
            return w("InvalidXml", "Multiple possible root nodes found.", A(e, i));
          t.unpairedTags.indexOf(o) !== -1 || n.push({ tagName: o, tagStartPos: a }), r = !0;
        }
        for (i++; i < e.length; i++)
          if (e[i] === "<")
            if (e[i + 1] === "!") {
              i++, i = nt(e, i);
              continue;
            } else if (e[i + 1] === "?") {
              if (i = tt(e, ++i), i.err) return i;
            } else
              break;
          else if (e[i] === "&") {
            const f = xn(e, i);
            if (f == -1)
              return w("InvalidChar", "char '&' is not expected.", A(e, i));
            i = f;
          } else if (s === !0 && !et(e[i]))
            return w("InvalidXml", "Extra text at the end", A(e, i));
        e[i] === "<" && i--;
      }
    } else {
      if (et(e[i]))
        continue;
      return w("InvalidChar", "char '" + e[i] + "' is not expected.", A(e, i));
    }
  if (r) {
    if (n.length == 1)
      return w("InvalidTag", "Unclosed tag '" + n[0].tagName + "'.", A(e, n[0].tagStartPos));
    if (n.length > 0)
      return w("InvalidXml", "Invalid '" + JSON.stringify(n.map((i) => i.tagName), null, 4).replace(/\r?\n/g, "") + "' found.", { line: 1, col: 1 });
  } else return w("InvalidXml", "Start tag expected.", 1);
  return !0;
};
function et(e) {
  return e === " " || e === "	" || e === `
` || e === "\r";
}
function tt(e, t) {
  const n = t;
  for (; t < e.length; t++)
    if (e[t] == "?" || e[t] == " ") {
      const r = e.substr(n, t - n);
      if (t > 5 && r === "xml")
        return w("InvalidXml", "XML declaration allowed only at the start of the document.", A(e, t));
      if (e[t] == "?" && e[t + 1] == ">") {
        t++;
        break;
      } else
        continue;
    }
  return t;
}
function nt(e, t) {
  if (e.length > t + 5 && e[t + 1] === "-" && e[t + 2] === "-") {
    for (t += 3; t < e.length; t++)
      if (e[t] === "-" && e[t + 1] === "-" && e[t + 2] === ">") {
        t += 2;
        break;
      }
  } else if (e.length > t + 8 && e[t + 1] === "D" && e[t + 2] === "O" && e[t + 3] === "C" && e[t + 4] === "T" && e[t + 5] === "Y" && e[t + 6] === "P" && e[t + 7] === "E") {
    let n = 1;
    for (t += 8; t < e.length; t++)
      if (e[t] === "<")
        n++;
      else if (e[t] === ">" && (n--, n === 0))
        break;
  } else if (e.length > t + 9 && e[t + 1] === "[" && e[t + 2] === "C" && e[t + 3] === "D" && e[t + 4] === "A" && e[t + 5] === "T" && e[t + 6] === "A" && e[t + 7] === "[") {
    for (t += 8; t < e.length; t++)
      if (e[t] === "]" && e[t + 1] === "]" && e[t + 2] === ">") {
        t += 2;
        break;
      }
  }
  return t;
}
const On = '"', Fn = "'";
function Cn(e, t) {
  let n = "", r = "", s = !1;
  for (; t < e.length; t++) {
    if (e[t] === On || e[t] === Fn)
      r === "" ? r = e[t] : r !== e[t] || (r = "");
    else if (e[t] === ">" && r === "") {
      s = !0;
      break;
    }
    n += e[t];
  }
  return r !== "" ? !1 : {
    value: n,
    index: t,
    tagClosed: s
  };
}
const jn = new RegExp(`(\\s*)([^\\s=]+)(\\s*=)?(\\s*(['"])(([\\s\\S])*?)\\5)?`, "g");
function rt(e, t) {
  const n = je.getAllMatches(e, jn), r = {};
  for (let s = 0; s < n.length; s++) {
    if (n[s][1].length === 0)
      return w("InvalidAttr", "Attribute '" + n[s][2] + "' has no space in starting.", Q(n[s]));
    if (n[s][3] !== void 0 && n[s][4] === void 0)
      return w("InvalidAttr", "Attribute '" + n[s][2] + "' is without value.", Q(n[s]));
    if (n[s][3] === void 0 && !t.allowBooleanAttributes)
      return w("InvalidAttr", "boolean attribute '" + n[s][2] + "' is not allowed.", Q(n[s]));
    const i = n[s][2];
    if (!Mn(i))
      return w("InvalidAttr", "Attribute '" + i + "' is an invalid name.", Q(n[s]));
    if (!r.hasOwnProperty(i))
      r[i] = 1;
    else
      return w("InvalidAttr", "Attribute '" + i + "' is repeated.", Q(n[s]));
  }
  return !0;
}
function Un(e, t) {
  let n = /\d/;
  for (e[t] === "x" && (t++, n = /[\da-fA-F]/); t < e.length; t++) {
    if (e[t] === ";")
      return t;
    if (!e[t].match(n))
      break;
  }
  return -1;
}
function xn(e, t) {
  if (t++, e[t] === ";")
    return -1;
  if (e[t] === "#")
    return t++, Un(e, t);
  let n = 0;
  for (; t < e.length; t++, n++)
    if (!(e[t].match(/\w/) && n < 20)) {
      if (e[t] === ";")
        break;
      return -1;
    }
  return t;
}
function w(e, t, n) {
  return {
    err: {
      code: e,
      msg: t,
      line: n.line || n,
      col: n.col
    }
  };
}
function Mn(e) {
  return je.isName(e);
}
function Xn(e) {
  return je.isName(e);
}
function A(e, t) {
  const n = e.substring(0, t).split(/\r?\n/);
  return {
    line: n.length,
    // column number is last line's length + 1, because column numbering starts at 1:
    col: n[n.length - 1].length + 1
  };
}
function Q(e) {
  return e.startIndex + e[1].length;
}
var Ue = {};
const gt = {
  preserveOrder: !1,
  attributeNamePrefix: "@_",
  attributesGroupName: !1,
  textNodeName: "#text",
  ignoreAttributes: !0,
  removeNSPrefix: !1,
  // remove NS from tag name or attribute name if true
  allowBooleanAttributes: !1,
  //a tag can have attributes without any value
  //ignoreRootElement : false,
  parseTagValue: !0,
  parseAttributeValue: !1,
  trimValues: !0,
  //Trim string values of tag and attributes
  cdataPropName: !1,
  numberParseOptions: {
    hex: !0,
    leadingZeros: !0,
    eNotation: !0
  },
  tagValueProcessor: function(e, t) {
    return t;
  },
  attributeValueProcessor: function(e, t) {
    return t;
  },
  stopNodes: [],
  //nested tags will not be parsed even for errors
  alwaysCreateTextNode: !1,
  isArray: () => !1,
  commentPropName: !1,
  unpairedTags: [],
  processEntities: !0,
  htmlEntities: !1,
  ignoreDeclaration: !1,
  ignorePiTags: !1,
  transformTagName: !1,
  transformAttributeName: !1,
  updateTag: function(e, t, n) {
    return e;
  }
  // skipEmptyListItem: false
}, $n = function(e) {
  return Object.assign({}, gt, e);
};
Ue.buildOptions = $n;
Ue.defaultOptions = gt;
class Vn {
  constructor(t) {
    this.tagname = t, this.child = [], this[":@"] = {};
  }
  add(t, n) {
    t === "__proto__" && (t = "#__proto__"), this.child.push({ [t]: n });
  }
  addChild(t) {
    t.tagname === "__proto__" && (t.tagname = "#__proto__"), t[":@"] && Object.keys(t[":@"]).length > 0 ? this.child.push({ [t.tagname]: t.child, ":@": t[":@"] }) : this.child.push({ [t.tagname]: t.child });
  }
}
var Wn = Vn;
const Bn = ge;
function zn(e, t) {
  const n = {};
  if (e[t + 3] === "O" && e[t + 4] === "C" && e[t + 5] === "T" && e[t + 6] === "Y" && e[t + 7] === "P" && e[t + 8] === "E") {
    t = t + 9;
    let r = 1, s = !1, i = !1, a = "";
    for (; t < e.length; t++)
      if (e[t] === "<" && !i) {
        if (s && Gn(e, t)) {
          t += 7;
          let c, o;
          [c, o, t] = Dn(e, t + 1), o.indexOf("&") === -1 && (n[qn(c)] = {
            regx: RegExp(`&${c};`, "g"),
            val: o
          });
        } else if (s && Kn(e, t)) t += 8;
        else if (s && Yn(e, t)) t += 8;
        else if (s && Jn(e, t)) t += 9;
        else if (Hn) i = !0;
        else throw new Error("Invalid DOCTYPE");
        r++, a = "";
      } else if (e[t] === ">") {
        if (i ? e[t - 1] === "-" && e[t - 2] === "-" && (i = !1, r--) : r--, r === 0)
          break;
      } else e[t] === "[" ? s = !0 : a += e[t];
    if (r !== 0)
      throw new Error("Unclosed DOCTYPE");
  } else
    throw new Error("Invalid Tag instead of DOCTYPE");
  return { entities: n, i: t };
}
function Dn(e, t) {
  let n = "";
  for (; t < e.length && e[t] !== "'" && e[t] !== '"'; t++)
    n += e[t];
  if (n = n.trim(), n.indexOf(" ") !== -1) throw new Error("External entites are not supported");
  const r = e[t++];
  let s = "";
  for (; t < e.length && e[t] !== r; t++)
    s += e[t];
  return [n, s, t];
}
function Hn(e, t) {
  return e[t + 1] === "!" && e[t + 2] === "-" && e[t + 3] === "-";
}
function Gn(e, t) {
  return e[t + 1] === "!" && e[t + 2] === "E" && e[t + 3] === "N" && e[t + 4] === "T" && e[t + 5] === "I" && e[t + 6] === "T" && e[t + 7] === "Y";
}
function Kn(e, t) {
  return e[t + 1] === "!" && e[t + 2] === "E" && e[t + 3] === "L" && e[t + 4] === "E" && e[t + 5] === "M" && e[t + 6] === "E" && e[t + 7] === "N" && e[t + 8] === "T";
}
function Yn(e, t) {
  return e[t + 1] === "!" && e[t + 2] === "A" && e[t + 3] === "T" && e[t + 4] === "T" && e[t + 5] === "L" && e[t + 6] === "I" && e[t + 7] === "S" && e[t + 8] === "T";
}
function Jn(e, t) {
  return e[t + 1] === "!" && e[t + 2] === "N" && e[t + 3] === "O" && e[t + 4] === "T" && e[t + 5] === "A" && e[t + 6] === "T" && e[t + 7] === "I" && e[t + 8] === "O" && e[t + 9] === "N";
}
function qn(e) {
  if (Bn.isName(e))
    return e;
  throw new Error(`Invalid entity name ${e}`);
}
var Zn = zn;
const Qn = /^[-+]?0x[a-fA-F0-9]+$/, er = /^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/, tr = {
  hex: !0,
  // oct: false,
  leadingZeros: !0,
  decimalPoint: ".",
  eNotation: !0
  //skipLike: /regex/
};
function nr(e, t = {}) {
  if (t = Object.assign({}, tr, t), !e || typeof e != "string") return e;
  let n = e.trim();
  if (t.skipLike !== void 0 && t.skipLike.test(n)) return e;
  if (e === "0") return 0;
  if (t.hex && Qn.test(n))
    return sr(n, 16);
  if (n.search(/[eE]/) !== -1) {
    const r = n.match(/^([-\+])?(0*)([0-9]*(\.[0-9]*)?[eE][-\+]?[0-9]+)$/);
    if (r) {
      if (t.leadingZeros)
        n = (r[1] || "") + r[3];
      else if (!(r[2] === "0" && r[3][0] === ".")) return e;
      return t.eNotation ? Number(n) : e;
    } else
      return e;
  } else {
    const r = er.exec(n);
    if (r) {
      const s = r[1], i = r[2];
      let a = rr(r[3]);
      if (!t.leadingZeros && i.length > 0 && s && n[2] !== ".") return e;
      if (!t.leadingZeros && i.length > 0 && !s && n[1] !== ".") return e;
      if (t.leadingZeros && i === e) return 0;
      {
        const c = Number(n), o = "" + c;
        return o.search(/[eE]/) !== -1 ? t.eNotation ? c : e : n.indexOf(".") !== -1 ? o === "0" && a === "" || o === a || s && o === "-" + a ? c : e : i ? a === o || s + a === o ? c : e : n === o || n === s + o ? c : e;
      }
    } else
      return e;
  }
}
function rr(e) {
  return e && e.indexOf(".") !== -1 && (e = e.replace(/0+$/, ""), e === "." ? e = "0" : e[0] === "." ? e = "0" + e : e[e.length - 1] === "." && (e = e.substr(0, e.length - 1))), e;
}
function sr(e, t) {
  if (parseInt) return parseInt(e, t);
  if (Number.parseInt) return Number.parseInt(e, t);
  if (window && window.parseInt) return window.parseInt(e, t);
  throw new Error("parseInt, Number.parseInt, window.parseInt are not supported");
}
var ir = nr;
function or(e) {
  return typeof e == "function" ? e : Array.isArray(e) ? (t) => {
    for (const n of e)
      if (typeof n == "string" && t === n || n instanceof RegExp && n.test(t))
        return !0;
  } : () => !1;
}
var Et = or;
const Tt = ge, ee = Wn, ar = Zn, cr = ir, lr = Et;
let ur = class {
  constructor(t) {
    this.options = t, this.currentNode = null, this.tagsNodeStack = [], this.docTypeEntities = {}, this.lastEntities = {
      apos: { regex: /&(apos|#39|#x27);/g, val: "'" },
      gt: { regex: /&(gt|#62|#x3E);/g, val: ">" },
      lt: { regex: /&(lt|#60|#x3C);/g, val: "<" },
      quot: { regex: /&(quot|#34|#x22);/g, val: '"' }
    }, this.ampEntity = { regex: /&(amp|#38|#x26);/g, val: "&" }, this.htmlEntities = {
      space: { regex: /&(nbsp|#160);/g, val: " " },
      // "lt" : { regex: /&(lt|#60);/g, val: "<" },
      // "gt" : { regex: /&(gt|#62);/g, val: ">" },
      // "amp" : { regex: /&(amp|#38);/g, val: "&" },
      // "quot" : { regex: /&(quot|#34);/g, val: "\"" },
      // "apos" : { regex: /&(apos|#39);/g, val: "'" },
      cent: { regex: /&(cent|#162);/g, val: "¢" },
      pound: { regex: /&(pound|#163);/g, val: "£" },
      yen: { regex: /&(yen|#165);/g, val: "¥" },
      euro: { regex: /&(euro|#8364);/g, val: "€" },
      copyright: { regex: /&(copy|#169);/g, val: "©" },
      reg: { regex: /&(reg|#174);/g, val: "®" },
      inr: { regex: /&(inr|#8377);/g, val: "₹" },
      num_dec: { regex: /&#([0-9]{1,7});/g, val: (n, r) => String.fromCharCode(Number.parseInt(r, 10)) },
      num_hex: { regex: /&#x([0-9a-fA-F]{1,6});/g, val: (n, r) => String.fromCharCode(Number.parseInt(r, 16)) }
    }, this.addExternalEntities = dr, this.parseXml = gr, this.parseTextData = fr, this.resolveNameSpace = pr, this.buildAttributesMap = mr, this.isItStopNode = Nr, this.replaceEntitiesValue = Tr, this.readStopNodeData = br, this.saveTextToParentTag = _r, this.addChild = Er, this.ignoreAttributesFn = lr(this.options.ignoreAttributes);
  }
};
function dr(e) {
  const t = Object.keys(e);
  for (let n = 0; n < t.length; n++) {
    const r = t[n];
    this.lastEntities[r] = {
      regex: new RegExp("&" + r + ";", "g"),
      val: e[r]
    };
  }
}
function fr(e, t, n, r, s, i, a) {
  if (e !== void 0 && (this.options.trimValues && !r && (e = e.trim()), e.length > 0)) {
    a || (e = this.replaceEntitiesValue(e));
    const c = this.options.tagValueProcessor(t, e, n, s, i);
    return c == null ? e : typeof c != typeof e || c !== e ? c : this.options.trimValues ? ke(e, this.options.parseTagValue, this.options.numberParseOptions) : e.trim() === e ? ke(e, this.options.parseTagValue, this.options.numberParseOptions) : e;
  }
}
function pr(e) {
  if (this.options.removeNSPrefix) {
    const t = e.split(":"), n = e.charAt(0) === "/" ? "/" : "";
    if (t[0] === "xmlns")
      return "";
    t.length === 2 && (e = n + t[1]);
  }
  return e;
}
const hr = new RegExp(`([^\\s=]+)\\s*(=\\s*(['"])([\\s\\S]*?)\\3)?`, "gm");
function mr(e, t, n) {
  if (this.options.ignoreAttributes !== !0 && typeof e == "string") {
    const r = Tt.getAllMatches(e, hr), s = r.length, i = {};
    for (let a = 0; a < s; a++) {
      const c = this.resolveNameSpace(r[a][1]);
      if (this.ignoreAttributesFn(c, t))
        continue;
      let o = r[a][4], u = this.options.attributeNamePrefix + c;
      if (c.length)
        if (this.options.transformAttributeName && (u = this.options.transformAttributeName(u)), u === "__proto__" && (u = "#__proto__"), o !== void 0) {
          this.options.trimValues && (o = o.trim()), o = this.replaceEntitiesValue(o);
          const l = this.options.attributeValueProcessor(c, o, t);
          l == null ? i[u] = o : typeof l != typeof o || l !== o ? i[u] = l : i[u] = ke(
            o,
            this.options.parseAttributeValue,
            this.options.numberParseOptions
          );
        } else this.options.allowBooleanAttributes && (i[u] = !0);
    }
    if (!Object.keys(i).length)
      return;
    if (this.options.attributesGroupName) {
      const a = {};
      return a[this.options.attributesGroupName] = i, a;
    }
    return i;
  }
}
const gr = function(e) {
  e = e.replace(/\r\n?/g, `
`);
  const t = new ee("!xml");
  let n = t, r = "", s = "";
  for (let i = 0; i < e.length; i++)
    if (e[i] === "<")
      if (e[i + 1] === "/") {
        const c = z(e, ">", i, "Closing Tag is not closed.");
        let o = e.substring(i + 2, c).trim();
        if (this.options.removeNSPrefix) {
          const f = o.indexOf(":");
          f !== -1 && (o = o.substr(f + 1));
        }
        this.options.transformTagName && (o = this.options.transformTagName(o)), n && (r = this.saveTextToParentTag(r, n, s));
        const u = s.substring(s.lastIndexOf(".") + 1);
        if (o && this.options.unpairedTags.indexOf(o) !== -1)
          throw new Error(`Unpaired tag can not be used as closing tag: </${o}>`);
        let l = 0;
        u && this.options.unpairedTags.indexOf(u) !== -1 ? (l = s.lastIndexOf(".", s.lastIndexOf(".") - 1), this.tagsNodeStack.pop()) : l = s.lastIndexOf("."), s = s.substring(0, l), n = this.tagsNodeStack.pop(), r = "", i = c;
      } else if (e[i + 1] === "?") {
        let c = Pe(e, i, !1, "?>");
        if (!c) throw new Error("Pi Tag is not closed.");
        if (r = this.saveTextToParentTag(r, n, s), !(this.options.ignoreDeclaration && c.tagName === "?xml" || this.options.ignorePiTags)) {
          const o = new ee(c.tagName);
          o.add(this.options.textNodeName, ""), c.tagName !== c.tagExp && c.attrExpPresent && (o[":@"] = this.buildAttributesMap(c.tagExp, s, c.tagName)), this.addChild(n, o, s);
        }
        i = c.closeIndex + 1;
      } else if (e.substr(i + 1, 3) === "!--") {
        const c = z(e, "-->", i + 4, "Comment is not closed.");
        if (this.options.commentPropName) {
          const o = e.substring(i + 4, c - 2);
          r = this.saveTextToParentTag(r, n, s), n.add(this.options.commentPropName, [{ [this.options.textNodeName]: o }]);
        }
        i = c;
      } else if (e.substr(i + 1, 2) === "!D") {
        const c = ar(e, i);
        this.docTypeEntities = c.entities, i = c.i;
      } else if (e.substr(i + 1, 2) === "![") {
        const c = z(e, "]]>", i, "CDATA is not closed.") - 2, o = e.substring(i + 9, c);
        r = this.saveTextToParentTag(r, n, s);
        let u = this.parseTextData(o, n.tagname, s, !0, !1, !0, !0);
        u == null && (u = ""), this.options.cdataPropName ? n.add(this.options.cdataPropName, [{ [this.options.textNodeName]: o }]) : n.add(this.options.textNodeName, u), i = c + 2;
      } else {
        let c = Pe(e, i, this.options.removeNSPrefix), o = c.tagName;
        const u = c.rawTagName;
        let l = c.tagExp, f = c.attrExpPresent, m = c.closeIndex;
        this.options.transformTagName && (o = this.options.transformTagName(o)), n && r && n.tagname !== "!xml" && (r = this.saveTextToParentTag(r, n, s, !1));
        const p = n;
        if (p && this.options.unpairedTags.indexOf(p.tagname) !== -1 && (n = this.tagsNodeStack.pop(), s = s.substring(0, s.lastIndexOf("."))), o !== t.tagname && (s += s ? "." + o : o), this.isItStopNode(this.options.stopNodes, s, o)) {
          let E = "";
          if (l.length > 0 && l.lastIndexOf("/") === l.length - 1)
            o[o.length - 1] === "/" ? (o = o.substr(0, o.length - 1), s = s.substr(0, s.length - 1), l = o) : l = l.substr(0, l.length - 1), i = c.closeIndex;
          else if (this.options.unpairedTags.indexOf(o) !== -1)
            i = c.closeIndex;
          else {
            const N = this.readStopNodeData(e, u, m + 1);
            if (!N) throw new Error(`Unexpected end of ${u}`);
            i = N.i, E = N.tagContent;
          }
          const _ = new ee(o);
          o !== l && f && (_[":@"] = this.buildAttributesMap(l, s, o)), E && (E = this.parseTextData(E, o, s, !0, f, !0, !0)), s = s.substr(0, s.lastIndexOf(".")), _.add(this.options.textNodeName, E), this.addChild(n, _, s);
        } else {
          if (l.length > 0 && l.lastIndexOf("/") === l.length - 1) {
            o[o.length - 1] === "/" ? (o = o.substr(0, o.length - 1), s = s.substr(0, s.length - 1), l = o) : l = l.substr(0, l.length - 1), this.options.transformTagName && (o = this.options.transformTagName(o));
            const E = new ee(o);
            o !== l && f && (E[":@"] = this.buildAttributesMap(l, s, o)), this.addChild(n, E, s), s = s.substr(0, s.lastIndexOf("."));
          } else {
            const E = new ee(o);
            this.tagsNodeStack.push(n), o !== l && f && (E[":@"] = this.buildAttributesMap(l, s, o)), this.addChild(n, E, s), n = E;
          }
          r = "", i = m;
        }
      }
    else
      r += e[i];
  return t.child;
};
function Er(e, t, n) {
  const r = this.options.updateTag(t.tagname, n, t[":@"]);
  r === !1 || (typeof r == "string" && (t.tagname = r), e.addChild(t));
}
const Tr = function(e) {
  if (this.options.processEntities) {
    for (let t in this.docTypeEntities) {
      const n = this.docTypeEntities[t];
      e = e.replace(n.regx, n.val);
    }
    for (let t in this.lastEntities) {
      const n = this.lastEntities[t];
      e = e.replace(n.regex, n.val);
    }
    if (this.options.htmlEntities)
      for (let t in this.htmlEntities) {
        const n = this.htmlEntities[t];
        e = e.replace(n.regex, n.val);
      }
    e = e.replace(this.ampEntity.regex, this.ampEntity.val);
  }
  return e;
};
function _r(e, t, n, r) {
  return e && (r === void 0 && (r = t.child.length === 0), e = this.parseTextData(
    e,
    t.tagname,
    n,
    !1,
    t[":@"] ? Object.keys(t[":@"]).length !== 0 : !1,
    r
  ), e !== void 0 && e !== "" && t.add(this.options.textNodeName, e), e = ""), e;
}
function Nr(e, t, n) {
  const r = "*." + n;
  for (const s in e) {
    const i = e[s];
    if (r === i || t === i) return !0;
  }
  return !1;
}
function wr(e, t, n = ">") {
  let r, s = "";
  for (let i = t; i < e.length; i++) {
    let a = e[i];
    if (r)
      a === r && (r = "");
    else if (a === '"' || a === "'")
      r = a;
    else if (a === n[0])
      if (n[1]) {
        if (e[i + 1] === n[1])
          return {
            data: s,
            index: i
          };
      } else
        return {
          data: s,
          index: i
        };
    else a === "	" && (a = " ");
    s += a;
  }
}
function z(e, t, n, r) {
  const s = e.indexOf(t, n);
  if (s === -1)
    throw new Error(r);
  return s + t.length - 1;
}
function Pe(e, t, n, r = ">") {
  const s = wr(e, t + 1, r);
  if (!s) return;
  let i = s.data;
  const a = s.index, c = i.search(/\s/);
  let o = i, u = !0;
  c !== -1 && (o = i.substring(0, c), i = i.substring(c + 1).trimStart());
  const l = o;
  if (n) {
    const f = o.indexOf(":");
    f !== -1 && (o = o.substr(f + 1), u = o !== s.data.substr(f + 1));
  }
  return {
    tagName: o,
    tagExp: i,
    closeIndex: a,
    attrExpPresent: u,
    rawTagName: l
  };
}
function br(e, t, n) {
  const r = n;
  let s = 1;
  for (; n < e.length; n++)
    if (e[n] === "<")
      if (e[n + 1] === "/") {
        const i = z(e, ">", n, `${t} is not closed`);
        if (e.substring(n + 2, i).trim() === t && (s--, s === 0))
          return {
            tagContent: e.substring(r, n),
            i
          };
        n = i;
      } else if (e[n + 1] === "?")
        n = z(e, "?>", n + 1, "StopNode is not closed.");
      else if (e.substr(n + 1, 3) === "!--")
        n = z(e, "-->", n + 3, "StopNode is not closed.");
      else if (e.substr(n + 1, 2) === "![")
        n = z(e, "]]>", n, "StopNode is not closed.") - 2;
      else {
        const i = Pe(e, n, ">");
        i && ((i && i.tagName) === t && i.tagExp[i.tagExp.length - 1] !== "/" && s++, n = i.closeIndex);
      }
}
function ke(e, t, n) {
  if (t && typeof e == "string") {
    const r = e.trim();
    return r === "true" ? !0 : r === "false" ? !1 : cr(e, n);
  } else
    return Tt.isExist(e) ? e : "";
}
var yr = ur, _t = {};
function vr(e, t) {
  return Nt(e, t);
}
function Nt(e, t, n) {
  let r;
  const s = {};
  for (let i = 0; i < e.length; i++) {
    const a = e[i], c = Ar(a);
    let o = "";
    if (n === void 0 ? o = c : o = n + "." + c, c === t.textNodeName)
      r === void 0 ? r = a[c] : r += "" + a[c];
    else {
      if (c === void 0)
        continue;
      if (a[c]) {
        let u = Nt(a[c], t, o);
        const l = kr(u, t);
        a[":@"] ? Pr(u, a[":@"], o, t) : Object.keys(u).length === 1 && u[t.textNodeName] !== void 0 && !t.alwaysCreateTextNode ? u = u[t.textNodeName] : Object.keys(u).length === 0 && (t.alwaysCreateTextNode ? u[t.textNodeName] = "" : u = ""), s[c] !== void 0 && s.hasOwnProperty(c) ? (Array.isArray(s[c]) || (s[c] = [s[c]]), s[c].push(u)) : t.isArray(c, o, l) ? s[c] = [u] : s[c] = u;
      }
    }
  }
  return typeof r == "string" ? r.length > 0 && (s[t.textNodeName] = r) : r !== void 0 && (s[t.textNodeName] = r), s;
}
function Ar(e) {
  const t = Object.keys(e);
  for (let n = 0; n < t.length; n++) {
    const r = t[n];
    if (r !== ":@") return r;
  }
}
function Pr(e, t, n, r) {
  if (t) {
    const s = Object.keys(t), i = s.length;
    for (let a = 0; a < i; a++) {
      const c = s[a];
      r.isArray(c, n + "." + c, !0, !0) ? e[c] = [t[c]] : e[c] = t[c];
    }
  }
}
function kr(e, t) {
  const { textNodeName: n } = t, r = Object.keys(e).length;
  return !!(r === 0 || r === 1 && (e[n] || typeof e[n] == "boolean" || e[n] === 0));
}
_t.prettify = vr;
const { buildOptions: Rr } = Ue, Ir = yr, { prettify: Sr } = _t, Lr = Ce;
let Or = class {
  constructor(t) {
    this.externalEntities = {}, this.options = Rr(t);
  }
  /**
   * Parse XML dats to JS object 
   * @param {string|Buffer} xmlData 
   * @param {boolean|Object} validationOption 
   */
  parse(t, n) {
    if (typeof t != "string") if (t.toString)
      t = t.toString();
    else
      throw new Error("XML data is accepted in String or Bytes[] form.");
    if (n) {
      n === !0 && (n = {});
      const i = Lr.validate(t, n);
      if (i !== !0)
        throw Error(`${i.err.msg}:${i.err.line}:${i.err.col}`);
    }
    const r = new Ir(this.options);
    r.addExternalEntities(this.externalEntities);
    const s = r.parseXml(t);
    return this.options.preserveOrder || s === void 0 ? s : Sr(s, this.options);
  }
  /**
   * Add Entity which is not by default supported by this library
   * @param {string} key 
   * @param {string} value 
   */
  addEntity(t, n) {
    if (n.indexOf("&") !== -1)
      throw new Error("Entity value can't have '&'");
    if (t.indexOf("&") !== -1 || t.indexOf(";") !== -1)
      throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'");
    if (n === "&")
      throw new Error("An entity with value '&' is not permitted");
    this.externalEntities[t] = n;
  }
};
var Fr = Or;
const Cr = `
`;
function jr(e, t) {
  let n = "";
  return t.format && t.indentBy.length > 0 && (n = Cr), wt(e, t, "", n);
}
function wt(e, t, n, r) {
  let s = "", i = !1;
  for (let a = 0; a < e.length; a++) {
    const c = e[a], o = Ur(c);
    if (o === void 0) continue;
    let u = "";
    if (n.length === 0 ? u = o : u = `${n}.${o}`, o === t.textNodeName) {
      let E = c[o];
      xr(u, t) || (E = t.tagValueProcessor(o, E), E = bt(E, t)), i && (s += r), s += E, i = !1;
      continue;
    } else if (o === t.cdataPropName) {
      i && (s += r), s += `<![CDATA[${c[o][0][t.textNodeName]}]]>`, i = !1;
      continue;
    } else if (o === t.commentPropName) {
      s += r + `<!--${c[o][0][t.textNodeName]}-->`, i = !0;
      continue;
    } else if (o[0] === "?") {
      const E = st(c[":@"], t), _ = o === "?xml" ? "" : r;
      let N = c[o][0][t.textNodeName];
      N = N.length !== 0 ? " " + N : "", s += _ + `<${o}${N}${E}?>`, i = !0;
      continue;
    }
    let l = r;
    l !== "" && (l += t.indentBy);
    const f = st(c[":@"], t), m = r + `<${o}${f}`, p = wt(c[o], t, u, l);
    t.unpairedTags.indexOf(o) !== -1 ? t.suppressUnpairedNode ? s += m + ">" : s += m + "/>" : (!p || p.length === 0) && t.suppressEmptyNode ? s += m + "/>" : p && p.endsWith(">") ? s += m + `>${p}${r}</${o}>` : (s += m + ">", p && r !== "" && (p.includes("/>") || p.includes("</")) ? s += r + t.indentBy + p + r : s += p, s += `</${o}>`), i = !0;
  }
  return s;
}
function Ur(e) {
  const t = Object.keys(e);
  for (let n = 0; n < t.length; n++) {
    const r = t[n];
    if (e.hasOwnProperty(r) && r !== ":@")
      return r;
  }
}
function st(e, t) {
  let n = "";
  if (e && !t.ignoreAttributes)
    for (let r in e) {
      if (!e.hasOwnProperty(r)) continue;
      let s = t.attributeValueProcessor(r, e[r]);
      s = bt(s, t), s === !0 && t.suppressBooleanAttributes ? n += ` ${r.substr(t.attributeNamePrefix.length)}` : n += ` ${r.substr(t.attributeNamePrefix.length)}="${s}"`;
    }
  return n;
}
function xr(e, t) {
  e = e.substr(0, e.length - t.textNodeName.length - 1);
  let n = e.substr(e.lastIndexOf(".") + 1);
  for (let r in t.stopNodes)
    if (t.stopNodes[r] === e || t.stopNodes[r] === "*." + n) return !0;
  return !1;
}
function bt(e, t) {
  if (e && e.length > 0 && t.processEntities)
    for (let n = 0; n < t.entities.length; n++) {
      const r = t.entities[n];
      e = e.replace(r.regex, r.val);
    }
  return e;
}
var Mr = jr;
const Xr = Mr, $r = Et, Vr = {
  attributeNamePrefix: "@_",
  attributesGroupName: !1,
  textNodeName: "#text",
  ignoreAttributes: !0,
  cdataPropName: !1,
  format: !1,
  indentBy: "  ",
  suppressEmptyNode: !1,
  suppressUnpairedNode: !0,
  suppressBooleanAttributes: !0,
  tagValueProcessor: function(e, t) {
    return t;
  },
  attributeValueProcessor: function(e, t) {
    return t;
  },
  preserveOrder: !1,
  commentPropName: !1,
  unpairedTags: [],
  entities: [
    { regex: new RegExp("&", "g"), val: "&amp;" },
    //it must be on top
    { regex: new RegExp(">", "g"), val: "&gt;" },
    { regex: new RegExp("<", "g"), val: "&lt;" },
    { regex: new RegExp("'", "g"), val: "&apos;" },
    { regex: new RegExp('"', "g"), val: "&quot;" }
  ],
  processEntities: !0,
  stopNodes: [],
  // transformTagName: false,
  // transformAttributeName: false,
  oneListGroup: !1
};
function W(e) {
  this.options = Object.assign({}, Vr, e), this.options.ignoreAttributes === !0 || this.options.attributesGroupName ? this.isAttribute = function() {
    return !1;
  } : (this.ignoreAttributesFn = $r(this.options.ignoreAttributes), this.attrPrefixLen = this.options.attributeNamePrefix.length, this.isAttribute = zr), this.processTextOrObjNode = Wr, this.options.format ? (this.indentate = Br, this.tagEndChar = `>
`, this.newLine = `
`) : (this.indentate = function() {
    return "";
  }, this.tagEndChar = ">", this.newLine = "");
}
W.prototype.build = function(e) {
  return this.options.preserveOrder ? Xr(e, this.options) : (Array.isArray(e) && this.options.arrayNodeName && this.options.arrayNodeName.length > 1 && (e = {
    [this.options.arrayNodeName]: e
  }), this.j2x(e, 0, []).val);
};
W.prototype.j2x = function(e, t, n) {
  let r = "", s = "";
  const i = n.join(".");
  for (let a in e)
    if (Object.prototype.hasOwnProperty.call(e, a))
      if (typeof e[a] > "u")
        this.isAttribute(a) && (s += "");
      else if (e[a] === null)
        this.isAttribute(a) || a === this.options.cdataPropName ? s += "" : a[0] === "?" ? s += this.indentate(t) + "<" + a + "?" + this.tagEndChar : s += this.indentate(t) + "<" + a + "/" + this.tagEndChar;
      else if (e[a] instanceof Date)
        s += this.buildTextValNode(e[a], a, "", t);
      else if (typeof e[a] != "object") {
        const c = this.isAttribute(a);
        if (c && !this.ignoreAttributesFn(c, i))
          r += this.buildAttrPairStr(c, "" + e[a]);
        else if (!c)
          if (a === this.options.textNodeName) {
            let o = this.options.tagValueProcessor(a, "" + e[a]);
            s += this.replaceEntitiesValue(o);
          } else
            s += this.buildTextValNode(e[a], a, "", t);
      } else if (Array.isArray(e[a])) {
        const c = e[a].length;
        let o = "", u = "";
        for (let l = 0; l < c; l++) {
          const f = e[a][l];
          if (!(typeof f > "u")) if (f === null)
            a[0] === "?" ? s += this.indentate(t) + "<" + a + "?" + this.tagEndChar : s += this.indentate(t) + "<" + a + "/" + this.tagEndChar;
          else if (typeof f == "object")
            if (this.options.oneListGroup) {
              const m = this.j2x(f, t + 1, n.concat(a));
              o += m.val, this.options.attributesGroupName && f.hasOwnProperty(this.options.attributesGroupName) && (u += m.attrStr);
            } else
              o += this.processTextOrObjNode(f, a, t, n);
          else if (this.options.oneListGroup) {
            let m = this.options.tagValueProcessor(a, f);
            m = this.replaceEntitiesValue(m), o += m;
          } else
            o += this.buildTextValNode(f, a, "", t);
        }
        this.options.oneListGroup && (o = this.buildObjectNode(o, a, u, t)), s += o;
      } else if (this.options.attributesGroupName && a === this.options.attributesGroupName) {
        const c = Object.keys(e[a]), o = c.length;
        for (let u = 0; u < o; u++)
          r += this.buildAttrPairStr(c[u], "" + e[a][c[u]]);
      } else
        s += this.processTextOrObjNode(e[a], a, t, n);
  return { attrStr: r, val: s };
};
W.prototype.buildAttrPairStr = function(e, t) {
  return t = this.options.attributeValueProcessor(e, "" + t), t = this.replaceEntitiesValue(t), this.options.suppressBooleanAttributes && t === "true" ? " " + e : " " + e + '="' + t + '"';
};
function Wr(e, t, n, r) {
  const s = this.j2x(e, n + 1, r.concat(t));
  return e[this.options.textNodeName] !== void 0 && Object.keys(e).length === 1 ? this.buildTextValNode(e[this.options.textNodeName], t, s.attrStr, n) : this.buildObjectNode(s.val, t, s.attrStr, n);
}
W.prototype.buildObjectNode = function(e, t, n, r) {
  if (e === "")
    return t[0] === "?" ? this.indentate(r) + "<" + t + n + "?" + this.tagEndChar : this.indentate(r) + "<" + t + n + this.closeTag(t) + this.tagEndChar;
  {
    let s = "</" + t + this.tagEndChar, i = "";
    return t[0] === "?" && (i = "?", s = ""), (n || n === "") && e.indexOf("<") === -1 ? this.indentate(r) + "<" + t + n + i + ">" + e + s : this.options.commentPropName !== !1 && t === this.options.commentPropName && i.length === 0 ? this.indentate(r) + `<!--${e}-->` + this.newLine : this.indentate(r) + "<" + t + n + i + this.tagEndChar + e + this.indentate(r) + s;
  }
};
W.prototype.closeTag = function(e) {
  let t = "";
  return this.options.unpairedTags.indexOf(e) !== -1 ? this.options.suppressUnpairedNode || (t = "/") : this.options.suppressEmptyNode ? t = "/" : t = `></${e}`, t;
};
W.prototype.buildTextValNode = function(e, t, n, r) {
  if (this.options.cdataPropName !== !1 && t === this.options.cdataPropName)
    return this.indentate(r) + `<![CDATA[${e}]]>` + this.newLine;
  if (this.options.commentPropName !== !1 && t === this.options.commentPropName)
    return this.indentate(r) + `<!--${e}-->` + this.newLine;
  if (t[0] === "?")
    return this.indentate(r) + "<" + t + n + "?" + this.tagEndChar;
  {
    let s = this.options.tagValueProcessor(t, e);
    return s = this.replaceEntitiesValue(s), s === "" ? this.indentate(r) + "<" + t + n + this.closeTag(t) + this.tagEndChar : this.indentate(r) + "<" + t + n + ">" + s + "</" + t + this.tagEndChar;
  }
};
W.prototype.replaceEntitiesValue = function(e) {
  if (e && e.length > 0 && this.options.processEntities)
    for (let t = 0; t < this.options.entities.length; t++) {
      const n = this.options.entities[t];
      e = e.replace(n.regex, n.val);
    }
  return e;
};
function Br(e) {
  return this.options.indentBy.repeat(e);
}
function zr(e) {
  return e.startsWith(this.options.attributeNamePrefix) && e !== this.options.textNodeName ? e.substr(this.attrPrefixLen) : !1;
}
var Dr = W;
const Hr = Ce, Gr = Fr, Kr = Dr;
var Yr = {
  XMLParser: Gr,
  XMLValidator: Hr,
  XMLBuilder: Kr
};
const Jr = an(on), te = process.env.BPM_DEBUG === "1", qr = new Yr.XMLParser({
  ignoreAttributes: !1,
  attributeNamePrefix: "",
  parseAttributeValue: !0,
  allowBooleanAttributes: !0
});
async function yt(e) {
  try {
    const t = await T.readFile(e);
    let n;
    try {
      n = (await Jr(t)).toString("utf8");
    } catch {
      n = t.toString("utf8");
    }
    const r = Qr(n);
    if (r !== null)
      return te && console.log("[bpm] regex tempo", r, e), be(r);
    const s = qr.parse(n), i = Zr(s);
    if (i !== null)
      return te && console.log("[bpm] direct tempo", i, e), be(i);
    const a = vt(s), c = fe(a || s);
    return te && c !== null && console.log("[bpm] fallback tempo", c, e), be(c);
  } catch (t) {
    return te && console.log("[bpm] failed to parse", e, t), null;
  }
}
function be(e) {
  return e === null || !Number.isFinite(e) || e < 20 || e > 400 ? null : e;
}
function Zr(e) {
  const t = vt(e), n = j(t, "MasterTrack"), r = j(n, "DeviceChain"), s = j(r, "Mixer"), i = j(s, "Tempo"), a = j(i, "Manual"), c = At(a, "Value");
  return c === null ? null : Number(c);
}
function Qr(e) {
  const t = /<Tempo\b[^>]*>([\s\S]*?)<\/Tempo>/gi;
  let n;
  const r = [];
  for (; (n = t.exec(e)) !== null; ) {
    const u = n[1].match(/<Manual[^>]*Value="([0-9]+(?:\.[0-9]+)?)"/i);
    if (!u) continue;
    const l = Number(u[1]);
    Number.isFinite(l) && l >= 20 && l <= 400 && r.push(l);
  }
  if (r.length > 0)
    return r[0];
  const s = [], i = /<Manual[^>]*Value="([0-9]+(?:\.[0-9]+)?)"/gi;
  let a;
  for (; (a = i.exec(e)) !== null; ) {
    const o = Number(a[1]);
    Number.isFinite(o) && s.push(o);
  }
  te && s.length > 0 && console.log("[bpm] manual values found", s.slice(0, 20), "total", s.length);
  const c = s.filter((o) => o >= 20 && o <= 400);
  return c.length === 0 ? null : c[c.length - 1];
}
function fe(e) {
  if (e == null) return null;
  if (Array.isArray(e)) {
    for (const n of e) {
      const r = fe(n);
      if (r !== null) return r;
    }
    return null;
  }
  if (typeof e != "object") return null;
  const t = e;
  if (t.Tempo && typeof t.Tempo == "object") {
    const n = j(t.Tempo, "Manual"), r = At(n, "Value");
    if (r !== null) return Number(r);
  }
  for (const n of Object.keys(t)) {
    const r = fe(t[n]);
    if (r !== null) return r;
  }
  return null;
}
function vt(e) {
  const t = j(e, "LiveSet");
  if (t && typeof t == "object") return t;
  const n = j(e, "Ableton");
  if (n && typeof n == "object") {
    const r = j(n, "LiveSet");
    if (r && typeof r == "object") return r;
  }
  return null;
}
function j(e, t) {
  if (!e || typeof e != "object") return null;
  const r = e[t];
  return Array.isArray(r) ? r[0] ?? null : r ?? null;
}
function At(e, t) {
  if (!e || typeof e != "object") return null;
  const r = e[t];
  return r ?? null;
}
function Pt(e) {
  if (typeof e != "string" || e.trim().length === 0) return "als";
  const t = d.extname(e).toLowerCase();
  return t === ".flp" ? "flp" : t === ".ptx" ? "ptx" : "als";
}
function J(e) {
  return {
    id: e.id,
    groupKey: e.group_key,
    title: e.title,
    latestVersionId: e.latest_version_id ?? null,
    rootPath: e.root_path ?? null,
    abletonProjectPath: e.ableton_project_path ?? null,
    dawFormat: e.daw_format ?? "als",
    creationMode: e.creation_mode ?? "blank",
    sourceTemplatePath: e.source_template_path ?? null,
    sourceTemplateName: e.source_template_name ?? null,
    projectTypeLabel: e.project_type_label ?? null,
    audioPath: e.audio_path ?? null,
    backgroundImagePath: e.background_image_path ?? null,
    folderId: e.folder_id ?? null,
    status: e.status ?? "Idea",
    genre: e.genre ?? null,
    notes: e.notes ?? "",
    noteId: e.note_id ?? null,
    notePreview: e.note_preview ?? null,
    trashed: !!e.trashed,
    createdAt: Number(e.created_at),
    updatedAt: Number(e.updated_at)
  };
}
function se(e) {
  return {
    id: e.id,
    trackId: e.track_id,
    filePath: e.file_path,
    savedAt: Number(e.saved_at),
    fileSize: Number(e.file_size),
    bpm: e.bpm === null || e.bpm === void 0 ? null : Number(e.bpm),
    bpmSource: e.bpm_source ?? "auto",
    createdAt: Number(e.created_at)
  };
}
async function P(e, t = []) {
  await S();
  const n = F();
  return await new Promise((r, s) => {
    n.run(e, t, (i) => {
      if (i) {
        s(i);
        return;
      }
      r();
    });
  });
}
async function ne(e, t = []) {
  await S();
  const n = F();
  return await new Promise((r, s) => {
    n.all(e, t, (i, a) => {
      if (i) {
        s(i);
        return;
      }
      r(a);
    });
  });
}
async function M(e, t = []) {
  await S();
  const n = F();
  return await new Promise((r, s) => {
    n.get(e, t, (i, a) => {
      if (i) {
        s(i);
        return;
      }
      r(a ?? null);
    });
  });
}
async function ie(e, t) {
  return (await ne(
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
    ${e}
    ORDER BY COALESCE(v.saved_at, t.updated_at) DESC
    `,
    t
  )).map((r) => {
    const s = J(r), a = r.version_id !== null && r.version_id !== void 0 ? se({
      id: r.version_id,
      track_id: r.id,
      file_path: r.version_file_path,
      saved_at: r.version_saved_at,
      file_size: r.version_file_size,
      bpm: r.version_bpm,
      bpm_source: r.version_bpm_source,
      created_at: r.version_created_at
    }) : null;
    return {
      track: s,
      latestVersion: a,
      versionCount: Number(r.version_count ?? 0)
    };
  });
}
async function b() {
  return ie("WHERE t.trashed = 0", []);
}
async function es(e) {
  return ie("WHERE t.trashed = 0 AND t.folder_id = ?", [e]);
}
async function ts() {
  return ie("WHERE t.trashed = 1", []);
}
async function ns(e) {
  return (await ne(
    `
    SELECT * FROM track_versions
    WHERE track_id = ?
      AND LOWER(file_path) NOT LIKE '%(overwritten%'
      AND LOWER(file_path) NOT LIKE '%(autosaved%'
    ORDER BY saved_at DESC
    `,
    [e]
  )).map((n) => se(n));
}
async function rs(e, t) {
  const n = await M("SELECT id, file_path FROM track_versions WHERE id = ? AND track_id = ?", [
    t,
    e
  ]);
  return n ? (await P(
    "UPDATE tracks SET latest_version_id = ?, ableton_project_path = ?, updated_at = ? WHERE id = ?",
    [t, n.file_path, Date.now(), e]
  ), (await ie("WHERE t.id = ?", [e]))[0] ?? null) : null;
}
async function ss(e, t) {
  await P("UPDATE tracks SET folder_id = ?, updated_at = ? WHERE id = ?", [
    t,
    Date.now(),
    e
  ]);
  const n = await M("SELECT * FROM tracks WHERE id = ?", [e]);
  return n ? J(n) : null;
}
async function is(e, t) {
  await P("UPDATE tracks SET status = ?, updated_at = ? WHERE id = ?", [
    t,
    Date.now(),
    e
  ]);
  const n = await M("SELECT * FROM tracks WHERE id = ?", [e]);
  return n ? J(n) : null;
}
async function os(e, t) {
  await P("UPDATE tracks SET genre = ?, updated_at = ? WHERE id = ?", [
    t,
    Date.now(),
    e
  ]);
  const n = await M("SELECT * FROM tracks WHERE id = ?", [e]);
  return n ? J(n) : null;
}
async function as(e, t) {
  await P("UPDATE tracks SET audio_path = ?, updated_at = ? WHERE id = ?", [
    t,
    Date.now(),
    e
  ]);
  const n = await M("SELECT * FROM tracks WHERE id = ?", [e]);
  return n ? J(n) : null;
}
async function kt(e, t) {
  const n = await M("SELECT latest_version_id FROM tracks WHERE id = ?", [e]);
  n != null && n.latest_version_id && await P("UPDATE track_versions SET bpm = ?, bpm_source = ? WHERE id = ?", [
    t,
    "manual",
    n.latest_version_id
  ]);
}
async function cs(e) {
  if (e.length === 0) return b();
  const t = e.map(() => "?").join(",");
  return await P(`UPDATE tracks SET trashed = 1 WHERE id IN (${t})`, e), b();
}
async function ls(e) {
  if (e.length === 0) return b();
  const t = e.map(() => "?").join(",");
  return await P(`UPDATE tracks SET trashed = 0 WHERE id IN (${t})`, e), b();
}
async function us(e) {
  if (e.length === 0) return b();
  const t = e.map(() => "?").join(",");
  return await P(`DELETE FROM track_versions WHERE track_id IN (${t})`, e), await P(`DELETE FROM tracks WHERE id IN (${t})`, e), b();
}
async function Rt(e) {
  if (e.length === 0) return b();
  await S();
  const t = F(), n = Array.from(new Set(e.map((a) => K(a.filePath)))), r = n.length ? await ne(`SELECT * FROM tracks WHERE group_key IN (${n.map(() => "?").join(",")})`, n) : [], s = /* @__PURE__ */ new Map();
  for (const a of r) {
    const c = J(a);
    s.set(c.groupKey, c);
  }
  const i = Date.now();
  for (const a of e) {
    const c = K(a.filePath);
    if (!s.has(c)) {
      const o = O(), u = ue(a.filePath), l = {
        id: o,
        groupKey: c,
        title: u,
        latestVersionId: null,
        rootPath: null,
        abletonProjectPath: null,
        dawFormat: a.ext ?? "als",
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
        trashed: !1,
        createdAt: i,
        updatedAt: i
      };
      s.set(c, l);
    }
  }
  return await new Promise((a, c) => {
    t.serialize(() => {
      const o = t.prepare(
        `
        INSERT OR IGNORE INTO tracks (
          id, group_key, title, latest_version_id, ableton_project_path, audio_path, background_image_path, folder_id, status, notes, trashed, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ), u = t.prepare(
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
      ), l = t.prepare(
        `
        UPDATE tracks SET latest_version_id = ?, ableton_project_path = ?, daw_format = ?, updated_at = ? WHERE id = ?
        `
      ), f = t.prepare(
        `
        UPDATE tracks SET title = ?, updated_at = ? WHERE id = ?
        `
      );
      try {
        for (const p of s.values())
          o.run([
            p.id,
            p.groupKey,
            p.title,
            p.latestVersionId,
            p.abletonProjectPath,
            p.audioPath,
            p.backgroundImagePath,
            p.folderId,
            p.status,
            p.notes,
            p.trashed ? 1 : 0,
            p.createdAt,
            p.updatedAt
          ]);
        for (const p of e) {
          const E = K(p.filePath), _ = s.get(E);
          if (!_) continue;
          const N = ue(p.filePath);
          N && N !== _.title && (f.run([N, i, _.id]), _.title = N);
          const v = Y(p.filePath), y = (v == null ? void 0 : v.versionTimestampMs) ?? p.lastModifiedMs, k = O();
          u.run([
            k,
            _.id,
            p.filePath,
            y,
            p.fileSize,
            null,
            "auto",
            null,
            i
          ]);
        }
        const m = Array.from(new Set(Array.from(s.values()).map((p) => p.id)));
        for (const p of m) {
          const E = t.prepare(
            "SELECT id, file_path, saved_at FROM track_versions WHERE track_id = ? ORDER BY saved_at DESC LIMIT 1"
          ).get(p);
          if (E && typeof E.file_path == "string") {
            const _ = Pt(E.file_path);
            l.run([E.id, E.file_path, _, i, p]);
          } else E && console.warn("[trackStore] missing latest file_path during upsertScanResults", {
            trackId: p,
            latestVersionId: E.id
          });
        }
        o.finalize(), u.finalize(), l.finalize(), f.finalize(), a();
      } catch (m) {
        c(m);
      }
    });
  }), await P(
    `
    DELETE FROM track_versions
    WHERE LOWER(file_path) LIKE '%.flp'
      AND (
        LOWER(file_path) LIKE '%(overwritten%'
        OR LOWER(file_path) LIKE '%(autosaved%'
      )
    `,
    []
  ), await hs(), b();
}
async function ds(e) {
  await S();
  const t = Date.now(), n = K(e.dawProjectPath), r = O();
  await P(
    `
    INSERT INTO tracks (
      id, group_key, title, latest_version_id, root_path, ableton_project_path, daw_format, creation_mode, source_template_path, source_template_name, project_type_label, audio_path, background_image_path, folder_id, status, notes, trashed, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      e.projectId,
      n,
      e.projectName,
      r,
      e.rootPath,
      e.dawProjectPath,
      e.dawFormat,
      e.creationMode,
      e.sourceTemplatePath,
      e.sourceTemplateName,
      e.projectTypeLabel,
      null,
      null,
      e.folderId,
      e.status,
      "",
      0,
      t,
      t
    ]
  ), await P(
    `
    INSERT INTO track_versions (
      id, track_id, file_path, saved_at, file_size, bpm, bpm_source, content_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      r,
      e.projectId,
      e.dawProjectPath,
      e.savedAt,
      e.fileSize,
      null,
      "auto",
      null,
      t
    ]
  );
  const s = await ie("WHERE t.id = ?", [e.projectId]);
  if (!s[0])
    throw new Error("Project row was created but could not be loaded.");
  return s[0];
}
async function fs(e) {
  const t = await M("SELECT * FROM track_versions WHERE file_path = ?", [e]);
  return t ? se(t) : null;
}
async function It(e, t, n) {
  await P("UPDATE track_versions SET bpm = ?, bpm_source = ? WHERE id = ?", [t, n, e]);
  const r = await M("SELECT * FROM track_versions WHERE id = ?", [e]);
  return r ? se(r) : null;
}
async function ps(e) {
  const t = e.toLowerCase(), n = await M(
    "SELECT * FROM track_versions WHERE LOWER(file_path) LIKE ? LIMIT 1",
    [`%${t}`]
  );
  if (!n) return null;
  const r = se(n), s = await yt(r.filePath);
  return s === null ? null : It(r.id, s, "als");
}
async function hs() {
  await S();
  const e = F(), t = await ne("SELECT * FROM tracks", []), n = await ne("SELECT * FROM track_versions", []), r = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map();
  for (const a of t)
    r.set(a.id, a), a.group_key && s.set(a.group_key, a);
  const i = /* @__PURE__ */ new Map();
  for (const a of n) {
    const c = a.file_path, o = K(c), u = i.get(o) ?? [];
    u.push(a), i.set(o, u);
  }
  await new Promise((a, c) => {
    e.serialize(() => {
      e.run("UPDATE tracks SET group_key = id");
      const o = e.prepare(
        "UPDATE track_versions SET track_id = ? WHERE id = ?"
      ), u = e.prepare(
        `
        UPDATE tracks
        SET group_key = ?, title = ?, latest_version_id = ?, ableton_project_path = ?, daw_format = ?, audio_path = ?, background_image_path = ?, folder_id = ?, status = ?, notes = ?, trashed = ?, updated_at = ?
        WHERE id = ?
        `
      ), l = e.prepare(
        `
        INSERT INTO tracks (
        id, group_key, title, latest_version_id, root_path, ableton_project_path, daw_format, creation_mode, source_template_path, source_template_name, project_type_label, audio_path, background_image_path, folder_id, status, notes, trashed, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      );
      try {
        const f = /* @__PURE__ */ new Set();
        for (const [m, p] of i.entries()) {
          const _ = [...p].sort((q, ae) => {
            const _e = Y(q.file_path) !== null, Ze = Y(ae.file_path) !== null;
            return !_e && Ze ? -1 : _e && !Ze ? 1 : Number(ae.saved_at) - Number(q.saved_at);
          })[0], N = _.file_path;
          if (typeof N != "string" || N.trim().length === 0) {
            console.warn("[trackStore] skipping grouped row with invalid file_path", { groupKey: m });
            continue;
          }
          const v = N, y = s.get(m), k = r.get(_.track_id), h = y ?? k, X = (h == null ? void 0 : h.id) ?? O(), We = ue(v), Be = (h == null ? void 0 : h.folder_id) ?? null, ze = (h == null ? void 0 : h.status) ?? "Idea", De = (h == null ? void 0 : h.notes) ?? "", He = Number((h == null ? void 0 : h.trashed) ?? 0), Ge = (h == null ? void 0 : h.audio_path) ?? null, Ke = (h == null ? void 0 : h.background_image_path) ?? null, Kt = (h == null ? void 0 : h.root_path) ?? d.dirname(v), Yt = Number((h == null ? void 0 : h.created_at) ?? Date.now()), Ye = Date.now(), Je = _.id, qe = Pt(v), Jt = (h == null ? void 0 : h.creation_mode) ?? "blank", qt = (h == null ? void 0 : h.source_template_path) ?? null, Zt = (h == null ? void 0 : h.source_template_name) ?? null, Qt = (h == null ? void 0 : h.project_type_label) ?? null;
          h ? u.run([
            m,
            We,
            Je,
            v,
            qe,
            Ge,
            Ke,
            Be,
            ze,
            De,
            He,
            Ye,
            X
          ]) : l.run([
            X,
            m,
            We,
            Je,
            Kt,
            v,
            qe,
            Jt,
            qt,
            Zt,
            Qt,
            Ge,
            Ke,
            Be,
            ze,
            De,
            He,
            Yt,
            Ye
          ]), f.add(X);
          for (const q of p) {
            const ae = q.id;
            q.track_id !== X && o.run([X, ae]);
          }
        }
        if (f.size > 0) {
          const m = Array.from(f).map(() => "?").join(",");
          e.run(`DELETE FROM tracks WHERE id NOT IN (${m})`, Array.from(f));
        }
        e.run(
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
        ), e.run(
          `
          DELETE FROM tracks
          WHERE id NOT IN (SELECT DISTINCT track_id FROM track_versions)
          `
        ), o.finalize(), u.finalize(), l.finalize(), a();
      } catch (f) {
        c(f);
      }
    });
  });
}
class St extends Error {
  constructor(n, r) {
    super(n);
    ce(this, "projectId");
    ce(this, "projectFolderPath");
    ce(this, "projectFilePath");
    this.name = "ProjectCreatedOnDiskSyncError", this.projectId = r.projectId, this.projectFolderPath = r.projectFolderPath, this.projectFilePath = r.projectFilePath;
  }
}
const ms = ["Samples", "Exports", "Stems", "Notes"];
function gs(e) {
  return Array.from(e).map((n) => {
    const r = n.charCodeAt(0);
    return r >= 0 && r <= 31 || '<>:"/\\|?*'.includes(n) ? " " : n;
  }).join("").replace(/\s+/g, " ").trim();
}
async function Es(e) {
  if (await T.mkdir(e, { recursive: !0 }), !(await T.stat(e)).isDirectory())
    throw new Error("Save location is not a directory.");
}
async function Ts(e, t) {
  for (let n = 0; n < 500; n += 1) {
    const r = n === 0 ? t : `${t} (${n})`, s = d.join(e, r);
    try {
      await T.access(s);
      continue;
    } catch {
      return s;
    }
  }
  throw new Error("Could not resolve a unique project folder name.");
}
async function _s(e, t) {
  await T.writeFile(e, JSON.stringify(t, null, 2), "utf8");
}
async function Lt(e, t) {
  var v;
  const n = gs(e.projectName);
  if (!n)
    throw new Error("Project name is required.");
  const r = d.resolve(e.saveTo);
  await Es(r);
  const s = e.templateOptions.mode, i = s === "template" ? "als" : e.dawFormat, a = i, c = await Ts(r, n);
  await T.mkdir(c, { recursive: !0 });
  const o = d.join(c, `${n}.${a}`);
  if (s === "template") {
    const y = (v = e.templateOptions.templatePath) == null ? void 0 : v.trim();
    if (!y)
      throw new Error("Template is required for template mode.");
    const k = d.resolve(y), h = await T.stat(k).catch(() => null);
    if (!h || !h.isFile())
      throw new Error("Selected template file could not be found.");
    if (!k.toLowerCase().endsWith(".als"))
      throw new Error("Selected template must be an Ableton .als file.");
    await T.copyFile(k, o, T.constants.COPYFILE_EXCL);
  } else
    await T.writeFile(o, "", { flag: "wx" });
  e.templateOptions.createStandardFolders && await Promise.all(
    ms.map(
      (y) => T.mkdir(d.join(c, y), { recursive: !0 })
    )
  );
  const u = (/* @__PURE__ */ new Date()).toISOString(), l = O(), f = s === "template" ? d.resolve(e.templateOptions.templatePath ?? "") : null, m = s === "template" ? e.templateOptions.templateDisplayName ?? null : null, p = e.templateOptions.projectTypeLabel ?? null;
  await _s(d.join(c, ".studio-vaulted.json"), {
    projectId: l,
    projectName: n,
    createdAt: u,
    mode: s,
    templateSourcePath: f,
    templateDisplayName: m,
    projectTypeLabel: p,
    dawFormat: i
  });
  const E = await T.stat(o), _ = {
    projectId: l,
    projectName: n,
    rootPath: c,
    dawProjectPath: o,
    dawFormat: i,
    folderId: e.folderId ?? null,
    status: e.initialStatus,
    creationMode: s,
    sourceTemplatePath: f,
    sourceTemplateName: m,
    projectTypeLabel: p,
    fileSize: E.size,
    savedAt: E.mtimeMs
  }, N = ds;
  try {
    const y = await N(_);
    return {
      projectId: l,
      projectFolderPath: c,
      projectFilePath: o,
      createdFromTemplate: s === "template",
      track: y
    };
  } catch (y) {
    const k = y instanceof Error ? y.message : "Unknown database error";
    throw new St(
      `Project created on disk but failed to sync library: ${k}`,
      { projectId: l, projectFolderPath: c, projectFilePath: o }
    );
  }
}
async function Ns(e) {
  return yt(e);
}
const ws = 3, Re = [], Ie = /* @__PURE__ */ new Set();
let ye = 0;
function Ee(e) {
  let t = 0;
  for (const n of e)
    Ie.has(n) || (Ie.add(n), Re.push(n), t += 1);
  return Ot(), t;
}
function Ot() {
  for (; ye < ws && Re.length > 0; ) {
    const e = Re.shift();
    if (!e) break;
    ye += 1, bs(e).catch(() => {
    }).finally(() => {
      ye -= 1, Ie.delete(e), Ot();
    });
  }
}
async function bs(e) {
  const t = await fs(e);
  if (!t || !t.filePath.toLowerCase().endsWith(".als") || t.bpm !== null && t.bpmSource === "als") return;
  const n = await Ns(t.filePath);
  process.env.BPM_DEBUG === "1" && console.log("[bpm] queued", t.filePath, "->", n);
  const r = await It(t.id, n, "auto");
  if (r)
    for (const s of he.getAllWindows())
      s.webContents.send("bpmUpdated", { id: r.id, bpm: r.bpm });
}
function ys(e) {
  return {
    id: e.id,
    name: e.name,
    createdAt: Number(e.created_at),
    updatedAt: Number(e.updated_at)
  };
}
async function pe(e, t = []) {
  await S();
  const n = F();
  return await new Promise((r, s) => {
    n.run(e, t, (i) => {
      if (i) {
        s(i);
        return;
      }
      r();
    });
  });
}
async function vs(e, t = []) {
  await S();
  const n = F();
  return await new Promise((r, s) => {
    n.all(e, t, (i, a) => {
      if (i) {
        s(i);
        return;
      }
      r(a);
    });
  });
}
async function D() {
  return (await vs("SELECT * FROM folders ORDER BY updated_at DESC")).map((t) => ys(t));
}
async function As(e) {
  const t = Date.now(), n = O();
  return await pe(
    "INSERT INTO folders (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [n, e, t, t]
  ), D();
}
async function Ps(e, t) {
  const n = Date.now();
  return await pe("UPDATE folders SET name = ?, updated_at = ? WHERE id = ?", [t, n, e]), D();
}
async function ks(e) {
  return await pe("UPDATE tracks SET folder_id = NULL WHERE folder_id = ?", [e]), await pe("DELETE FROM folders WHERE id = ?", [e]), D();
}
function Ft() {
  return d.join(U.getPath("userData"), "notes_media");
}
function it() {
  return Ft();
}
function xe(e) {
  return {
    id: e.id,
    trackId: e.track_id,
    contentJson: e.content_json ?? '{"type":"doc","html":""}',
    plainTextPreview: e.plain_text_preview ?? "",
    createdAt: Number(e.created_at),
    updatedAt: Number(e.updated_at)
  };
}
function Te(e) {
  return {
    id: e.id,
    noteId: e.note_id,
    type: e.type,
    filePath: e.file_path,
    originalName: e.original_name,
    sizeBytes: Number(e.size_bytes),
    createdAt: Number(e.created_at)
  };
}
async function oe(e, t = []) {
  await S();
  const n = F();
  return await new Promise((r, s) => {
    n.run(e, t, (i) => {
      if (i) {
        s(i);
        return;
      }
      r();
    });
  });
}
async function $(e, t = []) {
  await S();
  const n = F();
  return await new Promise((r, s) => {
    n.get(e, t, (i, a) => {
      if (i) {
        s(i);
        return;
      }
      r(a ?? null);
    });
  });
}
async function Rs(e, t = []) {
  await S();
  const n = F();
  return await new Promise((r, s) => {
    n.all(e, t, (i, a) => {
      if (i) {
        s(i);
        return;
      }
      r(a ?? []);
    });
  });
}
function Is(e) {
  return e.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "").replace(/on\w+="[^"]*"/gi, "").replace(/on\w+='[^']*'/gi, "");
}
function Ss(e, t = 100) {
  try {
    const n = JSON.parse(e);
    return (typeof n.html == "string" ? n.html : "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, t);
  } catch {
    return "";
  }
}
function Ls(e) {
  let t = "";
  try {
    const n = JSON.parse(e);
    typeof n.html == "string" && (t = n.html);
  } catch {
  }
  return JSON.stringify({
    type: "doc",
    version: 1,
    html: Is(t)
  });
}
async function Ct(e) {
  if (!e) return null;
  const t = await $("SELECT * FROM track_notes WHERE track_id = ?", [e]);
  return t ? xe(t) : null;
}
async function jt(e) {
  const t = await Ct(e);
  if (t) return t;
  const n = Date.now(), r = O(), s = JSON.stringify({ type: "doc", version: 1, html: "" });
  await oe(
    `
    INSERT INTO track_notes (id, track_id, content_json, plain_text_preview, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [r, e, s, "", n, n]
  ), await Ut(e);
  const i = await $("SELECT * FROM track_notes WHERE id = ?", [r]);
  if (!i) throw new Error("Failed to create note.");
  return xe(i);
}
async function Os(e, t) {
  const n = await jt(e), r = Ls(t), s = Ss(r), i = Date.now();
  await oe(
    "UPDATE track_notes SET content_json = ?, plain_text_preview = ?, updated_at = ? WHERE id = ?",
    [r, s, i, n.id]
  );
  const a = await $("SELECT * FROM track_notes WHERE id = ?", [n.id]);
  if (!a) throw new Error("Failed to update note.");
  return xe(a);
}
async function Me(e) {
  return e ? (await Rs(
    "SELECT * FROM note_media WHERE note_id = ? ORDER BY created_at DESC",
    [e]
  )).map((n) => Te(n)) : [];
}
async function Ut(e) {
  const t = d.join(Ft(), e);
  return await T.mkdir(t, { recursive: !0 }), t;
}
async function xt(e) {
  const t = await $("SELECT id, track_id FROM track_notes WHERE id = ?", [e.noteId]);
  if (!t || t.track_id !== e.trackId)
    throw new Error("Note not found for track.");
  const n = O(), r = e.extension.replace(/[^a-zA-Z0-9.]/g, "").replace(/^\.+/, "") || "bin", s = `${Date.now()}-${n}.${r}`, i = await Ut(e.trackId), a = d.join(i, s);
  await T.writeFile(a, e.bytes);
  const c = Date.now();
  await oe(
    `
    INSERT INTO note_media (id, note_id, type, file_path, original_name, size_bytes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [n, e.noteId, e.type, a, e.originalName, e.bytes.byteLength, c]
  );
  const o = await $("SELECT * FROM note_media WHERE id = ?", [n]);
  if (!o) throw new Error("Failed to save note media metadata.");
  return Te(o);
}
async function Fs(e) {
  if (!e) return { ok: !1 };
  const t = await $("SELECT * FROM note_media WHERE id = ?", [e]);
  if (!t) return { ok: !1 };
  const n = Te(t);
  await oe("DELETE FROM note_media WHERE id = ?", [e]);
  try {
    await T.unlink(n.filePath);
  } catch {
  }
  return { ok: !0 };
}
async function Cs(e, t) {
  if (!e) return { ok: !1, error: "Media id is required." };
  const n = t.trim();
  if (!n) return { ok: !1, error: "Name cannot be empty." };
  if (n.length > 120) return { ok: !1, error: "Name is too long." };
  if (!await $("SELECT * FROM note_media WHERE id = ?", [e])) return { ok: !1, error: "Recording not found." };
  await oe("UPDATE note_media SET original_name = ? WHERE id = ?", [n, e]);
  const s = await $("SELECT * FROM note_media WHERE id = ?", [e]);
  return s ? { ok: !0, media: Te(s) } : { ok: !1, error: "Failed to rename recording." };
}
const js = {
  free: {
    features: {
      notes: !1,
      templates: !1
    },
    limits: {
      folders: 3,
      groups: 3
    }
  },
  paid: {
    features: {
      notes: !0,
      templates: !0
    },
    limits: {
      folders: 1 / 0,
      groups: 1 / 0
    }
  }
}, Us = /^SVL-[0-9A-F]{8}-[0-9A-F]{8}$/, xs = "sv-2025-k9x#mLp!qR7nWz", Ms = typeof process < "u" && process.env.LICENSE_SERVER_URL || "https://license.studiovaulted.com", Xs = 7 * 24 * 60 * 60 * 1e3, Xe = "studio-vaulted.lic";
function $e() {
  return d.join(U.getPath("userData"), Xe);
}
function Mt(e, t) {
  return e.split("").map((n, r) => String.fromCharCode(n.charCodeAt(0) ^ t.charCodeAt(r % t.length))).join("");
}
function $s(e) {
  return Buffer.from(Mt(JSON.stringify(e), Xe)).toString("base64");
}
function Vs(e) {
  try {
    const t = Buffer.from(e, "base64").toString("utf8");
    return JSON.parse(Mt(t, Xe));
  } catch {
    return null;
  }
}
function Ws(e) {
  return typeof e == "object" && e !== null && typeof e.key == "string" && typeof e.token == "string" && typeof e.machineId == "string" && typeof e.lastVerifiedAt == "number";
}
async function Se(e) {
  await T.writeFile($e(), $s(e), "utf8");
}
async function Xt() {
  try {
    const e = await T.readFile($e(), "utf8"), t = Vs(e.trim());
    return Ws(t) ? t : null;
  } catch {
    return null;
  }
}
async function Le() {
  try {
    await T.unlink($e());
  } catch {
  }
}
const Bs = "machine.id";
function zs() {
  return d.join(U.getPath("userData"), Bs);
}
let H = null;
async function Ds() {
  if (H) return H;
  const e = zs(), t = Ne.isEncryptionAvailable();
  try {
    if (t) {
      const n = await T.readFile(e);
      H = Ne.decryptString(n);
    } else
      H = await T.readFile(e, "utf8");
    return H;
  } catch {
    const n = lt.randomUUID();
    try {
      t ? await T.writeFile(e, Ne.encryptString(n)) : await T.writeFile(e, n, "utf8");
    } catch (r) {
      console.error("[machineId] Failed to persist machine ID:", r);
    }
    return H = n, n;
  }
}
async function Ve(e, t) {
  const n = await fetch(`${Ms}${e}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(t),
    signal: AbortSignal.timeout(1e4)
  });
  if (!n.ok) throw new Error(`License server returned HTTP ${n.status}`);
  return n.json();
}
function Hs(e, t) {
  return Ve("/activate", { key: e, machineId: t });
}
function Gs(e, t, n) {
  return Ve("/deactivate", { key: e, machineId: t, token: n });
}
function Ks(e, t, n) {
  return Ve("/verify", { key: e, machineId: t, token: n });
}
let R = "free", I = null;
function Ys(e) {
  const t = e.split("-");
  return t.length !== 3 ? "***" : `${t[0]}-${t[1]}-********`;
}
function $t(e) {
  return Us.test(e.trim().toUpperCase());
}
function Vt(e) {
  const n = e.trim().toUpperCase().split("-");
  if (n.length !== 3) return !1;
  const [, r, s] = n, i = lt.createHmac("sha256", xs).update(r).digest("hex").substring(0, 8).toUpperCase();
  return s === i;
}
async function Js() {
  const e = await Xt();
  if (!e) {
    R = "free", I = null;
    return;
  }
  if (!$t(e.key) || !Vt(e.key)) {
    R = "free", I = null, await Le();
    return;
  }
  if (Date.now() - e.lastVerifiedAt <= Xs) {
    R = "paid", I = e.key;
    return;
  }
  try {
    (await Ks(e.key, e.machineId, e.token)).valid ? (await Se({ ...e, lastVerifiedAt: Date.now() }), R = "paid", I = e.key) : (R = "free", I = null, await Le());
  } catch {
    R = "paid", I = e.key;
  }
}
async function qs(e) {
  const t = e.trim().toUpperCase();
  if (!$t(t))
    return { success: !1, error: "Invalid key format. Expected SVL-XXXXXXXX-YYYYYYYY." };
  if (!Vt(t))
    return { success: !1, error: "License key is not valid." };
  let n;
  try {
    n = await Ds();
  } catch {
    return { success: !1, error: "Could not identify this machine. Please try again." };
  }
  if (process.env.NODE_ENV === "development")
    return await Se({ key: t, token: "dev-token", machineId: n, lastVerifiedAt: Date.now() }), R = "paid", I = t, { success: !0 };
  try {
    const r = await Hs(t, n);
    return !r.success || !r.token ? { success: !1, error: r.error ?? "Activation failed." } : (await Se({ key: t, token: r.token, machineId: n, lastVerifiedAt: Date.now() }), R = "paid", I = t, { success: !0 });
  } catch {
    return {
      success: !1,
      error: "Could not reach the activation server. Check your internet connection and try again."
    };
  }
}
async function Zs() {
  const e = await Xt();
  if (e)
    try {
      await Gs(e.key, e.machineId, e.token);
    } catch {
    }
  await Le(), R = "free", I = null;
}
function Qs() {
  const e = js[R];
  return {
    plan: R,
    activatedKey: I ? Ys(I) : null,
    features: { ...e.features },
    limits: { ...e.limits }
  };
}
const Oe = process.env.DEBUG_AUDIO === "1", Wt = /* @__PURE__ */ new Set([".mp3", ".wav", ".aiff", ".aif", ".m4a", ".flac", ".webm", ".ogg", ".opus"]), ei = /* @__PURE__ */ new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".svg"]);
let V = [], G = null, ve = null;
at.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: !0, secure: !0, supportFetchAPI: !0 } }
]);
const ti = nn(import.meta.url), Bt = d.dirname(ti);
process.env.APP_ROOT = d.join(Bt, "..");
const Fe = process.env.VITE_DEV_SERVER_URL, gi = d.join(process.env.APP_ROOT, "dist-electron"), zt = d.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = Fe ? d.join(process.env.APP_ROOT, "public") : zt;
let C;
function Dt() {
  const e = d.join(process.env.VITE_PUBLIC, "Studio-vaulted-icon-1.png"), t = d.join(process.env.VITE_PUBLIC, "Studio-vaulted-icon-1.ico"), n = process.platform === "win32" && ct(t) ? t : e;
  C = new he({
    icon: n,
    webPreferences: {
      contextIsolation: !0,
      nodeIntegration: !1,
      preload: d.join(Bt, "preload.mjs")
    }
  }), C.maximize(), C.webContents.on("did-finish-load", () => {
    C == null || C.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), Fe ? C.loadURL(Fe) : C.loadFile(d.join(zt, "index.html"));
}
function Ht(e, t) {
  if (t.length === 0) return !1;
  const n = d.resolve(e);
  return t.some((r) => {
    const s = d.resolve(r);
    return process.platform === "win32" ? n.toLowerCase().startsWith(s.toLowerCase() + d.sep) : n.startsWith(s + d.sep);
  });
}
function ot(e, t) {
  const n = d.resolve(e), r = d.resolve(t);
  if (process.platform === "win32") {
    const s = n.toLowerCase(), i = r.toLowerCase();
    return s === i || s.startsWith(i + d.sep);
  }
  return n === r || n.startsWith(r + d.sep);
}
async function ni() {
  at.registerFileProtocol("app", async (e, t) => {
    try {
      const n = new URL(e.url), r = n.searchParams.get("path");
      if (!r) {
        t({ error: -6 });
        return;
      }
      const s = d.extname(r).toLowerCase();
      if (n.hostname === "media") {
        if (!ei.has(s)) {
          t({ error: -6 });
          return;
        }
        const i = it();
        if (!ot(r, i)) {
          t({ error: -6 });
          return;
        }
        await T.access(r), t({ path: r });
        return;
      }
      if (n.hostname === "audio") {
        if (!Wt.has(s)) {
          t({ error: -6 });
          return;
        }
        if (!Ht(r, V)) {
          const i = it();
          if (ot(r, i)) {
            await T.access(r), t({ path: r });
            return;
          }
          Oe && console.warn("[audio] blocked path outside roots", r), t({ error: -6 });
          return;
        }
        await T.access(r), t({ path: r });
        return;
      }
      t({ error: -6 });
    } catch (n) {
      Oe && console.warn("[audio] protocol error", n), t({ error: -6 });
    }
  });
}
async function ri(e) {
  const t = await x(), n = (e == null ? void 0 : e.root) ?? t.projectRootDir;
  if (!n)
    return console.warn("[scanRoot] root-not-set: no project root configured"), {
      tracks: await b(),
      found: 0,
      settings: t,
      error: "root-not-set"
    };
  const r = d.resolve(n), s = (e == null ? void 0 : e.scanSubfolders) ?? t.scanSubfolders;
  try {
    if (!(await T.stat(r)).isDirectory())
      return console.warn("[scanRoot] root-not-directory:", r), {
        tracks: await b(),
        found: 0,
        settings: t,
        error: "root-not-directory"
      };
  } catch (u) {
    const l = u;
    return (l == null ? void 0 : l.code) === "EACCES" || (l == null ? void 0 : l.code) === "EPERM" ? (console.warn("[scanRoot] root-permission-denied:", r, l == null ? void 0 : l.code), {
      tracks: await b(),
      found: 0,
      settings: t,
      error: "root-permission-denied"
    }) : (console.warn("[scanRoot] root-missing:", r, (l == null ? void 0 : l.code) ?? "unknown"), {
      tracks: await b(),
      found: 0,
      settings: t,
      error: "root-missing"
    });
  }
  try {
    await T.access(r, T.constants.R_OK);
  } catch (u) {
    const l = u;
    return (l == null ? void 0 : l.code) === "EACCES" || (l == null ? void 0 : l.code) === "EPERM" ? (console.warn("[scanRoot] scan-permission-denied:", r, l == null ? void 0 : l.code), {
      tracks: await b(),
      found: 0,
      settings: t,
      error: "root-permission-denied"
    }) : (console.warn("[scanRoot] scan-failed-access:", r, (l == null ? void 0 : l.code) ?? "unknown"), {
      tracks: await b(),
      found: 0,
      settings: t,
      error: "scan-failed"
    });
  }
  V = [r];
  const i = await gn(r, {
    recursive: s,
    maxDepth: 8
  });
  console.info(
    "[scanRoot] scan-complete:",
    JSON.stringify({ root: r, recursive: s, found: i.length })
  );
  const a = await Rt(
    i.map((u) => ({
      name: u.displayName,
      filePath: u.filePath,
      ext: "als",
      lastModifiedMs: u.modifiedTime,
      fileSize: u.fileSize
    }))
  ), c = a.map((u) => {
    var l;
    return (l = u.latestVersion) == null ? void 0 : l.filePath;
  }).filter(
    (u) => typeof u == "string" && u.toLowerCase().endsWith(".als")
  );
  c.length > 0 && Ee(c);
  const o = await de({
    projectRootDir: r,
    scanSubfolders: s,
    lastScanAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  return {
    tracks: a,
    found: i.length,
    settings: o
  };
}
function Gt(e, t) {
  const n = e.toLowerCase();
  return n.includes("png") ? "png" : n.includes("jpeg") || n.includes("jpg") ? "jpg" : n.includes("webp") ? "webp" : n.includes("gif") ? "gif" : n.includes("wav") ? "wav" : n.includes("ogg") ? "ogg" : n.includes("webm") ? "webm" : n.includes("mpeg") || n.includes("mp3") ? "mp3" : d.extname(t).replace(".", "").toLowerCase() || "bin";
}
g.handle("pickFolders", async () => {
  const e = await re.showOpenDialog({
    properties: ["openDirectory", "multiSelections"]
  });
  return e.canceled ? [] : (V = e.filePaths, e.filePaths);
});
g.handle("settings:getAll", async () => x());
g.handle("settings:update", async (e, t) => de(t ?? {}));
g.handle("settings:chooseDirectory", async () => {
  const e = await re.showOpenDialog({
    properties: ["openDirectory"]
  });
  return e.canceled || e.filePaths.length === 0 ? null : e.filePaths[0];
});
g.handle("templates:list", async () => {
  const e = await x();
  return pt(e);
});
g.handle("templates:refresh", async () => {
  const e = await x();
  return pt(e);
});
g.handle("templates:chooseFolder", async () => {
  const e = await re.showOpenDialog({
    properties: ["openDirectory"]
  });
  return e.canceled || e.filePaths.length === 0 ? null : e.filePaths[0];
});
g.handle("pickAudioFile", async () => {
  const e = await re.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "Audio", extensions: Array.from(Wt).map((n) => n.slice(1)) }
    ]
  });
  if (e.canceled || e.filePaths.length === 0)
    return { path: null };
  const t = e.filePaths[0];
  return Ht(t, V) ? { path: t } : (Oe && console.warn("[audio] selected file outside roots", t), { path: null, reason: "outside-roots" });
});
g.handle("scanProjects", async (e, t) => {
  if (!Array.isArray(t)) return [];
  V = t;
  const n = await un(t, { maxDepth: 6 }), r = await Rt(n), s = r.map((i) => {
    var a;
    return (a = i.latestVersion) == null ? void 0 : a.filePath;
  }).filter(
    (i) => typeof i == "string" && i.toLowerCase().endsWith(".als")
  );
  return s.length > 0 && Ee(s), r;
});
g.handle(
  "projects:scanRoot",
  async (e, t) => {
    const n = await x(), r = (t == null ? void 0 : t.root) ?? n.projectRootDir ?? "", s = (t == null ? void 0 : t.scanSubfolders) ?? n.scanSubfolders, i = JSON.stringify({
      root: d.resolve(r || "."),
      scanSubfolders: s
    });
    if (G) {
      if (ve === i)
        return G;
      await G.catch(() => {
      });
    }
    return ve = i, G = ri(t).catch(async (a) => {
      const c = a;
      console.error("[scanRoot] unhandled error:", (c == null ? void 0 : c.message) ?? a);
      const o = await x();
      return {
        tracks: await b(),
        found: 0,
        settings: o,
        error: (c == null ? void 0 : c.code) === "EACCES" || (c == null ? void 0 : c.code) === "EPERM" ? "scan-permission-denied" : "scan-failed"
      };
    }).finally(() => {
      G = null, ve = null;
    }), G;
  }
);
g.handle(
  "projects:create",
  async (e, t) => {
    try {
      const n = await Lt(t), r = d.resolve(t.saveTo);
      return V.some((s) => d.resolve(s) === r) || (V = [r]), t.templateOptions.rememberRecentTemplate && t.templateOptions.templatePath && await de({
        recentTemplatePaths: [
          d.resolve(t.templateOptions.templatePath),
          ...(await x()).recentTemplatePaths
        ]
      }), t.templateOptions.saveAsDefaults && await de({
        newProjectDefaults: {
          createStandardFolders: t.templateOptions.createStandardFolders,
          openAfterCreate: t.templateOptions.openAfterCreate,
          lastUsedTemplatePath: t.templateOptions.mode === "template" ? t.templateOptions.templatePath ?? null : null
        }
      }), t.templateOptions.openAfterCreate && await me.openPath(n.projectFilePath), { ok: !0, result: n };
    } catch (n) {
      return n instanceof St ? {
        ok: !1,
        error: n.message,
        createdOnDisk: !0,
        projectId: n.projectId,
        projectFolderPath: n.projectFolderPath,
        projectFilePath: n.projectFilePath
      } : {
        ok: !1,
        error: n instanceof Error ? n.message : "Failed to create project.",
        createdOnDisk: !1
      };
    }
  }
);
g.handle(
  "createProject",
  async (e, t) => {
    const n = {
      projectName: t.name,
      saveTo: t.root,
      dawFormat: t.extension,
      folderId: t.folderId ?? null,
      initialStatus: t.status ?? "Idea",
      templateOptions: {
        mode: "blank",
        createStandardFolders: !0,
        openAfterCreate: !1,
        rememberRecentTemplate: !1,
        saveAsDefaults: !1
      }
    };
    try {
      return (await Lt(n)).track;
    } catch {
      return null;
    }
  }
);
g.handle("projects:chooseSaveDirectory", async () => {
  const e = await re.showOpenDialog({
    properties: ["openDirectory"]
  });
  return e.canceled || e.filePaths.length === 0 ? null : e.filePaths[0];
});
g.handle("notes:getByTrackId", async (e, t) => {
  if (!t) return null;
  const n = await Ct(t);
  if (!n) return null;
  const r = await Me(n.id);
  return { note: n, media: r };
});
g.handle("notes:createForTrack", async (e, t) => {
  if (!t) return null;
  const n = await jt(t), r = await Me(n.id);
  return { note: n, media: r };
});
g.handle("notes:updateContent", async (e, t) => t != null && t.trackId ? await Os(t.trackId, t.contentJson ?? "") : null);
g.handle(
  "notes:attachImage",
  async (e, t) => {
    var r;
    return !(t != null && t.noteId) || !(t != null && t.trackId) || !(t != null && t.bytes) ? { ok: !1, error: "Invalid image payload." } : (r = t.mimeType) != null && r.toLowerCase().startsWith("image/") ? { ok: !0, media: await xt({
      trackId: t.trackId,
      noteId: t.noteId,
      type: "image",
      originalName: t.originalName || "image",
      bytes: t.bytes,
      extension: Gt(t.mimeType, t.originalName)
    }) } : { ok: !1, error: "Only image attachments are supported." };
  }
);
g.handle("notes:listMedia", async (e, t) => t ? Me(t) : []);
g.handle("notes:deleteMedia", async (e, t) => t ? Fs(t) : { ok: !1 });
g.handle(
  "notes:renameMedia",
  async (e, t) => t != null && t.mediaId ? Cs(t.mediaId, t.originalName ?? "") : { ok: !1, error: "Media id is required." }
);
g.handle(
  "notes:saveVoiceRecording",
  async (e, t) => !(t != null && t.noteId) || !(t != null && t.trackId) || !(t != null && t.bytes) ? { ok: !1, error: "Invalid recording payload." } : { ok: !0, media: await xt({
    trackId: t.trackId,
    noteId: t.noteId,
    type: "audio",
    originalName: t.originalName || "recording.webm",
    bytes: t.bytes,
    extension: Gt(t.mimeType || "", t.originalName || "")
  }) }
);
g.handle("getTracks", async () => b());
g.handle("getTracksByFolder", async (e, t) => t ? es(t) : b());
g.handle("getTrashedTracks", async () => ts());
g.handle("upsertTracks", async () => b());
g.handle("setTrackBpm", async (e, t, n) => (await kt(t, n), null));
g.handle("setTrackFolder", async (e, t, n) => ss(t, n));
g.handle("setTrackStatus", async (e, t, n) => !t || !n ? null : is(t, n));
g.handle("setTrackGenre", async (e, t, n) => t ? os(t, n ?? null) : null);
g.handle("setTrackAudioPath", async (e, t, n) => t ? as(t, n ?? null) : null);
g.handle("openProjectPath", async (e, t) => {
  if (!t) return { ok: !1 };
  const n = Y(t);
  let r = t;
  if (n) {
    const i = d.join(d.dirname(t), `${n.baseName}.als`);
    ct(i) && (r = i);
  }
  const s = await me.openPath(r);
  return { ok: s === "", error: s || null };
});
g.handle("revealProjectPath", async (e, t) => t ? (me.showItemInFolder(t), { ok: !0 }) : { ok: !1 });
g.handle("system:openPath", async (e, t) => {
  if (!t) return { ok: !1 };
  const n = await me.openPath(t);
  return { ok: n === "", error: n || null };
});
g.handle("moveToTrash", async (e, t) => Array.isArray(t) ? cs(t) : b());
g.handle("restoreTracks", async (e, t) => Array.isArray(t) ? ls(t) : b());
g.handle("purgeTracks", async (e, t) => Array.isArray(t) ? us(t) : b());
g.handle("computeBpmForTracks", async (e, t) => Array.isArray(t) ? { queued: Ee(t) } : { queued: 0 });
g.handle("updateTrackBpm", async (e, t, n) => (await kt(t, n), null));
g.handle("listFolders", async () => D());
g.handle("createFolder", async (e, t) => t ? As(t) : D());
g.handle("renameFolder", async (e, t, n) => !t || !n ? D() : Ps(t, n));
g.handle("deleteFolder", async (e, t) => t ? ks(t) : D());
g.handle("listTrackVersions", async (e, t) => t ? ns(t) : []);
g.handle("setLatestVersion", async (e, t, n) => {
  var i;
  if (!t || !n) return null;
  const r = await rs(t, n), s = (i = r == null ? void 0 : r.latestVersion) == null ? void 0 : i.filePath;
  return s && s.toLowerCase().endsWith(".als") && Ee([s]), r;
});
g.handle("debugComputeBpmForFileName", async (e, t) => {
  if (!t) return null;
  const n = await ps(t);
  if (n)
    for (const r of he.getAllWindows())
      r.webContents.send("bpmUpdated", { id: n.id, bpm: n.bpm });
  return n;
});
U.on("window-all-closed", () => {
  process.platform !== "darwin" && (U.quit(), C = null);
});
U.on("activate", () => {
  he.getAllWindows().length === 0 && Dt();
});
g.handle("license:getStatus", () => Qs());
g.handle("license:activate", async (e, t) => qs(t));
g.handle("license:deactivate", async () => (await Zs(), { success: !0 }));
U.whenReady().then(async () => {
  await Js();
  const e = await x();
  e.projectRootDir && (V = [e.projectRootDir]), await ni(), Dt();
});
export {
  gi as MAIN_DIST,
  zt as RENDERER_DIST,
  Fe as VITE_DEV_SERVER_URL
};
