// localStorage save + JSON export/import. The host owns the save (multiplayer comes later).
const KEY = 'monster-ranch-save-v1';

export function hasSave() { return !!localStorage.getItem(KEY); }

export function loadSave() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function writeSave(data) {
  localStorage.setItem(KEY, JSON.stringify({ ...data, version: 1, savedAt: Date.now() }));
}

export function clearSave() { localStorage.removeItem(KEY); }

export function exportSave(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `monster-ranch-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function readSaveFile(file) {
  return file.text().then((t) => {
    const d = JSON.parse(t);
    if (!d || typeof d !== 'object' || !d.inventory) throw new Error('Not a Monster Ranch save');
    return d;
  });
}
