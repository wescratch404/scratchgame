/**
 * TurboWarp Scratch 3.0 Runtime Performance Optimizer
 * Configures JIT compiler, WebGL GPU acceleration, framerate, motion interpolation,
 * clone limits, and execution threads for maximum speed and responsiveness.
 */

export interface PerformanceProfile {
  id: 'high' | 'turbo' | 'smooth' | 'compat';
  name: string;
  description: string;
  framerate: number;
  interpolation: boolean;
  turboMode: boolean;
  compilerEnabled: boolean;
  disableWarpTimer: boolean;
  highClones: boolean;
  removeFencing: boolean;
  highQualityRender: boolean;
}

export const PERFORMANCE_PROFILES: Record<string, PerformanceProfile> = {
  high: {
    id: 'high',
    name: 'High Performance',
    description: '60 FPS, JIT fast compiler, motion interpolation & high clone limits',
    framerate: 60,
    interpolation: true,
    turboMode: false,
    compilerEnabled: true,
    disableWarpTimer: true,
    highClones: true,
    removeFencing: true,
    highQualityRender: false,
  },
  smooth: {
    id: 'smooth',
    name: 'Smooth Motion',
    description: '30 FPS game logic with monitor refresh rate interpolation (ideal for standard games)',
    framerate: 30,
    interpolation: true,
    turboMode: false,
    compilerEnabled: true,
    disableWarpTimer: true,
    highClones: false,
    removeFencing: false,
    highQualityRender: false,
  },
  turbo: {
    id: 'turbo',
    name: 'Maximum Turbo',
    description: 'Uncapped speed for 3D engines, raytracers, mathematical simulations & sorting algorithms',
    framerate: 60,
    interpolation: false,
    turboMode: true,
    compilerEnabled: true,
    disableWarpTimer: true,
    highClones: true,
    removeFencing: true,
    highQualityRender: false,
  },
  compat: {
    id: 'compat',
    name: 'Scratch 3.0 Strict',
    description: 'Legacy 30 FPS timing with standard 300 clone limits and stage fencing',
    framerate: 30,
    interpolation: false,
    turboMode: false,
    compilerEnabled: true,
    disableWarpTimer: false,
    highClones: false,
    removeFencing: false,
    highQualityRender: false,
  },
};

/**
 * Applies performance optimizations to a running TurboWarp Scaffolding instance.
 */
export function applyPerformanceOptimizations(sc: any, config: Partial<PerformanceProfile>): void {
  if (!sc) return;

  try {
    const vm = sc.vm;
    const runtime = vm?.runtime;

    // 1. Optimize WebGL GPU Renderer Settings
    if (sc.renderer) {
      try {
        if (typeof sc.renderer.setUseHighQualityRender === 'function') {
          sc.renderer.setUseHighQualityRender(config.highQualityRender ?? false);
        }
      } catch (err) {
        console.warn('Renderer optimization note:', err);
      }
    }

    if (!runtime) return;

    // 2. Framerate configuration (30 vs 60 FPS)
    const targetFps = config.framerate ?? 60;
    if (typeof runtime.setFramerate === 'function') {
      runtime.setFramerate(targetFps);
    } else if (typeof vm.setFramerate === 'function') {
      vm.setFramerate(targetFps);
    }

    // 3. Motion Interpolation (Smooth 60+ FPS motion without altering project clocks)
    const interpolation = config.interpolation ?? true;
    if (typeof runtime.setInterpolation === 'function') {
      runtime.setInterpolation(interpolation);
    } else if (typeof vm.setInterpolation === 'function') {
      vm.setInterpolation(interpolation);
    }

    // 4. Turbo Mode
    const turbo = config.turboMode ?? false;
    if (typeof runtime.setTurboMode === 'function') {
      runtime.setTurboMode(turbo);
    } else if (typeof vm.setTurboMode === 'function') {
      vm.setTurboMode(turbo);
    }

    // 5. JIT Fast Compiler (Remove warp timer loop-overhead for 10x-100x faster loop execution)
    if (typeof runtime.setCompilerOptions === 'function') {
      runtime.setCompilerOptions({
        enabled: config.compilerEnabled ?? true,
        warpTimer: !(config.disableWarpTimer ?? true),
      });
    }

    // 6. Runtime Limits (Clones, Stage Fencing, Miscellaneous Limits)
    if (typeof runtime.setRuntimeOptions === 'function') {
      const maxClones = config.highClones ? 10000 : 300;
      const fencing = !(config.removeFencing ?? true);
      runtime.setRuntimeOptions({
        maxClones,
        fencing,
        miscLimits: false,
      });
    }

    // 7. Ensure Audio Context is active and unmuted
    if (runtime.audioEngine && runtime.audioEngine.audioContext) {
      if (runtime.audioEngine.audioContext.state === 'suspended') {
        runtime.audioEngine.audioContext.resume().catch(() => {});
      }
    }
  } catch (err) {
    console.error('Error applying runtime optimizations:', err);
  }
}

/**
 * Creates a lightweight real-time FPS and execution monitor for the stage
 */
export function createPerformanceMonitor(
  onUpdate: (stats: { fps: number; stepTimeMs: number; cloneCount: number }) => void
): { stop: () => void } {
  let isRunning = true;
  let frameCount = 0;
  let lastTime = performance.now();
  let rafId: number;

  const loop = (now: number) => {
    if (!isRunning) return;

    frameCount++;
    const delta = now - lastTime;

    if (delta >= 500) {
      const fps = Math.round((frameCount * 1000) / delta);
      frameCount = 0;
      lastTime = now;
      onUpdate({
        fps,
        stepTimeMs: Math.round((1000 / (fps || 30)) * 10) / 10,
        cloneCount: 0,
      });
    }

    rafId = requestAnimationFrame(loop);
  };

  rafId = requestAnimationFrame(loop);

  return {
    stop: () => {
      isRunning = false;
      cancelAnimationFrame(rafId);
    },
  };
}
