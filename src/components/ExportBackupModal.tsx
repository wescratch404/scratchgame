import React, { useRef, useState } from 'react';
import { Sb3Project, Sb3Folder, Sb3Tag, LibraryBackup } from '../types/scratch';
import { Download, Upload, Archive, FileText, Check, AlertCircle, X, Layers } from 'lucide-react';
import JSZip from 'jszip';
import { getProjectBlob } from '../services/db';
import { embedThumbnailInSb3 } from '../services/sb3Parser';
import { getFolderHierarchyPath } from '../services/googleDrive';

interface ExportBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Sb3Project[];
  folders: Sb3Folder[];
  tags: Sb3Tag[];
  onRestoreBackup: (backup: LibraryBackup) => void;
}

export const ExportBackupModal: React.FC<ExportBackupModalProps> = ({
  isOpen,
  onClose,
  projects,
  folders,
  tags,
  onRestoreBackup,
}) => {
  const [exportingZip, setExportingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState({ current: 0, total: 0 });
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExportMetadataJson = () => {
    const backup: LibraryBackup = {
      version: 1,
      exportDate: new Date().toISOString(),
      projects: projects.map(p => {
        // Strip base64 thumbnail from backup JSON to keep it lightweight
        const { thumbnailUrl, ...rest } = p;
        return rest;
      }),
      folders,
      tags,
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scratch_library_metadata_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ text: 'Metadata JSON exported successfully.', type: 'success' });
  };

  const handleImportMetadataJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && Array.isArray(parsed.projects) && Array.isArray(parsed.folders)) {
          onRestoreBackup(parsed as LibraryBackup);
          setMessage({ text: 'Library metadata restored successfully!', type: 'success' });
        } else {
          setMessage({ text: 'Invalid library backup JSON schema.', type: 'error' });
        }
      } catch (err) {
        setMessage({ text: 'Failed to read backup file.', type: 'error' });
      }
    };
    reader.readAsText(file);
  };

  const handleExportAllSb3Zip = async () => {
    if (projects.length === 0) {
      setMessage({ text: 'No projects in library to export.', type: 'error' });
      return;
    }

    setExportingZip(true);
    setZipProgress({ current: 0, total: projects.length });

    try {
      const zip = new JSZip();
      for (let i = 0; i < projects.length; i++) {
        const p = projects[i];
        setZipProgress({ current: i + 1, total: projects.length });
        const blobOrBuf = await getProjectBlob(p.id);
        if (blobOrBuf) {
          const readyBlob = await embedThumbnailInSb3(blobOrBuf, p.thumbnailUrl);
          const safeName = p.fileName.endsWith('.sb3') ? p.fileName : `${p.fileName}.sb3`;
          const { path } = getFolderHierarchyPath(p.folderId, folders);
          const filePath = path ? `${path}/${safeName}` : safeName;
          zip.file(filePath, readyBlob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scratch_library_all_projects_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      setMessage({ text: `Exported ${projects.length} .sb3 files to ZIP archive.`, type: 'success' });
    } catch (err) {
      setMessage({ text: 'Failed to package ZIP archive.', type: 'error' });
    } finally {
      setExportingZip(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Export & Backup Library</h2>
              <p className="text-xs text-slate-400">Save your organization structure or batch download .sb3 files</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImportMetadataJson}
        />

        {/* Body */}
        <div className="p-6 space-y-4 text-xs">
          {message && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2 ${
                message.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                  : 'bg-red-950/60 border-red-800/80 text-red-300'
              }`}
            >
              {message.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{message.text}</span>
            </div>
          )}

          {/* Option 1: Export Metadata JSON */}
          <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-slate-100 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-orange-400" />
                Export Metadata JSON
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Backs up all folder structures, custom tags, creator notes, and project metadata.
              </p>
            </div>
            <button
              onClick={handleExportMetadataJson}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium text-xs border border-slate-700 transition-colors shrink-0"
            >
              Export JSON
            </button>
          </div>

          {/* Option 2: Import Metadata JSON */}
          <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-slate-100 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-blue-400" />
                Restore / Import Metadata JSON
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Restore folders, tags, and notes from a previously exported backup file.
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium text-xs border border-slate-700 transition-colors shrink-0"
            >
              Restore JSON
            </button>
          </div>

          {/* Option 3: Export All SB3 as ZIP */}
          <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-100 flex items-center gap-1.5">
                  <Archive className="w-4 h-4 text-purple-400" />
                  Package All SB3 Files as ZIP
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Download all {projects.length} Scratch projects in a single consolidated .zip file.
                </p>
              </div>
              <button
                onClick={handleExportAllSb3Zip}
                disabled={exportingZip}
                className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-lg font-semibold text-xs shadow-md shadow-orange-500/20 transition-all shrink-0 disabled:opacity-50"
              >
                {exportingZip ? 'Packing...' : 'Download ZIP'}
              </button>
            </div>

            {exportingZip && (
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                  <span>Compressing project files...</span>
                  <span>{zipProgress.current} / {zipProgress.total}</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-purple-500 h-full transition-all"
                    style={{ width: `${(zipProgress.current / zipProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
