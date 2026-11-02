import React, { useState, useEffect, useRef } from 'react';
import { Sb3Project, Sb3Folder } from '../types/scratch';
import { useTheme } from '../context/ThemeContext';
import { openEditorInNewTab, openSb3ProjectInEditorTab } from '../services/editorService';
import {
  Play,
  Star,
  MoreVertical,
  Edit2,
  Trash2,
  FolderInput,
  Layers,
  FileCode2,
  CheckCircle2,
  Tag as TagIcon,
  ExternalLink
} from 'lucide-react';

interface GridViewProps {
  projects: Sb3Project[];
  folders: Sb3Folder[];
  selectedProjectIds: string[];
  activeProjectId: string | null;
  onSelectProject: (id: string, isMulti: boolean, isRange?: boolean) => void;
  onOpenDetails: (project: Sb3Project) => void;
  onRunProject: (project: Sb3Project) => void;
  onToggleFavorite: (id: string) => void;
  onRenameProject: (project: Sb3Project) => void;
  onDeleteProject: (id: string) => void;
  onMoveProject: (projectId: string, targetFolderId: string | null) => void;
}

export const GridView: React.FC<GridViewProps> = ({
  projects,
  folders,
  selectedProjectIds,
  activeProjectId,
  onSelectProject,
  onOpenDetails,
  onRunProject,
  onToggleFavorite,
  onRenameProject,
  onDeleteProject,
  onMoveProject,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Infinite scroll / lazy render chunking for 5000+ items
  const [displayCount, setDisplayCount] = useState(60);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset display count when projects filter changes significantly
    setDisplayCount(60);
  }, [projects.length]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 400) {
      if (displayCount < projects.length) {
        setDisplayCount(prev => Math.min(prev + 40, projects.length));
      }
    }
  };

  const getFolderName = (folderId: string | null) => {
    if (!folderId) return 'Unfiled';
    const f = folders.find(f => f.id === folderId);
    return f ? f.name : 'Folder';
  };

  const handleDragStart = (e: React.DragEvent, project: Sb3Project) => {
    if (selectedProjectIds.includes(project.id) && selectedProjectIds.length > 1) {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        type: 'scratch-projects-bulk',
        ids: selectedProjectIds
      }));
    } else {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        type: 'scratch-project',
        id: project.id
      }));
    }
    e.dataTransfer.effectAllowed = 'move';
  };

  const visibleProjects = projects.slice(0, displayCount);

  if (projects.length === 0) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center p-8 text-center select-none ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
        <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center mb-4 text-orange-500 shadow-lg ${
          isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-orange-50 border-orange-200'
        }`}>
          <Layers className="w-8 h-8" />
        </div>
        <h3 className={`text-base font-semibold mb-1 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
          No Scratch Projects Found
        </h3>
        <p className={`text-xs max-w-sm mb-5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
          Drop .sb3 files here, or click "Import" in the toolbar to add Scratch projects to your library.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-4 custom-scrollbar select-none"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
        {visibleProjects.map((project) => {
          const isSelected = selectedProjectIds.includes(project.id);
          const isActive = activeProjectId === project.id;
          const isMenuOpen = menuOpenId === project.id;

          return (
            <div
              key={project.id}
              draggable
              onDragStart={(e) => handleDragStart(e, project)}
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
              className={`group relative flex flex-col rounded-xl overflow-hidden border transition-all duration-150 cursor-pointer ${
                isSelected
                  ? 'border-orange-500 ring-2 ring-orange-500/40 shadow-lg shadow-orange-500/10'
                  : isActive
                  ? isDark ? 'border-slate-600 bg-slate-850 shadow-md' : 'border-slate-400 bg-slate-50 shadow-md'
                  : isDark
                    ? 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:shadow-lg hover:shadow-black/30'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md shadow-sm'
              }`}
            >
              {/* Thumbnail Container */}
              <div className="relative aspect-[4/3] bg-slate-950 overflow-hidden">
                <img
                  src={project.thumbnailUrl}
                  alt={project.title}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => {
                    // Fallback if image fails to render
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />

                {/* Subtle top gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/30 pointer-events-none" />

                {/* Quick Run Overlay Button (Center/Bottom) */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRunProject(project);
                    }}
                    title="Launch Project in TurboWarp Player"
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/30 transform hover:scale-105 transition-all text-xs"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>RUN</span>
                  </button>
                </div>

                {/* Top Left Selection Checkbox */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectProject(project.id, true);
                  }}
                  className={`absolute top-2 left-2 w-6 h-6 rounded-md flex items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-orange-500 text-white shadow'
                      : 'bg-black/60 text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 backdrop-blur'
                  }`}
                >
                  <CheckCircle2 className={`w-4 h-4 ${isSelected ? 'fill-current text-white' : ''}`} />
                </button>

                {/* Top Right Favorite Star */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(project.id);
                  }}
                  title={project.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  className={`absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center transition-all ${
                    project.isFavorite
                      ? 'bg-black/60 text-amber-400 backdrop-blur'
                      : 'bg-black/60 text-slate-400 hover:text-amber-300 opacity-0 group-hover:opacity-100 backdrop-blur'
                  }`}
                >
                  <Star className={`w-3.5 h-3.5 ${project.isFavorite ? 'fill-current' : ''}`} />
                </button>

                {/* Bottom Info badges on thumbnail */}
                <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[10px] text-slate-300 pointer-events-none">
                  <span className="bg-black/70 backdrop-blur px-1.5 py-0.5 rounded font-mono">
                    {(project.fileSize / 1024).toFixed(0)} KB
                  </span>
                  <span className="bg-black/70 backdrop-blur px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                    <FileCode2 className="w-3 h-3 text-orange-400" />
                    {project.stats.spriteCount}s • {project.stats.blockCount}b
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-3 flex flex-col justify-between flex-1 gap-2">
                <div>
                  <div className="flex items-start justify-between gap-1">
                    <h3
                      className={`text-xs font-semibold truncate transition-colors ${
                        isDark ? 'text-slate-100 group-hover:text-orange-300' : 'text-slate-900 group-hover:text-orange-600'
                      }`}
                      title={project.title}
                    >
                      {project.title}
                    </h3>

                    {/* Three-dots Menu */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(isMenuOpen ? null : project.id);
                        }}
                        className={`p-1 rounded transition-colors ${
                          isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {/* Dropdown Menu */}
                      {isMenuOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className={`absolute right-0 top-full mt-1 w-40 border rounded-xl shadow-2xl py-1 z-30 text-xs animate-in fade-in ${
                            isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800 shadow-xl'
                          }`}
                        >
                          <button
                            onClick={() => {
                              setMenuOpenId(null);
                              onRunProject(project);
                            }}
                            className={`w-full text-left px-3 py-1.5 flex items-center gap-2 font-medium ${
                              isDark ? 'hover:bg-slate-800 text-emerald-400' : 'hover:bg-slate-100 text-emerald-600'
                            }`}
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Run Project</span>
                          </button>

                          <button
                            onClick={() => {
                              setMenuOpenId(null);
                              openSb3ProjectInEditorTab(project.id);
                            }}
                            className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${
                              isDark ? 'hover:bg-slate-800 text-blue-400' : 'hover:bg-slate-100 text-blue-600'
                            }`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Open in Editor</span>
                          </button>

                          <button
                            onClick={() => {
                              setMenuOpenId(null);
                              onRenameProject(project);
                            }}
                            className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${
                              isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-slate-100 text-slate-700'
                            }`}
                          >
                            <Edit2 className="w-3.5 h-3.5 text-blue-400" />
                            <span>Rename</span>
                          </button>

                          {/* Quick move submenu */}
                          <div className={`px-3 py-1 text-[10px] uppercase tracking-wider font-semibold border-t mt-1 ${
                            isDark ? 'text-slate-500 border-slate-800' : 'text-slate-400 border-slate-200'
                          }`}>
                            Move to Folder
                          </div>
                          <button
                            onClick={() => {
                              setMenuOpenId(null);
                              onMoveProject(project.id, null);
                            }}
                            className={`w-full text-left px-3 py-1 text-[11px] truncate ${
                              isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-700'
                            }`}
                          >
                            Unfiled (Root)
                          </button>
                          {folders.map(f => (
                            <button
                              key={f.id}
                              onClick={() => {
                                setMenuOpenId(null);
                                onMoveProject(project.id, f.id);
                              }}
                              className={`w-full text-left px-3 py-1 text-[11px] truncate ${
                                isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-700'
                              }`}
                            >
                              📁 {f.name}
                            </button>
                          ))}

                          <div className={`border-t my-1 ${isDark ? 'border-slate-800' : 'border-slate-200'}`} />

                          <button
                            onClick={() => {
                              setMenuOpenId(null);
                              onDeleteProject(project.id);
                            }}
                            className="w-full text-left px-3 py-1.5 hover:bg-red-500/20 text-red-500 flex items-center gap-2"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <p className={`text-[11px] truncate mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {project.fileName}
                  </p>
                </div>

                {/* Folder & Tags Chips */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 truncate max-w-[100px] ${
                    isDark ? 'bg-slate-800 text-slate-400 border-slate-700/50' : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    <FolderInput className="w-2.5 h-2.5 text-amber-500" />
                    <span>{getFolderName(project.folderId)}</span>
                  </span>

                  {project.tags.slice(0, 2).map((t, idx) => (
                    <span
                      key={idx}
                      className={`text-[10px] px-1.5 py-0.5 rounded-full border truncate max-w-[90px] ${
                        isDark ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-orange-50 text-orange-600 border-orange-200 font-medium'
                      }`}
                    >
                      {t}
                    </span>
                  ))}
                  {project.tags.length > 2 && (
                    <span className={`text-[9px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      +{project.tags.length - 2}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Infinite scrolling bottom loader / indicator */}
      {displayCount < projects.length && (
        <div className="py-6 flex justify-center">
          <button
            onClick={() => setDisplayCount(prev => Math.min(prev + 50, projects.length))}
            className={`px-4 py-2 text-xs font-medium rounded-lg border transition-colors ${
              isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
          >
            Load More Projects ({projects.length - displayCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
};
