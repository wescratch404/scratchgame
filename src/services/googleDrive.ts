import { Sb3Project, Sb3Folder } from '../types/scratch';
import { embedThumbnailInSb3 } from './sb3Parser';

const FOLDER_NAME = 'Scratch SB3 Library';

export interface DriveFileInfo {
  id: string;
  name: string;
  size?: string;
  modifiedTime?: string;
  properties?: Record<string, string>;
  thumbnailLink?: string;
  webViewLink?: string;
  folderPath?: string;      // e.g. "Tutorials/Beginner" or "" for root
  parentDriveId?: string;
}

export interface DriveFolderInfo {
  id: string;
  name: string;
  path: string;
  parentDriveId: string;
}

/**
 * Traces a local folder ID up its parent chain to produce an ordered array of folder names and path string.
 */
export function getFolderHierarchyPath(
  folderId: string | null,
  folders: Sb3Folder[]
): { names: string[]; path: string } {
  if (!folderId) {
    return { names: [], path: '' };
  }

  const names: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null = folderId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = folders.find(f => f.id === currentId);
    if (!folder) break;
    names.unshift(folder.name.trim());
    currentId = folder.parentId;
  }

  return {
    names,
    path: names.join('/'),
  };
}

/**
 * Utility to execute fetch with exponential backoff retry on transient 429/503/500 errors.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number = 3,
  delayMs: number = 750
): Promise<Response> {
  let lastErr: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || res.status === 503 || res.status === 500) {
        if (attempt < retries) {
          const wait = delayMs * Math.pow(2, attempt) + Math.random() * 250;
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const wait = delayMs * Math.pow(2, attempt) + Math.random() * 200;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
    }
  }
  throw lastErr || new Error('Network request failed after retries');
}

/**
 * Worker pool that executes tasks with bounded concurrency (default 4 streams)
 * for optimal browser HTTP/2 throughput to Google Drive without 429 rate limit triggers.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (completed: number, total: number, item: T) => void
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let currentIndex = 0;
  let completedCount = 0;

  const pool = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      const item = items[idx];
      try {
        const res = await worker(item, idx);
        results[idx] = res;
      } finally {
        completedCount++;
        if (onProgress) {
          onProgress(completedCount, items.length, item);
        }
      }
    }
  });

  await Promise.all(pool);
  return results;
}

/**
 * Searches for or creates a dedicated "Scratch SB3 Library" root folder in user's Google Drive.
 */
export async function findOrCreateLibraryFolder(accessToken: string): Promise<string> {
  const query = `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name)`;

  const response = await fetchWithRetry(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to search Google Drive folders (${response.status})`);
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  // Create root folder
  const createResponse = await fetchWithRetry('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Dedicated folder for Scratch .sb3 projects managed by Scratch SB3 Library Manager',
    }),
  });

  if (!createResponse.ok) {
    const err = await createResponse.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create Google Drive folder (${createResponse.status})`);
  }

  const newFolder = await createResponse.json();
  return newFolder.id;
}

/**
 * Creates a subfolder under parentFolderId in Google Drive.
 */
export async function createDriveFolder(
  accessToken: string,
  parentFolderId: string,
  folderName: string
): Promise<string> {
  const res = await fetchWithRetry('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
      description: `Folder "${folderName}" in Scratch SB3 Library`,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create folder "${folderName}" on Google Drive (${res.status})`);
  }

  const created = await res.json();
  return created.id;
}

/**
 * Pre-resolves and creates all required folder hierarchy paths in Google Drive in advance.
 * This completely eliminates per-file folder lookups during bulk uploads.
 */
export async function preResolveDriveFolderHierarchy(
  accessToken: string,
  rootDriveFolderId: string,
  folderPaths: string[],
  existingDriveFolders: DriveFolderInfo[] = []
): Promise<Map<string, string>> {
  const pathToFolderId = new Map<string, string>();
  pathToFolderId.set('', rootDriveFolderId);

  // Pre-index existing Drive folders by normalized path
  for (const df of existingDriveFolders) {
    if (df.path) {
      pathToFolderId.set(df.path.trim().toLowerCase(), df.id);
    }
  }

  const uniquePaths = Array.from(new Set(folderPaths.map(p => p.trim()).filter(Boolean)));
  for (const fullPath of uniquePaths) {
    const segments = fullPath.split('/').map(s => s.trim()).filter(Boolean);
    let currentPath = '';
    let currentParentId = rootDriveFolderId;

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const key = currentPath.toLowerCase();

      if (pathToFolderId.has(key)) {
        currentParentId = pathToFolderId.get(key)!;
      } else {
        const createdId = await createDriveFolder(accessToken, currentParentId, segment);
        pathToFolderId.set(key, createdId);
        currentParentId = createdId;
      }
    }
  }

  return pathToFolderId;
}

/**
 * Ensures that the given folder hierarchy exists in Google Drive under rootDriveFolderId.
 * Creates any missing subfolders and returns the target Drive folder ID for uploads.
 */
export async function ensureDriveFolderHierarchy(
  accessToken: string,
  rootDriveFolderId: string,
  folderNames: string[],
  folderCache?: Map<string, string>
): Promise<string> {
  if (!folderNames || folderNames.length === 0) {
    return rootDriveFolderId;
  }

  let currentParentId = rootDriveFolderId;

  for (const segment of folderNames) {
    const cleanSegment = segment.trim();
    if (!cleanSegment) continue;

    const cacheKey = `${currentParentId}:::${cleanSegment.toLowerCase()}`;
    if (folderCache && folderCache.has(cacheKey)) {
      currentParentId = folderCache.get(cacheKey)!;
      continue;
    }

    // Search for existing subfolder under currentParentId
    const escapedName = cleanSegment.replace(/'/g, "\\'");
    const query = `'${currentParentId}' in parents and name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name)`;

    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let foundId: string | null = null;
    if (res.ok) {
      const data = await res.json();
      if (data.files && data.files.length > 0) {
        foundId = data.files[0].id;
      }
    }

    if (!foundId) {
      // Create subfolder in Google Drive
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: cleanSegment,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [currentParentId],
          description: `Folder "${cleanSegment}" in Scratch SB3 Library`,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.error?.message || `Failed to create folder "${cleanSegment}" on Google Drive (${createRes.status})`);
      }

      const created = await createRes.json();
      foundId = created.id;
    }

    if (!foundId) {
      throw new Error(`Failed to resolve or create folder "${cleanSegment}" on Google Drive`);
    }

    if (folderCache) {
      folderCache.set(cacheKey, foundId);
    }

    currentParentId = foundId;
  }

  return currentParentId;
}

/**
 * Uploads or updates an .sb3 file in Google Drive using multipart upload inside a target folder.
 * Uses direct PATCH when existingFileId is known (with 404 fallback to POST), saving 1-2 pre-flight RTTs.
 */
export async function uploadProjectToDrive(
  accessToken: string,
  folderId: string,
  project: Sb3Project,
  sb3Blob: Blob | ArrayBuffer,
  folderPath?: string,
  knownExistingFileId?: string | null
): Promise<{ fileId: string; name: string }> {
  let existingFileId: string | null =
    knownExistingFileId !== undefined ? knownExistingFileId : (project.driveFileId || null);

  const boundary = `-------ScratchSb3Boundary${Date.now()}`;
  const metadata = {
    name: project.fileName.endsWith('.sb3') ? project.fileName : `${project.fileName}.sb3`,
    description: project.description || `Scratch 3 project with ${project.stats.spriteCount} sprites and ${project.stats.blockCount} blocks.`,
    properties: {
      scratchTitle: project.title,
      scratchSprites: String(project.stats.spriteCount),
      scratchBlocks: String(project.stats.blockCount),
      scratchVersion: project.stats.scratchVersion || '3.0.0',
      tags: project.tags.join(','),
      localProjectId: project.id,
      localFolderId: project.folderId || '',
      folderPath: folderPath || '',
    },
    ...(!existingFileId ? { parents: [folderId] } : {}),
  };

  // Performance: Avoid re-zipping all assets if thumbnail is already embedded in .sb3
  let binaryBlob: Blob;
  if (project.thumbnailUrl && !project.hasEmbeddedThumbnail) {
    try {
      binaryBlob = await embedThumbnailInSb3(sb3Blob, project.thumbnailUrl);
    } catch {
      binaryBlob = sb3Blob instanceof Blob ? sb3Blob : new Blob([sb3Blob], { type: 'application/x.scratch.sb3' });
    }
  } else {
    binaryBlob = sb3Blob instanceof Blob ? sb3Blob : new Blob([sb3Blob], { type: 'application/x.scratch.sb3' });
  }

  // Build multipart/related body
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const metaHeader = 'Content-Type: application/json; charset=UTF-8\r\n\r\n';
  const fileHeader = 'Content-Type: application/x.scratch.sb3\r\n\r\n';

  const multipartBlob = new Blob([
    delimiter,
    metaHeader,
    JSON.stringify(metadata),
    delimiter,
    fileHeader,
    binaryBlob,
    closeDelimiter,
  ]);

  const endpoint = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&addParents=${folderId}&fields=id,name`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name`;

  const method = existingFileId ? 'PATCH' : 'POST';

  let res = await fetchWithRetry(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBlob,
  });

  // If PATCH failed because file was deleted on Drive (404), fall back to create POST directly
  if (existingFileId && res.status === 404) {
    const postMetadata = { ...metadata, parents: [folderId] };
    const fallbackBlob = new Blob([
      delimiter,
      metaHeader,
      JSON.stringify(postMetadata),
      delimiter,
      fileHeader,
      binaryBlob,
      closeDelimiter,
    ]);

    res = await fetchWithRetry('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: fallbackBlob,
    });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to upload file to Google Drive (${res.status})`);
  }

  const result = await res.json();
  return { fileId: result.id, name: result.name };
}

/**
 * Uploads project preserving its complete folder hierarchy to Google Drive.
 * Uses pre-resolved folderCache when provided for zero-overhead folder resolution.
 */
export async function uploadProjectToDriveWithFolder(
  accessToken: string,
  rootDriveFolderId: string,
  project: Sb3Project,
  sb3Blob: Blob | ArrayBuffer,
  folders: Sb3Folder[],
  folderCache?: Map<string, string>,
  knownExistingFileId?: string | null
): Promise<{ fileId: string; name: string; folderPath: string }> {
  const { names, path } = getFolderHierarchyPath(project.folderId, folders);
  let targetFolderId = rootDriveFolderId;

  if (names.length > 0) {
    const cached = folderCache?.get(path.toLowerCase());
    if (cached) {
      targetFolderId = cached;
    } else {
      targetFolderId = await ensureDriveFolderHierarchy(accessToken, rootDriveFolderId, names, folderCache);
    }
  }

  const result = await uploadProjectToDrive(
    accessToken,
    targetFolderId,
    project,
    sb3Blob,
    path,
    knownExistingFileId
  );
  return { ...result, folderPath: path };
}

/**
 * High-speed single-pass folder and file scanner.
 * Queries Google Drive with pageSize=1000 in a single request instead of slow recursive BFS,
 * building the entire folder hierarchy tree in memory in milliseconds.
 */
export async function listAllDriveSb3ProjectsAndFolders(
  accessToken: string,
  rootFolderId: string
): Promise<{ files: DriveFileInfo[]; folders: DriveFolderInfo[] }> {
  try {
    let pageToken: string | null = null;
    const rawItems: any[] = [];

    do {
      let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent('trashed = false')}&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,properties,parents,webViewLink,thumbnailLink)&pageSize=1000`;
      if (pageToken) {
        url += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const response = await fetchWithRetry(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`Drive list error: ${response.status}`);
      }

      const data = await response.json();
      pageToken = data.nextPageToken || null;
      if (Array.isArray(data.files)) {
        rawItems.push(...data.files);
      }
    } while (pageToken);

    // Build the in-memory folder graph starting from rootFolderId
    const folderById = new Map<string, { id: string; name: string; parents: string[] }>();
    const childrenByParent = new Map<string, string[]>();

    for (const item of rawItems) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        const parents = Array.isArray(item.parents) ? item.parents : [];
        folderById.set(item.id, { id: item.id, name: item.name, parents });
        for (const p of parents) {
          if (!childrenByParent.has(p)) {
            childrenByParent.set(p, []);
          }
          childrenByParent.get(p)!.push(item.id);
        }
      }
    }

    // Traverse starting at rootFolderId to build folder paths and find all subfolders
    const allFolders: DriveFolderInfo[] = [];
    const folderIdToPath = new Map<string, string>();
    folderIdToPath.set(rootFolderId, '');

    const folderQueue: { id: string; path: string }[] = [{ id: rootFolderId, path: '' }];
    const visitedFolders = new Set<string>([rootFolderId]);

    while (folderQueue.length > 0) {
      const cur = folderQueue.shift()!;
      const childIds = childrenByParent.get(cur.id) || [];
      for (const cId of childIds) {
        if (visitedFolders.has(cId)) continue;
        visitedFolders.add(cId);
        const childFolder = folderById.get(cId);
        if (childFolder) {
          const subPath = cur.path ? `${cur.path}/${childFolder.name}` : childFolder.name;
          folderIdToPath.set(cId, subPath);
          allFolders.push({
            id: cId,
            name: childFolder.name,
            path: subPath,
            parentDriveId: cur.id,
          });
          folderQueue.push({ id: cId, path: subPath });
        }
      }
    }

    // Match files that belong to rootFolderId or any discovered subfolder
    const allFiles: DriveFileInfo[] = [];
    for (const item of rawItems) {
      if (item.mimeType === 'application/vnd.google-apps.folder') continue;

      const isSb3 =
        item.name.toLowerCase().endsWith('.sb3') ||
        Boolean(item.properties?.scratchTitle) ||
        Boolean(item.mimeType?.includes('scratch'));

      if (!isSb3) continue;

      const parents: string[] = Array.isArray(item.parents) ? item.parents : [];
      let parentDriveId: string | undefined = undefined;
      let folderPath = '';

      for (const p of parents) {
        if (visitedFolders.has(p)) {
          parentDriveId = p;
          folderPath = folderIdToPath.get(p) || '';
          break;
        }
      }

      // Check file's own custom property as backup if direct parent link wasn't in tree
      if (!folderPath && item.properties?.folderPath) {
        folderPath = item.properties.folderPath;
      }

      if (parentDriveId || visitedFolders.has(rootFolderId)) {
        allFiles.push({
          id: item.id,
          name: item.name,
          size: item.size,
          modifiedTime: item.modifiedTime,
          properties: item.properties,
          thumbnailLink: item.thumbnailLink,
          webViewLink: item.webViewLink,
          folderPath,
          parentDriveId: parentDriveId || rootFolderId,
        });
      }
    }

    return { files: allFiles, folders: allFolders };
  } catch (err) {
    console.warn('Fast drive listing failed, falling back to folder crawler:', err);
    return listAllDriveSb3ProjectsAndFoldersFallback(accessToken, rootFolderId);
  }
}

/**
 * Fallback folder crawler if the global query fails.
 */
async function listAllDriveSb3ProjectsAndFoldersFallback(
  accessToken: string,
  rootFolderId: string
): Promise<{ files: DriveFileInfo[]; folders: DriveFolderInfo[] }> {
  const allFiles: DriveFileInfo[] = [];
  const allFolders: DriveFolderInfo[] = [];

  const queue: { folderId: string; folderPath: string }[] = [
    { folderId: rootFolderId, folderPath: '' },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    let pageToken: string | null = null;

    do {
      let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${current.folderId}' in parents and trashed = false`)}&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,properties,webViewLink,thumbnailLink)&pageSize=1000`;
      if (pageToken) {
        url += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const response = await fetchWithRetry(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `Failed to list files from Google Drive folder (${response.status})`);
      }

      const data = await response.json();
      pageToken = data.nextPageToken || null;

      const items: any[] = data.files || [];
      for (const item of items) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          const subPath = current.folderPath ? `${current.folderPath}/${item.name}` : item.name;
          allFolders.push({
            id: item.id,
            name: item.name,
            path: subPath,
            parentDriveId: current.folderId,
          });
          queue.push({
            folderId: item.id,
            folderPath: subPath,
          });
        } else {
          const isSb3 =
            item.name.toLowerCase().endsWith('.sb3') ||
            item.properties?.scratchTitle ||
            item.mimeType?.includes('scratch');

          if (isSb3) {
            allFiles.push({
              id: item.id,
              name: item.name,
              size: item.size,
              modifiedTime: item.modifiedTime,
              properties: item.properties,
              thumbnailLink: item.thumbnailLink,
              webViewLink: item.webViewLink,
              folderPath: current.folderPath,
              parentDriveId: current.folderId,
            });
          }
        }
      }
    } while (pageToken);
  }

  return { files: allFiles, folders: allFolders };
}

/**
 * Lists all .sb3 files in Google Drive across root and all subfolders.
 */
export async function listDriveSb3Projects(
  accessToken: string,
  folderId: string
): Promise<DriveFileInfo[]> {
  const result = await listAllDriveSb3ProjectsAndFolders(accessToken, folderId);
  return result.files;
}

const FOLDER_COLORS = ['#FFAB19', '#4C97FF', '#59C059', '#855CD6', '#FF6680', '#0FBD8C', '#2CA58D', '#D65CD6'];

/**
 * Resolves or creates matching local Sb3Folder hierarchy for a path like "Games/Action/Platformer".
 */
export function resolveLocalFolderHierarchyFromPath(
  folderPath: string,
  existingFolders: Sb3Folder[]
): { leafFolderId: string | null; newFolders: Sb3Folder[] } {
  const cleanPath = (folderPath || '').trim();
  if (!cleanPath) {
    return { leafFolderId: null, newFolders: [] };
  }

  const segments = cleanPath.split('/').map(s => s.trim()).filter(Boolean);
  if (segments.length === 0) {
    return { leafFolderId: null, newFolders: [] };
  }

  let currentParentId: string | null = null;
  const newFolders: Sb3Folder[] = [];
  const allCurrentFolders = [...existingFolders];

  for (let i = 0; i < segments.length; i++) {
    const segmentName = segments[i];
    const match = allCurrentFolders.find(
      f => f.name.toLowerCase() === segmentName.toLowerCase() && f.parentId === currentParentId
    );

    if (match) {
      currentParentId = match.id;
    } else {
      const newFolderId = 'folder_' + Math.random().toString(36).substring(2, 9);
      const color = FOLDER_COLORS[(allCurrentFolders.length + newFolders.length) % FOLDER_COLORS.length];
      const createdFolder: Sb3Folder = {
        id: newFolderId,
        name: segmentName,
        parentId: currentParentId,
        color,
        createdAt: Date.now(),
      };
      newFolders.push(createdFolder);
      allCurrentFolders.push(createdFolder);
      currentParentId = newFolderId;
    }
  }

  return { leafFolderId: currentParentId, newFolders };
}

/**
 * Replicates the complete Google Drive folder tree locally.
 * Sorts driveFolders by hierarchy depth so parents are created before subfolders.
 */
export function replicateDriveFolderStructure(
  driveFolders: DriveFolderInfo[],
  existingFolders: Sb3Folder[]
): { allFolders: Sb3Folder[]; newFolders: Sb3Folder[]; pathToFolderId: Map<string, string> } {
  let workingFolders = [...existingFolders];
  const newFolders: Sb3Folder[] = [];
  const pathToFolderId = new Map<string, string>();

  // Sort by folder depth so top-level folders exist before subfolders
  const sorted = [...driveFolders].sort((a, b) => {
    const aDepth = (a.path || '').split('/').filter(Boolean).length;
    const bDepth = (b.path || '').split('/').filter(Boolean).length;
    return aDepth - bDepth;
  });

  for (const df of sorted) {
    if (!df.path) continue;
    const { leafFolderId, newFolders: created } = resolveLocalFolderHierarchyFromPath(df.path, workingFolders);
    if (created.length > 0) {
      newFolders.push(...created);
      workingFolders = [...workingFolders, ...created];
    }
    if (leafFolderId) {
      pathToFolderId.set(df.path, leafFolderId);
    }
  }

  return { allFolders: workingFolders, newFolders, pathToFolderId };
}

/**
 * Downloads a project file from Google Drive as a binary Blob with retry resilience.
 */
export async function downloadDriveSb3File(
  accessToken: string,
  fileId: string
): Promise<Blob> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const response = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to download SB3 file from Google Drive (${response.status})`);
  }

  return response.blob();
}

/**
 * Deletes a file from Google Drive.
 * Must only be called after explicit user confirmation dialog!
 */
export async function deleteDriveFile(
  accessToken: string,
  fileId: string
): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const response = await fetchWithRetry(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok && response.status !== 404) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to delete file from Google Drive (${response.status})`);
  }
}
