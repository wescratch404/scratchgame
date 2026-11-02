import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sb3Project } from '../types/scratch';
import { getProjectBlob } from '../services/db';
import { openEditorInNewTab, openProjectInEditorWithFile, openSb3ProjectInEditorTab } from '../services/editorService';
import {
  Play,
  Square,
  Maximize2,
  Minimize2,
  ExternalLink,
  Download,
  X,
  Gauge,
  Zap,
  Layers,
  Code,
  Music,
  FileCode2,
  AlertCircle,
  RotateCw,
  Sparkles,
  Camera,
  Image as ImageIcon,
  Check,
  ChevronDown
} from 'lucide-react';

interface PlayerModalProps {
  project: Sb3Project | null;
  onClose: () => void;
  onProjectPlayed?: (id: string) => void;
  onUpdateThumbnail?: (id: string, newThumbnailUrl: string) => void;
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
    // Check if script element is already in the document
    const existing = document.querySelector('script[src*="scaffolding"]');
    if (existing) {
      if (window.Scaffolding) {
        resolve(window.Scaffolding);
        return;
      }
      existing.addEventListener('load', () => resolve(window.Scaffolding));
      existing.addEventListener('error', (err) => reject(err));
      // Polling fallback
      let attempts = 0;
      const interval = setInterval(() => {
        if (window.Scaffolding) {
          clearInterval(interval);
          resolve(window.Scaffolding);
        } else if (++attempts > 50) {
          clearInterval(interval);
          reject(new Error('Timeout loading TurboWarp Scaffolding engine'));
        }
      }, 100);
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
    script.onerror = () => reject(new Error('Failed to load TurboWarp runtime script from CDN'));
    document.head.appendChild(script);
  });
}

export const PlayerModal: React.FC<PlayerModalProps> = ({ project, onClose, onProjectPlayed, onUpdateThumbnail }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [turboMode, setTurboMode] = useState(false);
  const [fps60, setFps60] = useState(false); // Default to standard 30 FPS
  const [interpolation, setInterpolation] = useState(true); // Smooth sub-frame motion interpolation
  const [activeTab, setActiveTab] = useState<'player' | 'inspect'>('player');
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState('Loading Scratch project...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showThumbnailMenu, setShowThumbnailMenu] = useState(false);
  const [showEditorMenu, setShowEditorMenu] = useState(false);
  const [thumbnailFeedback, setThumbnailFeedback] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageWrapperRef = useRef<HTMLDivElement>(null);
  const scaffoldingInstanceRef = useRef<any>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  // Capture current running stage canvas as thumbnail
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

      // 1. Try Scaffolding renderer snapshot callback first (captures exact WebGL render buffer)
      if (sc.renderer && typeof sc.renderer.requestSnapshot === 'function') {
        dataUrl = await new Promise<string>((resolve) => {
          let resolved = false;
          sc.renderer.requestSnapshot((url: string) => {
            if (!resolved) {
              resolved = true;
              resolve(url);
            }
          });
          // Request a redraw frame immediately so the snapshot callback executes without waiting
          if (sc.vm?.runtime?.requestRedraw) {
            sc.vm.runtime.requestRedraw();
          }
          // Safety timeout in case engine is paused
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              resolve('');
            }
          }, 350);
        });
      }

      // 2. Fallback to direct canvas capture
      if (!dataUrl || dataUrl.length < 50) {
        const canvas = sc._canvas || stageWrapperRef.current?.querySelector('canvas');
        if (canvas) {
          dataUrl = canvas.toDataURL('image/png');
        }
      }

      if (dataUrl && dataUrl.length > 50) {
        if (onUpdateThumbnail) {
          onUpdateThumbnail(project.id, dataUrl);
        }
        setThumbnailFeedback('Thumbnail set from stage!');
        setTimeout(() => setThumbnailFeedback(null), 3000);
      } else {
        throw new Error('Unable to extract image from stage canvas');
      }
    } catch (err) {
      console.error('Failed to capture thumbnail:', err);
      setThumbnailFeedback('Capture failed');
      setTimeout(() => setThumbnailFeedback(null), 3000);
    }
  }, [project, onUpdateThumbnail]);

  const handleCustomImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !project) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl && onUpdateThumbnail) {
        onUpdateThumbnail(project.id, dataUrl);
        setThumbnailFeedback('Custom thumbnail set!');
        setTimeout(() => setThumbnailFeedback(null), 3000);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Initialize and run the TurboWarp Scaffolding sandbox engine
  const startPlayer = useCallback(async () => {
    if (!project) return;

    setLoading(true);
    setErrorMessage(null);
    setLoadingStage('Initializing TurboWarp sandbox runtime...');

    try {
      // 1. Fetch project binary
      setLoadingStage('Reading SB3 project data from local storage...');
      const blobOrBuf = await getProjectBlob(project.id);
      if (!blobOrBuf) {
        throw new Error('Project SB3 file data could not be found in local storage.');
      }

      let arrayBuffer: ArrayBuffer;
      if (blobOrBuf instanceof Blob) {
        arrayBuffer = await blobOrBuf.arrayBuffer();
      } else {
        arrayBuffer = blobOrBuf;
      }

      // 2. Ensure Scaffolding is loaded
      setLoadingStage('Starting TurboWarp Scratch compiler...');
      const ScaffoldingLib = await ensureScaffoldingLoaded();

      // 3. Clean up any previous runner instance
      if (scaffoldingInstanceRef.current) {
        try {
          scaffoldingInstanceRef.current.stopAll();
        } catch {}
        scaffoldingInstanceRef.current = null;
      }

      if (stageWrapperRef.current) {
        stageWrapperRef.current.innerHTML = '';
      }

      // 4. Instantiate Scaffolding
      const sc = new ScaffoldingLib.Scaffolding();
      sc.width = 480;
      sc.height = 360;
      sc.resizeMode = 'preserve-ratio';
      sc.editableLists = false;

      // Add asset fallback store from Scratch CDN for any unbundled assets
      if (sc.storage && sc.storage.addWebStore) {
        try {
          const types = [
            sc.storage.AssetType?.ImageVector,
            sc.storage.AssetType?.ImageBitmap,
            sc.storage.AssetType?.Sound,
          ].filter(Boolean);
          sc.storage.addWebStore(
            types,
            (asset: any) => `https://assets.scratch.mit.edu/internalapi/asset/${asset.assetId}.${asset.dataFormat}/get/`
          );
        } catch (e) {
          console.warn('Optional storage webStore setup:', e);
        }
      }

      sc.setup();

      if (stageWrapperRef.current) {
        sc.appendTo(stageWrapperRef.current);
      }

      // 5. Load project ArrayBuffer
      setLoadingStage('Compiling Scratch blocks with TurboWarp JIT optimizer...');
      await sc.loadProject(arrayBuffer);

      // 6. High-Performance VM compiler and execution tuning
      if (sc.vm) {
        // Enable TurboWarp JIT Compiler with warpTimer disabled for maximum loop speed
        if (typeof sc.vm.setCompilerOptions === 'function') {
          sc.vm.setCompilerOptions({
            enabled: true,
            warpTimer: false
          });
        }
        if (sc.vm.runtime) {
          if (typeof sc.vm.runtime.setCompatibilityMode === 'function') {
            sc.vm.runtime.setCompatibilityMode(false); // Eliminate legacy Scratch 2 throttling
          }
          if (typeof sc.vm.runtime.setCompilerOptions === 'function') {
            sc.vm.runtime.setCompilerOptions({
              enabled: true,
              warpTimer: false
            });
          }
        }
        if (sc.vm.setFramerate) sc.vm.setFramerate(fps60 ? 60 : 30);
        if (sc.vm.setTurboMode) sc.vm.setTurboMode(turboMode);
        if (sc.vm.setInterpolation) sc.vm.setInterpolation(interpolation);
      }

      // 7. Start execution!
      sc.greenFlag();
      scaffoldingInstanceRef.current = sc;
      setIsRunning(true);
      setLoading(false);

      if (onProjectPlayed) {
        onProjectPlayed(project.id);
      }
    } catch (err) {
      console.error('TurboWarp player error:', err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, [project, fps60, turboMode, interpolation, onProjectPlayed]);

  useEffect(() => {
    setFps60(false); // Reset to default 30 FPS for each project run
    setTurboMode(false);
    startPlayer();

    return () => {
      if (scaffoldingInstanceRef.current) {
        try {
          scaffoldingInstanceRef.current.stopAll();
        } catch {}
        scaffoldingInstanceRef.current = null;
      }
    };
  }, [project?.id]);

  // Handle Fullscreen & resize relayout
  useEffect(() => {
    const handleResize = () => {
      if (scaffoldingInstanceRef.current && scaffoldingInstanceRef.current.relayout) {
        scaffoldingInstanceRef.current.relayout();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isFullscreen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, onClose]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
        setTimeout(() => {
          if (scaffoldingInstanceRef.current?.relayout) scaffoldingInstanceRef.current.relayout();
        }, 100);
      }).catch(() => {});
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
        setTimeout(() => {
          if (scaffoldingInstanceRef.current?.relayout) scaffoldingInstanceRef.current.relayout();
        }, 100);
      }).catch(() => {});
    }
  };

  const handleDownload = () => {
    if (!project) return;
    getProjectBlob(project.id).then((blobOrBuffer) => {
      if (!blobOrBuffer) return;
      const b = blobOrBuffer instanceof Blob ? blobOrBuffer : new Blob([blobOrBuffer]);
      const url = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = url;
      a.download = project.fileName.endsWith('.sb3') ? project.fileName : `${project.fileName}.sb3`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleOpenExternal = (url?: string | React.MouseEvent) => {
    const targetUrl = typeof url === 'string' ? url : 'https://turbowarp.org/editor';
    openEditorInNewTab(targetUrl);
  };

  const triggerGreenFlag = () => {
    if (scaffoldingInstanceRef.current) {
      scaffoldingInstanceRef.current.greenFlag();
      setIsRunning(true);
    } else {
      startPlayer();
    }
  };

  const triggerStop = () => {
    if (scaffoldingInstanceRef.current) {
      scaffoldingInstanceRef.current.stopAll();
      setIsRunning(false);
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

  if (!project) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150 select-none">
      <div
        ref={containerRef}
        className={`relative flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden w-full max-w-5xl transition-all duration-200 ${
          isFullscreen ? 'h-full w-full rounded-none border-none' : 'max-h-[94vh] h-[750px]'
        }`}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950/90 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-orange-500/20 text-orange-400 font-bold text-xs border border-orange-500/30 shrink-0">
              SB3
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white truncate max-w-md">
                {project.title}
              </h2>
              <p className="text-xs text-slate-400 truncate flex items-center gap-2">
                <span>{project.fileName}</span>
                <span>•</span>
                <span>{(project.fileSize / 1024).toFixed(1)} KB</span>
                <span>•</span>
                <span className="text-emerald-400 font-mono">TurboWarp Native Sandbox</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Tab Switcher */}
            <div className="flex items-center bg-slate-800/80 rounded-lg p-0.5 border border-slate-700 text-xs">
              <button
                onClick={() => setActiveTab('player')}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeTab === 'player'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                TurboWarp Stage
              </button>
              <button
                onClick={() => setActiveTab('inspect')}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeTab === 'inspect'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Inspect Code
              </button>
            </div>

            <button
              onClick={handleDownload}
              title="Download .sb3 file"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Open SB3 Editor Button & Dropdown */}
            <div className="relative flex items-center">
              <div className="flex items-center rounded-lg bg-slate-800 border border-slate-700 p-0.5 shadow-sm">
                <button
                  onClick={() => openSb3ProjectInEditorTab(project.id)}
                  title="Open this SB3 project in dedicated editor in a new browser tab"
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                  <span className="hidden sm:inline">Open Editor</span>
                </button>
                <button
                  onClick={() => setShowEditorMenu(!showEditorMenu)}
                  title="More editor options (Scratch 3, TurboWarp Web, PenguinMod)"
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors border-l border-slate-700/60 ml-0.5"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              {/* Editor Options Dropdown */}
              {showEditorMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 z-40 text-xs animate-in fade-in">
                  <div className="px-3 py-1.5 text-[10px] uppercase font-semibold text-slate-400 border-b border-slate-800">
                    Open Scratch Editor in New Tab
                  </div>

                  <button
                    onClick={() => {
                      setShowEditorMenu(false);
                      openSb3ProjectInEditorTab(project.id);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-800 text-slate-200 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-white flex items-center gap-1.5">
                        <span>SB3 Project Editor</span>
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded font-mono">Loaded File</span>
                      </div>
                      <div className="text-[10px] text-slate-400">Opens current project loaded in new tab</div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500 shrink-0 ml-2" />
                  </button>

                  {project && (
                    <button
                      onClick={() => {
                        setShowEditorMenu(false);
                        openProjectInEditorWithFile(project, 'https://turbowarp.org/editor');
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-800 text-slate-200 flex items-center justify-between border-t border-slate-800/60"
                    >
                      <div>
                        <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                          <Download className="w-3 h-3" />
                          <span>Download & Open TurboWarp</span>
                        </div>
                        <div className="text-[10px] text-slate-400">Downloads file to drop directly into editor</div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500 shrink-0 ml-2" />
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setShowEditorMenu(false);
                      handleOpenExternal('https://scratch.mit.edu/projects/editor/');
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-800 text-slate-200 flex items-center justify-between border-t border-slate-800/60"
                  >
                    <div>
                      <div className="font-semibold text-white">MIT Scratch 3.0</div>
                      <div className="text-[10px] text-slate-400">Official Scratch web editor</div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500 shrink-0 ml-2" />
                  </button>

                  <button
                    onClick={() => {
                      setShowEditorMenu(false);
                      handleOpenExternal('https://studio.penguinmod.com/editor.html');
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-800 text-slate-200 flex items-center justify-between border-t border-slate-800/60"
                  >
                    <div>
                      <div className="font-semibold text-white">PenguinMod Editor</div>
                      <div className="text-[10px] text-slate-400">Custom blocks & advanced mod editor</div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500 shrink-0 ml-2" />
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              title="Close Player"
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Player Controls Bar */}
        {activeTab === 'player' && (
          <div className="flex items-center justify-between px-5 py-2.5 bg-slate-900 border-b border-slate-800 text-sm shrink-0">
            {/* Green Flag & Stop Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={triggerGreenFlag}
                title="Green Flag (Start Scratch Project)"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold rounded-lg text-xs shadow-sm transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Green Flag</span>
              </button>

              <button
                onClick={triggerStop}
                title="Stop Project"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-semibold rounded-lg text-xs shadow-sm transition-all"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop</span>
              </button>

              <button
                onClick={startPlayer}
                title="Restart & Reload Engine"
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>

              <div className="h-4 w-[1px] bg-slate-700 mx-2" />

              {/* Status indicator */}
              <div className="flex items-center gap-2 text-xs">
                <span className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span className="text-slate-300 font-medium">{isRunning ? 'Running' : 'Stopped'}</span>
              </div>

              <div className="h-4 w-[1px] bg-slate-700 mx-2" />

              {/* Set Thumbnail Button */}
              <div className="relative flex items-center">
                <input
                  ref={thumbnailInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCustomImageUpload}
                />

                <div className="flex items-center rounded-lg bg-slate-800 border border-slate-700 p-0.5 shadow-sm">
                  <button
                    onClick={handleCaptureThumbnail}
                    title="Capture current running stage frame as project thumbnail"
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5 text-orange-400" />
                    <span>Set Thumbnail</span>
                  </button>
                  <button
                    onClick={() => setShowThumbnailMenu(!showThumbnailMenu)}
                    title="More thumbnail options"
                    className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors border-l border-slate-700/60 ml-0.5"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>

                {/* Dropdown Options */}
                {showThumbnailMenu && (
                  <div className="absolute left-0 top-full mt-1.5 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 z-30 text-xs animate-in fade-in">
                    <button
                      onClick={() => {
                        setShowThumbnailMenu(false);
                        handleCaptureThumbnail();
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-800 text-slate-200 flex items-center gap-2.5"
                    >
                      <Camera className="w-4 h-4 text-orange-400 shrink-0" />
                      <div>
                        <div className="font-semibold text-white">Capture Stage Frame</div>
                        <div className="text-[10px] text-slate-400">Snapshot running game screen</div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setShowThumbnailMenu(false);
                        thumbnailInputRef.current?.click();
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-800 text-slate-200 flex items-center gap-2.5"
                    >
                      <ImageIcon className="w-4 h-4 text-blue-400 shrink-0" />
                      <div>
                        <div className="font-semibold text-white">Upload Custom Image</div>
                        <div className="text-[10px] text-slate-400">PNG, JPG, SVG, WebP file</div>
                      </div>
                    </button>
                  </div>
                )}

                {/* Feedback confirmation badge */}
                {thumbnailFeedback && (
                  <span className="ml-2 px-2.5 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-700/80 text-emerald-300 font-medium text-[11px] flex items-center gap-1.5 animate-in fade-in">
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>{thumbnailFeedback}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Performance Controls & Quick Editor */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleFps}
                title="Toggle Framerate: 30 FPS (Scratch Standard) / 60 FPS (Enhanced)"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-colors border ${
                  fps60
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold shadow-xs'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                }`}
              >
                <Gauge className="w-3 h-3" />
                <span>{fps60 ? '60 FPS' : '30 FPS'}</span>
              </button>

              <button
                onClick={toggleTurbo}
                title="Toggle Turbo Mode (runs blocks without screen refresh delays)"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                  turboMode
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/30 font-semibold'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                <Zap className="w-3 h-3" />
                <span>Turbo {turboMode ? 'ON' : 'OFF'}</span>
              </button>

              <button
                onClick={toggleInterpolation}
                title="Toggle Smooth Motion (sub-frame sprite interpolation for 60+ Hz displays)"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                  interpolation
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-semibold shadow-xs'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                <Sparkles className="w-3 h-3 text-cyan-400" />
                <span>Smooth {interpolation ? 'ON' : 'OFF'}</span>
              </button>

              <div className="h-4 w-[1px] bg-slate-700 mx-1 hidden sm:block" />

              <button
                onClick={() => openSb3ProjectInEditorTab(project.id)}
                title="Open current SB3 project loaded in dedicated editor in a new browser tab"
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-xs transition-all"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Open in Editor</span>
              </button>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden bg-slate-950 relative min-h-0">
          {activeTab === 'player' ? (
            <div className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-hidden relative">
              {/* Loading State */}
              {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 z-20 gap-3">
                  <div className="w-12 h-12 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-slate-200 font-medium">{loadingStage}</p>
                  <p className="text-xs text-slate-500">Compiling Scratch 3.0 blocks into TurboWarp runtime...</p>
                </div>
              )}

              {/* Error State */}
              {errorMessage && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 z-20 p-6 text-center max-w-lg mx-auto">
                  <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center mb-3">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold text-white mb-1">Sandbox Execution Notice</h3>
                  <p className="text-xs text-red-300 mb-4 bg-red-950/50 p-3 rounded-lg border border-red-800 font-mono text-left max-h-32 overflow-y-auto">
                    {errorMessage}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={startPlayer}
                      className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Retry Sandbox</span>
                    </button>
                    <button
                      onClick={handleDownload}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download .sb3</span>
                    </button>
                    <button
                      onClick={() => openSb3ProjectInEditorTab(project.id)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open in SB3 Editor (New Tab)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* The Native Scratch Stage Canvas Container (TurboWarp Scaffolding) */}
              <div
                className="relative w-full h-full max-w-[854px] max-h-[580px] aspect-[4/3] bg-black rounded-xl overflow-hidden shadow-2xl border border-slate-800 flex items-center justify-center min-h-0 [transform:translateZ(0)]"
              >
                {/* Scaffolding appends its canvas and monitor layers here */}
                <div
                  ref={stageWrapperRef}
                  className="w-full h-full flex items-center justify-center overflow-hidden"
                />
              </div>
            </div>
          ) : (
            /* Inspect Project Code & Metadata view */
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
                  <div className="p-3 bg-blue-500/20 text-blue-400 rounded-lg">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{project.stats.spriteCount}</div>
                    <div className="text-xs text-slate-400">Total Sprites</div>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
                  <div className="p-3 bg-purple-500/20 text-purple-400 rounded-lg">
                    <Code className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{project.stats.blockCount}</div>
                    <div className="text-xs text-slate-400">Total Blocks</div>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
                  <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-lg">
                    <Music className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{project.stats.costumeCount + project.stats.soundCount}</div>
                    <div className="text-xs text-slate-400">Costumes & Sounds</div>
                  </div>
                </div>
              </div>

              {/* Sprites Breakdown */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-orange-400" />
                  Sprites in this Project ({project.stats.spriteNames.length})
                </h3>
                {project.stats.spriteNames.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {project.stats.spriteNames.map((name, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-slate-200 rounded-lg text-xs border border-slate-700"
                      >
                        <FileCode2 className="w-3.5 h-3.5 text-orange-400" />
                        {name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Stage only (no sprites)</p>
                )}
              </div>

              {/* Extensions */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Scratch Extensions Used
                </h3>
                {project.stats.extensions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {project.stats.extensions.map((ext, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wide"
                      >
                        {ext}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No external extensions required (Pure Scratch 3.0 blocks)</p>
                )}
              </div>

              {/* Variable and Lists info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Variables</h4>
                  <div className="text-xl font-bold text-white">{project.stats.variableCount}</div>
                  {project.stats.hasCloudVars && (
                    <span className="inline-block mt-1 text-[11px] text-cyan-400 font-medium">☁ Cloud Variables Enabled</span>
                  )}
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Lists</h4>
                  <div className="text-xl font-bold text-white">{project.stats.listCount}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Dedicated Lower Status Bar (Positioned cleanly at the modal bottom to avoid overlapping with stage) */}
        {activeTab === 'player' && (
          <footer className="px-5 py-2.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs shrink-0 select-none z-20">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse shadow-xs shadow-emerald-500/50' : 'bg-slate-500'}`} />
                <span className="text-slate-200 font-semibold text-xs">
                  {isRunning ? 'Runtime Running' : 'Runtime Stopped'}
                </span>
              </span>
              <span className="text-slate-700 hidden sm:inline">|</span>
              <span className="text-slate-400 text-xs hidden sm:flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>TurboWarp Compiler:</span>
                <span className="text-emerald-400 font-semibold">Active & Optimized</span>
              </span>
              <span className="text-slate-700 hidden md:inline">|</span>
              <span className="text-slate-400 text-xs font-mono hidden md:inline">
                {project.stats.blockCount.toLocaleString()} blocks • {project.stats.spriteCount} sprites
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold border ${
                fps60
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              }`}>
                {fps60 ? '⚡ 60 FPS' : '30 FPS'}
              </span>
              {turboMode && (
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  ⚡ Turbo
                </span>
              )}
              {interpolation && (
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  ✨ Smooth
                </span>
              )}
              <span className="text-slate-500 font-mono text-[11px] hidden sm:inline">480 × 360 px</span>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
};
