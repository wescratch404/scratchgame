import React, { useState } from 'react';
import { Sb3Folder, Sb3Tag } from '../types/scratch';
import { useTheme } from '../context/ThemeContext';
import { openEditorInNewTab, openSb3ProjectInEditorTab } from '../services/editorService';
import {
  Folder,
  FolderOpen,
  FolderPlus,
  Star,
  Clock,
  Archive,
  Grid,
  ChevronRight,
  ChevronDown,
  Tag,
  Plus,
  Trash2,
  Edit2,
  HardDrive,
  Sun,
  Moon,
  Layers,
  Copy,
  ExternalLink
} from 'lucide-react';

interface SidebarProps {
  folders: Sb3Folder[];
  tags: Sb3Tag[];
  currentFolderId: string | 'all' | 'unfiled' | 'favorites' | 'recent' | 'archived';
  onSelectFolder: (id: string | 'all' | 'unfiled' | 'favorites' | 'recent' | 'archived') => void;
  selectedTags: string[];
  onToggleTag: (tagName: string) => void;
  onClearTags: () => void;
  onCreateFolder: (parentId: string | null) => void;
  onRenameFolder: (folder: Sb3Folder) => void;
  onDeleteFolder: (folderId: string) => void;
  onCreateTag: () => void;
  onDeleteTag: (tagId: string) => void;
  counts: {
    total: number;
    favorites: number;
    recent: number;
    archived: number;
    unfiled: number;
    byFolder: Record<string, number>;
    byTag: Record<string, number>;
  };
  storageUsedBytes: number;
  onMoveProjectToFolder?: (projectId: string, targetFolderId: string | null) => void;
  onOpenDuplicateScanner?: () => void;
  activeProjectId?: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  folders,
  tags,
  currentFolderId,
  onSelectFolder,
  selectedTags,
  onToggleTag,
  onClearTags,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onCreateTag,
  onDeleteTag,
  counts,
  storageUsedBytes,
  onMoveProjectToFolder,
  onOpenDuplicateScanner,
  activeProjectId,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    tutorials: true,
  });
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  const toggleExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  const handleDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(folderId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverFolderId(null);
  };

  const handleDrop = (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);

    try {
      const data = e.dataTransfer.getData('text/plain');
      if (data && onMoveProjectToFolder) {
        const payload = JSON.parse(data);
        if (payload.type === 'scratch-project' && payload.id) {
          onMoveProjectToFolder(payload.id, targetFolderId);
        } else if (payload.type === 'scratch-projects-bulk' && Array.isArray(payload.ids)) {
          for (const pid of payload.ids) {
            onMoveProjectToFolder(pid, targetFolderId);
          }
        }
      }
    } catch {
      // Ignore invalid drag payload
    }
  };

  const formatStorage = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isDark = theme === 'dark';

  // Render folder tree item
  const renderFolderItem = (folder: Sb3Folder, level = 0) => {
    const childFolders = folders.filter(f => f.parentId === folder.id);
    const hasChildren = childFolders.length > 0;
    const isExpanded = expandedFolders[folder.id];
    const isSelected = currentFolderId === folder.id;
    const isDragOver = dragOverFolderId === folder.id;
    const projectCount = counts.byFolder[folder.id] || 0;

    return (
      <div key={folder.id} className="select-none">
        <div
          onDragOver={(e) => handleDragOver(e, folder.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, folder.id)}
          onClick={() => onSelectFolder(folder.id)}
          style={{ paddingLeft: `${level * 14 + 10}px` }}
          className={`group flex items-center justify-between py-1.5 pr-2 rounded-lg text-xs font-medium cursor-pointer transition-colors relative ${
            isSelected
              ? isDark
                ? 'bg-orange-500/15 text-orange-400 font-semibold'
                : 'bg-orange-50 text-orange-600 font-semibold border border-orange-200'
              : isDark
                ? 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
          } ${isDragOver ? 'ring-2 ring-orange-500 bg-orange-500/20' : ''}`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {hasChildren ? (
              <button
                onClick={(e) => toggleExpand(folder.id, e)}
                className={`p-0.5 rounded ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-3.5" />
            )}

            {isExpanded ? (
              <FolderOpen className="w-4 h-4 shrink-0" style={{ color: folder.color || '#FFAB19' }} />
            ) : (
              <Folder className="w-4 h-4 shrink-0" style={{ color: folder.color || '#FFAB19' }} />
            )}

            <span className="truncate max-w-[130px]" title={folder.name}>
              {folder.name}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                isSelected
                  ? isDark ? 'bg-orange-500/30 text-orange-300' : 'bg-orange-100 text-orange-700 font-semibold'
                  : isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {projectCount}
            </span>

            {/* Folder Actions hover */}
            <div className="hidden group-hover:flex items-center gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateFolder(folder.id);
                }}
                title="Create subfolder"
                className={`p-1 rounded ${isDark ? 'hover:text-orange-400 text-slate-400' : 'hover:text-orange-600 text-slate-500'}`}
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRenameFolder(folder);
                }}
                title="Rename folder"
                className={`p-1 rounded ${isDark ? 'hover:text-orange-400 text-slate-400' : 'hover:text-orange-600 text-slate-500'}`}
              >
                <Edit2 className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFolder(folder.id);
                }}
                title="Delete folder"
                className={`p-1 rounded ${isDark ? 'hover:text-red-400 text-slate-400' : 'hover:text-red-600 text-slate-500'}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="space-y-0.5 mt-0.5">
            {childFolders.map(child => renderFolderItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootFolders = folders.filter(f => !f.parentId);

  return (
    <aside className={`w-64 h-full border-r flex flex-col shrink-0 select-none transition-colors ${
      isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
    }`}>
      {/* Brand Header & Dark/Light Theme Toggle */}
      <div className={`p-4 border-b flex items-center justify-between transition-colors ${
        isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50/80 border-slate-200'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-orange-500 via-amber-500 to-yellow-400 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <span className="text-slate-950 font-black text-sm">SB3</span>
          </div>
          <div>
            <h1 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Scratch SB3
            </h1>
            <p className={`text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Library Manager
            </p>
          </div>
        </div>

        {/* Theme Toggle Button (Replaces Demos) */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl border transition-all ${
            isDark
              ? 'text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 shadow-sm'
              : 'text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200 shadow-sm'
          }`}
        >
          {isDark ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-indigo-600" />
              <span>Dark</span>
            </>
          )}
        </button>
      </div>

      {/* Main Navigation Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-5 text-sm custom-scrollbar">
        {/* Core Collections */}
        <div className="space-y-1">
          <div className={`px-2 text-[10px] font-semibold uppercase tracking-wider mb-1 ${
            isDark ? 'text-slate-400' : 'text-slate-500'
          }`}>
            Collections
          </div>

          <button
            onClick={() => onSelectFolder('all')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentFolderId === 'all'
                ? isDark
                  ? 'bg-orange-500/15 text-orange-400 font-semibold'
                  : 'bg-orange-50 text-orange-600 font-semibold border border-orange-200'
                : isDark
                  ? 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Grid className="w-4 h-4 text-orange-400" />
              <span>All Projects</span>
            </div>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
              isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'
            }`}>
              {counts.total}
            </span>
          </button>

          <button
            onClick={() => onSelectFolder('favorites')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentFolderId === 'favorites'
                ? isDark
                  ? 'bg-orange-500/15 text-orange-400 font-semibold'
                  : 'bg-orange-50 text-orange-600 font-semibold border border-orange-200'
                : isDark
                  ? 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400/30" />
              <span>Favorites</span>
            </div>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
              isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'
            }`}>
              {counts.favorites}
            </span>
          </button>

          <button
            onClick={() => onSelectFolder('recent')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentFolderId === 'recent'
                ? isDark
                  ? 'bg-orange-500/15 text-orange-400 font-semibold'
                  : 'bg-orange-50 text-orange-600 font-semibold border border-orange-200'
                : isDark
                  ? 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>Recently Opened</span>
            </div>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
              isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'
            }`}>
              {counts.recent}
            </span>
          </button>

          <button
            onClick={() => onSelectFolder('unfiled')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentFolderId === 'unfiled'
                ? isDark
                  ? 'bg-orange-500/15 text-orange-400 font-semibold'
                  : 'bg-orange-50 text-orange-600 font-semibold border border-orange-200'
                : isDark
                  ? 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-400" />
              <span>Unfiled / Root</span>
            </div>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
              isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'
            }`}>
              {counts.unfiled}
            </span>
          </button>

          <button
            onClick={() => onSelectFolder('archived')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentFolderId === 'archived'
                ? isDark
                  ? 'bg-orange-500/15 text-orange-400 font-semibold'
                  : 'bg-orange-50 text-orange-600 font-semibold border border-orange-200'
                : isDark
                  ? 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-purple-400" />
              <span>Archived</span>
            </div>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
              isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'
            }`}>
              {counts.archived}
            </span>
          </button>
        </div>

        {/* Folders Section */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              Folders
            </span>
            <button
              onClick={() => onCreateFolder(null)}
              title="Create new top-level folder"
              className={`p-1 rounded transition-colors ${
                isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-0.5">
            {rootFolders.map(folder => renderFolderItem(folder, 0))}
          </div>
        </div>

        {/* Tags Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-2">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              Tags
            </span>
            <div className="flex items-center gap-1">
              {selectedTags.length > 0 && (
                <button
                  onClick={onClearTags}
                  className="text-[10px] text-orange-500 hover:underline font-semibold"
                >
                  Clear ({selectedTags.length})
                </button>
              )}
              <button
                onClick={onCreateTag}
                title="Create new custom tag"
                className={`p-1 rounded transition-colors ${
                  isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 px-1">
            {tags.map(tag => {
              const isSelected = selectedTags.includes(tag.name);
              const tagCount = counts.byTag[tag.name] || 0;
              return (
                <div
                  key={tag.id}
                  onClick={() => onToggleTag(tag.name)}
                  className={`group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-all border ${
                    isSelected
                      ? isDark
                        ? 'bg-orange-500/20 text-orange-300 border-orange-500/50 shadow-sm'
                        : 'bg-orange-100 text-orange-700 border-orange-300 font-semibold shadow-sm'
                      : isDark
                        ? 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-800 hover:text-white'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span>{tag.name}</span>
                  <span className="text-[10px] opacity-60 font-mono">({tagCount})</span>

                  {/* Delete custom tag */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteTag(tag.id);
                    }}
                    title="Delete tag"
                    className={`hidden group-hover:inline-block ml-0.5 ${
                      isDark ? 'text-slate-400 hover:text-red-400' : 'text-slate-500 hover:text-red-600'
                    }`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tools / Editor & Duplicate Trigger */}
      <div className={`px-3 py-2 border-t space-y-1.5 transition-colors ${
        isDark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-slate-50/50'
      }`}>
        <button
          onClick={() => {
            if (activeProjectId) {
              openSb3ProjectInEditorTab(activeProjectId);
            } else {
              openEditorInNewTab('https://turbowarp.org/editor');
            }
          }}
          title={activeProjectId ? 'Open selected project in SB3 Editor in new tab' : 'Open TurboWarp Web Editor in new tab'}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            isDark
              ? 'bg-slate-900 hover:bg-slate-850 text-blue-300 hover:text-blue-200 border-slate-800 hover:border-slate-750'
              : 'bg-white hover:bg-slate-50 text-blue-700 hover:text-blue-800 border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center gap-2">
            <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
            <span>Scratch Editor</span>
          </div>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
            isDark ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-50 text-blue-700'
          }`}>
            {activeProjectId ? 'Loaded ↗' : 'New Tab ↗'}
          </span>
        </button>

        {onOpenDuplicateScanner && (
          <button
            onClick={onOpenDuplicateScanner}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              isDark
                ? 'bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
                : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-200 shadow-xs'
            }`}
          >
            <div className="flex items-center gap-2">
              <Copy className="w-3.5 h-3.5 text-amber-500" />
              <span>Scan Duplicates</span>
            </div>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700'
            }`}>
              Clean Up
            </span>
          </button>
        )}
      </div>

      {/* Storage Indicator & Footer */}
      <div className={`p-3 border-t transition-colors ${
        isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50/80'
      }`}>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className={`flex items-center gap-1.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <HardDrive className="w-3.5 h-3.5" />
            Storage Used
          </span>
          <span className={`font-mono font-semibold ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
            {formatStorage(storageUsedBytes)}
          </span>
        </div>
        <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
          <div
            className="bg-orange-500 h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, Math.max(3, (storageUsedBytes / (50 * 1024 * 1024)) * 100))}%` }}
          />
        </div>
        <div className={`flex items-center justify-between mt-1 text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          <span>{counts.total} SB3 Files</span>
          <span>IndexedDB Local Storage</span>
        </div>
      </div>
    </aside>
  );
};
