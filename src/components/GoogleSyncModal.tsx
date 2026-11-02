import React, { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { Sb3Project, Sb3Folder } from '../types/scratch';
import { getProjectBlob, saveProject, saveProjectsBulk, saveFoldersBulk } from '../services/db';
import { clearCachedAccessToken } from '../services/googleAuth';
import {
  findOrCreateLibraryFolder,
  uploadProjectToDrive,
  uploadProjectToDriveWithFolder,
  listAllDriveSb3ProjectsAndFolders,
  listDriveSb3Projects,
  downloadDriveSb3File,
  deleteDriveFile,
  resolveLocalFolderHierarchyFromPath,
  replicateDriveFolderStructure,
  getFolderHierarchyPath,
  runWithConcurrency,
  preResolveDriveFolderHierarchy,
  DriveFileInfo
} from '../services/googleDrive';
import { parseSb3File } from '../services/sb3Parser';
import {
  Cloud,
  CloudUpload,
  CloudDownload,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  Trash2,
  RefreshCw,
  LogOut,
  Folder,
  FileCode2,
  HardDrive,
  KeyRound,
  Zap,
  Gauge,
  Clock,
  Sparkles
} from 'lucide-react';

interface GoogleSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  accessToken: string | null;
  onLogin: () => Promise<string | null>;
  onLogout: () => Promise<void>;
  localProjects: Sb3Project[];
  onLocalProjectsUpdated: (updated: Sb3Project[]) => void;
  folders: Sb3Folder[];
  onFoldersUpdated?: (folders: Sb3Folder[]) => void;
  autoStartPull?: boolean;
}

export const GoogleSyncModal: React.FC<GoogleSyncModalProps> = ({
  isOpen,
  onClose,
  user,
  accessToken,
  onLogin,
  onLogout,
  localProjects,
  onLocalProjectsUpdated,
  folders,
  onFoldersUpdated,
  autoStartPull = false,
}) => {
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFileInfo[]>([]);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [syncStatusDetail, setSyncStatusDetail] = useState<string | null>(null);
  const [forceFullSync, setForceFullSync] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [deleteConfirmFile, setDeleteConfirmFile] = useState<DriveFileInfo | null>(null);
  const [hasAutoPulled, setHasAutoPulled] = useState(false);

  const fetchDriveFiles = useCallback(async (token: string) => {
    setLoadingDrive(true);
    setStatusMessage(null);
    try {
      const folderId = await findOrCreateLibraryFolder(token);
      setDriveFolderId(folderId);
      const files = await listDriveSb3Projects(token, folderId);
      setDriveFiles(files);
    } catch (err: any) {
      console.error('Drive load error:', err);
      if (err?.message?.includes('401') || err?.message?.toLowerCase().includes('unauthorized')) {
        clearCachedAccessToken();
        setStatusMessage({
          text: 'Google Drive authorization expired. Please click "Authorize Drive" to reconnect.',
          type: 'error'
        });
      } else {
        setStatusMessage({ text: err.message || 'Failed to connect to Google Drive.', type: 'error' });
      }
    } finally {
      setLoadingDrive(false);
    }
  }, []);

  // Load Drive files when modal is open and authenticated
  useEffect(() => {
    if (!isOpen || !accessToken) return;
    fetchDriveFiles(accessToken);
  }, [isOpen, accessToken, fetchDriveFiles]);

  // Reset auto pull state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setHasAutoPulled(false);
    }
  }, [isOpen]);

  // Trigger auto pull if requested
  useEffect(() => {
    if (isOpen && autoStartPull && !hasAutoPulled && !syncingAll) {
      setHasAutoPulled(true);
      handlePullFromDrive();
    }
  }, [isOpen, autoStartPull, hasAutoPulled, syncingAll]);

  if (!isOpen) return null;

  // Helper to ensure an active access token
  const getValidToken = async (): Promise<string | null> => {
    if (accessToken) return accessToken;
    try {
      const token = await onLogin();
      if (token) {
        fetchDriveFiles(token);
      }
      return token;
    } catch (err: any) {
      setStatusMessage({ text: 'Google Sign-in was cancelled or failed.', type: 'error' });
      return null;
    }
  };

  // High-Speed Sync all local projects to Google Drive
  const handleSyncAllToDrive = async () => {
    setSyncingAll(true);
    setStatusMessage(null);
    setSyncStatusDetail('Analyzing library & preparing parallel streams...');
    const startTime = performance.now();

    const token = await getValidToken();
    if (!token) {
      setSyncingAll(false);
      setSyncStatusDetail(null);
      return;
    }

    try {
      const folderId = driveFolderId || await findOrCreateLibraryFolder(token);
      setDriveFolderId(folderId);

      // 1. High-speed single-pass discovery of remote files and folders
      setSyncStatusDetail('Indexing Google Drive folder structure...');
      const { files: remoteFiles, folders: remoteFolders } =
        await listAllDriveSb3ProjectsAndFolders(token, folderId);
      setDriveFiles(remoteFiles);

      // Index remote files for O(1) matching
      const remoteFileById = new Map<string, DriveFileInfo>();
      const remoteFileByKey = new Map<string, DriveFileInfo>();
      for (const rf of remoteFiles) {
        remoteFileById.set(rf.id, rf);
        const key = `${(rf.folderPath || '').trim().toLowerCase()}:::${rf.name.trim().toLowerCase()}`;
        remoteFileByKey.set(key, rf);
      }

      // 2. Pre-resolve all folder hierarchy paths needed by all local projects in advance
      setSyncStatusDetail('Pre-resolving folder tree hierarchy in Google Drive...');
      const allNeededFolderPaths = localProjects.map(p => {
        const { path } = getFolderHierarchyPath(p.folderId, folders);
        return path;
      });
      const resolvedFolderMap = await preResolveDriveFolderHierarchy(
        token,
        folderId,
        allNeededFolderPaths,
        remoteFolders
      );

      // 3. Diff analysis: Partition projects into needsUpload vs alreadyUpToDate
      interface ProjectSyncTask {
        project: Sb3Project;
        targetFolderId: string;
        folderPath: string;
        knownFileId: string | null;
      }

      const tasksToUpload: ProjectSyncTask[] = [];
      let skippedCount = 0;
      const updatedProjects: Sb3Project[] = [...localProjects];

      for (let i = 0; i < localProjects.length; i++) {
        const proj = localProjects[i];
        const { path } = getFolderHierarchyPath(proj.folderId, folders);
        const targetFolderId = resolvedFolderMap.get(path.toLowerCase()) || folderId;

        // Check if remote file exists
        let matchedRemote: DriveFileInfo | undefined = undefined;
        if (proj.driveFileId && remoteFileById.has(proj.driveFileId)) {
          matchedRemote = remoteFileById.get(proj.driveFileId);
        } else {
          const matchKey = `${path.toLowerCase()}:::${proj.fileName.toLowerCase()}`;
          matchedRemote = remoteFileByKey.get(matchKey);
        }

        // Fast Incremental check:
        // Skip upload if remote file exists, has been synced, was not modified since, and folder path is identical
        const isUpToDate =
          !forceFullSync &&
          matchedRemote &&
          Boolean(proj.driveFileId) &&
          Boolean(proj.driveSyncedAt) &&
          (proj.dateModified || 0) <= (proj.driveSyncedAt || 0) &&
          (matchedRemote.folderPath || '').toLowerCase() === path.toLowerCase();

        if (isUpToDate) {
          skippedCount++;
        } else {
          tasksToUpload.push({
            project: proj,
            targetFolderId,
            folderPath: path,
            knownFileId: matchedRemote?.id || proj.driveFileId || null,
          });
        }
      }

      setSyncProgress({ current: 0, total: tasksToUpload.length });

      if (tasksToUpload.length === 0) {
        const durationSec = ((performance.now() - startTime) / 1000).toFixed(1);
        setStatusMessage({
          text: `Everything is already up-to-date! All ${localProjects.length} Scratch projects match Google Drive (checked in ${durationSec}s).`,
          type: 'info',
        });
        setSyncingAll(false);
        setSyncStatusDetail(null);
        return;
      }

      // 4. Parallel Uploads using runWithConcurrency (4 concurrent streams)
      setSyncStatusDetail(`Uploading ${tasksToUpload.length} project(s) via 4 parallel streams...`);
      const uploadResults = await runWithConcurrency(
        tasksToUpload,
        4,
        async (task) => {
          const blobOrBuf = await getProjectBlob(task.project.id);
          if (!blobOrBuf) {
            throw new Error(`Local file data missing for ${task.project.fileName}`);
          }

          const res = await uploadProjectToDrive(
            token,
            task.targetFolderId,
            task.project,
            blobOrBuf,
            task.folderPath,
            task.knownFileId
          );
          return { projectId: task.project.id, fileId: res.fileId };
        },
        (completed, total, task) => {
          setSyncProgress({ current: completed, total });
          setSyncStatusDetail(`Uploaded ${task.project.title} (${completed}/${total}) • 4 parallel streams`);
        }
      );

      // 5. Update local projects metadata in bulk
      const resultMap = new Map(uploadResults.map(r => [r.projectId, r.fileId]));
      for (let i = 0; i < updatedProjects.length; i++) {
        const pId = updatedProjects[i].id;
        if (resultMap.has(pId)) {
          updatedProjects[i] = {
            ...updatedProjects[i],
            driveFileId: resultMap.get(pId)!,
            driveSyncedAt: Date.now(),
          };
        }
      }

      // Single database transaction for all updated project records
      await saveProjectsBulk(updatedProjects);
      onLocalProjectsUpdated(updatedProjects);

      // 6. Fast single-pass refresh of remote files
      const refreshed = await listAllDriveSb3ProjectsAndFolders(token, folderId);
      setDriveFiles(refreshed.files);

      const durationSec = ((performance.now() - startTime) / 1000).toFixed(1);
      const skipNote = skippedCount > 0 ? `, ${skippedCount} already up-to-date (skipped)` : '';
      setStatusMessage({
        text: `Sync finished in ${durationSec}s! Uploaded ${tasksToUpload.length} project(s)${skipNote} across 4 parallel streams.`,
        type: 'success',
      });
    } catch (err: any) {
      console.error('Sync error:', err);
      if (err?.message?.includes('401') || err?.message?.toLowerCase().includes('unauthorized')) {
        clearCachedAccessToken();
        setStatusMessage({
          text: 'Google Drive authorization expired. Please sign in again.',
          type: 'error',
        });
      } else {
        setStatusMessage({
          text: err.message || 'Error occurred while syncing with Google Drive.',
          type: 'error',
        });
      }
    } finally {
      setSyncingAll(false);
      setSyncStatusDetail(null);
    }
  };

  // High-Speed Pull / Import projects from Google Drive into local library
  const handlePullFromDrive = async () => {
    setSyncingAll(true);
    setStatusMessage(null);
    setSyncStatusDetail('Single-pass scanning Google Drive library...');
    const startTime = performance.now();

    const token = await getValidToken();
    if (!token) {
      setSyncingAll(false);
      setSyncStatusDetail(null);
      return;
    }

    try {
      const folderId = driveFolderId || await findOrCreateLibraryFolder(token);
      const { files, folders: driveFolders } = await listAllDriveSb3ProjectsAndFolders(token, folderId);
      setDriveFiles(files);

      // 1. Replicate the entire Google Drive folder tree locally in 1 pass
      let currentFolders = [...folders];
      const newlyCreatedFolders: Sb3Folder[] = [];

      const { allFolders: foldersWithDriveTree, newFolders: createdFromTree, pathToFolderId } =
        replicateDriveFolderStructure(driveFolders, currentFolders);

      if (createdFromTree.length > 0) {
        newlyCreatedFolders.push(...createdFromTree);
        currentFolders = foldersWithDriveTree;
        await saveFoldersBulk(newlyCreatedFolders);
        if (onFoldersUpdated) {
          onFoldersUpdated(currentFolders);
        }
      }

      if (files.length === 0 && newlyCreatedFolders.length === 0) {
        setStatusMessage({ text: 'No .sb3 files or folders found in your Google Drive library folder.', type: 'info' });
        setSyncingAll(false);
        setSyncStatusDetail(null);
        return;
      }

      // 2. Classify remote files into download tasks vs metadata-only updates vs already up-to-date
      let updatedProjectsList: Sb3Project[] = [...localProjects];
      const localByDriveId = new Map(localProjects.filter(p => p.driveFileId).map(p => [p.driveFileId!, p]));
      const localByNameAndFolder = new Map(
        localProjects.map(p => [`${p.folderId || ''}:::${p.fileName.toLowerCase()}`, p])
      );

      interface DownloadTask {
        file: DriveFileInfo;
        targetFolderId: string | null;
        existingProject?: Sb3Project;
      }

      const tasksToDownload: DownloadTask[] = [];
      let upToDateCount = 0;
      let metadataUpdatedCount = 0;
      const projectsToUpdateMetadata: Sb3Project[] = [];

      for (const file of files) {
        let targetFolderId: string | null = null;
        if (file.folderPath) {
          targetFolderId = pathToFolderId.get(file.folderPath) || null;
        }

        const existing =
          localByDriveId.get(file.id) ||
          localByNameAndFolder.get(`${targetFolderId || ''}:::${file.name.toLowerCase()}`) ||
          localProjects.find(p => p.fileName.toLowerCase() === file.name.toLowerCase() && !p.driveFileId);

        if (existing) {
          const folderChanged = existing.folderId !== targetFolderId;
          const driveModTime = file.modifiedTime ? new Date(file.modifiedTime).getTime() : 0;
          const isDriveNewer = driveModTime > (existing.dateModified || 0);

          if (isDriveNewer || !existing.driveSyncedAt) {
            tasksToDownload.push({ file, targetFolderId, existingProject: existing });
          } else if (folderChanged || !existing.driveFileId) {
            const updatedMeta: Sb3Project = {
              ...existing,
              folderId: targetFolderId,
              driveFileId: file.id,
              driveSyncedAt: Date.now(),
            };
            projectsToUpdateMetadata.push(updatedMeta);
            const idx = updatedProjectsList.findIndex(p => p.id === existing.id);
            if (idx !== -1) updatedProjectsList[idx] = updatedMeta;
            metadataUpdatedCount++;
          } else {
            upToDateCount++;
          }
        } else {
          tasksToDownload.push({ file, targetFolderId });
        }
      }

      setSyncProgress({ current: 0, total: tasksToDownload.length });

      // 3. Parallel Download and Parsing using runWithConcurrency (4 concurrent streams)
      setSyncStatusDetail(`Downloading & parsing ${tasksToDownload.length} project(s) via 4 parallel streams...`);
      const downloadedItems = await runWithConcurrency(
        tasksToDownload,
        4,
        async (task) => {
          const blob = await downloadDriveSb3File(token, task.file.id);
          const parsed = await parseSb3File(blob, task.file.name);
          const driveModTime = task.file.modifiedTime ? new Date(task.file.modifiedTime).getTime() : Date.now();

          let projectRecord: Sb3Project;
          if (task.existingProject) {
            projectRecord = {
              ...task.existingProject,
              title: parsed.project.title || task.existingProject.title,
              thumbnailUrl: parsed.project.thumbnailUrl || task.existingProject.thumbnailUrl,
              stats: parsed.project.stats || task.existingProject.stats,
              fileSize: parsed.project.fileSize || task.existingProject.fileSize,
              folderId: task.targetFolderId,
              driveFileId: task.file.id,
              driveSyncedAt: Date.now(),
              dateModified: driveModTime,
            };
          } else {
            projectRecord = {
              ...parsed.project,
              folderId: task.targetFolderId,
              driveFileId: task.file.id,
              driveSyncedAt: Date.now(),
              dateModified: driveModTime,
            };
          }

          return { project: projectRecord, blob, isNew: !task.existingProject };
        },
        (completed, total, task) => {
          setSyncProgress({ current: completed, total });
          setSyncStatusDetail(`Downloaded ${task.file.name} (${completed}/${total}) • 4 parallel streams`);
        }
      );

      // 4. Unified Bulk Save into IndexedDB (1 database transaction)
      const allProjectsToSave: Sb3Project[] = [...projectsToUpdateMetadata];
      const allBlobsToSave: { id: string; blob: Blob }[] = [];

      for (const item of downloadedItems) {
        allProjectsToSave.push(item.project);
        allBlobsToSave.push({ id: item.project.id, blob: item.blob });

        const idx = updatedProjectsList.findIndex(p => p.id === item.project.id);
        if (idx !== -1) {
          updatedProjectsList[idx] = item.project;
        } else {
          updatedProjectsList.push(item.project);
        }
      }

      if (allProjectsToSave.length > 0) {
        await saveProjectsBulk(allProjectsToSave, allBlobsToSave);
      }

      onLocalProjectsUpdated(updatedProjectsList);

      const durationSec = ((performance.now() - startTime) / 1000).toFixed(1);
      const downloadedCount = downloadedItems.length;

      const summaryParts: string[] = [];
      if (downloadedCount > 0) summaryParts.push(`downloaded ${downloadedCount} project(s)`);
      if (metadataUpdatedCount > 0) summaryParts.push(`synchronized ${metadataUpdatedCount} project(s)`);
      if (createdFromTree.length > 0) summaryParts.push(`replicated ${createdFromTree.length} folder(s)`);
      if (upToDateCount > 0) summaryParts.push(`${upToDateCount} already up-to-date (skipped)`);

      setStatusMessage({
        text: `Pulled from Google Drive in ${durationSec}s! ${summaryParts.join(', ')} across 4 parallel streams.`,
        type: 'success',
      });
    } catch (err: any) {
      console.error('Pull error:', err);
      if (err?.message?.includes('401') || err?.message?.toLowerCase().includes('unauthorized')) {
        clearCachedAccessToken();
        setStatusMessage({
          text: 'Google Drive authorization expired. Please sign in again.',
          type: 'error',
        });
      } else {
        setStatusMessage({
          text: err.message || 'Error downloading files from Google Drive.',
          type: 'error',
        });
      }
    } finally {
      setSyncingAll(false);
      setSyncStatusDetail(null);
    }
  };

  // Delete file from Google Drive (Mandatory user confirmation)
  const handleConfirmDeleteDriveFile = async () => {
    if (!deleteConfirmFile) return;
    const token = await getValidToken();
    if (!token) return;

    try {
      await deleteDriveFile(token, deleteConfirmFile.id);
      setDriveFiles(prev => prev.filter(f => f.id !== deleteConfirmFile.id));

      // Remove driveFileId reference on local project
      const updated = localProjects.map(p => {
        if (p.driveFileId === deleteConfirmFile.id) {
          const up = { ...p, driveFileId: undefined, driveSyncedAt: undefined };
          saveProject(up);
          return up;
        }
        return p;
      });
      onLocalProjectsUpdated(updated);

      setStatusMessage({
        text: `Deleted "${deleteConfirmFile.name}" from Google Drive.`,
        type: 'success',
      });
    } catch (err: any) {
      setStatusMessage({
        text: err.message || 'Failed to delete file from Google Drive.',
        type: 'error',
      });
    } finally {
      setDeleteConfirmFile(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Google Drive Cloud Sync</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-normal">
                  Google Workspace
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Sync and back up your Scratch .sb3 library directly with Google Drive
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar text-xs">
          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2.5 animate-in fade-in ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  : statusMessage.type === 'error'
                  ? 'bg-red-950/60 border-red-800 text-red-300'
                  : 'bg-blue-950/60 border-blue-800 text-blue-300'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span className="font-medium">{statusMessage.text}</span>
            </div>
          )}

          {/* User Authentication State */}
          {!user ? (
            <div className="p-8 bg-slate-950/60 border border-slate-800 rounded-2xl flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-500 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Cloud className="w-8 h-8 text-white" />
              </div>
              <div className="max-w-md">
                <h3 className="text-base font-bold text-white mb-1">
                  Connect your Google Account
                </h3>
                <p className="text-slate-400 text-xs">
                  Sign in with Gmail to automatically back up your Scratch .sb3 files to a dedicated folder in Google Drive. Access your projects anywhere and never lose your work.
                </p>
              </div>

              {/* Official Google Sign-In Button */}
              <button
                onClick={onLogin}
                className="flex items-center gap-3 px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-800 font-semibold rounded-xl shadow-md transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Sign in with Google</span>
              </button>

              {/* Direct Sync & Pull actions before signing in */}
              <div className="pt-2 w-full max-w-md border-t border-slate-800/80 mt-2 space-y-2">
                <p className="text-[11px] text-slate-500 font-medium">Or start a sync action directly (will connect account):</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={handleSyncAllToDrive}
                    className="flex items-center justify-center gap-2 py-2 px-3 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-xl font-medium text-xs transition-colors"
                  >
                    <CloudUpload className="w-3.5 h-3.5 text-blue-400" />
                    <span>Sync All ({localProjects.length}) to Drive</span>
                  </button>
                  <button
                    onClick={handlePullFromDrive}
                    className="flex items-center justify-center gap-2 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl font-medium text-xs transition-colors"
                  >
                    <CloudDownload className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Pull / Import from Drive</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Signed In User Profile & Drive Controls */
            <div className="space-y-5">
              {/* Profile Card */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Google User'}
                      className="w-10 h-10 rounded-full border-2 border-orange-500/50"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-600 font-bold text-white flex items-center justify-center">
                      {(user.displayName || user.email || 'G')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-100 truncate">
                      {user.displayName || 'Google Account'}
                    </div>
                    <div className="text-slate-400 text-[11px] truncate">{user.email}</div>
                  </div>
                </div>

                <button
                  onClick={onLogout}
                  title="Sign out from Google"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-red-400 rounded-lg text-xs transition-colors border border-slate-700"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              </div>

              {/* Token prompt banner if session token is not yet initialized */}
              {!accessToken && (
                <div className="p-3.5 bg-amber-950/40 border border-amber-800/60 rounded-xl flex items-center justify-between gap-3 text-amber-200">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="text-xs">
                      <span className="font-semibold text-white">Google Drive authorization required</span>
                      <p className="text-[11px] text-amber-300/80">
                        Grant permission for this session to sync and access your Drive files.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={getValidToken}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs shrink-0 transition-colors shadow"
                  >
                    Authorize Drive
                  </button>
                </div>
              )}

              {/* Sync Actions Box */}
              <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl space-y-3.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-blue-400" />
                    <span className="font-semibold text-white">Google Drive Library:</span>
                    <span className="text-slate-300 font-mono bg-slate-800 px-2 py-0.5 rounded">
                      Scratch SB3 Library
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium">
                      <Zap className="w-3 h-3 text-emerald-400" />
                      4 Parallel Streams
                    </span>
                    <span className="text-slate-400 font-mono">
                      {driveFiles.length} file(s){new Set(driveFiles.map(f => f.folderPath).filter(Boolean)).size > 0 ? ` • ${new Set(driveFiles.map(f => f.folderPath).filter(Boolean)).size} folder(s)` : ''}
                    </span>
                  </div>
                </div>

                {/* Performance & Sync Mode Options */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-900/80 rounded-xl border border-slate-800/80 text-[11px]">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <div className="text-slate-300">
                      <span className="font-medium text-slate-200">Sync Mode: </span>
                      <span className="text-slate-400">
                        {forceFullSync
                          ? 'Re-upload all projects regardless of modification date'
                          : 'Skip unmodified files, sync changes only (fastest)'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForceFullSync(prev => !prev)}
                    disabled={syncingAll}
                    className={`px-2.5 py-1 rounded-lg border font-medium transition-colors shrink-0 flex items-center gap-1.5 ${
                      forceFullSync
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                    }`}
                  >
                    <Zap className="w-3 h-3" />
                    <span>{forceFullSync ? 'Full Re-sync Active' : '⚡ Smart Incremental'}</span>
                  </button>
                </div>

                {/* Progress bar and live status */}
                {syncingAll && (
                  <div className="space-y-2 p-3 bg-slate-900 rounded-xl border border-blue-500/30 shadow-lg shadow-blue-500/5 animate-in fade-in">
                    <div className="flex justify-between items-center text-slate-300 font-medium">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                        <span className="text-white text-xs">Syncing in Progress</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
                          HTTP/2 x4 Multi-Stream
                        </span>
                      </div>
                      <span className="font-mono text-orange-400 font-semibold">
                        {syncProgress.current} / {syncProgress.total}
                      </span>
                    </div>

                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden p-0.5">
                      <div
                        className="bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400 h-full rounded-full transition-all duration-200"
                        style={{
                          width: `${syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : 100}%`,
                        }}
                      />
                    </div>

                    {syncStatusDetail && (
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping shrink-0" />
                        <span className="truncate">{syncStatusDetail}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Sync Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    onClick={handleSyncAllToDrive}
                    disabled={syncingAll}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl shadow-md shadow-blue-500/20 transition-all text-xs"
                  >
                    <CloudUpload className="w-4 h-4" />
                    <span>Sync All ({localProjects.length}) to Drive</span>
                  </button>

                  <button
                    onClick={handlePullFromDrive}
                    disabled={syncingAll}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-750 disabled:opacity-50 text-slate-200 font-medium rounded-xl border border-slate-700 transition-all text-xs"
                  >
                    <CloudDownload className="w-4 h-4 text-cyan-400" />
                    <span>Pull / Import from Drive</span>
                  </button>
                </div>
              </div>

              {/* Files in Google Drive List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                    Files in your Google Drive Folder ({driveFiles.length})
                  </h4>

                  {driveFolderId && (
                    <a
                      href={`https://drive.google.com/drive/folders/${driveFolderId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
                    >
                      <span>Open folder in Drive</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {loadingDrive ? (
                  <div className="py-8 text-center text-slate-500 flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                    <span>Loading files from Google Drive...</span>
                  </div>
                ) : driveFiles.length > 0 ? (
                  <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60 max-h-56 overflow-y-auto custom-scrollbar">
                    {driveFiles.map((f) => (
                      <div
                        key={f.id}
                        className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-900/60 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileCode2 className="w-4 h-4 text-orange-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium text-slate-200 truncate flex items-center gap-1.5 flex-wrap">
                              <span>{f.name}</span>
                              {f.folderPath && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 font-sans shrink-0">
                                  📁 {f.folderPath}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {f.folderPath ? `Location: ${f.folderPath} • ` : 'Root • '}
                              {f.size ? `${(Number(f.size) / 1024).toFixed(0)} KB` : 'SB3 File'} •{' '}
                              {f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : ''}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {f.webViewLink && (
                            <a
                              href={f.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View in Google Drive"
                              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            onClick={() => setDeleteConfirmFile(f)}
                            title="Delete file from Google Drive"
                            className="p-1.5 text-slate-400 hover:text-red-400 rounded hover:bg-slate-800 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : !accessToken ? (
                  <div className="p-6 text-center text-slate-400 border border-slate-800 rounded-xl bg-slate-950/40 space-y-2">
                    <Cloud className="w-6 h-6 mx-auto text-blue-400" />
                    <p className="font-medium text-slate-200">Google Drive not connected for this session.</p>
                    <p className="text-[11px] text-slate-500">
                      Click "Authorize Drive" or "Sync All" / "Pull" to view and sync your files.
                    </p>
                    <button
                      onClick={getValidToken}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition-colors"
                    >
                      Authorize Drive
                    </button>
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-500 border border-slate-800 rounded-xl bg-slate-950/30">
                    No files uploaded to Google Drive yet. Click "Sync All to Drive" to upload your projects!
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Destructive Confirmation Modal for Deleting from Google Drive */}
        {deleteConfirmFile && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-red-800 rounded-2xl shadow-2xl p-5 max-w-sm w-full space-y-3">
              <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>Delete file from Google Drive?</span>
              </div>
              <p className="text-xs text-slate-300">
                Are you sure you want to permanently delete <strong className="text-white">"{deleteConfirmFile.name}"</strong> from your Google Drive folder?
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setDeleteConfirmFile(null)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDeleteDriveFile}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg text-xs"
                >
                  Delete from Drive
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
