import React from 'react';
import { Sb3Project, Sb3Folder, SortField, SortOrder } from '../types/scratch';
import { useTheme } from '../context/ThemeContext';
import { openEditorInNewTab, openSb3ProjectInEditorTab } from '../services/editorService';
import {
  Play,
  Star,
  MoreVertical,
  CheckCircle2,
  FolderInput,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit2,
  Layers,
  ExternalLink
} from 'lucide-react';

interface ListViewProps {
  projects: Sb3Project[];
  folders: Sb3Folder[];
  selectedProjectIds: string[];
  activeProjectId: string | null;
  sortField: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField, order: SortOrder) => void;
  onSelectProject: (id: string, isMulti: boolean, isRange?: boolean) => void;
  onOpenDetails: (project: Sb3Project) => void;
  onRunProject: (project: Sb3Project) => void;
  onToggleFavorite: (id: string) => void;
  onRenameProject: (project: Sb3Project) => void;
  onDeleteProject: (id: string) => void;
  onSelectAll: () => void;
}

export const ListView: React.FC<ListViewProps> = ({
  projects,
  folders,
  selectedProjectIds,
  activeProjectId,
  sortField,
  sortOrder,
  onSortChange,
  onSelectProject,
  onOpenDetails,
  onRunProject,
  onToggleFavorite,
  onRenameProject,
  onDeleteProject,
  onSelectAll,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const getFolderName = (folderId: string | null) => {
    if (!folderId) return 'Unfiled';
    const f = folders.find(f => f.id === folderId);
    return f ? f.name : 'Folder';
  };

  const handleHeaderSort = (field: SortField) => {
    if (sortField === field) {
      onSortChange(field, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(field, 'asc');
    }
  };

  const allSelected = projects.length > 0 && selectedProjectIds.length === projects.length;

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (projects.length === 0) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center p-8 text-center select-none ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
        <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center mb-4 text-orange-500 shadow-lg ${
          isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-orange-50 border-orange-200'
        }`}>
          <Layers className="w-8 h-8" />
        </div>
        <h3 className={`text-base font-semibold mb-1 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
          No Projects In This View
        </h3>
        <p className={`text-xs max-w-sm ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
          No files match your current folder or search criteria.
        </p>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col overflow-hidden select-none ${isDark ? 'bg-slate-950/40' : 'bg-slate-50/50'}`}>
      {/* Table Header */}
      <div className={`flex items-center px-4 py-2.5 border-b text-[11px] font-semibold uppercase tracking-wider shrink-0 ${
        isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
      }`}>
        {/* Select All Checkbox */}
        <div className="w-8 flex items-center justify-center">
          <button
            onClick={onSelectAll}
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              allSelected
                ? 'bg-orange-500 border-orange-500 text-white'
                : isDark ? 'border-slate-700 hover:border-slate-500' : 'border-slate-300 hover:border-slate-400'
            }`}
          >
            {allSelected && <CheckCircle2 className="w-3.5 h-3.5 fill-current" />}
          </button>
        </div>

        {/* Favorite */}
        <div className="w-8 text-center" />

        {/* File Name */}
        <div
          onClick={() => handleHeaderSort('fileName')}
          className="flex-1 flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors min-w-[200px]"
        >
          <span>File Name</span>
          {sortField === 'fileName' && (
            sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-orange-400" /> : <ArrowDown className="w-3 h-3 text-orange-400" />
          )}
        </div>

        {/* Folder */}
        <div className="w-32 hidden md:block">
          <span>Folder</span>
        </div>

        {/* Tags */}
        <div className="w-40 hidden lg:block">
          <span>Tags</span>
        </div>

        {/* Size */}
        <div
          onClick={() => handleHeaderSort('fileSize')}
          className="w-24 text-right flex items-center justify-end gap-1 cursor-pointer hover:text-white transition-colors"
        >
          <span>Size</span>
          {sortField === 'fileSize' && (
            sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-orange-400" /> : <ArrowDown className="w-3 h-3 text-orange-400" />
          )}
        </div>

        {/* Modified Date */}
        <div
          onClick={() => handleHeaderSort('dateModified')}
          className="w-28 text-right hidden sm:flex items-center justify-end gap-1 cursor-pointer hover:text-white transition-colors"
        >
          <span>Modified</span>
          {sortField === 'dateModified' && (
            sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-orange-400" /> : <ArrowDown className="w-3 h-3 text-orange-400" />
          )}
        </div>

        {/* Actions column */}
        <div className="w-28 text-right pr-2">
          <span>Action</span>
        </div>
      </div>

      {/* Rows Container */}
      <div className={`flex-1 overflow-y-auto divide-y custom-scrollbar ${isDark ? 'divide-slate-800/60' : 'divide-slate-200'}`}>
        {projects.map((project) => {
          const isSelected = selectedProjectIds.includes(project.id);
          const isActive = activeProjectId === project.id;

          return (
            <div
              key={project.id}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey) {
                  onSelectProject(project.id, true);
                } else if (e.shiftKey) {
                  onSelectProject(project.id, false, true);
                } else {
                  onSelectProject(project.id, false);
                  onOpenDetails(project);
                }
              }}
              onDoubleClick={() => onRunProject(project)}
              className={`group flex items-center px-4 py-2 text-xs transition-colors cursor-pointer ${
                isSelected
                  ? isDark ? 'bg-orange-500/10 hover:bg-orange-500/15' : 'bg-orange-50 hover:bg-orange-100/70'
                  : isActive
                  ? isDark ? 'bg-slate-850 hover:bg-slate-800' : 'bg-slate-200/80 hover:bg-slate-200'
                  : isDark
                    ? 'hover:bg-slate-900/80 bg-slate-950/20'
                    : 'hover:bg-slate-100 bg-white'
              }`}
            >
              {/* Checkbox */}
              <div
                className="w-8 flex items-center justify-center shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectProject(project.id, true);
                }}
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-orange-500 border-orange-500 text-white'
                      : isDark ? 'border-slate-700 group-hover:border-slate-500' : 'border-slate-300 group-hover:border-slate-400'
                  }`}
                >
                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 fill-current" />}
                </div>
              </div>

              {/* Star */}
              <div
                className="w-8 flex items-center justify-center shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(project.id);
                }}
              >
                <button
                  className={`p-1 rounded transition-colors ${
                    project.isFavorite
                      ? 'text-amber-400'
                      : isDark
                        ? 'text-slate-600 hover:text-amber-300 hover:bg-slate-800'
                        : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100'
                  }`}
                >
                  <Star className={`w-3.5 h-3.5 ${project.isFavorite ? 'fill-current' : ''}`} />
                </button>
              </div>

              {/* Thumbnail + File Name */}
              <div className="flex-1 flex items-center gap-2.5 min-w-[200px] overflow-hidden pr-2">
                <div className={`w-8 h-8 rounded-lg overflow-hidden shrink-0 border relative ${
                  isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
                }`}>
                  <img
                    src={project.thumbnailUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <div className={`font-semibold truncate transition-colors ${
                    isDark ? 'text-slate-200 group-hover:text-orange-300' : 'text-slate-800 group-hover:text-orange-600'
                  }`}>
                    {project.fileName}
                  </div>
                  {project.title && project.title !== project.fileName && (
                    <div className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {project.title}
                    </div>
                  )}
                </div>
              </div>

              {/* Folder */}
              <div className="w-32 hidden md:block truncate pr-2">
                <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border ${
                  isDark
                    ? 'text-slate-400 bg-slate-800/80 border-slate-700/50'
                    : 'text-slate-600 bg-slate-100 border-slate-200'
                }`}>
                  <FolderInput className="w-3 h-3 text-amber-500 shrink-0" />
                  <span className="truncate">{getFolderName(project.folderId)}</span>
                </span>
              </div>

              {/* Tags */}
              <div className="w-40 hidden lg:flex items-center gap-1 truncate pr-2">
                {project.tags.slice(0, 2).map((t, idx) => (
                  <span
                    key={idx}
                    className={`text-[10px] px-1.5 py-0.5 rounded-full border truncate ${
                      isDark
                        ? 'bg-slate-800 text-slate-300 border-slate-700/60'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {t}
                  </span>
                ))}
                {project.tags.length > 2 && (
                  <span className={`text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    +{project.tags.length - 2}
                  </span>
                )}
              </div>

              {/* Size */}
              <div className={`w-24 text-right font-mono pr-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {(project.fileSize / 1024).toFixed(1)} KB
              </div>

              {/* Modified Date */}
              <div className={`w-28 text-right text-[11px] hidden sm:block pr-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {formatDate(project.dateModified)}
              </div>

              {/* Actions & Run */}
              <div className="w-28 flex items-center justify-end gap-1 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRunProject(project);
                  }}
                  title="Run Project in TurboWarp"
                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-semibold text-[11px] flex items-center gap-1 transition-all shadow-sm"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Run</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openSb3ProjectInEditorTab(project.id);
                  }}
                  title="Open this project in SB3 Editor in a new browser tab"
                  className={`p-1.5 rounded transition-colors ${
                    isDark ? 'text-blue-400 hover:text-blue-300 hover:bg-slate-800' : 'text-blue-600 hover:text-blue-700 hover:bg-slate-100'
                  }`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRenameProject(project);
                  }}
                  title="Rename"
                  className={`p-1 rounded transition-colors ${
                    isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteProject(project.id);
                  }}
                  title="Delete"
                  className={`p-1 rounded transition-colors ${
                    isDark ? 'text-slate-400 hover:text-red-400 hover:bg-slate-800' : 'text-slate-500 hover:text-red-600 hover:bg-slate-100'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
