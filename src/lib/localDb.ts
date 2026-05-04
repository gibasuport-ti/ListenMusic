import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'spotify-clone-local-storage';
const STORE_NAME = 'audio-files';
const METADATA_STORE = 'media-metadata';

export async function getLocalDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 2, {
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE, { keyPath: 'id' });
      }
    },
  });
}

export async function saveMediaLocal(id: string, file: File | Blob): Promise<void> {
  const db = await getLocalDB();
  await db.put(STORE_NAME, file, id);
}

export async function getMediaLocal(id: string): Promise<Blob | null> {
  const db = await getLocalDB();
  const file = await db.get(STORE_NAME, id);
  return file || null;
}

export async function saveAudioLocal(id: string, file: File | Blob): Promise<void> {
  return saveMediaLocal(id, file);
}

export async function saveMetadataLocal(metadata: any): Promise<void> {
  const db = await getLocalDB();
  await db.put(METADATA_STORE, metadata);
}

export async function getAllMetadataLocal(): Promise<any[]> {
  const db = await getLocalDB();
  return db.getAll(METADATA_STORE);
}

export async function deleteMediaLocal(id: string): Promise<void> {
  const db = await getLocalDB();
  await db.delete(STORE_NAME, id);
  await db.delete(METADATA_STORE, id);
}

export async function getAudioLocal(id: string): Promise<Blob | null> {
  return getMediaLocal(id);
}

export async function existsAudioLocal(id: string): Promise<boolean> {
  const db = await getLocalDB();
  const key = await db.getKey(STORE_NAME, id);
  return key !== undefined;
}

export async function getAllStorageKeys(): Promise<string[]> {
  const db = await getLocalDB();
  const keys = await db.getAllKeys(STORE_NAME);
  return keys.map(k => String(k));
}

export async function deleteAudioLocal(id: string): Promise<void> {
  const db = await getLocalDB();
  await db.delete(STORE_NAME, id);
}
