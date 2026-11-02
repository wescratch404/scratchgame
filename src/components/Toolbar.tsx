import React from 'react';
import { User } from 'firebase/auth';
import { ViewMode, SortField, SortOrder } from '../types/scratch';
import { useTheme } from '../context/ThemeContext';
import { openEditorInNewTab, openSb3ProjectInEditorTab } from '../services/editorService';
import {
  Search,
  LayoutGrid,
  List,
  Upload,
  FolderPlus,
  BarChart3,
  ArrowUpDown,
  Download,
  X,
  FilePlus,
  FolderUp,
  Cloud,
  CloudDownload,
  Copy,
  ExternalLink
} from 'lucide-react';

interface ToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortField: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField, order: SortOrder) => void;
  onOpenImportDialog: () => void;
  onOpenFolderDialog: () => void;
  onOpenStatsModal: () => void;
  onOpenBackupModal: () => void;
  onOpenDuplicateScanner: () => void;
  currentFolderTitle: string;
  totalVisibleCount: number;
  onQuickImportFiles: (files: FileList | null) => void;
  onQuickImportFolder: (files: FileList | null) => void;
  user: User | null;
  accessToken?: string | null;
  onOpenGoogleSync: () => void;
  onPullFromDrive?: () => void;
  activeProjectId?: string | null;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sortField,
  sortOrder,
  onSortChange,
  onOpenImportDialog,
  onOpenFolderDialog,
  onOpenStatsModal,
  onOpenBackupModal,
  onOpenDuplicateScanner,
  currentFolderTitle,
  totalVisibleCount,
  onQuickImportFiles,
  onQuickImportFolder,
  user,
  accessToken,
  onOpenGoogleSync,
  onPullFromDrive,
  activeProjectId,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const folderInputRef = React.useRef<HTMLInputElement>(null);

  const sortOptions: { label: string; field: SortField; order: SortOrder }[] = [
    { label: 'Name (A to Z)', field: 'title', order: 'asc' },
    { label: 'Name (Z to A)', field: 'title', order: 'desc' },
    { label: 'Size (Largest)', field: 'fileSize', order: 'desc' },
    { label: 'Size (Smallest)', field: 'fileSize', order: 'asc' },
    { label: 'Recently Modified', field: 'dateModified', order: 'desc' },
    { label: 'Recently Added', field: 'dateAdded', order: 'desc' },
    { label: 'Most Played', field: 'playCount', order: 'desc' },
  ];

  const currentSortKey = `${sortField}_${sortOrder}`;

  const handleSortSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const matched = sortOptions.find(opt => `${opt.field}_${opt.order}` === val);
    if (matched) {
      onSortChange(matched.field, matched.order);
    }
  };

  return (
    <header className={`h-14 border-b px-4 flex items-center justify-between gap-3 shrink-0 backdrop-blur-md z-10 transition-colors ${
      isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white/95 border-slate-200 shadow-sm'
    }`}>
      {/* Hidden File / Folder Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".sb3"
        multiple
        className="hidden"
        onChange={(e) => onQuickImportFiles(e.target.files)}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={(e) => onQuickImportFolder(e.target.files)}
      />

      {/* Left side: Current View Breadcrumb / Folder Title */}
      <div className="flex items-center gap-2 min-w-0">
        <h2 className={`text-sm font-semibold truncate flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
          <span>{currentFolderTitle}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-normal ${
            isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'
          }`}>
            {totalVisibleCount}
          </span>
        </h2>
      </div>

      {/* Center: Global Search Bar */}
      <div className="flex-1 max-w-md relative">
        <div className="relative flex items-center">
          <Search className={`w-4 h-4 absolute left-3 pointer-events-none ${isDark ? 'text-slate-400' : 'text-slate-400'}`} />
          <input
            type="text"
            placeholder="Search by title, filename, tags, sprites, or notes..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className={`w-full border rounded-xl pl-9 pr-8 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all ${
              isDark
                ? 'bg-slate-950/80 border-slate-700/80 text-slate-100 placeholder-slate-500'
                : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
            }`}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className={`absolute right-2.5 ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Right side: Actions, Sort, View Modes */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Sort Dropdown */}
        <div className="relative flex items-center">
          <ArrowUpDown className={`w-3.5 h-3.5 absolute left-2.5 pointer-events-none ${isDark ? 'text-slate-400' : 'text-slate-400'}`} />
          <select
            value={currentSortKey}
            onChange={handleSortSelect}
            className={`border text-xs rounded-lg pl-8 pr-3 py-1.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-500 ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-200'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
            }`}
          >
            {sortOptions.map((opt) => (
              <option key={`${opt.field}_${opt.order}`} value={`${opt.field}_${opt.order}`}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* View Toggle (Grid / List) */}
        <div className={`flex items-center border rounded-lg p-0.5 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-300'}`}>
          <button
            onClick={() => onViewModeChange('grid')}
            title="Grid View"
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'grid'
                ? 'bg-orange-500 text-white shadow-sm'
                : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            title="List View"
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'list'
                ? 'bg-orange-500 text-white shadow-sm'
                : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        <div className={`h-5 w-[1px] mx-0.5 ${isDark ? 'bg-slate-800' : 'bg-slate-300'}`} />

        {/* New Folder */}
        <button
          onClick={onOpenFolderDialog}
          title="Create New Folder"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 border text-xs font-medium rounded-lg transition-colors ${
            isDark
              ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
          }`}
        >
          <FolderPlus className="w-3.5 h-3.5 text-orange-500" />
          <span className="hidden sm:inline">New Folder</span>
        </button>

        {/* Import Dropdown / Button */}
        <div className="relative group">
          <button
            onClick={onOpenImportDialog}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-xs font-semibold rounded-lg shadow-sm shadow-orange-500/20 transition-all"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import SB3</span>
          </button>

          {/* Quick flyout options */}
          <div className={`absolute right-0 top-full mt-1.5 w-48 border rounded-xl shadow-xl py-1 hidden group-hover:block z-30 ${
            isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200 shadow-xl'
          }`}>
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 ${
                isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <FilePlus className="w-3.5 h-3.5 text-orange-500" />
              <span>Import .sb3 Files</span>
            </button>
            <button
              onClick={() => folderInputRef.current?.click()}
              className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 ${
                isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <FolderUp className="w-3.5 h-3.5 text-blue-500" />
              <span>Import Folder (.sb3)</span>
            </button>
          </div>
        </div>

        {/* Stats & Backup buttons */}
        <button
          onClick={onOpenStatsModal}
          title="Library Statistics Dashboard"
          className={`p-2 border border-transparent rounded-lg transition-colors ${
            isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800 hover:border-slate-700' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 hover:border-slate-200'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenBackupModal}
          title="Export, Backup & Restore"
          className={`p-2 border border-transparent rounded-lg transition-colors ${
            isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800 hover:border-slate-700' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 hover:border-slate-200'
          }`}
        >
          <Download className="w-4 h-4" />
        </button>

        {/* Duplicate Scanner Button */}
        <button
          onClick={onOpenDuplicateScanner}
          title="Scan and Remove Duplicate SB3 Files"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
            isDark
              ? 'text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30'
              : 'text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-200 shadow-sm'
          }`}
        >
          <Copy className="w-3.5 h-3.5 text-amber-500" />
          <span className="hidden lg:inline">Duplicates</span>
        </button>

        {/* Open SB3 Editor in New Tab Button */}
        <button
          onClick={() => {
            if (activeProjectId) {
              openSb3ProjectInEditorTab(activeProjectId);
            } else {
              openEditorInNewTab('https://turbowarp.org/editor');
            }
          }}
          title={activeProjectId ? 'Open current selected project in SB3 Editor in new tab' : 'Open TurboWarp Scratch Editor in new tab'}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
            isDark
              ? 'text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30'
              : 'text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border-blue-200 shadow-sm'
          }`}
        >
          <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden md:inline">Open Editor</span>
        </button>

        <div className={`h-5 w-[1px] mx-0.5 ${isDark ? 'bg-slate-800' : 'bg-slate-300'}`} />

        {/* Quick Pull from Google Drive */}
        {user && onPullFromDrive && (
          <button
            onClick={onPullFromDrive}
            title="Pull and mirror exact folder structure and files from Google Drive"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              isDark
                ? 'text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30'
                : 'text-cyan-700 hover:text-cyan-800 bg-cyan-50 hover:bg-cyan-100 border-cyan-200 shadow-sm'
            }`}
          >
            <CloudDownload className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden xl:inline">Pull Drive</span>
          </button>
        )}

        {/* Google Drive / Gmail Login Button */}
        {user ? (
          <button
            onClick={onOpenGoogleSync}
            title={accessToken ? `Connected as ${user.email} • Google Drive Active` : `Signed in as ${user.email} • Click to connect Google Drive`}
            className={`flex items-center gap-2 pl-1.5 pr-2.5 py-1 border rounded-xl transition-all text-xs ${
              isDark ? 'bg-slate-800 hover:bg-slate-750 border-slate-700/80' : 'bg-slate-100 hover:bg-slate-200 border-slate-300'
            }`}
          >
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                className="w-5 h-5 rounded-full border border-orange-500/50 object-cover"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-blue-600 font-bold text-[10px] text-white flex items-center justify-center">
                {(user.displayName || user.email || 'G')[0].toUpperCase()}
              </div>
            )}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`font-medium truncate max-w-[90px] hidden md:inline ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                {user.displayName?.split(' ')[0] || user.email?.split('@')[0]}
              </span>
              <Cloud className={`w-3.5 h-3.5 shrink-0 ${accessToken ? 'text-blue-500' : 'text-amber-400'}`} />
            </div>
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                accessToken ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'
              }`}
            />
          </button>
        ) : (
          <button
            onClick={onOpenGoogleSync}
            title="Sign in with Google to sync .sb3 files to Google Drive"
            className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 font-semibold rounded-lg shadow-sm border border-slate-200 transition-all text-xs"
          >
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span className="hidden sm:inline">Google Sync</span>
          </button>
        )}
      </div>
    </header>
  );
};
