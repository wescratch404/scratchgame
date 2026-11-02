import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sb3Project, Sb3Folder } from '../types/scratch';
import { useTheme } from '../context/ThemeContext';
import {
  scanForDuplicates,
  DuplicateGroup,
  DuplicateMatchMode,
  ScanProgress
} from '../services/duplicateScanner';
import {
  Copy,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  X,
  Play,
  RotateCw,
  HardDrive,
  Check,
  FolderInput,
  Calendar,
  Layers,
  ArrowRight,
  Info,
  Clock,
  Sparkles,
  FileCode2,
  ShieldAlert,
  HelpCircle
} from 'lucide-react';

interface DuplicateScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Sb3Project[];
  folders: Sb3Folder[];
  onDeleteProjects: (ids: string[]) => Promise<void>;
  onPlayProject?: (project: Sb3Project) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export const DuplicateScannerModal: React.FC<DuplicateScannerModalProps> = ({
  isOpen,
  onClose,
  projects,
  folders,
  onDeleteProjects,
  onPlayProject,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [mode, setMode] = useState<DuplicateMatchMode>('exact-hash');
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [hasScanned, setHasScanned] = useState(false);

  // User Confirmation Modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletedSummary, setDeletedSummary] = useState<{ count: number; bytes: number } | null>(null);

  const getFolderName = useCallback((folderId: string | null) => {
    if (!folderId) return 'Unfiled';
    const f = folders.find(folder => folder.id === folderId);
    return f ? f.name : 'Folder';
  }, [folders]);

  // Run scan
  const handleStartScan = useCallback(async (selectedMode: DuplicateMatchMode = mode) => {
    setIsScanning(true);
    setProgress({ scanned: 0, total: projects.length, currentTitle: 'Preparing...' });
    setDeletedSummary(null);

    try {
      const results = await scanForDuplicates(projects, selectedMode, (p) => {
        setProgress(p);
      });
      setDuplicateGroups(results);
      setHasScanned(true);
    } catch (err) {
      console.error('Scan failed:', err);
    } finally {
      setIsScanning(false);
      setProgress(null);
    }
  }, [mode, projects]);

  // Auto-scan when modal opens
  useEffect(() => {
    if (isOpen && !hasScanned && projects.length > 0) {
      handleStartScan();
    }
  }, [isOpen, hasScanned, projects.length, handleStartScan]);

  // Calculate selected files for deletion
  const selectedItems = useMemo(() => {
    const list: { group: DuplicateGroup; project: Sb3Project }[] = [];
    for (const group of duplicateGroups) {
      for (const item of group.items) {
        if (item.selectedForDeletion) {
          list.push({ group, project: item.project });
        }
      }
    }
    return list;
  }, [duplicateGroups]);

  const selectedCount = selectedItems.length;
  const totalReclaimedBytes = useMemo(() => {
    return selectedItems.reduce((acc, curr) => acc + curr.project.fileSize, 0);
  }, [selectedItems]);

  // Toggle selection for a specific project
  const handleToggleItemSelection = (groupId: string, projectId: string) => {
    setDuplicateGroups(prev =>
      prev.map(group => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          items: group.items.map(item => {
            if (item.project.id !== projectId) return item;
            return {
              ...item,
              selectedForDeletion: !item.selectedForDeletion,
            };
          }),
        };
      })
    );
  };

  // Set an item as the designated original in a group
  const handleSetOriginal = (groupId: string, projectId: string) => {
    setDuplicateGroups(prev =>
      prev.map(group => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          items: group.items.map(item => ({
            ...item,
            isOriginal: item.project.id === projectId,
            selectedForDeletion: item.project.id !== projectId,
          })),
        };
      })
    );
  };

  // Smart selection presets
  const handleApplyPreset = (preset: 'oldest' | 'newest' | 'played' | 'all' | 'none') => {
    setDuplicateGroups(prev =>
      prev.map(group => {
        if (preset === 'all') {
          return {
            ...group,
            items: group.items.map(item => ({
              ...item,
              selectedForDeletion: !item.isOriginal,
            })),
          };
        }
        if (preset === 'none') {
          return {
            ...group,
            items: group.items.map(item => ({
              ...item,
              selectedForDeletion: false,
            })),
          };
        }

        // Determine new original based on preset criteria
        let sorted = [...group.items];
        if (preset === 'oldest') {
          sorted.sort((a, b) => a.project.dateAdded - b.project.dateAdded);
        } else if (preset === 'newest') {
          sorted.sort((a, b) => b.project.dateModified - a.project.dateModified);
        } else if (preset === 'played') {
          sorted.sort((a, b) => (b.project.playCount || 0) - (a.project.playCount || 0));
        }

        const primaryId = sorted[0].project.id;

        return {
          ...group,
          items: group.items.map(item => ({
            ...item,
            isOriginal: item.project.id === primaryId,
            selectedForDeletion: item.project.id !== primaryId,
          })),
        };
      })
    );
  };

  // Execute deletion ONLY after user confirmation
  const handleConfirmDelete = async () => {
    if (selectedItems.length === 0) return;
    setIsDeleting(true);

    const idsToDelete = selectedItems.map(item => item.project.id);
    const count = idsToDelete.length;
    const bytes = totalReclaimedBytes;

    try {
      await onDeleteProjects(idsToDelete);

      // Remove deleted items from groups
      setDuplicateGroups(prev => {
        return prev
          .map(group => ({
            ...group,
            items: group.items.filter(item => !idsToDelete.includes(item.project.id)),
          }))
          .filter(group => group.items.length >= 2);
      });

      setDeletedSummary({ count, bytes });
      setShowConfirmModal(false);
    } catch (err) {
      console.error('Failed to delete duplicate projects:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-colors ${
        isDark ? 'bg-slate-900 border-slate-700/80 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${
          isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50/80'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center shadow-inner">
              <Copy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">Duplicate Files Scanner</h2>
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                  isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  {projects.length} Total Projects
                </span>
              </div>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Detect identical Scratch SB3 files, compare versions, and safely clean up storage.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-colors ${
              isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-900'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter & Scan Toolbar */}
        <div className={`px-6 py-3 border-b flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 ${
          isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-2">
            <span className={`font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Matching Mode:
            </span>
            <div className={`flex rounded-xl p-0.5 border ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <button
                onClick={() => {
                  setMode('exact-hash');
                  handleStartScan('exact-hash');
                }}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  mode === 'exact-hash'
                    ? 'bg-amber-500 text-slate-950 shadow-sm font-semibold'
                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Byte-for-byte SHA-256 hash match (100% identical files)"
              >
                Exact Hash (SHA-256)
              </button>
              <button
                onClick={() => {
                  setMode('name-and-size');
                  handleStartScan('name-and-size');
                }}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  mode === 'name-and-size'
                    ? 'bg-amber-500 text-slate-950 shadow-sm font-semibold'
                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Matching file name and identical byte size"
              >
                Name & Size
              </button>
              <button
                onClick={() => {
                  setMode('structure-and-stats');
                  handleStartScan('structure-and-stats');
                }}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  mode === 'structure-and-stats'
                    ? 'bg-amber-500 text-slate-950 shadow-sm font-semibold'
                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Identical block and sprite counts"
              >
                Code Structure
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleStartScan()}
              disabled={isScanning}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-semibold transition-all ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700 hover:border-slate-600'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm'
              }`}
            >
              <RotateCw className={`w-3.5 h-3.5 text-amber-500 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Scanning...' : 'Re-scan'}</span>
            </button>
          </div>
        </div>

        {/* Success Alert if files were deleted */}
        {deletedSummary && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-between text-xs animate-in fade-in">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Successfully deleted {deletedSummary.count} duplicate file(s) and freed {formatBytes(deletedSummary.bytes)} of storage!
              </span>
            </div>
            <button
              onClick={() => setDeletedSummary(null)}
              className="p-1 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {/* Scanning Progress */}
          {isScanning && (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-500 animate-pulse">
                <RotateCw className="w-8 h-8 animate-spin" />
              </div>
              <h3 className="text-base font-bold mb-1">Scanning Your SB3 Library...</h3>
              <p className={`text-xs max-w-sm mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {progress ? `Comparing hashes for "${progress.currentTitle}"` : 'Analyzing project files...'}
              </p>

              {progress && (
                <div className="w-64 space-y-2">
                  <div className={`w-full h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                    <div
                      className="bg-amber-500 h-full rounded-full transition-all duration-150"
                      style={{ width: `${Math.round((progress.scanned / Math.max(1, progress.total)) * 100)}%` }}
                    />
                  </div>
                  <div className={`flex justify-between text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <span>{progress.scanned} of {progress.total}</span>
                    <span>{Math.round((progress.scanned / Math.max(1, progress.total)) * 100)}%</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No Duplicates Found */}
          {!isScanning && hasScanned && duplicateGroups.length === 0 && (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4 text-emerald-400 shadow-lg">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold mb-1 text-emerald-400">No Duplicates Found!</h3>
              <p className={`text-xs max-w-md ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Your Scratch library is clean and well-organized. No redundant projects matched the "{mode}" criteria.
              </p>
              <div className="mt-6 flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-md transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Duplicates Found List */}
          {!isScanning && duplicateGroups.length > 0 && (
            <div className="space-y-6">
              {/* Summary & Preset Controls */}
              <div className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <span className="text-amber-500 font-extrabold">{duplicateGroups.length}</span> Duplicate Group{duplicateGroups.length === 1 ? '' : 's'} Found
                    <span className={`text-xs font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      ({duplicateGroups.reduce((acc, g) => acc + g.items.length, 0)} total files)
                    </span>
                  </div>
                  <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Select which copies to delete. The original (unselected) project will be preserved.
                  </p>
                </div>

                {/* Preset Buttons */}
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  <span className={`text-[11px] font-semibold mr-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Keep:
                  </span>
                  <button
                    onClick={() => handleApplyPreset('oldest')}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                      isDark ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200' : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                    title="Keep oldest created file, mark newer duplicates for deletion"
                  >
                    Oldest Added
                  </button>
                  <button
                    onClick={() => handleApplyPreset('newest')}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                      isDark ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200' : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                    title="Keep newest modified file, mark older copies for deletion"
                  >
                    Newest Modified
                  </button>
                  <button
                    onClick={() => handleApplyPreset('played')}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                      isDark ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200' : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                    title="Keep most played file"
                  >
                    Most Played
                  </button>
                  <button
                    onClick={() => handleApplyPreset('all')}
                    className="px-2 py-1 rounded-lg border text-[11px] font-semibold text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/30 transition-colors"
                  >
                    Select All Duplicates
                  </button>
                  <button
                    onClick={() => handleApplyPreset('none')}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                      isDark ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400' : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-500'
                    }`}
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Group Cards */}
              <div className="space-y-4">
                {duplicateGroups.map((group, groupIndex) => {
                  const markedInGroup = group.items.filter(i => i.selectedForDeletion).length;
                  const groupSpaceSaving = markedInGroup * group.fileSize;

                  return (
                    <div
                      key={group.id}
                      className={`rounded-xl border overflow-hidden transition-all ${
                        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                      }`}
                    >
                      {/* Group Header */}
                      <div className={`px-4 py-2.5 border-b flex items-center justify-between text-xs ${
                        isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                      }`}>
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-500 font-bold text-[10px] flex items-center justify-center">
                            {groupIndex + 1}
                          </span>
                          <span className="font-semibold text-xs">
                            {group.reason}
                          </span>
                          <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                            isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {formatBytes(group.fileSize)} each
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-[11px]">
                          <span className={`font-medium ${
                            markedInGroup > 0 ? 'text-red-400' : isDark ? 'text-slate-400' : 'text-slate-500'
                          }`}>
                            {markedInGroup} of {group.items.length} marked for deletion
                          </span>
                          {groupSpaceSaving > 0 && (
                            <span className="text-emerald-400 font-mono">
                              (saves {formatBytes(groupSpaceSaving)})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Items in this duplicate group */}
                      <div className="divide-y divide-slate-800">
                        {group.items.map((item) => {
                          const p = item.project;

                          return (
                            <div
                              key={p.id}
                              className={`p-3 flex items-center justify-between gap-3 text-xs transition-colors ${
                                item.selectedForDeletion
                                  ? isDark ? 'bg-red-950/15' : 'bg-red-50/50'
                                  : item.isOriginal
                                  ? isDark ? 'bg-emerald-950/15' : 'bg-emerald-50/40'
                                  : ''
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                {/* Checkbox for deletion */}
                                <input
                                  type="checkbox"
                                  checked={item.selectedForDeletion}
                                  onChange={() => handleToggleItemSelection(group.id, p.id)}
                                  className="w-4 h-4 rounded text-red-500 focus:ring-red-400 focus:ring-offset-0 bg-slate-800 border-slate-700 cursor-pointer shrink-0"
                                  title={item.selectedForDeletion ? 'Uncheck to keep file' : 'Check to mark for deletion'}
                                />

                                {/* Project Thumbnail */}
                                <div className="w-12 h-9 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden shrink-0 relative">
                                  <img
                                    src={p.thumbnailUrl}
                                    alt={p.title}
                                    className="w-full h-full object-cover"
                                  />
                                </div>

                                {/* Project Info */}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className={`font-semibold truncate max-w-md ${
                                      item.selectedForDeletion
                                        ? isDark ? 'text-slate-400 line-through' : 'text-slate-500 line-through'
                                        : isDark ? 'text-white' : 'text-slate-900'
                                    }`}>
                                      {p.title}
                                    </h4>

                                    {item.isOriginal && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                        <Check className="w-3 h-3" />
                                        ORIGINAL (KEEP)
                                      </span>
                                    )}

                                    {item.selectedForDeletion && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                                        <Trash2 className="w-3 h-3" />
                                        DELETE
                                      </span>
                                    )}
                                  </div>

                                  <div className={`flex items-center gap-3 mt-1 text-[11px] flex-wrap ${
                                    isDark ? 'text-slate-400' : 'text-slate-500'
                                  }`}>
                                    <span className="font-mono truncate max-w-[180px]">
                                      {p.fileName}
                                    </span>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                      <FolderInput className="w-3 h-3 text-amber-500" />
                                      {getFolderName(p.folderId)}
                                    </span>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      Added {formatDate(p.dateAdded)}
                                    </span>
                                    {p.playCount > 0 && (
                                      <>
                                        <span>•</span>
                                        <span className="text-cyan-400 font-medium">
                                          Played {p.playCount}x
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Action controls */}
                              <div className="flex items-center gap-2 shrink-0">
                                {onPlayProject && (
                                  <button
                                    onClick={() => onPlayProject(p)}
                                    title="Play and preview project in TurboWarp player"
                                    className={`p-1.5 rounded-lg border transition-colors ${
                                      isDark
                                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                                    }`}
                                  >
                                    <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
                                  </button>
                                )}

                                {!item.isOriginal && (
                                  <button
                                    onClick={() => handleSetOriginal(group.id, p.id)}
                                    title="Make this file the designated original to keep"
                                    className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                                      isDark
                                        ? 'bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border-slate-700'
                                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                                    }`}
                                  >
                                    Set as Original
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer with Delete Trigger */}
        <div className={`px-6 py-4 border-t flex items-center justify-between gap-4 shrink-0 ${
          isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-slate-50/90'
        }`}>
          <div className="flex items-center gap-2 text-xs">
            {selectedCount > 0 ? (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-red-400 flex items-center gap-1.5">
                  <Trash2 className="w-4 h-4" />
                  {selectedCount} duplicate file{selectedCount === 1 ? '' : 's'} selected
                </span>
                <span className={`font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  • Reclaims {formatBytes(totalReclaimedBytes)}
                </span>
              </div>
            ) : (
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                No duplicate files selected for deletion.
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              Cancel
            </button>

            <button
              onClick={() => setShowConfirmModal(true)}
              disabled={selectedCount === 0 || isScanning}
              className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg transition-all ${
                selectedCount > 0 && !isScanning
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20 cursor-pointer active:scale-95'
                  : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-60'
              }`}
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Selected Duplicates ({selectedCount})</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* EXPLICIT CONFIRMATION DIALOG BEFORE DELETING DUPLICATE FILES              */}
      {/* ========================================================================= */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 ${
            isDark ? 'bg-slate-900 border-red-500/40 text-slate-100' : 'bg-white border-red-300 text-slate-900'
          }`}>
            {/* Header */}
            <div className={`px-6 py-4 border-b flex items-start gap-3.5 ${
              isDark ? 'border-slate-800 bg-red-950/20' : 'border-slate-200 bg-red-50/50'
            }`}>
              <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 text-red-500 flex items-center justify-center shrink-0 shadow-inner">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-red-500">
                  Confirm Deletion of Duplicate Files
                </h3>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Please review the items to be permanently deleted before proceeding.
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-xs">
              {/* Highlight summary card */}
              <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Files to Delete
                  </div>
                  <div className="text-lg font-bold text-red-400 mt-0.5">
                    {selectedCount} Project{selectedCount === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Storage Recovered
                  </div>
                  <div className="text-lg font-mono font-bold text-emerald-400 mt-0.5">
                    {formatBytes(totalReclaimedBytes)}
                  </div>
                </div>
              </div>

              {/* Warning Notice */}
              <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                isDark ? 'bg-amber-950/20 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong>Warning:</strong> Deleting these duplicate files will permanently remove their records and .sb3 project archives from IndexedDB storage. Original versions of these projects will be preserved.
                </div>
              </div>

              {/* List of files to be deleted */}
              <div>
                <div className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  Selected for Permanent Deletion ({selectedCount}):
                </div>
                <div className={`max-h-44 overflow-y-auto rounded-xl border divide-y custom-scrollbar ${
                  isDark ? 'bg-slate-950 border-slate-800 divide-slate-800/60' : 'bg-slate-50 border-slate-200 divide-slate-200'
                }`}>
                  {selectedItems.map(({ project }) => (
                    <div key={project.id} className="p-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={project.thumbnailUrl}
                          alt=""
                          className="w-7 h-6 rounded object-cover border border-slate-700 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold truncate max-w-[260px] text-slate-200">
                            {project.title}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate">
                            {project.fileName} • {getFolderName(project.folderId)}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-semibold text-red-400 shrink-0">
                        {formatBytes(project.fileSize)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className={`px-6 py-4 border-t flex items-center justify-end gap-3 ${
              isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50'
            }`}>
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isDeleting}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                Cancel & Review
              </button>

              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 flex items-center gap-2 transition-all active:scale-95"
              >
                {isDeleting ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting Files...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Permanently Delete {selectedCount} Duplicate{selectedCount === 1 ? '' : 's'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
