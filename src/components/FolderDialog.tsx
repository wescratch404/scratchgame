import React, { useState, useEffect } from 'react';
import { Sb3Folder } from '../types/scratch';
import { FolderPlus, Edit2, X, Check } from 'lucide-react';

interface FolderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  folderToEdit: Sb3Folder | null;
  parentFolderId: string | null;
  folders: Sb3Folder[];
  onSaveFolder: (folder: Sb3Folder) => void;
}

const COLOR_PALETTE = [
  '#FFAB19', // Scratch Orange
  '#4C97FF', // Scratch Blue
  '#59C059', // Scratch Green
  '#855CD6', // Scratch Purple
  '#FF6680', // Scratch Pink
  '#0FBD8C', // Scratch Teal
  '#D65CD6', // Magenta
  '#2CA58D', // Deep Mint
];

export const FolderDialog: React.FC<FolderDialogProps> = ({
  isOpen,
  onClose,
  folderToEdit,
  parentFolderId,
  folders,
  onSaveFolder,
}) => {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(parentFolderId);
  const [color, setColor] = useState('#FFAB19');

  useEffect(() => {
    if (folderToEdit) {
      setName(folderToEdit.name);
      setParentId(folderToEdit.parentId);
      setColor(folderToEdit.color || '#FFAB19');
    } else {
      setName('');
      setParentId(parentFolderId);
      setColor('#FFAB19');
    }
  }, [folderToEdit, parentFolderId, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const folder: Sb3Folder = {
      id: folderToEdit ? folderToEdit.id : `folder_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: name.trim(),
      parentId: parentId || null,
      color,
      createdAt: folderToEdit ? folderToEdit.createdAt : Date.now(),
    };

    onSaveFolder(folder);
    onClose();
  };

  const availableParents = folders.filter(f => !folderToEdit || f.id !== folderToEdit.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
              {folderToEdit ? <Edit2 className="w-4 h-4" /> : <FolderPlus className="w-4 h-4" />}
            </div>
            <h2 className="text-base font-bold text-white">
              {folderToEdit ? 'Rename Folder' : 'Create New Folder'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Folder Name */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Folder Name
            </label>
            <input
              type="text"
              autoFocus
              required
              placeholder="e.g. Platformers, Tutorials, Physics..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-medium text-xs focus:ring-1 focus:ring-orange-500 outline-none"
            />
          </div>

          {/* Parent Folder (Nested folders) */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Parent Folder (Optional hierarchy)
            </label>
            <select
              value={parentId || ''}
              onChange={(e) => setParentId(e.target.value ? e.target.value : null)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-xs focus:ring-1 focus:ring-orange-500 outline-none cursor-pointer"
            >
              <option value="">Root level (No parent)</option>
              {availableParents.map(f => (
                <option key={f.id} value={f.id}>
                  📁 {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Color Tag */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Folder Color Accent
            </label>
            <div className="flex items-center gap-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform ${
                    color === c ? 'scale-110 ring-2 ring-white shadow' : 'hover:scale-105 opacity-80'
                  }`}
                >
                  {color === c && <Check className="w-3.5 h-3.5 text-slate-950" />}
                </button>
              ))}
            </div>
          </div>

          {/* Submit buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg text-xs shadow-md shadow-orange-500/20 transition-all"
            >
              {folderToEdit ? 'Save Changes' : 'Create Folder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
