import React, { useState, useRef } from 'react';
import { Upload, FolderUp, FilePlus, AlertCircle, X, Loader2 } from 'lucide-react';
import { parseSb3File } from '../services/sb3Parser';
import { Sb3Project, Sb3Folder } from '../types/scratch';
import { resolveLocalFolderHierarchyFromPath } from '../services/googleDrive';

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  folders: Sb3Folder[];
  currentFolderId: string | 'all' | 'unfiled' | 'favorites' | 'recent' | 'archived';
  onImportComplete: (projects: Sb3Project[], blobs: { id: string; blob: Blob }[], newFolders?: Sb3Folder[]) => void;
}

export const ImportDialog: React.FC<ImportDialogProps> = ({
  isOpen,
  onClose,
  folders,
  currentFolderId,
  onImportComplete,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [targetFolder, setTargetFolder] = useState<string | null>(
    typeof currentFolderId === 'string' && !['all', 'unfiled', 'favorites', 'recent', 'archived'].includes(currentFolderId)
      ? currentFolderId
      : null
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const processFilesWithPaths = async (items: { file: File; relativePath: string }[]) => {
    const validItems = items.filter(
      item => item.file.name.toLowerCase().endsWith('.sb3') || item.file.type.includes('scratch')
    );

    if (validItems.length === 0) {
      setStatusMessage('No valid .sb3 Scratch files found in selection.');
      return;
    }

    setProcessing(true);
    setProgress({ current: 0, total: validItems.length });
    setStatusMessage(`Importing ${validItems.length} project(s)...`);

    const importedProjects: Sb3Project[] = [];
    const importedBlobs: { id: string; blob: Blob }[] = [];
    let currentFolders = [...folders];
    const createdFolders: Sb3Folder[] = [];

    for (let i = 0; i < validItems.length; i++) {
      const { file, relativePath } = validItems[i];
      setProgress({ current: i + 1, total: validItems.length });
      try {
        const { project, blob } = await parseSb3File(file);

        // Check if file has relative folder structure
        const pathSegments = relativePath.split('/').filter(Boolean);
        if (pathSegments.length > 1) {
          // Has folder segments before file name (e.g., FolderA/SubFolderB/game.sb3)
          const dirSegments = pathSegments.slice(0, -1);
          const dirPath = dirSegments.join('/');
          const { leafFolderId, newFolders } = resolveLocalFolderHierarchyFromPath(dirPath, currentFolders);
          if (newFolders.length > 0) {
            createdFolders.push(...newFolders);
            currentFolders = [...currentFolders, ...newFolders];
          }
          project.folderId = leafFolderId;
        } else if (targetFolder) {
          project.folderId = targetFolder;
        }

        importedProjects.push(project);
        importedBlobs.push({ id: project.id, blob });
      } catch (err) {
        console.error('Failed to parse file:', file.name, err);
      }
    }

    setProcessing(false);
    if (importedProjects.length > 0) {
      onImportComplete(importedProjects, importedBlobs, createdFolders);
      onClose();
    } else {
      setStatusMessage('Could not extract valid Scratch project data from the files.');
    }
  };

  const handleFiles = (fileList: FileList | File[]) => {
    const list = Array.from(fileList).map(f => ({
      file: f,
      relativePath: (f as any).webkitRelativePath || f.name,
    }));
    processFilesWithPaths(list);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const extracted: { file: File; relativePath: string }[] = [];
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

      if (extracted.length > 0) {
        processFilesWithPaths(extracted);
        return;
      }
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Import Scratch SB3 Projects</h2>
              <p className="text-xs text-slate-400">Add individual files, multiple projects, or entire folders</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden File Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".sb3"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-ignore
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />

        {/* Modal Body */}
        <div className="p-6 space-y-5 text-xs">
          {/* Target Folder Selector */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Import destination folder:
            </label>
            <select
              value={targetFolder || 'unfiled'}
              onChange={(e) => setTargetFolder(e.target.value === 'unfiled' ? null : e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-xs focus:ring-1 focus:ring-orange-500 outline-none"
            >
              <option value="unfiled">Unfiled (Root Library)</option>
              {folders.map(f => (
                <option key={f.id} value={f.id}>📁 {f.name}</option>
              ))}
            </select>
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all ${
              isDragging
                ? 'border-orange-500 bg-orange-500/10 scale-[1.01]'
                : 'border-slate-700 bg-slate-950/60 hover:border-slate-600'
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-orange-500/15 border border-orange-500/20 text-orange-400 flex items-center justify-center mb-3">
              <Upload className="w-7 h-7" />
            </div>

            <h3 className="text-sm font-semibold text-white mb-1">
              Drag & Drop .sb3 files here
            </h3>
            <p className="text-xs text-slate-400 max-w-xs mb-4">
              Drop single .sb3 files or whole folders. We'll automatically parse project.json and extract thumbnails.
            </p>

            {/* Action buttons inside drop zone */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-medium rounded-xl text-xs shadow-md shadow-orange-500/20 transition-all"
              >
                <FilePlus className="w-4 h-4" />
                <span>Select .sb3 Files</span>
              </button>

              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl text-xs border border-slate-700 transition-all"
              >
                <FolderUp className="w-4 h-4 text-blue-400" />
                <span>Select Folder</span>
              </button>
            </div>
          </div>

          {/* Progress / Processing */}
          {processing && (
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
                  Parsing Scratch archives...
                </span>
                <span className="text-orange-400 font-mono font-bold">
                  {progress.current} / {progress.total}
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-orange-500 h-full transition-all duration-150"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Status Message */}
          {statusMessage && !processing && (
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-amber-300 flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
