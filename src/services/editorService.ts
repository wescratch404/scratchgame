import { Sb3Project } from '../types/scratch';
import { getProjectBlob } from './db';
import { embedThumbnailInSb3 } from './sb3Parser';

export interface EditorOption {
  id: 'turbowarp' | 'scratch' | 'penguinmod';
  name: string;
  url: string;
  description: string;
  badge?: string;
}

export const SCRATCH_EDITORS: EditorOption[] = [
  {
    id: 'turbowarp',
    name: 'TurboWarp Editor',
    url: 'https://turbowarp.org/editor',
    description: 'Fast Scratch compiler, dark mode, high framerates & custom extensions',
    badge: 'Recommended',
  },
  {
    id: 'scratch',
    name: 'MIT Scratch 3.0',
    url: 'https://scratch.mit.edu/projects/editor/',
    description: 'Official MIT Scratch web editor & creative coding environment',
  },
  {
    id: 'penguinmod',
    name: 'PenguinMod Editor',
    url: 'https://studio.penguinmod.com/editor.html',
    description: 'Enhanced Scratch mod with advanced blocks and custom stages',
  },
];

/**
 * Safely opens an editor URL in a new browser tab using an anchor element
 * to guarantee compatibility with iframe sandboxes and popup blockers.
 */
export function openEditorInNewTab(url: string = 'https://turbowarp.org/editor'): void {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Downloads a project's .sb3 file and opens the editor in a new browser tab,
 * making it effortless to drag and drop the file into the new editor window.
 */
export async function openProjectInEditorWithFile(
  project: Sb3Project,
  editorUrl: string = 'https://turbowarp.org/editor'
): Promise<void> {
  // First, initiate the .sb3 download if project exists
  try {
    const blobOrBuffer = await getProjectBlob(project.id);
    if (blobOrBuffer) {
      const embeddedBlob = await embedThumbnailInSb3(blobOrBuffer, project.thumbnailUrl);
      const blobUrl = URL.createObjectURL(embeddedBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      const cleanFileName = project.fileName.endsWith('.sb3') ? project.fileName : `${project.fileName}.sb3`;
      downloadLink.download = cleanFileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    }
  } catch (err) {
    console.warn('Could not auto-download project before opening editor:', err);
  }

  // Open the editor in a new tab
  openEditorInNewTab(editorUrl);
}

/**
 * Opens the dedicated Scratch SB3 Project Editor in a new browser tab with
 * the specified project file immediately loaded, running, and editable!
 */
export function openSb3ProjectInEditorTab(projectId: string): void {
  const url = `${window.location.origin}${window.location.pathname}?editor=${encodeURIComponent(projectId)}`;
  openEditorInNewTab(url);
}

