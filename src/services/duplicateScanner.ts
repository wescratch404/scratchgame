import { Sb3Project } from '../types/scratch';
import { getProjectBlob } from './db';

export type DuplicateMatchMode = 'exact-hash' | 'name-and-size' | 'structure-and-stats';

export interface DuplicateProjectItem {
  project: Sb3Project;
  hash?: string;
  isOriginal: boolean;
  selectedForDeletion: boolean;
}

export interface DuplicateGroup {
  id: string;
  reason: string;
  fileSize: number;
  items: DuplicateProjectItem[];
  potentialSpaceSaving: number;
}

export interface ScanProgress {
  scanned: number;
  total: number;
  currentTitle: string;
}

/**
 * Calculates SHA-256 hash string for an ArrayBuffer or Blob
 */
export async function calculateSha256(data: Blob | ArrayBuffer): Promise<string> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Scans projects and returns duplicate groups
 */
export async function scanForDuplicates(
  projects: Sb3Project[],
  mode: DuplicateMatchMode = 'exact-hash',
  onProgress?: (progress: ScanProgress) => void
): Promise<DuplicateGroup[]> {
  if (projects.length < 2) return [];

  const groups: DuplicateGroup[] = [];

  if (mode === 'exact-hash') {
    // Optimization: Group by exact fileSize first.
    // Files with different file sizes cannot have matching hashes.
    const sizeMap = new Map<number, Sb3Project[]>();
    for (const p of projects) {
      const list = sizeMap.get(p.fileSize) || [];
      list.push(p);
      sizeMap.set(p.fileSize, list);
    }

    // Filter to only sizes with >= 2 projects candidate
    const candidateProjects: Sb3Project[] = [];
    for (const [_, list] of sizeMap.entries()) {
      if (list.length >= 2) {
        candidateProjects.push(...list);
      }
    }

    if (candidateProjects.length === 0) {
      if (onProgress) {
        onProgress({ scanned: projects.length, total: projects.length, currentTitle: 'Complete' });
      }
      return [];
    }

    const hashMap = new Map<string, { project: Sb3Project; hash: string }[]>();
    let scanned = 0;

    for (const proj of candidateProjects) {
      scanned++;
      if (onProgress) {
        onProgress({
          scanned,
          total: candidateProjects.length,
          currentTitle: proj.title || proj.fileName,
        });
      }

      try {
        const blobOrBuf = await getProjectBlob(proj.id);
        if (blobOrBuf) {
          const hash = await calculateSha256(blobOrBuf);
          const list = hashMap.get(hash) || [];
          list.push({ project: proj, hash });
          hashMap.set(hash, list);
        }
      } catch (err) {
        console.error(`Error hashing project ${proj.id}:`, err);
      }
    }

    for (const [hash, entries] of hashMap.entries()) {
      if (entries.length >= 2) {
        // Sort items to determine the primary original to keep:
        // Priority: 1. Favorite first, 2. Most played, 3. Oldest dateAdded
        const sorted = [...entries].sort((a, b) => {
          if (a.project.isFavorite && !b.project.isFavorite) return -1;
          if (!a.project.isFavorite && b.project.isFavorite) return 1;
          if ((b.project.playCount || 0) !== (a.project.playCount || 0)) {
            return (b.project.playCount || 0) - (a.project.playCount || 0);
          }
          return a.project.dateAdded - b.project.dateAdded;
        });

        const items: DuplicateProjectItem[] = sorted.map((entry, idx) => ({
          project: entry.project,
          hash: entry.hash,
          isOriginal: idx === 0,
          selectedForDeletion: idx > 0, // Mark all redundant duplicates for deletion by default
        }));

        const singleSize = sorted[0].project.fileSize;
        const potentialSaving = singleSize * (sorted.length - 1);

        groups.push({
          id: hash,
          reason: 'Exact Binary Match (SHA-256 identical content)',
          fileSize: singleSize,
          items,
          potentialSpaceSaving: potentialSaving,
        });
      }
    }
  } else if (mode === 'name-and-size') {
    const keyMap = new Map<string, Sb3Project[]>();
    let scanned = 0;

    for (const p of projects) {
      scanned++;
      if (onProgress) {
        onProgress({
          scanned,
          total: projects.length,
          currentTitle: p.title || p.fileName,
        });
      }

      const cleanName = (p.fileName || p.title).trim().toLowerCase();
      const key = `${cleanName}__${p.fileSize}`;
      const list = keyMap.get(key) || [];
      list.push(p);
      keyMap.set(key, list);
    }

    for (const [key, list] of keyMap.entries()) {
      if (list.length >= 2) {
        const sorted = [...list].sort((a, b) => {
          if (a.isFavorite && !b.isFavorite) return -1;
          if (!a.isFavorite && b.isFavorite) return 1;
          if ((b.playCount || 0) !== (a.playCount || 0)) {
            return (b.playCount || 0) - (a.playCount || 0);
          }
          return a.dateAdded - b.dateAdded;
        });

        const items: DuplicateProjectItem[] = sorted.map((proj, idx) => ({
          project: proj,
          isOriginal: idx === 0,
          selectedForDeletion: idx > 0,
        }));

        groups.push({
          id: key,
          reason: 'Identical Name & Exact File Size',
          fileSize: sorted[0].fileSize,
          items,
          potentialSpaceSaving: sorted[0].fileSize * (sorted.length - 1),
        });
      }
    }
  } else if (mode === 'structure-and-stats') {
    const sigMap = new Map<string, Sb3Project[]>();
    let scanned = 0;

    for (const p of projects) {
      scanned++;
      if (onProgress) {
        onProgress({
          scanned,
          total: projects.length,
          currentTitle: p.title || p.fileName,
        });
      }

      const s = p.stats;
      const sig = `${s.spriteCount}_${s.blockCount}_${s.scriptCount}_${s.costumeCount}_${s.soundCount}_${s.variableCount}`;
      const list = sigMap.get(sig) || [];
      list.push(p);
      sigMap.set(sig, list);
    }

    for (const [sig, list] of sigMap.entries()) {
      if (list.length >= 2) {
        const sorted = [...list].sort((a, b) => {
          if (a.isFavorite && !b.isFavorite) return -1;
          if (!a.isFavorite && b.isFavorite) return 1;
          return a.dateAdded - b.dateAdded;
        });

        const items: DuplicateProjectItem[] = sorted.map((proj, idx) => ({
          project: proj,
          isOriginal: idx === 0,
          selectedForDeletion: idx > 0,
        }));

        const totalExtraBytes = sorted.slice(1).reduce((acc, cur) => acc + cur.fileSize, 0);

        groups.push({
          id: sig,
          reason: 'Identical Scratch Code & Sprite Architecture',
          fileSize: sorted[0].fileSize,
          items,
          potentialSpaceSaving: totalExtraBytes,
        });
      }
    }
  }

  // Sort groups by potential space saving descending (largest savings first)
  return groups.sort((a, b) => b.potentialSpaceSaving - a.potentialSpaceSaving);
}
