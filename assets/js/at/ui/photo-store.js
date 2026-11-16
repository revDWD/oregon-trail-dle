// The Camp Camera Roll, kept on this device in IndexedDB so photos survive closing the page.
// Photos are never uploaded and belong to the device, not to a hiker. Everything here fails soft:
// without IndexedDB (private windows, old browsers) the roll simply lasts for the session.

const DB = "at-camp";
const STORE = "photos";

// Newest first, without duplicates or broken entries, capped at `max`.
export function trimRoll(photos = [], max = 12) {
  const seen = new Set();
  return photos
    .filter((p) => p && typeof p.id === "string" && Number.isFinite(p.at) && !seen.has(p.id) && seen.add(p.id))
    .sort((a, b) => b.at - a.at)
    .slice(0, Math.max(0, max));
}

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no IndexedDB")); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("blocked"));
  });
}

async function withStore(mode, work) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const out = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(out && "result" in out ? out.result : undefined);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function loadPhotos(max = 12) {
  try { return trimRoll(await withStore("readonly", (s) => s.getAll()), max); } catch (e) { return []; }
}

// Save the whole roll: anything no longer in it is removed, so the device never holds more than `max`.
export async function savePhotos(photos, max = 12) {
  const keep = trimRoll(photos, max);
  try {
    await withStore("readwrite", (s) => { s.clear(); keep.forEach((p) => s.put(p)); });
    return true;
  } catch (e) { return false; }
}

export const clearPhotos = () => savePhotos([], 0);
