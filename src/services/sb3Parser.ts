import JSZip from 'jszip';
import { Sb3Project, ScratchStats } from '../types/scratch';

export function generateScratchSvgThumbnail(title: string, color = '#FFAB19'): string {
  const safeTitle = title.replace(/[<>&"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360" width="480" height="360">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1E1E2E"/>
        <stop offset="100%" stop-color="#11111B"/>
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${color}"/>
        <stop offset="100%" stop-color="#FF6680"/>
      </linearGradient>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.3"/>
      </filter>
    </defs>
    <!-- Background -->
    <rect width="480" height="360" fill="url(#bg)"/>
    <!-- Stage Grid subtle lines -->
    <path d="M 0,180 L 480,180 M 240,0 L 240,360" stroke="#313244" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.4"/>
    <!-- Central Scratch Stage Illustration -->
    <g transform="translate(240, 150)">
      <!-- Scratch Cat Head Stylized Silhouette -->
      <path d="M -50,-20 L -65,-70 L -25,-48 C -8,-54 8,-54 25,-48 L 65,-70 L 50,-20 C 68,-3 72,25 58,48 C 42,72 -42,72 -58,48 C -72,25 -68,-3 -50,-20 Z" 
            fill="${color}" filter="url(#shadow)" opacity="0.95"/>
      <!-- Ears inside -->
      <path d="M -55,-28 L -60,-58 L -34,-44 Z" fill="#FFE082" opacity="0.8"/>
      <path d="M 55,-28 L 60,-58 L 34,-44 Z" fill="#FFE082" opacity="0.8"/>
      <!-- Whiskers -->
      <path d="M -45,15 L -80,10 M -45,25 L -80,28 M 45,15 L 80,10 M 45,25 L 80,28" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>
      <!-- Eyes -->
      <ellipse cx="-20" cy="5" rx="7" ry="10" fill="#FFFFFF"/>
      <ellipse cx="20" cy="5" rx="7" ry="10" fill="#FFFFFF"/>
      <circle cx="-19" cy="5" r="4.5" fill="#1E1E2E"/>
      <circle cx="21" cy="5" r="4.5" fill="#1E1E2E"/>
      <!-- Nose / Smile -->
      <path d="M 0,18 L -4,13 L 4,13 Z" fill="#FF5722"/>
      <path d="M 0,22 C -6,28 -12,28 -16,22 M 0,22 C 6,28 12,28 16,22" stroke="#1E1E2E" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    </g>
    <!-- Scratch Block Badge Bar -->
    <g transform="translate(40, 270)">
      <rect x="0" y="0" width="400" height="42" rx="10" fill="#252538" stroke="#383850" stroke-width="1.5"/>
      <circle cx="24" cy="21" r="10" fill="#4C97FF"/>
      <path d="M 20,16 L 29,21 L 20,26 Z" fill="#FFFFFF"/>
      <text x="46" y="26" fill="#F8FAFC" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="bold" letter-spacing="0.2">
        ${safeTitle.length > 28 ? safeTitle.substring(0, 26) + '...' : safeTitle}
      </text>
    </g>
    <!-- Corner Code Block Pill -->
    <g transform="translate(360, 24)">
      <rect x="0" y="0" width="96" height="28" rx="14" fill="#4C97FF" opacity="0.9"/>
      <text x="48" y="18" fill="#FFFFFF" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="bold" text-anchor="middle">
        SCRATCH 3
      </text>
    </g>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function parseSb3File(file: File | Blob, customFileName?: string): Promise<{ project: Sb3Project; blob: Blob }> {
  const fileName = customFileName || (file instanceof File ? file.name : 'scratch_project.sb3');
  const fileSize = file.size;
  const rawTitle = fileName.replace(/\.[^/.]+$/, '');

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (err) {
    throw new Error(`Failed to read SB3 archive: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Find project.json
  const projectJsonFile = zip.file('project.json');
  if (!projectJsonFile) {
    throw new Error('Invalid SB3 file: missing project.json');
  }

  let projectData: any = {};
  try {
    const jsonText = await projectJsonFile.async('text');
    projectData = JSON.parse(jsonText);
  } catch (err) {
    throw new Error('Failed to parse project.json');
  }

  // Parse targets
  const targets = projectData.targets || [];
  let spriteCount = 0;
  let blockCount = 0;
  let costumeCount = 0;
  let soundCount = 0;
  let variableCount = 0;
  let listCount = 0;
  let scriptCount = 0;
  const spriteNames: string[] = [];
  const extensionsSet = new Set<string>(projectData.extensions || []);
  let hasCloudVars = false;

  let thumbnailCandidateAsset: string | null = null;

  for (const target of targets) {
    if (target.isStage) {
      // Stage backdrop costume could be a good thumbnail
      if (target.costumes && target.costumes.length > 0) {
        // Look for costume asset
        const costume = target.costumes[0];
        if (costume && costume.md5ext) {
          thumbnailCandidateAsset = costume.md5ext;
        }
      }
    } else {
      spriteCount++;
      if (target.name) {
        spriteNames.push(target.name);
      }
      // If no stage backdrop thumbnail, use first sprite costume
      if (!thumbnailCandidateAsset && target.costumes && target.costumes.length > 0) {
        thumbnailCandidateAsset = target.costumes[0].md5ext;
      }
    }

    // Costumes & sounds
    if (target.costumes) costumeCount += target.costumes.length;
    if (target.sounds) soundCount += target.sounds.length;

    // Variables & lists
    if (target.variables) {
      const vars = Object.values(target.variables);
      variableCount += vars.length;
      for (const v of vars as any[]) {
        if (Array.isArray(v) && v[2] === true) {
          hasCloudVars = true;
        }
      }
    }
    if (target.lists) listCount += Object.keys(target.lists).length;

    // Blocks
    if (target.blocks) {
      const blocksObj = target.blocks;
      const blockKeys = Object.keys(blocksObj);
      blockCount += blockKeys.length;

      for (const key of blockKeys) {
        const blk = blocksObj[key];
        if (blk && typeof blk === 'object') {
          // Identify script tops
          if (blk.topLevel && blk.opcode && blk.opcode.startsWith('event_when')) {
            scriptCount++;
          }
          // Extension detection from opcodes
          if (blk.opcode) {
            if (blk.opcode.startsWith('pen_')) extensionsSet.add('pen');
            if (blk.opcode.startsWith('music_')) extensionsSet.add('music');
            if (blk.opcode.startsWith('text2speech_')) extensionsSet.add('text2speech');
            if (blk.opcode.startsWith('translate_')) extensionsSet.add('translate');
            if (blk.opcode.startsWith('videoSensing_')) extensionsSet.add('videoSensing');
          }
        }
      }
    }
  }

  // Attempt to extract thumbnail asset from zip
  let thumbnailUrl = '';
  let hasEmbeddedThumbnail = false;

  // 1. Check for dedicated embedded thumbnail files inside the .sb3 archive
  // Many Scratch tools, packagers (e.g. TurboWarp, Scratch Desktop, PenguinMod) store thumbnail.png or thumbnail.svg
  const embeddedThumbCandidates = [
    { name: 'thumbnail.png', mime: 'image/png' },
    { name: 'thumbnail.svg', mime: 'image/svg+xml' },
    { name: 'thumbnail.jpg', mime: 'image/jpeg' },
    { name: 'thumbnail.jpeg', mime: 'image/jpeg' },
    { name: 'preview.png', mime: 'image/png' },
    { name: 'cover.png', mime: 'image/png' },
  ];

  for (const candidate of embeddedThumbCandidates) {
    const thumbEntry = zip.file(candidate.name);
    if (thumbEntry) {
      try {
        if (candidate.name.endsWith('.svg')) {
          const svgContent = await thumbEntry.async('text');
          thumbnailUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;
          hasEmbeddedThumbnail = true;
          break;
        } else {
          const base64 = await thumbEntry.async('base64');
          thumbnailUrl = `data:${candidate.mime};base64,${base64}`;
          hasEmbeddedThumbnail = true;
          break;
        }
      } catch (err) {
        console.warn(`Could not extract embedded ${candidate.name}:`, err);
      }
    }
  }

  // 2. If no dedicated thumbnail file, extract backdrop or costume asset
  if (!thumbnailUrl && thumbnailCandidateAsset) {
    const assetFile = zip.file(thumbnailCandidateAsset);
    if (assetFile) {
      try {
        if (thumbnailCandidateAsset.endsWith('.svg')) {
          const svgContent = await assetFile.async('text');
          thumbnailUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;
        } else if (thumbnailCandidateAsset.endsWith('.png')) {
          const base64 = await assetFile.async('base64');
          thumbnailUrl = `data:image/png;base64,${base64}`;
        } else if (thumbnailCandidateAsset.endsWith('.jpg') || thumbnailCandidateAsset.endsWith('.jpeg')) {
          const base64 = await assetFile.async('base64');
          thumbnailUrl = `data:image/jpeg;base64,${base64}`;
        }
      } catch {
        // Fallback to generated thumbnail
      }
    }
  }

  // 3. Fallback to generated Scratch SVG placeholder
  if (!thumbnailUrl || thumbnailUrl.length < 50) {
    thumbnailUrl = generateScratchSvgThumbnail(rawTitle);
  }

  // 4. Ensure the .sb3 archive contains the embedded thumbnail
  let finalBlob: Blob = file instanceof Blob ? file : new Blob([file]);
  if (!hasEmbeddedThumbnail) {
    try {
      if (thumbnailUrl.startsWith('data:image/png;base64,')) {
        zip.file('thumbnail.png', thumbnailUrl.replace(/^data:image\/png;base64,/, ''), { base64: true });
        finalBlob = await zip.generateAsync({ type: 'blob' });
        hasEmbeddedThumbnail = true;
      } else if (thumbnailUrl.startsWith('data:image/svg+xml')) {
        const svgContent = decodeURIComponent(
          thumbnailUrl.replace(/^data:image\/svg\+xml;utf8,/, '').replace(/^data:image\/svg\+xml;charset=utf-8,/, '')
        );
        zip.file('thumbnail.svg', svgContent);
        finalBlob = await zip.generateAsync({ type: 'blob' });
        hasEmbeddedThumbnail = true;
      }
    } catch {
      // Keep original file if zip regeneration fails
    }
  }

  const stats: ScratchStats = {
    spriteCount,
    blockCount,
    costumeCount,
    soundCount,
    variableCount,
    listCount,
    scriptCount: scriptCount || Math.max(1, Math.round(blockCount / 8)),
    extensions: Array.from(extensionsSet),
    spriteNames,
    hasCloudVars,
    scratchVersion: projectData.meta?.semver || '3.0.0',
  };

  const project: Sb3Project = {
    id: `sb3_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    title: projectData.meta?.title || rawTitle,
    fileName,
    fileSize: finalBlob.size || fileSize,
    folderId: null,
    tags: inferTagsFromMetadata(rawTitle, stats),
    isFavorite: false,
    isArchived: false,
    dateAdded: Date.now(),
    dateModified: Date.now(),
    playCount: 0,
    notes: '',
    description: `Scratch 3 project containing ${spriteCount} sprites and ${blockCount} blocks.`,
    thumbnailUrl,
    stats,
    hasEmbeddedThumbnail,
  };

  return { project, blob: finalBlob };
}

/**
 * Embeds or updates a thumbnail (PNG or SVG) directly inside an .sb3 ZIP archive.
 * Preserves all scripts, costumes, and sounds while injecting thumbnail.png or thumbnail.svg.
 */
export async function embedThumbnailInSb3(
  sb3BlobOrBuffer: Blob | ArrayBuffer,
  thumbnailDataUrl: string
): Promise<Blob> {
  try {
    const zip = await JSZip.loadAsync(sb3BlobOrBuffer);

    if (thumbnailDataUrl.startsWith('data:image/png;base64,')) {
      const base64Data = thumbnailDataUrl.replace(/^data:image\/png;base64,/, '');
      zip.file('thumbnail.png', base64Data, { base64: true });
    } else if (thumbnailDataUrl.startsWith('data:image/jpeg;base64,') || thumbnailDataUrl.startsWith('data:image/jpg;base64,')) {
      const base64Data = thumbnailDataUrl.replace(/^data:image\/jpe?g;base64,/, '');
      zip.file('thumbnail.jpg', base64Data, { base64: true });
    } else if (thumbnailDataUrl.startsWith('data:image/svg+xml')) {
      const svgText = decodeURIComponent(
        thumbnailDataUrl
          .replace(/^data:image\/svg\+xml;utf8,/, '')
          .replace(/^data:image\/svg\+xml;charset=utf-8,/, '')
      );
      zip.file('thumbnail.svg', svgText);
    }

    return await zip.generateAsync({ type: 'blob' });
  } catch (err) {
    console.error('Failed to embed thumbnail in SB3 archive:', err);
    return sb3BlobOrBuffer instanceof Blob ? sb3BlobOrBuffer : new Blob([sb3BlobOrBuffer]);
  }
}

function inferTagsFromMetadata(title: string, stats: ScratchStats): string[] {
  const tags: string[] = [];
  const lower = title.toLowerCase();

  if (lower.includes('platform') || lower.includes('jump') || lower.includes('run')) tags.push('Platformer');
  if (lower.includes('physic') || lower.includes('gravity') || lower.includes('particle')) tags.push('Physics');
  if (lower.includes('ai') || lower.includes('bot') || lower.includes('smart')) tags.push('AI');
  if (lower.includes('game') || lower.includes('arcade') || lower.includes('play')) tags.push('Games');
  if (lower.includes('3d') || lower.includes('raycast')) tags.push('3D Engine');
  if (lower.includes('tut') || lower.includes('learn') || lower.includes('lesson')) tags.push('Education');
  if (lower.includes('animat') || lower.includes('story') || lower.includes('movie')) tags.push('Animation');
  if (lower.includes('music') || lower.includes('synth') || stats.extensions.includes('music')) tags.push('Music');
  if (stats.blockCount > 50 && (lower.includes('clone') || lower.includes('bullet') || lower.includes('particle'))) {
    tags.push('Clone');
  }

  if (tags.length === 0) {
    tags.push('Platformer');
  }

  return tags;
}

function generateHexHash32(): string {
  const chars = '0123456789abcdef';
  let str = '';
  for (let i = 0; i < 32; i++) {
    str += chars[Math.floor(Math.random() * chars.length)];
  }
  return str;
}

/**
 * Creates sample .sb3 files directly inside browser using JSZip
 */
export async function createSampleSb3Zip(
  title: string,
  spriteCount: number,
  blockCount: number,
  tags: string[],
  folderId: string | null = null,
  color = '#FFAB19'
): Promise<{ project: Sb3Project; blob: Blob }> {
  const zip = new JSZip();

  // Generate SVG backdrop
  const backdropSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360" width="480" height="360">
    <rect width="480" height="360" fill="#181825"/>
    <circle cx="240" cy="180" r="120" fill="${color}" opacity="0.25"/>
    <text x="240" y="170" fill="#FFFFFF" font-family="sans-serif" font-size="28" font-weight="bold" text-anchor="middle">${title}</text>
    <text x="240" y="205" fill="#A6ADC8" font-family="sans-serif" font-size="14" text-anchor="middle">Scratch 3.0 Interactive Project</text>
  </svg>`;

  const backdropHash = generateHexHash32();
  const backdropFileName = `${backdropHash}.svg`;
  zip.file(backdropFileName, backdropSvg);
  zip.file('thumbnail.svg', backdropSvg);

  // Generate Sprite SVG
  const spriteSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <circle cx="50" cy="50" r="40" fill="${color}"/>
    <circle cx="38" cy="42" r="6" fill="#FFFFFF"/>
    <circle cx="62" cy="42" r="6" fill="#FFFFFF"/>
    <circle cx="39" cy="42" r="3" fill="#11111B"/>
    <circle cx="63" cy="42" r="3" fill="#11111B"/>
    <path d="M 40,62 Q 50,72 60,62" stroke="#11111B" stroke-width="4" fill="none" stroke-linecap="round"/>
  </svg>`;

  const spriteHash = generateHexHash32();
  const spriteFileName = `${spriteHash}.svg`;
  zip.file(spriteFileName, spriteSvg);

  // Construct valid Scratch 3.0 project.json
  const spriteNames = ['Player', 'GameManager'];
  if (spriteCount >= 3) spriteNames.push('Obstacle');
  if (spriteCount >= 4) spriteNames.push('Collectible');
  if (spriteCount >= 5) spriteNames.push('ParticleFX');

  const targets = [
    {
      isStage: true,
      name: 'Stage',
      variables: {
        'v1': ['Score', 0],
        'v2': ['High Score', 100]
      },
      lists: {},
      broadcasts: { 'b1': 'game_start', 'b2': 'game_over' },
      blocks: {
        'b_flag': {
          opcode: 'event_whenflagclicked',
          next: 'b_broadcast',
          parent: null,
          inputs: {},
          fields: {},
          shadow: false,
          topLevel: true,
          x: 40,
          y: 40
        },
        'b_broadcast': {
          opcode: 'event_broadcast',
          next: null,
          parent: 'b_flag',
          inputs: { 'BROADCAST_INPUT': [1, [11, 'game_start', 'b1']] },
          fields: {},
          shadow: false,
          topLevel: false
        }
      },
      comments: {},
      currentCostume: 0,
      costumes: [
        {
          name: 'Backdrop1',
          dataFormat: 'svg',
          assetId: backdropHash,
          md5: backdropFileName,
          md5ext: backdropFileName,
          rotationCenterX: 240,
          rotationCenterY: 180
        }
      ],
      sounds: [],
      volume: 100,
      layerOrder: 0
    }
  ];

  for (let i = 0; i < spriteNames.length; i++) {
    const sName = spriteNames[i];
    targets.push({
      isStage: false,
      name: sName,
      variables: {},
      lists: {},
      broadcasts: {},
      blocks: {
        [`b_flag_${i}`]: {
          opcode: 'event_whenflagclicked',
          next: `b_forever_${i}`,
          parent: null,
          inputs: {},
          fields: {},
          shadow: false,
          topLevel: true,
          x: 40 + (i * 20),
          y: 40 + (i * 20)
        },
        [`b_forever_${i}`]: {
          opcode: 'control_forever',
          next: null,
          parent: `b_flag_${i}`,
          inputs: {
            'SUBSTACK': [2, `b_move_${i}`]
          },
          fields: {},
          shadow: false,
          topLevel: false
        },
        [`b_move_${i}`]: {
          opcode: 'motion_movesteps',
          next: `b_bounce_${i}`,
          parent: `b_forever_${i}`,
          inputs: {
            'STEPS': [1, [4, `${4 + i * 2}`]]
          },
          fields: {},
          shadow: false,
          topLevel: false
        },
        [`b_bounce_${i}`]: {
          opcode: 'motion_ifonedgebounce',
          next: `b_turn_${i}`,
          parent: `b_move_${i}`,
          inputs: {},
          fields: {},
          shadow: false,
          topLevel: false
        },
        [`b_turn_${i}`]: {
          opcode: 'motion_turnright',
          next: null,
          parent: `b_bounce_${i}`,
          inputs: {
            'DEGREES': [1, [4, `${2 + i * 2}`]]
          },
          fields: {},
          shadow: false,
          topLevel: false
        }
      },
      comments: {},
      currentCostume: 0,
      costumes: [
        {
          name: `${sName}_Costume1`,
          dataFormat: 'svg',
          assetId: spriteHash,
          md5: spriteFileName,
          md5ext: spriteFileName,
          rotationCenterX: 50,
          rotationCenterY: 50
        }
      ],
      sounds: [],
      volume: 100,
      layerOrder: i + 1,
      visible: true,
      x: -100 + (i * 50),
      y: -50 + (i * 30),
      size: 100,
      direction: 45 + (i * 45),
      draggable: true,
      rotationStyle: 'all around'
    } as any);
  }

  const projectJson = {
    targets,
    monitors: [],
    extensions: tags.includes('Music') ? ['music'] : (tags.includes('Physics') ? ['pen'] : []),
    meta: {
      semver: '3.0.0',
      vm: '0.2.0',
      agent: 'Scratch SB3 Library Manager Generator',
      title
    }
  };

  zip.file('project.json', JSON.stringify(projectJson, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  const fileName = `${title.replace(/\s+/g, '_')}.sb3`;

  const parsed = await parseSb3File(blob, fileName);
  parsed.project.folderId = folderId;
  parsed.project.tags = tags;
  parsed.project.stats.blockCount = blockCount;
  parsed.project.stats.spriteCount = spriteNames.length;
  parsed.project.stats.spriteNames = spriteNames;

  return { project: parsed.project, blob };
}
