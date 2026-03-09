"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("studioVaulted", {
  pickFolders: () => electron.ipcRenderer.invoke("pickFolders"),
  scanProjects: (roots) => electron.ipcRenderer.invoke("scanProjects", roots),
  getTracks: () => electron.ipcRenderer.invoke("getTracks"),
  getTracksByFolder: (folderId) => electron.ipcRenderer.invoke("getTracksByFolder", folderId),
  getTrashedTracks: () => electron.ipcRenderer.invoke("getTrashedTracks"),
  upsertTracks: (tracks) => electron.ipcRenderer.invoke("upsertTracks", tracks),
  moveToTrash: (ids) => electron.ipcRenderer.invoke("moveToTrash", ids),
  restoreTracks: (ids) => electron.ipcRenderer.invoke("restoreTracks", ids),
  purgeTracks: (ids) => electron.ipcRenderer.invoke("purgeTracks", ids),
  setTrackBpm: (id, bpm) => electron.ipcRenderer.invoke("setTrackBpm", id, bpm),
  setTrackFolder: (id, folderId) => electron.ipcRenderer.invoke("setTrackFolder", id, folderId),
  setTrackStatus: (id, status) => electron.ipcRenderer.invoke("setTrackStatus", id, status),
  setTrackGenre: (id, genre) => electron.ipcRenderer.invoke("setTrackGenre", id, genre),
  setTrackAudioPath: (id, audioPath) => electron.ipcRenderer.invoke("setTrackAudioPath", id, audioPath),
  openProjectPath: (filePath) => electron.ipcRenderer.invoke("openProjectPath", filePath),
  revealProjectPath: (filePath) => electron.ipcRenderer.invoke("revealProjectPath", filePath),
  listFolders: () => electron.ipcRenderer.invoke("listFolders"),
  createFolder: (name) => electron.ipcRenderer.invoke("createFolder", name),
  renameFolder: (id, name) => electron.ipcRenderer.invoke("renameFolder", id, name),
  deleteFolder: (id) => electron.ipcRenderer.invoke("deleteFolder", id),
  listTrackVersions: (trackId) => electron.ipcRenderer.invoke("listTrackVersions", trackId),
  setLatestVersion: (trackId, versionId) => electron.ipcRenderer.invoke("setLatestVersion", trackId, versionId),
  debugComputeBpmForFileName: (fileName) => electron.ipcRenderer.invoke("debugComputeBpmForFileName", fileName),
  computeBpmForTracks: (idsOrPaths) => electron.ipcRenderer.invoke("computeBpmForTracks", idsOrPaths),
  updateTrackBpm: (id, bpm) => electron.ipcRenderer.invoke("updateTrackBpm", id, bpm),
  pickAudioFile: () => electron.ipcRenderer.invoke("pickAudioFile"),
  createProject: (input) => electron.ipcRenderer.invoke("createProject", input),
  onBpmUpdated: (callback) => {
    const listener = (_event, payload) => {
      callback(payload);
    };
    electron.ipcRenderer.on("bpmUpdated", listener);
    return () => electron.ipcRenderer.off("bpmUpdated", listener);
  }
});
electron.contextBridge.exposeInMainWorld("settings", {
  getAll: () => electron.ipcRenderer.invoke("settings:getAll"),
  update: (patch) => electron.ipcRenderer.invoke("settings:update", patch),
  chooseDirectory: () => electron.ipcRenderer.invoke("settings:chooseDirectory")
});
electron.contextBridge.exposeInMainWorld("templates", {
  list: () => electron.ipcRenderer.invoke("templates:list"),
  refresh: () => electron.ipcRenderer.invoke("templates:refresh"),
  chooseFolder: () => electron.ipcRenderer.invoke("templates:chooseFolder")
});
electron.contextBridge.exposeInMainWorld("projects", {
  scanRoot: (options) => electron.ipcRenderer.invoke("projects:scanRoot", options),
  create: (input) => electron.ipcRenderer.invoke("projects:create", input),
  chooseSaveDirectory: () => electron.ipcRenderer.invoke("projects:chooseSaveDirectory")
});
electron.contextBridge.exposeInMainWorld("system", {
  openPath: (targetPath) => electron.ipcRenderer.invoke("system:openPath", targetPath)
});
electron.contextBridge.exposeInMainWorld("notes", {
  getByTrackId: (trackId) => electron.ipcRenderer.invoke("notes:getByTrackId", trackId),
  createForTrack: (trackId) => electron.ipcRenderer.invoke("notes:createForTrack", trackId),
  updateContent: (payload) => electron.ipcRenderer.invoke("notes:updateContent", payload),
  attachImage: (payload) => electron.ipcRenderer.invoke("notes:attachImage", payload),
  listMedia: (noteId) => electron.ipcRenderer.invoke("notes:listMedia", noteId),
  deleteMedia: (mediaId) => electron.ipcRenderer.invoke("notes:deleteMedia", mediaId),
  renameMedia: (payload) => electron.ipcRenderer.invoke("notes:renameMedia", payload),
  saveVoiceRecording: (payload) => electron.ipcRenderer.invoke("notes:saveVoiceRecording", payload)
});
electron.contextBridge.exposeInMainWorld("audioApi", {
  buildAudioUrl: (absPath) => {
    const url = new URL("app://audio");
    url.searchParams.set("path", absPath);
    return url.toString();
  },
  buildMediaUrl: (absPath) => {
    const url = new URL("app://media");
    url.searchParams.set("path", absPath);
    return url.toString();
  }
});
electron.contextBridge.exposeInMainWorld("license", {
  getStatus: () => electron.ipcRenderer.invoke("license:getStatus"),
  activate: (key) => electron.ipcRenderer.invoke("license:activate", key),
  deactivate: () => electron.ipcRenderer.invoke("license:deactivate")
});
