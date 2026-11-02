import React, { useState, useEffect, useRef } from 'react';
import { Sb3Project, Sb3Folder, Sb3Tag } from '../types/scratch';
import { useTheme } from '../context/ThemeContext';
import { getProjectBlob, saveProject } from '../services/db';
import { embedThumbnailInSb3 } from '../services/sb3Parser';
import { openEditorInNewTab, openProjectInEditorWithFile, openSb3ProjectInEditorTab } from '../services/editorService';
import {
  X,
  Play,
  Download,
  ExternalLink,
  Star,
  FolderInput,
  Tag as TagIcon,
  Layers,
  Code,
  Music,
  FileCode2,
  Calendar,
  HardDrive,
  Activity,
  Edit3,
  Check,
  Plus,
  Cloud,
  Camera,
  Image as ImageIcon,
  Loader2
} from 'lucide-react';

interface ProjectDetailsProps {
  project: Sb3Project | null;
  folders: Sb3Folder[];
  availableTags: Sb3Tag[];
  onClose: () => void;
  onUpdateProject: (updated: Sb3Project) => void;
  onRunProject: (project: Sb3Project) => void;
  onToggleFavorite: (id: string) => void;
  onSyncProjectToDrive?: (project: Sb3Project) => void;
}

export const ProjectDetails: React.FC<ProjectDetailsProps> = ({
  project,
  folders,
  availableTags,
  onClose,
  onUpdateProject,
  onRunProject,
  onToggleFavorite,
  onSyncProjectToDrive,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [description, setDescription] = useState('');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [updatingThumbnail, setUpdatingThumbnail] = useState(false);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const handleThumbnailChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !project) return;
    setUpdatingThumbnail(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const blobOrBuf = await getProjectBlob(project.id);
        if (blobOrBuf) {
          const updatedBlob = await embedThumbnailInSb3(blobOrBuf, dataUrl);
          const updated: Sb3Project = {
            ...project,
            thumbnailUrl: dataUrl,
            hasEmbeddedThumbnail: true,
            dateModified: Date.now(),
          };
          await saveProject(updated, updatedBlob);
          onUpdateProject(updated);
        }
        setUpdatingThumbnail(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Failed to update thumbnail:', err);
      setUpdatingThumbnail(false);
    }
  };

  useEffect(() => {
    if (project) {
      setTitle(project.title);
      setNotes(project.notes || '');
      setDescription(project.description || '');
      setFolderId(project.folderId);
      setIsSaved(false);
    }
  }, [project?.id]);

  if (!project) return null;

  const handleSaveNotes = () => {
    const updated: Sb3Project = {
      ...project,
      title: title.trim() || project.fileName,
      notes,
      description,
      folderId,
      dateModified: Date.now()
    };
    onUpdateProject(updated);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleAddTag = (tagName: string) => {
    if (!tagName) return;
    const clean = tagName.trim();
    if (!project.tags.includes(clean)) {
      const updated = {
        ...project,
        tags: [...project.tags, clean],
        dateModified: Date.now()
      };
      onUpdateProject(updated);
    }
    setNewTagInput('');
  };

  const handleRemoveTag = (tagName: string) => {
    const updated = {
      ...project,
      tags: project.tags.filter(t => t !== tagName),
      dateModified: Date.now()
    };
    onUpdateProject(updated);
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value === 'unfiled' ? null : e.target.value;
    setFolderId(val);
    const updated = {
      ...project,
      folderId: val,
      dateModified: Date.now()
    };
    onUpdateProject(updated);
  };

  const handleDownload = async () => {
    const blobOrBuffer = await getProjectBlob(project.id);
    if (!blobOrBuffer) return;
    const embeddedBlob = await embedThumbnailInSb3(blobOrBuffer, project.thumbnailUrl);
    const url = URL.createObjectURL(embeddedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = project.fileName.endsWith('.sb3') ? project.fileName : `${project.fileName}.sb3`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenEditor = () => {
    openSb3ProjectInEditorTab(project.id);
  };

  const handleDownloadAndOpen = async () => {
    await openProjectInEditorWithFile(project, 'https://turbowarp.org/editor');
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <aside className={`w-80 h-full border-l flex flex-col shrink-0 select-none shadow-xl z-20 transition-colors ${
      isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
    }`}>
      {/* Header */}
      <div className={`p-3.5 border-b flex items-center justify-between transition-colors ${
        isDark ? 'border-slate-800 bg-slate-950/70 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-800'
      }`}>
        <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
          <span>Project Inspector</span>
          {isSaved && (
            <span className="text-[10px] text-emerald-500 font-semibold flex items-center gap-1 animate-in fade-in">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
        </h3>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggleFavorite(project.id)}
            title={project.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            className={`p-1.5 rounded-lg transition-colors ${
              project.isFavorite
                ? 'text-amber-400 bg-amber-500/10'
                : isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <Star className={`w-4 h-4 ${project.isFavorite ? 'fill-current' : ''}`} />
          </button>

          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar text-xs">
        {/* Thumbnail Preview with Run Button Overlay & Embedded Status */}
        <div className="space-y-2">
          <div className={`relative aspect-[4/3] rounded-xl overflow-hidden border group shadow-md ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            <img
              src={project.thumbnailUrl}
              alt={project.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

            {/* Quick Play overlay button */}
            <button
              onClick={() => onRunProject(project)}
              className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg shadow-lg text-xs transition-transform transform active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Launch</span>
            </button>

            {/* Hidden file input for changing thumbnail */}
            <input
              ref={thumbInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={handleThumbnailChange}
            />
          </div>

          {/* Embedded thumbnail indicator and change button */}
          <div className="flex items-center justify-between text-[11px] px-0.5 text-slate-400">
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <Camera className="w-3.5 h-3.5 shrink-0" />
              <span>Stored in .sb3 archive</span>
            </span>

            <button
              onClick={() => thumbInputRef.current?.click()}
              disabled={updatingThumbnail}
              title="Replace and embed a new thumbnail into this .sb3 file"
              className={`hover:text-white flex items-center gap-1 text-[11px] underline underline-offset-2 ${
                updatingThumbnail ? 'opacity-50' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {updatingThumbnail ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-orange-400" />
                  <span>Embedding...</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-3 h-3 text-orange-400" />
                  <span>Change image</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Project Title & Filename */}
        <div className="space-y-1">
          <label className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Project Title
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleSaveNotes}
              className={`w-full border rounded-lg px-2.5 py-1.5 font-semibold text-xs focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none transition-colors ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>
          <div className={`text-[11px] font-mono flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <FileCode2 className="w-3 h-3 shrink-0" />
            <span className="truncate">{project.fileName}</span>
          </div>
        </div>

        {/* Action Buttons Bar */}
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onRunProject(project)}
              className="flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow transition-colors text-xs"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Run Project</span>
            </button>

            <button
              onClick={handleOpenEditor}
              title="Open current project in SB3 Editor in a new browser tab"
              className={`flex items-center justify-center gap-1.5 py-2 px-3 font-semibold rounded-lg border transition-colors text-xs ${
                isDark
                  ? 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border-blue-500/40'
                  : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
              <span>Open in Editor</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleDownloadAndOpen}
              title="Download .sb3 and open TurboWarp editor in a new tab"
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 text-xs font-medium rounded-lg border transition-colors ${
                isDark ? 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              <FileCode2 className="w-3 h-3 text-orange-400" />
              <span>Load in Editor</span>
            </button>

            <button
              onClick={handleDownload}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 text-xs font-medium rounded-lg border transition-colors ${
                isDark ? 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              <Download className="w-3 h-3" />
              <span>Export .sb3</span>
            </button>
          </div>
        </div>

        {/* Sync to Google Drive */}
        {onSyncProjectToDrive && (
          <button
            onClick={() => onSyncProjectToDrive(project)}
            className={`w-full flex items-center justify-center gap-2 py-2 px-3 border font-medium rounded-lg transition-colors text-xs ${
              isDark
                ? 'bg-blue-950/40 hover:bg-blue-900/40 border-blue-700/50 text-blue-300'
                : 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700'
            }`}
          >
            <Cloud className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>{project.driveFileId ? 'Re-sync to Google Drive' : 'Sync to Google Drive'}</span>
            {project.driveSyncedAt && (
              <span className="text-[10px] font-mono ml-auto opacity-80">
                Synced {new Date(project.driveSyncedAt).toLocaleDateString()}
              </span>
            )}
          </button>
        )}

        {/* Folder Selector */}
        <div className="space-y-1">
          <label className={`text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <FolderInput className="w-3 h-3 text-amber-500" />
            Assigned Folder
          </label>
          <select
            value={folderId || 'unfiled'}
            onChange={handleFolderChange}
            className={`w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer ${
              isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
            }`}
          >
            <option value="unfiled">Unfiled (Root)</option>
            {folders.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        {/* Tags Management */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className={`text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <TagIcon className="w-3 h-3 text-orange-500" />
              Tags
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {project.tags.map((t, idx) => (
              <span
                key={idx}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${
                  isDark
                    ? 'bg-orange-500/10 text-orange-300 border-orange-500/20'
                    : 'bg-orange-50 text-orange-700 border-orange-200 font-medium'
                }`}
              >
                <span>{t}</span>
                <button
                  onClick={() => handleRemoveTag(t)}
                  className="hover:text-red-500 font-bold ml-0.5"
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          {/* Quick Tag Add input / dropdown */}
          <div className="flex items-center gap-1 pt-1">
            <input
              type="text"
              placeholder="Add tag..."
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag(newTagInput);
                }
              }}
              className={`flex-1 border rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-orange-500 ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
            <button
              onClick={() => handleAddTag(newTagInput)}
              className={`p-1 rounded-lg border ${
                isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Scratch Specifications Card */}
        <div className={`border rounded-xl p-3 space-y-2 ${
          isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50/80 border-slate-200'
        }`}>
          <h4 className={`text-[10px] font-semibold uppercase tracking-wider flex items-center justify-between ${
            isDark ? 'text-slate-400' : 'text-slate-500'
          }`}>
            <span>Scratch 3.0 Telemetry</span>
            <span className="text-emerald-500 font-mono font-normal">v{project.stats.scratchVersion || '3.0'}</span>
          </h4>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-900/90 border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'}`}>
              <span className={`block text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Sprites</span>
              <span className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{project.stats.spriteCount}</span>
            </div>
            <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-900/90 border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'}`}>
              <span className={`block text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Blocks</span>
              <span className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{project.stats.blockCount}</span>
            </div>
            <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-900/90 border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'}`}>
              <span className={`block text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Costumes</span>
              <span className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{project.stats.costumeCount}</span>
            </div>
            <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-900/90 border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'}`}>
              <span className={`block text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Sounds</span>
              <span className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{project.stats.soundCount}</span>
            </div>
          </div>

          {project.stats.spriteNames.length > 0 && (
            <div className="pt-1">
              <span className={`text-[10px] block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Sprite List:</span>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {project.stats.spriteNames.map((s, idx) => (
                  <span key={idx} className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                    isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
                  }`}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {project.stats.extensions.length > 0 && (
            <div className={`pt-1 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
              <span className={`text-[10px] block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Extensions:</span>
              <div className="flex flex-wrap gap-1">
                {project.stats.extensions.map((ext, idx) => (
                  <span key={idx} className="px-1.5 py-0.5 bg-amber-500/10 text-amber-500 rounded text-[10px] font-mono border border-amber-500/20">
                    {ext}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Creator Notes & Documentation */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className={`text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              <Edit3 className="w-3 h-3 text-blue-500" />
              Creator Notes & Tips
            </label>
            <button
              onClick={handleSaveNotes}
              className="text-[10px] text-orange-500 hover:underline font-semibold"
            >
              Save Notes
            </button>
          </div>
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleSaveNotes}
            placeholder="Add controls guide, game rules, ideas, or reminders for this project..."
            className={`w-full border rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none resize-none leading-relaxed transition-colors ${
              isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
            }`}
          />
        </div>

        {/* Metadata Details (Date, Size, Plays) */}
        <div className={`space-y-1.5 pt-2 border-t text-[11px] ${
          isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'
        }`}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <HardDrive className="w-3 h-3 text-slate-400" /> File Size
            </span>
            <span className={`font-mono ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>{(project.fileSize / 1024).toFixed(1)} KB</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-slate-400" /> Times Played
            </span>
            <span className={`font-mono ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>{project.playCount} times</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400" /> Last Played
            </span>
            <span className={isDark ? 'text-slate-300' : 'text-slate-800'}>{formatDate(project.lastPlayed)}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400" /> Date Added
            </span>
            <span className={isDark ? 'text-slate-300' : 'text-slate-800'}>{formatDate(project.dateAdded)}</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
