import React, { useState, useEffect } from 'react';
import { Sb3Project } from '../types/scratch';
import { Edit2, X } from 'lucide-react';

interface RenameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  project: Sb3Project | null;
  onConfirmRename: (projectId: string, newTitle: string, newFileName: string) => void;
}

export const RenameDialog: React.FC<RenameDialogProps> = ({
  isOpen,
  onClose,
  project,
  onConfirmRename,
}) => {
  const [title, setTitle] = useState('');
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    if (project) {
      setTitle(project.title);
      setFileName(project.fileName);
    }
  }, [project, isOpen]);

  if (!isOpen || !project) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    let safeFileName = fileName.trim();
    if (!safeFileName.endsWith('.sb3')) {
      safeFileName += '.sb3';
    }

    onConfirmRename(project.id, title.trim(), safeFileName);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <Edit2 className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-white">Rename Project</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Project Title
            </label>
            <input
              type="text"
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-medium text-xs focus:ring-1 focus:ring-orange-500 outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              File Name (.sb3)
            </label>
            <input
              type="text"
              required
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:ring-1 focus:ring-orange-500 outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg text-xs shadow-md shadow-orange-500/20"
            >
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
