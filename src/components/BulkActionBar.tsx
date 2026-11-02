import React, { useState } from 'react';
import { Sb3Folder, Sb3Tag } from '../types/scratch';
import { useTheme } from '../context/ThemeContext';
import {
  FolderInput,
  Tag as TagIcon,
  Trash2,
  Download,
  Archive,
  Star,
  X,
  CheckSquare,
  Plus,
  CloudUpload
} from 'lucide-react';

interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  folders: Sb3Folder[];
  availableTags: Sb3Tag[];
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkMove: (targetFolderId: string | null) => void;
  onBulkAddTag: (tagName: string) => void;
  onBulkRemoveTag: (tagName: string) => void;
  onBulkFavorite: (isFavorite: boolean) => void;
  onBulkArchive: () => void;
  onBulkDelete: () => void;
  onBulkExport: () => void;
  onBulkSyncDrive?: () => void;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  totalCount,
  folders,
  availableTags,
  onSelectAll,
  onDeselectAll,
  onBulkMove,
  onBulkAddTag,
  onBulkRemoveTag,
  onBulkFavorite,
  onBulkArchive,
  onBulkDelete,
  onBulkExport,
  onBulkSyncDrive,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [customTagInput, setCustomTagInput] = useState('');

  if (selectedCount === 0) return null;

  const btnClass = isDark
    ? 'flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors border border-slate-700/60'
    : 'flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors border border-slate-200';

  return (
    <div className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40 backdrop-blur-md rounded-2xl shadow-2xl px-4 py-2.5 flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-200 text-xs border ${
      isDark ? 'bg-slate-900/95 border-slate-700/80 text-white' : 'bg-white/95 border-slate-200 text-slate-800 shadow-xl'
    }`}>
      {/* Count & Select All */}
      <div className={`flex items-center gap-2 pr-3 border-r ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
        <span className="font-semibold bg-orange-500/20 text-orange-500 px-2 py-0.5 rounded-full border border-orange-500/30">
          {selectedCount} Selected
        </span>
        <button
          onClick={selectedCount === totalCount ? onDeselectAll : onSelectAll}
          className={isDark ? 'text-slate-400 hover:text-white transition-colors' : 'text-slate-500 hover:text-slate-900 transition-colors'}
        >
          {selectedCount === totalCount ? 'Clear' : 'Select All'}
        </button>
      </div>

      {/* Move to Folder */}
      <div className="relative">
        <button
          onClick={() => {
            setShowFolderMenu(!showFolderMenu);
            setShowTagMenu(false);
          }}
          className={btnClass}
        >
          <FolderInput className="w-3.5 h-3.5 text-amber-500" />
          <span>Move</span>
        </button>

        {showFolderMenu && (
          <div className={`absolute bottom-full mb-2 left-0 w-48 border rounded-xl shadow-2xl py-1 text-xs z-50 ${
            isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200 shadow-xl'
          }`}>
            <div className={`px-3 py-1 text-[10px] uppercase font-semibold tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Select Destination
            </div>
            <button
              onClick={() => {
                onBulkMove(null);
                setShowFolderMenu(false);
              }}
              className={`w-full text-left px-3 py-1.5 ${isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-700'}`}
            >
              Unfiled (Root)
            </button>
            {folders.map(f => (
              <button
                key={f.id}
                onClick={() => {
                  onBulkMove(f.id);
                  setShowFolderMenu(false);
                }}
                className={`w-full text-left px-3 py-1.5 truncate ${isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-700'}`}
              >
                📁 {f.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tags Menu */}
      <div className="relative">
        <button
          onClick={() => {
            setShowTagMenu(!showTagMenu);
            setShowFolderMenu(false);
          }}
          className={btnClass}
        >
          <TagIcon className="w-3.5 h-3.5 text-orange-500" />
          <span>Tags</span>
        </button>

        {showTagMenu && (
          <div className={`absolute bottom-full mb-2 left-0 w-56 border rounded-xl shadow-2xl p-2 text-xs z-50 space-y-2 ${
            isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200 shadow-xl'
          }`}>
            <div className={`text-[10px] uppercase font-semibold tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Quick Add Tag
            </div>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
              {availableTags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => {
                    onBulkAddTag(tag.name);
                    setShowTagMenu(false);
                  }}
                  className={`px-2 py-0.5 rounded-full text-[11px] border ${
                    isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  }`}
                >
                  +{tag.name}
                </button>
              ))}
            </div>

            <div className={`flex gap-1 pt-1 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <input
                type="text"
                placeholder="Custom tag..."
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customTagInput) {
                    onBulkAddTag(customTagInput);
                    setCustomTagInput('');
                    setShowTagMenu(false);
                  }
                }}
                className={`flex-1 border rounded px-2 py-1 text-[11px] ${
                  isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                }`}
              />
              <button
                onClick={() => {
                  if (customTagInput) {
                    onBulkAddTag(customTagInput);
                    setCustomTagInput('');
                    setShowTagMenu(false);
                  }
                }}
                className="px-2 bg-orange-500 hover:bg-orange-600 rounded text-white"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Star / Favorite */}
      <button
        onClick={() => onBulkFavorite(true)}
        title="Star selected"
        className={btnClass}
      >
        <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
        <span className="hidden sm:inline">Star</span>
      </button>

      {/* Export as ZIP */}
      <button
        onClick={onBulkExport}
        title="Download selected SB3 projects as ZIP archive"
        className={btnClass}
      >
        <Download className="w-3.5 h-3.5 text-blue-500" />
        <span className="hidden sm:inline">Export ZIP</span>
      </button>

      {/* Sync to Google Drive */}
      {onBulkSyncDrive && (
        <button
          onClick={onBulkSyncDrive}
          title="Sync selected projects to Google Drive"
          className={isDark
            ? 'flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-950/60 hover:bg-blue-900/60 text-blue-300 rounded-lg transition-colors border border-blue-700/50'
            : 'flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors border border-blue-200'}
        >
          <CloudUpload className="w-3.5 h-3.5 text-blue-500" />
          <span className="hidden sm:inline">Sync Drive</span>
        </button>
      )}

      {/* Archive */}
      <button
        onClick={onBulkArchive}
        title="Archive selected"
        className={btnClass}
      >
        <Archive className="w-3.5 h-3.5 text-purple-500" />
        <span className="hidden sm:inline">Archive</span>
      </button>

      {/* Delete */}
      <button
        onClick={onBulkDelete}
        title="Delete selected projects"
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors border border-red-500/30"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span>Delete</span>
      </button>

      {/* Close / Deselect */}
      <button
        onClick={onDeselectAll}
        className={`p-1 rounded-lg transition-colors ml-1 ${isDark ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-800'}`}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

