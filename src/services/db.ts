import { Sb3Project, Sb3Folder, Sb3Tag } from '../types/scratch';

const DB_NAME = 'ScratchSB3LibraryDB';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

export const defaultFolders: Sb3Folder[] = [
  { id: 'games', name: 'Games', parentId: null, color: '#FFAB19', createdAt: Date.now() },
  { id: 'tutorials', name: 'Tutorials', parentId: null, color: '#4C97FF', createdAt: Date.now() },
  { id: 'tut-beginner', name: 'Beginner', parentId: 'tutorials', color: '#59C059', createdAt: Date.now() },
  { id: 'tut-inter', name: 'Intermediate', parentId: 'tutorials', color: '#4C97FF', createdAt: Date.now() },
  { id: 'tut-adv', name: 'Advanced', parentId: 'tutorials', color: '#855CD6', createdAt: Date.now() },
  { id: 'physics', name: 'Physics Simulations', parentId: null, color: '#FF6680', createdAt: Date.now() },
  { id: 'math', name: 'Math Projects', parentId: null, color: '#0FBD8C', createdAt: Date.now() },
  { id: 'experiments', name: 'Experiments', parentId: null, color: '#855CD6', createdAt: Date.now() },
];

export const defaultTags: Sb3Tag[] = [
  { id: 'platformer', name: 'Platformer', color: '#FFAB19' },
  { id: 'physics', name: 'Physics', color: '#FF6680' },
  { id: 'education', name: 'Education', color: '#4C97FF' },
  { id: 'clone', name: 'Clone', color: '#0FBD8C' },
  { id: 'animation', name: 'Animation', color: '#855CD6' },
  { id: 'ai', name: 'AI', color: '#D65CD6' },
  { id: 'music', name: 'Music', color: '#FF8C1A' },
  { id: '3d', name: '3D Engine', color: '#2CA58D' },
];

export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('projects')) {
        const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
        projectStore.createIndex('folderId', 'folderId', { unique: false });
        projectStore.createIndex('isFavorite', 'isFavorite', { unique: false });
        projectStore.createIndex('dateModified', 'dateModified', { unique: false });
      }

      if (!db.objectStoreNames.contains('projectBlobs')) {
        db.createObjectStore('projectBlobs', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('folders')) {
        db.createObjectStore('folders', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('tags')) {
        db.createObjectStore('tags', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

// Projects Operations
export async function getAllProjects(): Promise<Sb3Project[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readonly');
    const store = transaction.objectStore('projects');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getProjectById(id: string): Promise<Sb3Project | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readonly');
    const store = transaction.objectStore('projects');
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProject(project: Sb3Project, blob?: Blob | ArrayBuffer): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const stores = blob ? ['projects', 'projectBlobs'] : ['projects'];
    const transaction = db.transaction(stores, 'readwrite');

    const projectStore = transaction.objectStore('projects');
    projectStore.put(project);

    if (blob) {
      const blobStore = transaction.objectStore('projectBlobs');
      blobStore.put({ id: project.id, blob });
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function saveProjectsBulk(projects: Sb3Project[], blobs?: { id: string; blob: Blob | ArrayBuffer }[]): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const stores = blobs ? ['projects', 'projectBlobs'] : ['projects'];
    const transaction = db.transaction(stores, 'readwrite');

    const projectStore = transaction.objectStore('projects');
    for (const proj of projects) {
      projectStore.put(proj);
    }

    if (blobs) {
      const blobStore = transaction.objectStore('projectBlobs');
      for (const item of blobs) {
        blobStore.put(item);
      }
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getProjectBlob(id: string): Promise<Blob | ArrayBuffer | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projectBlobs', 'readonly');
    const store = transaction.objectStore('projectBlobs');
    const request = store.get(id);

    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.blob : null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteProjects(ids: string[]): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['projects', 'projectBlobs'], 'readwrite');
    const projectStore = transaction.objectStore('projects');
    const blobStore = transaction.objectStore('projectBlobs');

    for (const id of ids) {
      projectStore.delete(id);
      blobStore.delete(id);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// Folders Operations
export async function getAllFolders(): Promise<Sb3Folder[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('folders', 'readonly');
    const store = transaction.objectStore('folders');
    const request = store.getAll();

    request.onsuccess = () => {
      const result = request.result;
      if (!result || result.length === 0) {
        // Seed initial default folders
        seedDefaultFolders().then(resolve).catch(reject);
      } else {
        resolve(result);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function seedDefaultFolders(): Promise<Sb3Folder[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('folders', 'readwrite');
    const store = transaction.objectStore('folders');
    for (const folder of defaultFolders) {
      store.put(folder);
    }
    transaction.oncomplete = () => resolve(defaultFolders);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function saveFolder(folder: Sb3Folder): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('folders', 'readwrite');
    const store = transaction.objectStore('folders');
    store.put(folder);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function saveFoldersBulk(folders: Sb3Folder[]): Promise<void> {
  if (folders.length === 0) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('folders', 'readwrite');
    const store = transaction.objectStore('folders');
    for (const folder of folders) {
      store.put(folder);
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteFolder(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('folders', 'readwrite');
    const store = transaction.objectStore('folders');
    store.delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// Tags Operations
export async function getAllTags(): Promise<Sb3Tag[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('tags', 'readonly');
    const store = transaction.objectStore('tags');
    const request = store.getAll();

    request.onsuccess = () => {
      const result = request.result;
      if (!result || result.length === 0) {
        seedDefaultTags().then(resolve).catch(reject);
      } else {
        resolve(result);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function seedDefaultTags(): Promise<Sb3Tag[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('tags', 'readwrite');
    const store = transaction.objectStore('tags');
    for (const tag of defaultTags) {
      store.put(tag);
    }
    transaction.oncomplete = () => resolve(defaultTags);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function saveTag(tag: Sb3Tag): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('tags', 'readwrite');
    const store = transaction.objectStore('tags');
    store.put(tag);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteTag(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('tags', 'readwrite');
    const store = transaction.objectStore('tags');
    store.delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
