import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sb3Project,
  Sb3Folder,
  Sb3Tag,
  ViewMode,
  SortField,
  SortOrder,
  LibraryBackup
} from './types/scratch';
import {
  getAllProjects,
  getAllFolders,
  getAllTags,
  saveProject,
  saveProjectsBulk,
  deleteProjects,
  saveFolder,
  saveFoldersBulk,
  deleteFolder,
  saveTag,
  deleteTag,
  getProjectBlob
} from './services/db';
import { parseSb3File, embedThumbnailInSb3 } from './services/sb3Parser';
import { useTheme } from './context/ThemeContext';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { GridView } from './components/GridView';
import { ListView } from './components/ListView';
import { ProjectDetails } from './components/ProjectDetails';
import { PlayerModal } from './components/PlayerModal';
import { StatsModal } from './components/StatsModal';
import { BulkActionBar } from './components/BulkActionBar';
import { ImportDialog } from './components/ImportDialog';
import { FolderDialog } from './components/FolderDialog';
import { TagDialog } from './components/TagDialog';
import { RenameDialog } from './components/RenameDialog';
import { ExportBackupModal } from './components/ExportBackupModal';
import { GoogleSyncModal } from './components/GoogleSyncModal';
import { DuplicateScannerModal } from './components/DuplicateScannerModal';
import { Sb3EditorView } from './components/Sb3EditorView';
import { User } from 'firebase/auth';
import { initAuth, googleSignIn, logout, getAccessToken, clearCachedAccessToken } from './services/googleAuth';
import {
  findOrCreateLibraryFolder,
  uploadProjectToDriveWithFolder,
  resolveLocalFolderHierarchyFromPath
} from './services/googleDrive';
import JSZip from 'jszip';
import {
  Sparkles,
  Upload,
  AlertTriangle,
  FolderInput,
  FolderPlus,
  Loader2,
  CheckCircle2,
  Layers
} from 'lucide-react';

export default function App() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Check if opened as dedicated SB3 Editor tab for a specific project
  const [editorProjectId, setEditorProjectId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('editor') || params.get('project');
  });

  // Main Data States
  const [projects, setProjects] = useState<Sb3Project[]>([]);
  const [folders, setFolders] = useState<Sb3Folder[]>([]);
  const [tags, setTags] = useState<Sb3Tag[]>([]);
  const [loading, setLoading] = useState(true);

  // View & Filter States
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState<string | 'all' | 'unfiled' | 'favorites' | 'recent' | 'archived'>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>('dateModified');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Selection & Active Item States
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [showDetailsPanel, setShowDetailsPanel] = useState(true);

  // Modal Dialog States
  const [playingProject, setPlayingProject] = useState<Sb3Project | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [folderToEdit, setFolderToEdit] = useState<Sb3Folder | null>(null);
  const [parentFolderIdForNew, setParentFolderIdForNew] = useState<string | null>(null);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [projectToRename, setProjectToRename] = useState<Sb3Project | null>(null);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showDuplicateScannerModal, setShowDuplicateScannerModal] = useState(false);
  const [globalDragActive, setGlobalDragActive] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Google Authentication & Drive States
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [showGoogleSyncModal, setShowGoogleSyncModal] = useState(false);
  const [autoPullOnOpenGoogleSync, setAutoPullOnOpenGoogleSync] = useState(false);

  // Toast notification helper
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3000);
  }, []);

  // Listen for Google Auth changes
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
      },
      () => {
        setUser(null);
        setAccessToken(null);
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Initialize DB data
  useEffect(() => {
    async function initData() {
      try {
        const [loadedProjects, loadedFolders, loadedTags] = await Promise.all([
          getAllProjects(),
          getAllFolders(),
          getAllTags()
        ]);

        setFolders(loadedFolders);
        setTags(loadedTags);

        // Clean up any demo projects if previously seeded
        const demoTitles = new Set([
          'Neon Dash Cat Platformer',
          'Galactic Invaders 3000',
          'Particle Fountain Simulator',
          'Scratch 8-Bit Chiptune Synth',
          'Neural Pong AI Challenger',
          'Raycaster 3D Maze Explorer',
          'Geometry Dash Mini',
          'Scratch Cat Platformer',
          'Retro Asteroids Space Shooter',
          'Virtual Flappy Cat',
          'Paint & Pixel Canvas Art',
          'Piano Synth Musical Keyboard',
        ]);

        const demoProjects = loadedProjects.filter(p => demoTitles.has(p.title));
        if (demoProjects.length > 0) {
          await deleteProjects(demoProjects.map(p => p.id));
        }

        const realProjects = loadedProjects.filter(p => !demoTitles.has(p.title));
        setProjects(realProjects);
      } catch (err) {
        console.error('Failed to initialize database:', err);
      } finally {
        setLoading(false);
      }
    }
    initData();
  }, []);

  // Global window Drag and Drop support for .sb3 files
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes('Files')) {
        setGlobalDragActive(true);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDragLeave = (e: DragEvent) => {
      if (e.clientX === 0 || e.clientY === 0) {
        setGlobalDragActive(false);
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      setGlobalDragActive(false);

      const extracted: { file: File; relativePath: string }[] = [];

      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        const readEntry = async (entry: any, currentPath: string): Promise<void> => {
          if (!entry) return;
          if (entry.isFile) {
            const file: File = await new Promise((res, rej) => entry.file(res, rej));
            const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
            extracted.push({ file, relativePath: fullPath });
          } else if (entry.isDirectory) {
            const dirReader = entry.createReader();
            const readEntries = async (): Promise<any[]> => {
              return new Promise((res, rej) => dirReader.readEntries(res, rej));
            };
            let entries: any[] = [];
            let batch: any[];
            do {
              batch = await readEntries();
              entries = entries.concat(batch);
            } while (batch.length > 0);

            const nextPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
            for (const child of entries) {
              await readEntry(child, nextPath);
            }
          }
        };

        for (let i = 0; i < e.dataTransfer.items.length; i++) {
          const item = e.dataTransfer.items[i];
          const entry = (item as any).webkitGetAsEntry ? (item as any).webkitGetAsEntry() : null;
          if (entry) {
            await readEntry(entry, '');
          } else {
            const file = item.getAsFile();
            if (file) {
              extracted.push({ file, relativePath: file.webkitRelativePath || file.name });
            }
          }
        }
      } else if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          const f = e.dataTransfer.files[i];
          extracted.push({ file: f, relativePath: (f as any).webkitRelativePath || f.name });
        }
      }

      const validItems = extracted.filter(
        item => item.file.name.toLowerCase().endsWith('.sb3') || item.file.type.includes('scratch')
      );

      if (validItems.length > 0) {
        showToast(`Importing ${validItems.length} project(s)...`);
        const newProjects: Sb3Project[] = [];
        const newBlobs: { id: string; blob: Blob }[] = [];
        let currentFolders = [...folders];
        const newFoldersList: Sb3Folder[] = [];

        for (const item of validItems) {
          try {
            const res = await parseSb3File(item.file);
            const pathSegments = item.relativePath.split('/').filter(Boolean);
            if (pathSegments.length > 1) {
              const dirPath = pathSegments.slice(0, -1).join('/');
              const { leafFolderId, newFolders } = resolveLocalFolderHierarchyFromPath(dirPath, currentFolders);
              if (newFolders.length > 0) {
                newFoldersList.push(...newFolders);
                currentFolders = [...currentFolders, ...newFolders];
              }
              res.project.folderId = leafFolderId;
            } else if (typeof currentFolderId === 'string' && !['all', 'unfiled', 'favorites', 'recent', 'archived'].includes(currentFolderId)) {
              res.project.folderId = currentFolderId;
            }
            newProjects.push(res.project);
            newBlobs.push({ id: res.project.id, blob: res.blob });
          } catch (err) {
            console.error(err);
          }
        }

        if (newFoldersList.length > 0) {
          await saveFoldersBulk(newFoldersList);
          setFolders(currentFolders);
        }

        if (newProjects.length > 0) {
          await saveProjectsBulk(newProjects, newBlobs);
          setProjects(prev => [...prev, ...newProjects]);
          const folderNote = newFoldersList.length > 0 ? ` across ${newFoldersList.length} folder(s)` : '';
          showToast(`Imported ${newProjects.length} Scratch project(s)${folderNote} successfully!`);
        }
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [currentFolderId, folders, showToast]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid firing when typing in an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      // Space: Toggle Project Inspector
      if (e.key === ' ' && !playingProject) {
        e.preventDefault();
        setShowDetailsPanel(prev => !prev);
      }

      // Ctrl/Cmd+A: Select all visible projects
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedProjectIds(filteredProjects.map(p => p.id));
      }

      // Escape: Deselect or close
      if (e.key === 'Escape') {
        if (selectedProjectIds.length > 0) {
          setSelectedProjectIds([]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Calculate folder tree helper (includes descendants when selecting parent folder)
  const getSubfolderIds = useCallback((parentFolderId: string): string[] => {
    const ids: string[] = [parentFolderId];
    const findChildren = (pid: string) => {
      const children = folders.filter(f => f.parentId === pid);
      for (const c of children) {
        ids.push(c.id);
        findChildren(c.id);
      }
    };
    findChildren(parentFolderId);
    return ids;
  }, [folders]);

  // Filtered & Sorted Projects
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      // Folder filtering
      if (currentFolderId === 'favorites') {
        if (!p.isFavorite) return false;
      } else if (currentFolderId === 'recent') {
        if (!p.lastPlayed && Date.now() - p.dateAdded > 7 * 24 * 60 * 60 * 1000) return false;
      } else if (currentFolderId === 'archived') {
        if (!p.isArchived) return false;
      } else if (currentFolderId === 'unfiled') {
        if (p.folderId !== null) return false;
        if (p.isArchived) return false;
      } else if (currentFolderId !== 'all') {
        const allowedFolderIds = getSubfolderIds(currentFolderId);
        if (!p.folderId || !allowedFolderIds.includes(p.folderId)) return false;
        if (p.isArchived) return false;
      } else {
        // 'all' shows all non-archived projects
        if (p.isArchived) return false;
      }

      // Tags filtering
      if (selectedTags.length > 0) {
        const hasTag = selectedTags.some(t => p.tags.includes(t));
        if (!hasTag) return false;
      }

      // Global Search filtering
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = p.title.toLowerCase().includes(q);
        const fileMatch = p.fileName.toLowerCase().includes(q);
        const notesMatch = p.notes.toLowerCase().includes(q);
        const tagMatch = p.tags.some(t => t.toLowerCase().includes(q));
        const spriteMatch = p.stats.spriteNames.some(s => s.toLowerCase().includes(q));
        const extMatch = p.stats.extensions.some(e => e.toLowerCase().includes(q));
        if (!titleMatch && !fileMatch && !notesMatch && !tagMatch && !spriteMatch && !extMatch) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortField === 'title') {
        comparison = a.title.localeCompare(b.title);
      } else if (sortField === 'fileName') {
        comparison = a.fileName.localeCompare(b.fileName);
      } else if (sortField === 'fileSize') {
        comparison = a.fileSize - b.fileSize;
      } else if (sortField === 'dateModified') {
        comparison = a.dateModified - b.dateModified;
      } else if (sortField === 'dateAdded') {
        comparison = a.dateAdded - b.dateAdded;
      } else if (sortField === 'playCount') {
        comparison = a.playCount - b.playCount;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [projects, currentFolderId, selectedTags, searchQuery, sortField, sortOrder, getSubfolderIds]);

  // Sidebar Counts
  const counts = useMemo(() => {
    const byFolder: Record<string, number> = {};
    const byTag: Record<string, number> = {};
    let favorites = 0;
    let recent = 0;
    let archived = 0;
    let unfiled = 0;

    for (const f of folders) byFolder[f.id] = 0;
    for (const t of tags) byTag[t.name] = 0;

    for (const p of projects) {
      if (p.isFavorite) favorites++;
      if (p.isArchived) archived++;
      if (p.lastPlayed || Date.now() - p.dateAdded <= 7 * 24 * 60 * 60 * 1000) recent++;
      if (!p.folderId && !p.isArchived) unfiled++;

      if (p.folderId && byFolder[p.folderId] !== undefined) {
        byFolder[p.folderId]++;
      }

      for (const t of p.tags) {
        byTag[t] = (byTag[t] || 0) + 1;
      }
    }

    return {
      total: projects.filter(p => !p.isArchived).length,
      favorites,
      recent,
      archived,
      unfiled,
      byFolder,
      byTag
    };
  }, [projects, folders, tags]);

  const storageUsedBytes = useMemo(() => {
    return projects.reduce((acc, p) => acc + p.fileSize, 0);
  }, [projects]);

  // Active Project for Inspector
  const activeProject = useMemo(() => {
    if (activeProjectId) {
      return projects.find(p => p.id === activeProjectId) || null;
    }
    if (selectedProjectIds.length === 1) {
      return projects.find(p => p.id === selectedProjectIds[0]) || null;
    }
    return null;
  }, [projects, activeProjectId, selectedProjectIds]);

  // Current folder title for toolbar breadcrumb
  const currentFolderTitle = useMemo(() => {
    if (currentFolderId === 'all') return 'All Projects';
    if (currentFolderId === 'favorites') return 'Starred Favorites';
    if (currentFolderId === 'recent') return 'Recently Opened';
    if (currentFolderId === 'unfiled') return 'Unfiled (Root)';
    if (currentFolderId === 'archived') return 'Archived Projects';
    const f = folders.find(f => f.id === currentFolderId);
    return f ? f.name : 'Projects';
  }, [currentFolderId, folders]);

  // Selection handlers
  const handleSelectProject = (id: string, isMulti: boolean, isRange = false) => {
    if (isRange && selectedProjectIds.length > 0) {
      const lastSelectedId = selectedProjectIds[selectedProjectIds.length - 1];
      const lastIdx = filteredProjects.findIndex(p => p.id === lastSelectedId);
      const currIdx = filteredProjects.findIndex(p => p.id === id);
      if (lastIdx !== -1 && currIdx !== -1) {
        const start = Math.min(lastIdx, currIdx);
        const end = Math.max(lastIdx, currIdx);
        const rangeIds = filteredProjects.slice(start, end + 1).map(p => p.id);
        setSelectedProjectIds(Array.from(new Set([...selectedProjectIds, ...rangeIds])));
        return;
      }
    }

    if (isMulti) {
      setSelectedProjectIds(prev =>
        prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
      );
    } else {
      setSelectedProjectIds([id]);
      setActiveProjectId(id);
    }
  };

  const handleSelectAll = () => {
    setSelectedProjectIds(filteredProjects.map(p => p.id));
  };

  const handleDeselectAll = () => {
    setSelectedProjectIds([]);
  };

  // Run Project
  const handleRunProject = (project: Sb3Project) => {
    const updated = {
      ...project,
      playCount: (project.playCount || 0) + 1,
      lastPlayed: Date.now()
    };
    saveProject(updated);
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
    setPlayingProject(updated);
  };

  // Toggle Favorite
  const handleToggleFavorite = (id: string) => {
    setProjects(prev =>
      prev.map(p => {
        if (p.id === id) {
          const updated = { ...p, isFavorite: !p.isFavorite };
          saveProject(updated);
          return updated;
        }
        return p;
      })
    );
  };

  // Single Delete Project
  const handleDeleteProject = (id: string) => {
    if (window.confirm('Are you sure you want to delete this Scratch project from your library?')) {
      deleteProjects([id]);
      setProjects(prev => prev.filter(p => p.id !== id));
      setSelectedProjectIds(prev => prev.filter(i => i !== id));
      if (activeProjectId === id) setActiveProjectId(null);
      showToast('Project deleted.');
    }
  };

  // Single Move Project
  const handleMoveProject = (projectId: string, targetFolderId: string | null) => {
    setProjects(prev =>
      prev.map(p => {
        if (p.id === projectId) {
          const updated = { ...p, folderId: targetFolderId, dateModified: Date.now() };
          saveProject(updated);
          return updated;
        }
        return p;
      })
    );
    showToast('Project moved.');
  };

  // Delete Duplicate Projects Handler
  const handleDeleteDuplicateProjects = async (ids: string[]) => {
    await deleteProjects(ids);
    setProjects(prev => prev.filter(p => !ids.includes(p.id)));
    setSelectedProjectIds(prev => prev.filter(id => !ids.includes(id)));
    if (activeProjectId && ids.includes(activeProjectId)) {
      setActiveProjectId(null);
    }
    showToast(`Deleted ${ids.length} duplicate Scratch project(s)!`);
  };

  // Update Project (from inspector notes, tags, etc.)
  const handleUpdateProject = (updated: Sb3Project) => {
    saveProject(updated);
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  // Quick Import from toolbar file / folder inputs
  const handleQuickImport = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter(
      f => f.name.toLowerCase().endsWith('.sb3') || f.type.includes('scratch')
    );
    if (files.length === 0) {
      showToast('No .sb3 files found.');
      return;
    }

    showToast(`Parsing ${files.length} project(s)...`);
    const newProjects: Sb3Project[] = [];
    const newBlobs: { id: string; blob: Blob }[] = [];
    let currentFolders = [...folders];
    const newFoldersList: Sb3Folder[] = [];

    for (const f of files) {
      try {
        const res = await parseSb3File(f);
        const relPath = (f as any).webkitRelativePath || f.name;
        const pathSegments = relPath.split('/').filter(Boolean);
        if (pathSegments.length > 1) {
          const dirPath = pathSegments.slice(0, -1).join('/');
          const { leafFolderId, newFolders } = resolveLocalFolderHierarchyFromPath(dirPath, currentFolders);
          if (newFolders.length > 0) {
            newFoldersList.push(...newFolders);
            currentFolders = [...currentFolders, ...newFolders];
          }
          res.project.folderId = leafFolderId;
        } else if (typeof currentFolderId === 'string' && !['all', 'unfiled', 'favorites', 'recent', 'archived'].includes(currentFolderId)) {
          res.project.folderId = currentFolderId;
        }
        newProjects.push(res.project);
        newBlobs.push({ id: res.project.id, blob: res.blob });
      } catch (err) {
        console.error('Error parsing .sb3 file:', err);
      }
    }

    if (newFoldersList.length > 0) {
      await saveFoldersBulk(newFoldersList);
      setFolders(currentFolders);
    }

    if (newProjects.length > 0) {
      await saveProjectsBulk(newProjects, newBlobs);
      setProjects(prev => [...prev, ...newProjects]);
      const folderNote = newFoldersList.length > 0 ? ` across ${newFoldersList.length} folder(s)` : '';
      showToast(`Imported ${newProjects.length} Scratch project(s)${folderNote}!`);
    }
  };

  // Bulk Operations
  const handleBulkMove = (targetFolderId: string | null) => {
    setProjects(prev =>
      prev.map(p => {
        if (selectedProjectIds.includes(p.id)) {
          const updated = { ...p, folderId: targetFolderId, dateModified: Date.now() };
          saveProject(updated);
          return updated;
        }
        return p;
      })
    );
    showToast(`Moved ${selectedProjectIds.length} projects.`);
    setSelectedProjectIds([]);
  };

  const handleBulkAddTag = (tagName: string) => {
    setProjects(prev =>
      prev.map(p => {
        if (selectedProjectIds.includes(p.id) && !p.tags.includes(tagName)) {
          const updated = { ...p, tags: [...p.tags, tagName], dateModified: Date.now() };
          saveProject(updated);
          return updated;
        }
        return p;
      })
    );
    showToast(`Added tag "${tagName}" to selected.`);
  };

  const handleBulkRemoveTag = (tagName: string) => {
    setProjects(prev =>
      prev.map(p => {
        if (selectedProjectIds.includes(p.id)) {
          const updated = { ...p, tags: p.tags.filter(t => t !== tagName), dateModified: Date.now() };
          saveProject(updated);
          return updated;
        }
        return p;
      })
    );
  };

  const handleBulkFavorite = (isFavorite: boolean) => {
    setProjects(prev =>
      prev.map(p => {
        if (selectedProjectIds.includes(p.id)) {
          const updated = { ...p, isFavorite };
          saveProject(updated);
          return updated;
        }
        return p;
      })
    );
    showToast(`Updated favorites for ${selectedProjectIds.length} projects.`);
  };

  const handleBulkArchive = () => {
    setProjects(prev =>
      prev.map(p => {
        if (selectedProjectIds.includes(p.id)) {
          const updated = { ...p, isArchived: !p.isArchived };
          saveProject(updated);
          return updated;
        }
        return p;
      })
    );
    showToast(`Archived ${selectedProjectIds.length} projects.`);
    setSelectedProjectIds([]);
  };

  const handleBulkDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${selectedProjectIds.length} Scratch projects?`)) {
      deleteProjects(selectedProjectIds);
      setProjects(prev => prev.filter(p => !selectedProjectIds.includes(p.id)));
      setSelectedProjectIds([]);
      setActiveProjectId(null);
      showToast('Deleted selected projects.');
    }
  };

  const handleBulkExport = async () => {
    const selected = projects.filter(p => selectedProjectIds.includes(p.id));
    if (selected.length === 0) return;

    showToast(`Packaging ${selected.length} projects into ZIP...`);
    try {
      const zip = new JSZip();
      for (const p of selected) {
        const blobOrBuf = await getProjectBlob(p.id);
        if (blobOrBuf) {
          const readyBlob = await embedThumbnailInSb3(blobOrBuf, p.thumbnailUrl);
          const safeName = p.fileName.endsWith('.sb3') ? p.fileName : `${p.fileName}.sb3`;
          zip.file(safeName, readyBlob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scratch_selection_${selected.length}_projects.zip`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Downloaded ZIP successfully!');
    } catch (err) {
      console.error(err);
      showToast('Failed to create ZIP package.');
    }
  };

  // Google Login / Logout & Drive Handlers
  const handleGoogleLogin = async (): Promise<string | null> => {
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setAccessToken(res.accessToken);
        showToast(`Signed in as ${res.user.email}`);
        return res.accessToken;
      }
      return null;
    } catch (err: any) {
      console.error('Google sign in error:', err);
      showToast('Google Sign-in was cancelled or encountered an error.');
      return null;
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setAccessToken(null);
      showToast('Signed out from Google account.');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Sync single project to Google Drive
  const handleSyncProjectToDrive = async (project: Sb3Project) => {
    let token = accessToken || await getAccessToken();
    if (!token) {
      token = await handleGoogleLogin();
      if (!token) return;
    }

    showToast(`Syncing "${project.title}" to Google Drive...`);
    try {
      const folderId = await findOrCreateLibraryFolder(token);
      const blobOrBuf = await getProjectBlob(project.id);
      if (!blobOrBuf) {
        showToast('Project file not found locally.');
        return;
      }

      const res = await uploadProjectToDriveWithFolder(token, folderId, project, blobOrBuf, folders);
      const updated = {
        ...project,
        driveFileId: res.fileId,
        driveSyncedAt: Date.now(),
      };
      await saveProject(updated);
      setProjects(prev => prev.map(p => p.id === project.id ? updated : p));
      const folderMsg = res.folderPath ? ` in "${res.folderPath}"` : '';
      showToast(`Synced "${project.title}" to Google Drive${folderMsg}!`);
    } catch (err: any) {
      console.error('Drive sync failed:', err);
      if (err?.message?.includes('401') || err?.message?.toLowerCase().includes('unauthorized')) {
        clearCachedAccessToken();
        setAccessToken(null);
        showToast('Google Drive authorization expired. Please reconnect.');
      } else {
        showToast(err.message || 'Failed to sync with Google Drive.');
      }
    }
  };

  // Bulk sync selected projects to Google Drive
  const handleBulkSyncDrive = async () => {
    let token = accessToken || await getAccessToken();
    if (!token) {
      token = await handleGoogleLogin();
      if (!token) return;
    }

    const selected = projects.filter(p => selectedProjectIds.includes(p.id));
    if (selected.length === 0) return;

    showToast(`Syncing ${selected.length} projects to Google Drive...`);
    try {
      const folderId = await findOrCreateLibraryFolder(token);
      const updatedProjects = [...projects];
      const folderCache = new Map<string, string>();

      for (let i = 0; i < selected.length; i++) {
        const proj = selected[i];
        const blobOrBuf = await getProjectBlob(proj.id);
        if (blobOrBuf) {
          const res = await uploadProjectToDriveWithFolder(token, folderId, proj, blobOrBuf, folders, folderCache);
          const idx = updatedProjects.findIndex(p => p.id === proj.id);
          if (idx !== -1) {
            updatedProjects[idx] = {
              ...updatedProjects[idx],
              driveFileId: res.fileId,
              driveSyncedAt: Date.now(),
            };
            await saveProject(updatedProjects[idx]);
          }
        }
      }

      setProjects(updatedProjects);
      showToast(`Synced ${selected.length} projects to Google Drive (preserving folder structures)!`);
      setSelectedProjectIds([]);
    } catch (err: any) {
      console.error('Bulk Drive sync failed:', err);
      if (err?.message?.includes('401') || err?.message?.toLowerCase().includes('unauthorized')) {
        clearCachedAccessToken();
        setAccessToken(null);
        showToast('Google Drive authorization expired. Please reconnect.');
      } else {
        showToast(err.message || 'Failed to sync selected projects to Google Drive.');
      }
    }
  };

  // Folder Operations
  const handleOpenCreateFolder = (parentId: string | null = null) => {
    setFolderToEdit(null);
    setParentFolderIdForNew(parentId);
    setShowFolderDialog(true);
  };

  const handleOpenRenameFolder = (folder: Sb3Folder) => {
    setFolderToEdit(folder);
    setParentFolderIdForNew(folder.parentId);
    setShowFolderDialog(true);
  };

  const handleSaveFolder = async (folder: Sb3Folder) => {
    await saveFolder(folder);
    setFolders(prev => {
      const exists = prev.some(f => f.id === folder.id);
      return exists ? prev.map(f => f.id === folder.id ? folder : f) : [...prev, folder];
    });
    showToast(`Folder "${folder.name}" saved.`);
  };

  const handleDeleteFolder = async (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    if (window.confirm(`Delete folder "${folder.name}"? Projects inside will be moved to Unfiled.`)) {
      // Unfile projects that were in this folder
      setProjects(prev =>
        prev.map(p => {
          if (p.folderId === folderId) {
            const updated = { ...p, folderId: null };
            saveProject(updated);
            return updated;
          }
          return p;
        })
      );
      await deleteFolder(folderId);
      setFolders(prev => prev.filter(f => f.id !== folderId));
      if (currentFolderId === folderId) {
        setCurrentFolderId('all');
      }
      showToast(`Folder "${folder.name}" deleted.`);
    }
  };

  // Tag Operations
  const handleSaveTag = async (tag: Sb3Tag) => {
    await saveTag(tag);
    setTags(prev => [...prev, tag]);
    showToast(`Tag "${tag.name}" created.`);
  };

  const handleDeleteTag = async (tagId: string) => {
    const tag = tags.find(t => t.id === tagId);
    if (!tag) return;
    await deleteTag(tagId);
    setTags(prev => prev.filter(t => t.id !== tagId));
    setSelectedTags(prev => prev.filter(t => t !== tag.name));
    showToast(`Tag "${tag.name}" removed.`);
  };

  const handleToggleTagFilter = (tagName: string) => {
    setSelectedTags(prev =>
      prev.includes(tagName) ? prev.filter(t => t !== tagName) : [...prev, tagName]
    );
  };

  // Project Rename
  const handleOpenRenameProject = (project: Sb3Project) => {
    setProjectToRename(project);
    setShowRenameDialog(true);
  };

  const handleConfirmRename = (projectId: string, newTitle: string, newFileName: string) => {
    setProjects(prev =>
      prev.map(p => {
        if (p.id === projectId) {
          const updated = { ...p, title: newTitle, fileName: newFileName, dateModified: Date.now() };
          saveProject(updated);
          return updated;
        }
        return p;
      })
    );
    showToast('Project renamed.');
  };

  // Restore Metadata Backup
  const handleRestoreBackup = (backup: LibraryBackup) => {
    if (backup.folders) {
      for (const f of backup.folders) saveFolder(f);
      setFolders(backup.folders);
    }
    if (backup.tags) {
      for (const t of backup.tags) saveTag(t);
      setTags(backup.tags);
    }
    if (backup.projects) {
      // Merge restored metadata into matching projects
      setProjects(prev =>
        prev.map(existing => {
          const match = backup.projects.find(bp => bp.id === existing.id || bp.fileName === existing.fileName);
          if (match) {
            const updated = {
              ...existing,
              title: match.title,
              folderId: match.folderId,
              tags: match.tags,
              notes: match.notes,
              description: match.description,
              isFavorite: match.isFavorite,
              isArchived: match.isArchived,
            };
            saveProject(updated);
            return updated;
          }
          return existing;
        })
      );
    }
    showToast('Library metadata backup restored successfully!');
  };

  // If opened in dedicated SB3 Editor tab for a project, render the loaded editor
  if (editorProjectId) {
    return (
      <Sb3EditorView
        projectId={editorProjectId}
        onExit={() => {
          setEditorProjectId(null);
          const url = new URL(window.location.href);
          url.searchParams.delete('editor');
          url.searchParams.delete('project');
          window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
        }}
      />
    );
  }

  return (
    <div className={`flex h-screen w-screen overflow-hidden font-sans select-none antialiased transition-colors ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
    }`}>
      {/* Global Drag Overlay */}
      {globalDragActive && (
        <div className="fixed inset-0 z-50 bg-orange-600/30 backdrop-blur-md border-4 border-dashed border-orange-500 flex flex-col items-center justify-center p-8 pointer-events-none animate-in fade-in">
          <div className="w-20 h-20 rounded-3xl bg-slate-900/90 border border-orange-500 text-orange-400 flex items-center justify-center shadow-2xl mb-4">
            <Upload className="w-10 h-10 animate-bounce" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Drop Scratch .sb3 Files Here</h2>
          <p className="text-sm text-orange-200">They will be parsed, organized, and saved to your local library.</p>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs animate-in slide-in-from-top-2 border ${
          isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800 shadow-xl'
        }`}>
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Left Sidebar */}
      <Sidebar
        folders={folders}
        tags={tags}
        currentFolderId={currentFolderId}
        onSelectFolder={(id) => {
          setCurrentFolderId(id);
          setSelectedProjectIds([]);
        }}
        selectedTags={selectedTags}
        onToggleTag={handleToggleTagFilter}
        onClearTags={() => setSelectedTags([])}
        onCreateFolder={handleOpenCreateFolder}
        onRenameFolder={handleOpenRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onCreateTag={() => setShowTagDialog(true)}
        onDeleteTag={handleDeleteTag}
        counts={counts}
        storageUsedBytes={storageUsedBytes}
        onMoveProjectToFolder={handleMoveProject}
        onOpenDuplicateScanner={() => setShowDuplicateScannerModal(true)}
        activeProjectId={activeProjectId}
      />

      {/* Central Main Workspace Area */}
      <main className={`flex-1 flex flex-col min-w-0 h-full relative overflow-hidden transition-colors ${
        isDark ? 'bg-slate-950' : 'bg-slate-50'
      }`}>
        {/* Top Toolbar */}
        <Toolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sortField={sortField}
          sortOrder={sortOrder}
          onSortChange={(field, order) => {
            setSortField(field);
            setSortOrder(order);
          }}
          onOpenImportDialog={() => setShowImportDialog(true)}
          onOpenFolderDialog={() => handleOpenCreateFolder(null)}
          onOpenStatsModal={() => setShowStatsModal(true)}
          onOpenBackupModal={() => setShowBackupModal(true)}
          onOpenDuplicateScanner={() => setShowDuplicateScannerModal(true)}
          currentFolderTitle={currentFolderTitle}
          totalVisibleCount={filteredProjects.length}
          onQuickImportFiles={handleQuickImport}
          onQuickImportFolder={handleQuickImport}
          user={user}
          accessToken={accessToken}
          onOpenGoogleSync={() => {
            setAutoPullOnOpenGoogleSync(false);
            setShowGoogleSyncModal(true);
          }}
          onPullFromDrive={() => {
            setAutoPullOnOpenGoogleSync(true);
            setShowGoogleSyncModal(true);
          }}
          activeProjectId={activeProjectId}
        />

        {/* View Component: Grid or List */}
        <div className="flex-1 flex overflow-hidden relative">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
              <p className="text-xs font-medium">Opening Scratch SB3 Library...</p>
            </div>
          ) : viewMode === 'grid' ? (
            <GridView
              projects={filteredProjects}
              folders={folders}
              selectedProjectIds={selectedProjectIds}
              activeProjectId={activeProjectId}
              onSelectProject={handleSelectProject}
              onOpenDetails={(p) => {
                setActiveProjectId(p.id);
                setShowDetailsPanel(true);
              }}
              onRunProject={handleRunProject}
              onToggleFavorite={handleToggleFavorite}
              onRenameProject={handleOpenRenameProject}
              onDeleteProject={handleDeleteProject}
              onMoveProject={handleMoveProject}
            />
          ) : (
            <ListView
              projects={filteredProjects}
              folders={folders}
              selectedProjectIds={selectedProjectIds}
              activeProjectId={activeProjectId}
              sortField={sortField}
              sortOrder={sortOrder}
              onSortChange={(f, o) => {
                setSortField(f);
                setSortOrder(o);
              }}
              onSelectProject={handleSelectProject}
              onOpenDetails={(p) => {
                setActiveProjectId(p.id);
                setShowDetailsPanel(true);
              }}
              onRunProject={handleRunProject}
              onToggleFavorite={handleToggleFavorite}
              onRenameProject={handleOpenRenameProject}
              onDeleteProject={handleDeleteProject}
              onSelectAll={handleSelectAll}
            />
          )}

          {/* Right Inspector Panel */}
          {showDetailsPanel && activeProject && (
            <ProjectDetails
              project={activeProject}
              folders={folders}
              availableTags={tags}
              onClose={() => setShowDetailsPanel(false)}
              onUpdateProject={handleUpdateProject}
              onRunProject={handleRunProject}
              onToggleFavorite={handleToggleFavorite}
              onSyncProjectToDrive={handleSyncProjectToDrive}
            />
          )}
        </div>

        {/* Floating Bulk Action Bar */}
        <BulkActionBar
          selectedCount={selectedProjectIds.length}
          totalCount={filteredProjects.length}
          folders={folders}
          availableTags={tags}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onBulkMove={handleBulkMove}
          onBulkAddTag={handleBulkAddTag}
          onBulkRemoveTag={handleBulkRemoveTag}
          onBulkFavorite={handleBulkFavorite}
          onBulkArchive={handleBulkArchive}
          onBulkDelete={handleBulkDelete}
          onBulkExport={handleBulkExport}
          onBulkSyncDrive={handleBulkSyncDrive}
        />

        {/* Status Bar Footer */}
        <footer className={`h-7 border-t px-4 flex items-center justify-between text-[11px] select-none shrink-0 transition-colors ${
          isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
        }`}>
          <div className="flex items-center gap-3">
            <span>
              {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'} displayed
            </span>
            {selectedProjectIds.length > 0 && (
              <span className="text-orange-400 font-medium">
                • {selectedProjectIds.length} selected
              </span>
            )}
            {selectedTags.length > 0 && (
              <span className="text-amber-400">
                • Filtered by {selectedTags.length} tags
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-slate-500 hidden sm:inline">
              Shortcuts: Space (Inspector) • Ctrl+A (Select All) • Esc (Deselect)
            </span>
            <span className="text-emerald-400 font-mono">Scratch 3.0 / TurboWarp Ready</span>
          </div>
        </footer>
      </main>

      {/* Modal Dialogs */}
      {playingProject && (
        <PlayerModal
          project={playingProject}
          onClose={() => setPlayingProject(null)}
          onProjectPlayed={(id) => {
            setProjects(prev =>
              prev.map(p => p.id === id ? { ...p, playCount: (p.playCount || 0) + 1, lastPlayed: Date.now() } : p)
            );
          }}
          onUpdateThumbnail={(id, newThumbnailUrl) => {
            setProjects(prev =>
              prev.map(p => {
                if (p.id === id) {
                  const updated = { ...p, thumbnailUrl: newThumbnailUrl, dateModified: Date.now() };
                  saveProject(updated);
                  return updated;
                }
                return p;
              })
            );
            showToast('Project thumbnail updated successfully!');
          }}
        />
      )}

      {showStatsModal && (
        <StatsModal
          isOpen={showStatsModal}
          onClose={() => setShowStatsModal(false)}
          projects={projects}
          folders={folders}
          tags={tags}
          onPlayProject={(p) => {
            setShowStatsModal(false);
            handleRunProject(p);
          }}
        />
      )}

      {showImportDialog && (
        <ImportDialog
          isOpen={showImportDialog}
          onClose={() => setShowImportDialog(false)}
          folders={folders}
          currentFolderId={currentFolderId}
          onImportComplete={async (newProjects, newBlobs, newFolders) => {
            if (newFolders && newFolders.length > 0) {
              await saveFoldersBulk(newFolders);
              setFolders(prev => [...prev, ...newFolders]);
            }
            await saveProjectsBulk(newProjects, newBlobs);
            setProjects(prev => [...prev, ...newProjects]);
            const folderNote = newFolders && newFolders.length > 0
              ? ` across ${newFolders.length} folder(s)`
              : '';
            showToast(`Imported ${newProjects.length} Scratch projects${folderNote}!`);
          }}
        />
      )}

      {showFolderDialog && (
        <FolderDialog
          isOpen={showFolderDialog}
          onClose={() => {
            setShowFolderDialog(false);
            setFolderToEdit(null);
          }}
          folderToEdit={folderToEdit}
          parentFolderId={parentFolderIdForNew}
          folders={folders}
          onSaveFolder={handleSaveFolder}
        />
      )}

      {showTagDialog && (
        <TagDialog
          isOpen={showTagDialog}
          onClose={() => setShowTagDialog(false)}
          onSaveTag={handleSaveTag}
        />
      )}

      {showRenameDialog && projectToRename && (
        <RenameDialog
          isOpen={showRenameDialog}
          onClose={() => {
            setShowRenameDialog(false);
            setProjectToRename(null);
          }}
          project={projectToRename}
          onConfirmRename={handleConfirmRename}
        />
      )}

      {showBackupModal && (
        <ExportBackupModal
          isOpen={showBackupModal}
          onClose={() => setShowBackupModal(false)}
          projects={projects}
          folders={folders}
          tags={tags}
          onRestoreBackup={handleRestoreBackup}
        />
      )}

      {showGoogleSyncModal && (
        <GoogleSyncModal
          isOpen={showGoogleSyncModal}
          onClose={() => {
            setShowGoogleSyncModal(false);
            setAutoPullOnOpenGoogleSync(false);
          }}
          user={user}
          accessToken={accessToken}
          onLogin={handleGoogleLogin}
          onLogout={handleGoogleLogout}
          localProjects={projects}
          onLocalProjectsUpdated={(updated) => setProjects(updated)}
          folders={folders}
          onFoldersUpdated={(updatedFolders) => setFolders(updatedFolders)}
          autoStartPull={autoPullOnOpenGoogleSync}
        />
      )}

      {showDuplicateScannerModal && (
        <DuplicateScannerModal
          isOpen={showDuplicateScannerModal}
          onClose={() => setShowDuplicateScannerModal(false)}
          projects={projects}
          folders={folders}
          onDeleteProjects={handleDeleteDuplicateProjects}
          onPlayProject={(p) => {
            setShowDuplicateScannerModal(false);
            handleRunProject(p);
          }}
        />
      )}
    </div>
  );
}
