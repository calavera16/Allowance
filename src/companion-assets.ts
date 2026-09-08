import type { CustomCompanion } from "./types";

export const MAX_GIF_BYTES = 20 * 1024 * 1024;
export const validCompanionId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{64}$/.test(id);
export type CompanionBackup = { id: string; dataUrl: string };
const databaseName = "allowance.companions.v1";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("gifs");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Could not open companion storage."));
    request.onblocked = () => reject(new Error("Close other Allowance windows and try again."));
  });
}

async function saveBlobs(assets: Array<{ id: string; blob: Blob }>): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("gifs", "readwrite");
      for (const asset of assets) transaction.objectStore("gifs").put(asset.blob, asset.id);
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(new Error("Could not save the GIF. Check available disk space and try again."));
    });
  } finally { database.close(); }
}

export async function readCompanionGif(id: string): Promise<Blob> {
  if (!validCompanionId(id)) throw new Error("Invalid companion reference. Choose your GIF again.");
  const database = await openDatabase();
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const request = database.transaction("gifs", "readonly").objectStore("gifs").get(id);
      request.onsuccess = () => request.result instanceof Blob ? resolve(request.result) : reject(new Error("This GIF is missing. Choose it again or restore a backup that includes it."));
      request.onerror = () => reject(new Error("Could not read the saved GIF. Try choosing it again."));
    });
  } finally { database.close(); }
}

export async function inspectGif(blob: Blob): Promise<{ id: string; width: number; height: number }> {
  if (blob.size > MAX_GIF_BYTES) throw new Error("Choose a GIF smaller than 20 MB.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const signature = String.fromCharCode(...bytes.slice(0, 6));
  if (bytes.length < 14 || !["GIF87a", "GIF89a"].includes(signature)) throw new Error("This file is not a GIF. Choose a .gif image.");
  const width = bytes[6] | bytes[7] << 8, height = bytes[8] | bytes[9] << 8;
  if (!width || !height || width > 2048 || height > 2048) throw new Error("Choose a GIF no larger than 2048 × 2048 pixels.");
  // Decode before saving so a damaged file cannot replace a working companion.
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/gif" }));
    bitmap.close();
  } catch { throw new Error("This GIF could not be opened. Try another file."); }
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return { id: [...hash].map(n => n.toString(16).padStart(2, "0")).join(""), width, height };
}

export async function importCompanionGif(file: File): Promise<CustomCompanion> {
  const info = await inspectGif(file);
  await saveBlobs([{ id: info.id, blob: new Blob([await file.arrayBuffer()], { type: "image/gif" }) }]);
  return { ...info, name: file.name.slice(0, 100) || "Custom GIF", bytes: file.size };
}

export async function exportCompanionGifs(ids: string[]): Promise<CompanionBackup[]> {
  const assets: CompanionBackup[] = [];
  let total = 0;
  for (const id of new Set(ids)) {
    const blob = await readCompanionGif(id);
    total += blob.size;
    if (total > 40 * 1024 * 1024) throw new Error("The selected GIFs exceed the 40 MB backup media limit. Use smaller GIFs before backing up.");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not include a GIF in the backup."));
      reader.readAsDataURL(blob);
    });
    assets.push({ id, dataUrl });
  }
  return assets;
}

export async function restoreCompanionGifs(value: unknown, requiredIds: string[]): Promise<void> {
  const assets = Array.isArray(value) ? value : [];
  if (assets.length > 20) throw new Error("The backup contains too many companion images.");
  const validated: Array<{ id: string; blob: Blob }> = [];
  let total = 0;
  for (const id of new Set(requiredIds)) {
    const asset = assets.find(a => a?.id === id);
    if (!asset) { await readCompanionGif(id); continue; }
    const prefix = "data:image/gif;base64,";
    if (typeof asset.dataUrl !== "string" || !asset.dataUrl.startsWith(prefix) || asset.dataUrl.length > MAX_GIF_BYTES * 4 / 3 + 32) throw new Error("The backup contains an invalid companion GIF.");
    let binary: string;
    try { binary = atob(asset.dataUrl.slice(prefix.length)); } catch { throw new Error("The backup contains a damaged companion GIF."); }
    total += binary.length;
    if (total > 40 * 1024 * 1024) throw new Error("Companion images in this backup exceed 40 MB.");
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "image/gif" });
    const info = await inspectGif(blob);
    if (info.id !== id) throw new Error("A companion image does not match its backup reference.");
    validated.push({ id, blob });
  }
  // One transaction, after every GIF has been validated.
  if (validated.length) await saveBlobs(validated);
}
