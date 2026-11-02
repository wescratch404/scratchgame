import React from 'react';
import { Sb3Project, Sb3Folder, Sb3Tag } from '../types/scratch';
import {
  BarChart3,
  X,
  Layers,
  Code,
  HardDrive,
  Play,
  Clock,
  Folder,
  Tag as TagIcon,
  Sparkles,
  TrendingUp
} from 'lucide-react';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Sb3Project[];
  folders: Sb3Folder[];
  tags: Sb3Tag[];
  onPlayProject: (project: Sb3Project) => void;
}

export const StatsModal: React.FC<StatsModalProps> = ({
  isOpen,
  onClose,
  projects,
  folders,
  tags,
  onPlayProject,
}) => {
  if (!isOpen) return null;

  const totalProjects = projects.length;
  const totalStorageBytes = projects.reduce((acc, p) => acc + p.fileSize, 0);
  const totalBlocks = projects.reduce((acc, p) => acc + (p.stats.blockCount || 0), 0);
  const totalSprites = projects.reduce((acc, p) => acc + (p.stats.spriteCount || 0), 0);
  const totalPlays = projects.reduce((acc, p) => acc + (p.playCount || 0), 0);

  const formatStorage = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Folders distribution
  const folderCounts: { name: string; count: number; color: string }[] = folders.map(f => ({
    name: f.name,
    count: projects.filter(p => p.folderId === f.id).length,
    color: f.color || '#FFAB19',
  }));
  const unfiledCount = projects.filter(p => !p.folderId).length;
  if (unfiledCount > 0) {
    folderCounts.push({ name: 'Unfiled', count: unfiledCount, color: '#64748B' });
  }

  // Tags distribution
  const tagCountsMap: Record<string, number> = {};
  for (const p of projects) {
    for (const t of p.tags) {
      tagCountsMap[t] = (tagCountsMap[t] || 0) + 1;
    }
  }
  const topTags = Object.entries(tagCountsMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // Most Played Projects
  const mostPlayed = [...projects]
    .filter(p => p.playCount > 0)
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, 5);

  // Recently Added Projects
  const recentAdded = [...projects]
    .sort((a, b) => b.dateAdded - a.dateAdded)
    .slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150 select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Library Analytics & Statistics</h2>
              <p className="text-xs text-slate-400">Deep telemetry of your local Scratch collections</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-xs">
          {/* Top Metric Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Layers className="w-4 h-4 text-orange-400" />
                <span className="text-[11px] font-medium">Total Projects</span>
              </div>
              <div className="text-2xl font-black text-white">{totalProjects}</div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <HardDrive className="w-4 h-4 text-blue-400" />
                <span className="text-[11px] font-medium">Library Size</span>
              </div>
              <div className="text-2xl font-black text-white">{formatStorage(totalStorageBytes)}</div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Code className="w-4 h-4 text-purple-400" />
                <span className="text-[11px] font-medium">Total Blocks</span>
              </div>
              <div className="text-2xl font-black text-white">{totalBlocks.toLocaleString()}</div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span className="text-[11px] font-medium">Sprites Across App</span>
              </div>
              <div className="text-2xl font-black text-white">{totalSprites}</div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                <span className="text-[11px] font-medium">Total Runs</span>
              </div>
              <div className="text-2xl font-black text-white">{totalPlays}</div>
            </div>
          </div>

          {/* Charts Row: Folders & Tags */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Folder Breakdown */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Folder className="w-4 h-4 text-amber-400" />
                Projects per Folder
              </h3>

              <div className="space-y-2.5">
                {folderCounts.map((fc, i) => {
                  const percent = totalProjects > 0 ? Math.round((fc.count / totalProjects) * 100) : 0;
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium truncate max-w-[200px]">{fc.name}</span>
                        <span className="text-slate-400 font-mono">
                          {fc.count} ({percent}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(4, percent)}%`,
                            backgroundColor: fc.color
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tag Popularity */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
                <TagIcon className="w-4 h-4 text-orange-400" />
                Top Project Tags
              </h3>

              {topTags.length > 0 ? (
                <div className="space-y-2.5">
                  {topTags.map(([tag, count], idx) => {
                    const percent = totalProjects > 0 ? Math.round((count / totalProjects) * 100) : 0;
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-300 font-medium">{tag}</span>
                          <span className="text-slate-400 font-mono">
                            {count} projects
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-orange-500 h-full rounded-full transition-all"
                            style={{ width: `${Math.max(4, percent)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-slate-500 text-center py-8">No tags recorded yet</div>
              )}
            </div>
          </div>

          {/* Leaderboards: Most Played & Recent Imports */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Most Played */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Play className="w-4 h-4 text-emerald-400" />
                Most Opened Projects
              </h3>

              {mostPlayed.length > 0 ? (
                <div className="space-y-2">
                  {mostPlayed.map((proj, idx) => (
                    <div
                      key={proj.id}
                      onClick={() => onPlayProject(proj)}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-900 hover:bg-slate-850 cursor-pointer border border-slate-800 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 text-center font-bold text-orange-400">#{idx + 1}</span>
                        <div className="truncate">
                          <div className="text-slate-200 font-medium truncate">{proj.title}</div>
                          <div className="text-[10px] text-slate-500">{proj.fileName}</div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[11px] shrink-0">
                        {proj.playCount} runs
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-slate-500 text-center py-8">
                  Run projects to see your play count statistics!
                </div>
              )}
            </div>

            {/* Recent Imports */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                Recent Imports
              </h3>

              <div className="space-y-2">
                {recentAdded.map(proj => (
                  <div
                    key={proj.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800"
                  >
                    <div className="min-w-0">
                      <div className="text-slate-200 font-medium truncate">{proj.title}</div>
                      <div className="text-[10px] text-slate-500">{(proj.fileSize / 1024).toFixed(0)} KB • {proj.stats.spriteCount} sprites</div>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {new Date(proj.dateAdded).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
