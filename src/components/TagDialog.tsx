import React, { useState } from 'react';
import { Sb3Tag } from '../types/scratch';
import { Tag as TagIcon, X, Check } from 'lucide-react';

interface TagDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveTag: (tag: Sb3Tag) => void;
}

const TAG_COLORS = [
  '#FFAB19', // Scratch Orange
  '#4C97FF', // Blue
  '#59C059', // Green
  '#855CD6', // Purple
  '#FF6680', // Pink
  '#0FBD8C', // Teal
  '#D65CD6', // Magenta
  '#E67E22', // Amber
  '#3498DB', // Sky Blue
  '#E74C3C', // Red
];

export const TagDialog: React.FC<TagDialogProps> = ({
  isOpen,
  onClose,
  onSaveTag,
}) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#FFAB19');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newTag: Sb3Tag = {
      id: `tag_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      color,
    };

    onSaveTag(newTag);
    setName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <TagIcon className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-white">Create Custom Tag</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Tag Name
            </label>
            <input
              type="text"
              autoFocus
              required
              placeholder="e.g. Multiplayer, Speedrun, Particle..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-medium text-xs focus:ring-1 focus:ring-orange-500 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Color Label
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform ${
                    color === c ? 'scale-110 ring-2 ring-white shadow' : 'hover:scale-105 opacity-80'
                  }`}
                >
                  {color === c && <Check className="w-3 h-3 text-slate-950" />}
                </button>
              ))}
            </div>
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
              Add Tag
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
