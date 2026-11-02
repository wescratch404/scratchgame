import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sb3Project } from '../types/scratch';
import { getProjectById, getProjectBlob, saveProject, getAllFolders } from '../services/db';
import { embedThumbnailInSb3 } from '../services/sb3Parser';
import { parseSb3ProjectDetails, ParsedProjectDetails, ParsedSprite } from '../services/sb3Inspector';
import { openProjectInEditorWithFile } from '../services/editorService';
import { useTheme } from '../context/ThemeContext';
import {
  Play,
  Square,
  RotateCw,
  Maximize2,
  Minimize2,
  ExternalLink,
  Download,
  Save,
  Check,
  Code2,
  Image as ImageIcon,
  Music,
  Layers,
  ArrowLeft,
  Camera,
  FileCode2,
  Activity,
  HardDrive,
  Calendar,
  Tag as TagIcon,
  FolderInput,
  Edit3,
  Search,
  ZoomIn,
  ZoomOut,
  Volume2,
  VolumeX,
  Sparkles,
  Info
} from 'lucide-react';

interface Sb3EditorViewProps {
  projectId: string;
  onExit?: () => void;
}

declare global {
  interface Window {
    Scaffolding?: any;
  }
}

async function ensureScaffoldingLoaded(): Promise<any> {
  if (window.Scaffolding) {
    return window.Scaffolding;
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[src*="scaffolding-min.js"]');
    if (existingScript) {
      if (window.Scaffolding) {
        resolve(window.Scaffolding);
        return;
      }
      existingScript.addEventListener('load', () => resolve(window.Scaffolding));
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Scaffolding')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@turbowarp/scaffolding/dist/scaffolding-min.js';
    script.async = true;
    script.onload = () => {
      if (window.Scaffolding) {
        resolve(window.Scaffolding);
      } else {
        reject(new Error('TurboWarp Scaffolding loaded without global export'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load TurboWarp runtime script'));
    document.head.appendChild(script);
  });
}

export const Sb3EditorView: React.FC<Sb3EditorViewProps> = ({ projectId, onExit }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [project, setProject] = useState<Sb3Project | null>(null);
  const [projectDetails, setProjectDetails] = useState<ParsedProjectDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState('Opening SB3 project archive...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Editor Workbench Tab State
  const [activeTab, setActiveTab] = useState<'code' | 'costumes' | 'sounds' | 'data' | 'turbowarp'>('code');
  const [selectedSpriteIndex, setSelectedSpriteIndex] = useState(0);
  const [selectedCostumeIndex, setSelectedCostumeIndex] = useState(0);
  const [costumeZoom, setCostumeZoom] = useState(1);
  const [blockSearch, setBlockSearch] = useState('');

  // Audio preview
  const [playingSoundUrl, setPlayingSoundUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Editable Project State
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);

  // Stage Runtime State
  const [isRunning, setIsRunning] = useState(false);
  const [turboMode, setTurboMode] = useState(false);
  const [fps60, setFps60] = useState(false);
  const [interpolation, setInterpolation] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [thumbnailFeedback, setThumbnailFeedback] = useState<string | null>(null);

  const stageWrapperRef = useRef<HTMLDivElement>(null);
  const scaffoldingInstanceRef = useRef<any>(null);
  const projectBlobRef = useRef<Blob | null>(null);

  // Load project from IndexedDB
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        setLoadingStage('Retrieving .sb3 file from local library...');

        const [p, blobOrBuffer, allFolders] = await Promise.all([
          getProjectById(projectId),
          getProjectBlob(projectId),
          getAllFolders(),
        ]);

        if (!isMounted) return;

        setFolders(allFolders.map(f => ({ id: f.id, name: f.name })));

        if (!p || !blobOrBuffer) {
          throw new Error(`Project "${projectId}" not found in local library.`);
        }

        setProject(p);
        setTitle(p.title);
        setNotes(p.notes || '');

        const blob = blobOrBuffer instanceof Blob ? blobOrBuffer : new Blob([blobOrBuffer]);
        projectBlobRef.current = blob;

        setLoadingStage('Inspecting Scratch 3 sprites, scripts & assets...');
        const details = await parseSb3ProjectDetails(blob);
        if (!isMounted) return;
        setProjectDetails(details);

        setLoadingStage('Spinning up TurboWarp Scaffolding engine...');
        await initializeStageEngine(blob);

        setLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Failed to load project in editor:', err);
        setErrorMessage(err.message || 'Could not load SB3 file in editor');
        setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
      if (scaffoldingInstanceRef.current) {
        try {
          scaffoldingInstanceRef.current.stopAll?.();
        } catch {}
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [projectId]);

  // Initialize Scaffolding Stage
  const initializeStageEngine = async (blob: Blob) => {
    try {
      const Scaffolding = await ensureScaffoldingLoaded();
      if (!stageWrapperRef.current) return;

      // Clean old instance
      stageWrapperRef.current.innerHTML = '';

      const sc = new Scaffolding();
      sc.width = 480;
      sc.height = 360;
      sc.resizeMode = 'preserve-ratio';
      sc.editableLists = false;
      sc.usePackagedRuntime = false;

      sc.setup();
      sc.appendTo(stageWrapperRef.current);

      const arrayBuffer = await blob.arrayBuffer();
      await sc.loadProject(arrayBuffer);

      // High-performance compiler and VM execution tuning
      if (sc.vm) {
        if (typeof sc.vm.setCompilerOptions === 'function') {
          sc.vm.setCompilerOptions({
            enabled: true,
            warpTimer: false
          });
        }
        if (sc.vm.runtime) {
          if (typeof sc.vm.runtime.setCompatibilityMode === 'function') {
            sc.vm.runtime.setCompatibilityMode(false);
          }
          if (typeof sc.vm.runtime.setCompilerOptions === 'function') {
            sc.vm.runtime.setCompilerOptions({
              enabled: true,
              warpTimer: false
            });
          }
          sc.vm.runtime.on('PROJECT_RUN_START', () => setIsRunning(true));
          sc.vm.runtime.on('PROJECT_RUN_STOP', () => setIsRunning(false));
        }
        if (sc.vm.setFramerate) sc.vm.setFramerate(fps60 ? 60 : 30);
        if (sc.vm.setTurboMode) sc.vm.setTurboMode(turboMode);
        if (sc.vm.setInterpolation) sc.vm.setInterpolation(interpolation);
      }

      scaffoldingInstanceRef.current = sc;
      sc.start();
      setIsRunning(true);
    } catch (err) {
      console.warn('Scaffolding initialization warning:', err);
    }
  };

  // Play / Stop / Restart stage
  const triggerGreenFlag = () => {
    if (scaffoldingInstanceRef.current) {
      scaffoldingInstanceRef.current.greenFlag();
      setIsRunning(true);
    }
  };

  const triggerStop = () => {
    if (scaffoldingInstanceRef.current) {
      scaffoldingInstanceRef.current.stopAll();
      setIsRunning(false);
    }
  };

  const restartPlayer = async () => {
    if (projectBlobRef.current) {
      triggerStop();
      await initializeStageEngine(projectBlobRef.current);
    }
  };

  const toggleTurbo = () => {
    const next = !turboMode;
    setTurboMode(next);
    if (scaffoldingInstanceRef.current?.vm?.setTurboMode) {
      scaffoldingInstanceRef.current.vm.setTurboMode(next);
    }
  };

  const toggleFps = () => {
    const next = !fps60;
    setFps60(next);
    if (scaffoldingInstanceRef.current?.vm?.setFramerate) {
      scaffoldingInstanceRef.current.vm.setFramerate(next ? 60 : 30);
    }
  };

  const toggleInterpolation = () => {
    const next = !interpolation;
    setInterpolation(next);
    if (scaffoldingInstanceRef.current?.vm?.setInterpolation) {
      scaffoldingInstanceRef.current.vm.setInterpolation(next);
    }
  };

  // Save changes to IndexedDB
  const handleSave = async () => {
    if (!project) return;
    const updated: Sb3Project = {
      ...project,
      title: title.trim() || project.title,
      notes: notes,
      dateModified: Date.now(),
    };
    await saveProject(updated);
    setProject(updated);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  // Capture Thumbnail
  const handleCaptureThumbnail = useCallback(async () => {
    if (!project) return;
    const sc = scaffoldingInstanceRef.current;
    if (!sc) {
      setThumbnailFeedback('Engine not ready');
      setTimeout(() => setThumbnailFeedback(null), 2500);
      return;
    }

    try {
      let dataUrl: string | null = null;
      if (sc.renderer && typeof sc.renderer.requestSnapshot === 'function') {
        dataUrl = await new Promise<string>((resolve) => {
          let resolved = false;
          sc.renderer.requestSnapshot((url: string) => {
            if (!resolved) {
              resolved = true;
              resolve(url);
            }
          });
          if (sc.vm?.runtime?.requestRedraw) sc.vm.runtime.requestRedraw();
          setTimeout(() => {
            if (!resolved) {
              const canvas = stageWrapperRef.current?.querySelector('canvas');
              resolve(canvas?.toDataURL('image/png') || '');
            }
          }, 300);
        });
      }

      if (!dataUrl) {
        const canvas = stageWrapperRef.current?.querySelector('canvas');
        if (canvas) dataUrl = canvas.toDataURL('image/png');
      }

      if (dataUrl && dataUrl.length > 100) {
        const updated = { ...project, thumbnailUrl: dataUrl, dateModified: Date.now() };
        await saveProject(updated);
        setProject(updated);
        setThumbnailFeedback('Thumbnail captured!');
        setTimeout(() => setThumbnailFeedback(null), 2500);
      }
    } catch {
      setThumbnailFeedback('Capture failed');
      setTimeout(() => setThumbnailFeedback(null), 2500);
    }
  }, [project]);

  // Export .sb3 file
  const handleExportSb3 = async () => {
    if (!project || !projectBlobRef.current) return;
    try {
      const embedded = await embedThumbnailInSb3(projectBlobRef.current, project.thumbnailUrl);
      const url = URL.createObjectURL(embedded);
      const a = document.createElement('a');
      a.href = url;
      a.download = project.fileName.endsWith('.sb3') ? project.fileName : `${project.fileName}.sb3`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      const url = URL.createObjectURL(projectBlobRef.current);
      const a = document.createElement('a');
      a.href = url;
      a.download = project.fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Sound Preview Player
  const handlePlaySound = (url: string) => {
    if (playingSoundUrl === url && audioRef.current) {
      audioRef.current.pause();
      setPlayingSoundUrl(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlayingSoundUrl(null);
    audio.play();
    setPlayingSoundUrl(url);
  };

  const selectedSprite: ParsedSprite | undefined = projectDetails?.sprites[selectedSpriteIndex];

  // Block Category Colors for Scratch Visual Authenticity
  const categoryColors: Record<string, string> = {
    motion: 'bg-blue-600 border-blue-500 text-white',
    looks: 'bg-purple-600 border-purple-500 text-white',
    sound: 'bg-pink-600 border-pink-500 text-white',
    events: 'bg-amber-500 border-amber-400 text-slate-900',
    control: 'bg-amber-600 border-amber-500 text-white',
    sensing: 'bg-cyan-600 border-cyan-500 text-white',
    operators: 'bg-emerald-600 border-emerald-500 text-white',
    variables: 'bg-orange-600 border-orange-500 text-white',
    custom: 'bg-rose-600 border-rose-500 text-white',
    other: 'bg-slate-700 border-slate-600 text-slate-200',
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 ${
        isDark ? 'bg-slate-950 text-slate-200' : 'bg-slate-100 text-slate-800'
      }`}>
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 shadow-xl animate-pulse">
            <Code2 className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Opening SB3 Editor</h2>
            <p className="text-xs text-slate-400 mt-1">{loadingStage}</p>
          </div>
          <div className="w-56 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2">
            <div className="bg-orange-500 h-full w-2/3 animate-[pulse_1.5s_ease-in-out_infinite]" />
          </div>
        </div>
      </div>
    );
  }

  if (errorMessage || !project) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 ${
        isDark ? 'bg-slate-950 text-slate-200' : 'bg-slate-100 text-slate-800'
      }`}>
        <div className="max-w-md p-6 bg-slate-900 border border-red-500/30 rounded-2xl shadow-2xl text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 mx-auto">
            <FileCode2 className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-white">Could Not Open Project</h2>
          <p className="text-xs text-slate-400">{errorMessage || 'The requested project could not be loaded.'}</p>
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold"
            >
              Retry
            </button>
            <button
              onClick={() => {
                if (onExit) onExit();
                else window.location.href = window.location.pathname;
              }}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold"
            >
              Return to Library
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      {/* Top Header Bar */}
      <header className={`h-14 border-b px-4 flex items-center justify-between shrink-0 select-none z-30 transition-colors ${
        isDark ? 'bg-slate-900/95 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => {
              if (onExit) onExit();
              else window.location.href = window.location.pathname;
            }}
            title="Back to SB3 Library"
            className={`p-2 rounded-lg transition-colors ${
              isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <span className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs font-bold font-mono">
            SB3 EDITOR
          </span>

          {/* Editable Title */}
          <div className="flex items-center gap-2 min-w-0">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleSave}
              placeholder="Project Title"
              className={`text-sm font-bold bg-transparent border-b border-transparent hover:border-slate-600 focus:border-orange-500 outline-none px-1 py-0.5 truncate max-w-xs md:max-w-md ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            />
            {isSaved && (
              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold animate-in fade-in">
                <Check className="w-3 h-3" /> Saved
              </span>
            )}
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {/* Save Button */}
          <button
            onClick={handleSave}
            title="Save project changes"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Save</span>
          </button>

          {/* Export .sb3 Button */}
          <button
            onClick={handleExportSb3}
            title="Download .sb3 file with embedded thumbnail"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              isDark ? 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Export .sb3</span>
          </button>

          {/* Open in TurboWarp Web Editor */}
          <button
            onClick={() => openProjectInEditorWithFile(project, 'https://turbowarp.org/editor')}
            title="Download .sb3 and open in TurboWarp Web Editor"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Open TurboWarp Web</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Section: Interactive Stage Canvas */}
        <div className={`w-[480px] lg:w-[520px] xl:w-[560px] border-r flex flex-col shrink-0 select-none ${
          isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          {/* Stage Controls Bar */}
          <div className={`p-2.5 border-b flex items-center justify-between gap-2 shrink-0 ${
            isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
          }`}>
            <div className="flex items-center gap-1.5">
              <button
                onClick={triggerGreenFlag}
                title="Green Flag (Start Project)"
                className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold rounded-lg text-xs shadow-sm transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play</span>
              </button>

              <button
                onClick={triggerStop}
                title="Stop Project"
                className="flex items-center gap-1 px-2.5 py-1.5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-semibold rounded-lg text-xs shadow-sm transition-all"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop</span>
              </button>

              <button
                onClick={restartPlayer}
                title="Restart Scaffolding Stage"
                className={`p-1.5 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-600'
                }`}
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Stage Options */}
            <div className="flex items-center gap-1.5 text-xs">
              <button
                onClick={toggleTurbo}
                title="Turbo Mode (runs blocks without screen refresh delays)"
                className={`px-2 py-1 rounded-md font-mono text-[11px] font-semibold transition-all border ${
                  turboMode
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-xs'
                    : isDark ? 'text-slate-400 hover:text-white border-slate-700' : 'text-slate-600 border-slate-300'
                }`}
              >
                ⚡ Turbo
              </button>

              <button
                onClick={toggleFps}
                title="Framerate (30 vs 60 FPS)"
                className={`px-2 py-1 rounded-md font-mono text-[11px] font-semibold transition-all border ${
                  fps60
                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 shadow-xs'
                    : isDark ? 'text-slate-400 hover:text-white border-slate-700' : 'text-slate-600 border-slate-300'
                }`}
              >
                {fps60 ? '60 FPS' : '30 FPS'}
              </button>

              <button
                onClick={toggleInterpolation}
                title="Toggle Smooth Motion (sub-frame sprite interpolation)"
                className={`px-2 py-1 rounded-md font-mono text-[11px] font-semibold transition-all border ${
                  interpolation
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-xs'
                    : isDark ? 'text-slate-400 hover:text-white border-slate-700' : 'text-slate-600 border-slate-300'
                }`}
              >
                ✨ Smooth
              </button>

              <button
                onClick={handleCaptureThumbnail}
                title="Snapshot stage as thumbnail"
                className={`p-1.5 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-slate-800 text-orange-400 hover:text-orange-300' : 'hover:bg-slate-100 text-orange-500'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Stage Viewport */}
          <div className="p-4 flex flex-col items-center justify-between flex-1 min-h-0 overflow-hidden bg-black/90">
            <div
              className="relative w-full aspect-[4/3] max-w-[480px] bg-black rounded-xl overflow-hidden shadow-2xl border border-slate-800 flex items-center justify-center min-h-0 [transform:translateZ(0)]"
            >
              <div
                ref={stageWrapperRef}
                className="w-full h-full flex items-center justify-center overflow-hidden"
              />
            </div>

            {/* Status bar placed cleanly in a dedicated lower position below the stage */}
            <div className="w-full max-w-[480px] mt-3 px-3 py-1.5 bg-slate-900/90 rounded-lg border border-slate-800 flex items-center justify-between text-[11px] text-slate-400 shrink-0 select-none">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span>{isRunning ? 'Stage Running' : 'Stage Paused'}</span>
              </div>
              <div className="flex items-center gap-2">
                {thumbnailFeedback && (
                  <span className="text-emerald-400 font-semibold animate-in fade-in">
                    {thumbnailFeedback}
                  </span>
                )}
                <span className="text-slate-500">•</span>
                <span className="font-mono text-slate-400">JIT Optimized</span>
                <span className="text-slate-500">•</span>
                <span className="font-mono text-slate-500">480 × 360 px</span>
              </div>
            </div>
          </div>

          {/* Sprite Mini-Bar */}
          <div className={`p-3 border-t shrink-0 ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Sprites ({projectDetails?.sprites.length || 0})
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
              {projectDetails?.sprites.map((s, idx) => {
                const isSelected = idx === selectedSpriteIndex;
                const thumb = s.costumes[0]?.url;

                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedSpriteIndex(idx);
                      setSelectedCostumeIndex(0);
                    }}
                    className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border shrink-0 transition-all ${
                      isSelected
                        ? 'border-orange-500 bg-orange-500/15 ring-2 ring-orange-500/30'
                        : isDark ? 'border-slate-800 bg-slate-800/80 hover:border-slate-700' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center bg-black/40">
                      {thumb ? (
                        <img src={thumb} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400">{s.name[0]}</span>
                      )}
                    </div>
                    <span className="text-[10px] font-medium truncate max-w-[56px] text-center">
                      {s.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Center / Right Section: Editor Workbench Tabs */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Tab Navigation */}
          <div className={`h-11 border-b px-4 flex items-center justify-between shrink-0 select-none ${
            isDark ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white'
          }`}>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('code')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'code'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Code & Scripts</span>
                {selectedSprite && (
                  <span className="text-[10px] bg-black/20 px-1 rounded font-mono">
                    {selectedSprite.scripts.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('costumes')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'costumes'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Costumes</span>
                {selectedSprite && (
                  <span className="text-[10px] bg-black/20 px-1 rounded font-mono">
                    {selectedSprite.costumes.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('sounds')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'sounds'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>Sounds</span>
                {selectedSprite && (
                  <span className="text-[10px] bg-black/20 px-1 rounded font-mono">
                    {selectedSprite.sounds.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('data')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'data'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Variables & Data</span>
              </button>

              <button
                onClick={() => setActiveTab('turbowarp')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'turbowarp'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>TurboWarp Live Bridge</span>
              </button>
            </div>

            {/* Active Sprite Label */}
            {selectedSprite && (
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <span>Editing:</span>
                <span className={`font-semibold px-2 py-0.5 rounded-md border ${
                  isDark ? 'bg-slate-800 text-orange-400 border-slate-700' : 'bg-slate-100 text-orange-600 border-slate-200'
                }`}>
                  {selectedSprite.name}
                </span>
              </div>
            )}
          </div>

          {/* Workbench Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {/* TAB 1: CODE & SCRIPTS */}
            {activeTab === 'code' && selectedSprite && (
              <div className="space-y-4">
                {/* Sprite properties summary */}
                <div className={`p-3 rounded-xl border flex items-center justify-between gap-4 text-xs ${
                  isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-slate-500">X: </span>
                      <span className="font-mono font-semibold">{selectedSprite.x}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Y: </span>
                      <span className="font-mono font-semibold">{selectedSprite.y}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Size: </span>
                      <span className="font-mono font-semibold">{selectedSprite.size}%</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Direction: </span>
                      <span className="font-mono font-semibold">{selectedSprite.direction}°</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter blocks..."
                      value={blockSearch}
                      onChange={(e) => setBlockSearch(e.target.value)}
                      className={`text-xs px-2 py-1 rounded-md border outline-none ${
                        isDark ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                      }`}
                    />
                  </div>
                </div>

                {/* Scripts breakdown */}
                {selectedSprite.scripts.length === 0 ? (
                  <div className="text-center py-16 text-slate-500">
                    <Code2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-xs">No block scripts attached to this sprite.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {selectedSprite.scripts.map((script, sIdx) => {
                      const filteredBlocks = blockSearch
                        ? script.blocks.filter(b => b.label.toLowerCase().includes(blockSearch.toLowerCase()))
                        : script.blocks;

                      if (blockSearch && filteredBlocks.length === 0) return null;

                      return (
                        <div
                          key={sIdx}
                          className={`p-3.5 rounded-xl border flex flex-col gap-2 shadow-sm ${
                            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
                          }`}
                        >
                          {/* Hat header */}
                          <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                            <span className="text-[11px] font-bold text-amber-400 font-mono flex items-center gap-1.5">
                              <span>⚡</span>
                              <span>{script.hatLabel || 'Script'}</span>
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {script.blockCount} blocks
                            </span>
                          </div>

                          {/* Block stack */}
                          <div className="space-y-1.5 pt-1">
                            {filteredBlocks.map((blk, bIdx) => {
                              const colorClass = categoryColors[blk.category] || categoryColors.other;

                              return (
                                <div
                                  key={bIdx}
                                  className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-medium shadow-xs flex items-center justify-between ${colorClass}`}
                                >
                                  <span>{blk.label}</span>
                                  <span className="text-[9px] opacity-70 uppercase tracking-wider">{blk.category}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: COSTUMES */}
            {activeTab === 'costumes' && selectedSprite && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Costumes Gallery ({selectedSprite.costumes.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCostumeZoom(prev => Math.max(0.5, prev - 0.25))}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-mono">{Math.round(costumeZoom * 100)}%</span>
                    <button
                      onClick={() => setCostumeZoom(prev => Math.min(2.5, prev + 0.25))}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {selectedSprite.costumes.map((costume, cIdx) => (
                    <div
                      key={cIdx}
                      className={`p-3 rounded-xl border flex flex-col gap-2 ${
                        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="h-40 rounded-lg overflow-hidden bg-slate-950/80 flex items-center justify-center p-2 border border-slate-800/80">
                        {costume.url ? (
                          <img
                            src={costume.url}
                            alt={costume.name}
                            style={{ transform: `scale(${costumeZoom})` }}
                            className="max-h-full max-w-full object-contain transition-transform"
                          />
                        ) : (
                          <span className="text-xs text-slate-500">No Image</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{costume.name}</p>
                          <p className="text-[10px] text-slate-500 uppercase">{costume.dataFormat}</p>
                        </div>
                        {costume.url && (
                          <a
                            href={costume.url}
                            download={`${costume.name}.${costume.dataFormat}`}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                            title="Download Costume"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: SOUNDS */}
            {activeTab === 'sounds' && selectedSprite && (
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Audio & Sound Effects ({selectedSprite.sounds.length})
                </h3>

                {selectedSprite.sounds.length === 0 ? (
                  <div className="text-center py-16 text-slate-500">
                    <Music className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-xs">No sound assets attached to this sprite.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedSprite.sounds.map((sound, sIdx) => {
                      const isPlaying = playingSoundUrl === sound.url;

                      return (
                        <div
                          key={sIdx}
                          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <button
                              onClick={() => sound.url && handlePlaySound(sound.url)}
                              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                                isPlaying
                                  ? 'bg-orange-500 text-white'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                              }`}
                            >
                              {isPlaying ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                            </button>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">{sound.name}</p>
                              <p className="text-[10px] text-slate-500 font-mono">
                                {sound.durationSeconds ? `${sound.durationSeconds}s • ` : ''}
                                {sound.rate} Hz • {sound.dataFormat.toUpperCase()}
                              </p>
                            </div>
                          </div>

                          {sound.url && (
                            <a
                              href={sound.url}
                              download={`${sound.name}.${sound.dataFormat}`}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs shrink-0"
                              title="Download Sound File"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: VARIABLES & DATA */}
            {activeTab === 'data' && projectDetails && (
              <div className="space-y-6">
                {/* Global Variables */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Global Variables ({projectDetails.globalVariables.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {projectDetails.globalVariables.map((v, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                        }`}
                      >
                        <span className="font-semibold text-orange-400">{v.name}</span>
                        <span className="font-mono bg-black/30 px-2 py-0.5 rounded">{String(v.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Broadcast Messages */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Broadcast Messages ({projectDetails.broadcasts.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {projectDetails.broadcasts.map((b, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-mono font-medium"
                      >
                        📢 {b}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Extensions */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Extensions Detected ({projectDetails.extensions.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {projectDetails.extensions.map((ext, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-mono font-medium"
                      >
                        🧩 {ext}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: TURBOWARP LIVE BRIDGE */}
            {activeTab === 'turbowarp' && project && (
              <div className="space-y-4">
                <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-center justify-between gap-4 ${
                  isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <ExternalLink className="w-4 h-4 text-blue-400" />
                      <span>TurboWarp Web Editor Direct Transfer</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      The file <span className="font-mono text-orange-400 font-semibold">{project.fileName}</span> is ready. Click below to download and open TurboWarp in a new tab, where you can drag and drop it right into the editor!
                    </p>
                  </div>
                  <button
                    onClick={() => openProjectInEditorWithFile(project, 'https://turbowarp.org/editor')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shrink-0 shadow-md flex items-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download & Open in TurboWarp</span>
                  </button>
                </div>

                {/* Embedded TurboWarp Editor iframe */}
                <div className="rounded-xl overflow-hidden border border-slate-800 shadow-2xl h-[650px] bg-slate-950 flex flex-col">
                  <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-2 font-mono">
                      <span>TurboWarp Web Workspace</span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded font-semibold">Active</span>
                    </span>
                    <span className="text-[11px] text-slate-400">Tip: Drag your downloaded .sb3 file into the editor below</span>
                  </div>
                  <iframe
                    src="https://turbowarp.org/editor"
                    title="TurboWarp Editor"
                    className="w-full flex-1 border-0"
                    allow="autoplay; camera; microphone"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar: Notes & Metadata */}
        <aside className={`w-72 border-l p-4 flex flex-col gap-4 shrink-0 overflow-y-auto select-none ${
          isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
              Creator Notes & Instructions
            </label>
            <textarea
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleSave}
              placeholder="Add project rules, controls guide, or ideas..."
              className={`w-full border rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-orange-500 outline-none resize-none leading-relaxed ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            />
          </div>

          {/* Project Details */}
          <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5" /> File Size
              </span>
              <span className="font-mono">{(project.fileSize / 1024).toFixed(1)} KB</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 flex items-center gap-1.5">
                <FileCode2 className="w-3.5 h-3.5" /> Total Blocks
              </span>
              <span className="font-mono">{projectDetails?.totalBlockCount || project.stats.blockCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Sprites
              </span>
              <span className="font-mono">{project.stats.spriteCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Times Played
              </span>
              <span className="font-mono">{project.playCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Added
              </span>
              <span className="text-slate-400">{new Date(project.dateAdded).toLocaleDateString()}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
