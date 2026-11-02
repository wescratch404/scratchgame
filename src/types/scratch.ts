export interface ScratchStats {
  spriteCount: number;
  blockCount: number;
  costumeCount: number;
  soundCount: number;
  variableCount: number;
  listCount: number;
  scriptCount: number;
  extensions: string[];
  spriteNames: string[];
  hasCloudVars: boolean;
  scratchVersion?: string;
}

export interface Sb3Project {
  id: string;
  title: string;
  fileName: string;
  fileSize: number;
  folderId: string | null; // null means root / unfiled
  tags: string[];
  isFavorite: boolean;
  isArchived: boolean;
  dateAdded: number;
  dateModified: number;
  playCount: number;
  lastPlayed?: number;
  notes: string;
  description: string;
  thumbnailUrl: string; // Base64 data URL or generated SVG
  stats: ScratchStats;
  driveFileId?: string;
  driveSyncedAt?: number;
  hasEmbeddedThumbnail?: boolean;
}

export interface Sb3Folder {
  id: string;
  name: string;
  parentId: string | null;
  color?: string;
  createdAt: number;
}

export interface Sb3Tag {
  id: string;
  name: string;
  color: string;
}

export type ViewMode = 'grid' | 'list';

export type SortField = 'title' | 'fileName' | 'fileSize' | 'dateModified' | 'dateAdded' | 'playCount';
export type SortOrder = 'asc' | 'desc';

export interface FilterOptions {
  searchQuery: string;
  folderId: string | 'all' | 'unfiled' | 'favorites' | 'recent' | 'archived';
  selectedTags: string[];
  minSize?: number;
  maxSize?: number;
  extensionFilter?: string;
}

export interface LibraryBackup {
  version: number;
  exportDate: string;
  projects: Omit<Sb3Project, 'thumbnailUrl'>[];
  folders: Sb3Folder[];
  tags: Sb3Tag[];
}
