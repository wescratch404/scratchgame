import JSZip from 'jszip';

export interface ParsedCostume {
  name: string;
  assetId: string;
  dataFormat: string;
  url: string;
  rotationCenterX: number;
  rotationCenterY: number;
  sizeBytes?: number;
}

export interface ParsedSound {
  name: string;
  assetId: string;
  dataFormat: string;
  url: string;
  rate: number;
  sampleCount: number;
  durationSeconds?: number;
  sizeBytes?: number;
}

export interface ParsedBlock {
  id: string;
  opcode: string;
  category: 'motion' | 'looks' | 'sound' | 'events' | 'control' | 'sensing' | 'operators' | 'variables' | 'custom' | 'other';
  label: string;
  topLevel: boolean;
  inputs?: Record<string, any>;
  fields?: Record<string, any>;
}

export interface ParsedScript {
  id: string;
  hatOpcode?: string;
  hatLabel?: string;
  blockCount: number;
  blocks: ParsedBlock[];
}

export interface ParsedSprite {
  name: string;
  isStage: boolean;
  x: number;
  y: number;
  size: number;
  direction: number;
  visible: boolean;
  currentCostumeIndex: number;
  costumes: ParsedCostume[];
  sounds: ParsedSound[];
  variables: { name: string; value: any }[];
  lists: { name: string; items: any[] }[];
  scripts: ParsedScript[];
  totalBlocks: number;
}

export interface ParsedProjectDetails {
  meta: any;
  extensions: string[];
  broadcasts: string[];
  globalVariables: { name: string; value: any }[];
  globalLists: { name: string; items: any[] }[];
  sprites: ParsedSprite[];
  totalBlockCount: number;
}

function getOpcodeCategory(opcode: string): ParsedBlock['category'] {
  if (opcode.startsWith('motion_')) return 'motion';
  if (opcode.startsWith('looks_')) return 'looks';
  if (opcode.startsWith('sound_')) return 'sound';
  if (opcode.startsWith('event_')) return 'events';
  if (opcode.startsWith('control_')) return 'control';
  if (opcode.startsWith('sensing_')) return 'sensing';
  if (opcode.startsWith('operator_')) return 'operators';
  if (opcode.startsWith('data_')) return 'variables';
  if (opcode.startsWith('procedures_')) return 'custom';
  return 'other';
}

function formatOpcodeLabel(opcode: string, fields?: Record<string, any>): string {
  // Common human-readable Scratch block names
  const labels: Record<string, string> = {
    'event_whenflagclicked': 'when ⚑ clicked',
    'event_whenkeypressed': `when key [${fields?.KEY_OPTION?.[0] || 'space'}] pressed`,
    'event_whenthisspriteclicked': 'when this sprite clicked',
    'event_whenbackdropswitchesto': `when backdrop switches to [${fields?.BACKDROP?.[0] || ''}]`,
    'event_whenbroadcastreceived': `when I receive [${fields?.BROADCAST_OPTION?.[0] || 'message'}]`,
    'event_broadcast': 'broadcast message',
    'event_broadcastandwait': 'broadcast message and wait',
    'motion_movesteps': 'move () steps',
    'motion_turnright': 'turn ↻ () degrees',
    'motion_turnleft': 'turn ↺ () degrees',
    'motion_goto': 'go to [random position]',
    'motion_gotoxy': 'go to x: () y: ()',
    'motion_glideto': 'glide () secs to []',
    'motion_glidesecstoxy': 'glide () secs to x: () y: ()',
    'motion_pointindirection': 'point in direction ()',
    'motion_pointtowards': 'point towards []',
    'motion_changexby': 'change x by ()',
    'motion_setx': 'set x to ()',
    'motion_changeyby': 'change y by ()',
    'motion_sety': 'set y to ()',
    'motion_ifonedgebounce': 'if on edge, bounce',
    'motion_setrotationstyle': 'set rotation style []',
    'looks_sayforsecs': 'say () for () seconds',
    'looks_say': 'say ()',
    'looks_thinkforsecs': 'think () for () seconds',
    'looks_think': 'think ()',
    'looks_switchcostumeto': 'switch costume to []',
    'looks_nextcostume': 'next costume',
    'looks_switchbackdropto': 'switch backdrop to []',
    'looks_nextbackdrop': 'next backdrop',
    'looks_changesizeby': 'change size by ()',
    'looks_setsizeto': 'set size to () %',
    'looks_show': 'show',
    'looks_hide': 'hide',
    'looks_gotofrontback': 'go to [front] layer',
    'sound_playuntildone': 'play sound [] until done',
    'sound_play': 'start sound []',
    'sound_stopallsounds': 'stop all sounds',
    'sound_changevolumeby': 'change volume by ()',
    'sound_setvolumeto': 'set volume to () %',
    'control_wait': 'wait () seconds',
    'control_repeat': 'repeat ()',
    'control_forever': 'forever',
    'control_if': 'if <> then',
    'control_if_else': 'if <> then else',
    'control_wait_until': 'wait until <>',
    'control_repeat_until': 'repeat until <>',
    'control_stop': 'stop [all]',
    'control_start_as_clone': 'when I start as a clone',
    'control_create_clone_of': 'create clone of []',
    'control_delete_this_clone': 'delete this clone',
    'data_setvariableto': `set [${fields?.VARIABLE?.[0] || 'variable'}] to ()`,
    'data_changevariableby': `change [${fields?.VARIABLE?.[0] || 'variable'}] by ()`,
    'data_showvariable': 'show variable []',
    'data_hidevariable': 'hide variable []',
    'procedures_definition': 'define custom block',
    'procedures_call': 'call custom block',
  };

  if (labels[opcode]) return labels[opcode];

  // Clean fallback: e.g. "motion_movesteps" -> "motion: movesteps"
  return opcode.replace(/_/g, ' ');
}

export async function parseSb3ProjectDetails(blobOrBuffer: Blob | ArrayBuffer): Promise<ParsedProjectDetails> {
  const zip = await JSZip.loadAsync(blobOrBuffer);
  const projectJsonFile = zip.file('project.json');
  if (!projectJsonFile) {
    throw new Error('Missing project.json in SB3 archive');
  }

  const jsonText = await projectJsonFile.async('text');
  const projectData = JSON.parse(jsonText);

  const meta = projectData.meta || {};
  const extensions: string[] = projectData.extensions || [];
  const targets: any[] = projectData.targets || [];

  const globalVariables: { name: string; value: any }[] = [];
  const globalLists: { name: string; items: any[] }[] = [];
  const broadcastsSet = new Set<string>();

  const sprites: ParsedSprite[] = [];
  let totalBlockCount = 0;

  for (const target of targets) {
    const isStage = !!target.isStage;
    const name = target.name || (isStage ? 'Stage' : 'Sprite');

    // Extract broadcasts
    if (target.broadcasts) {
      Object.values(target.broadcasts).forEach((b: any) => {
        if (typeof b === 'string') broadcastsSet.add(b);
      });
    }

    // Extract variables
    const targetVars: { name: string; value: any }[] = [];
    if (target.variables) {
      Object.values(target.variables).forEach((v: any) => {
        if (Array.isArray(v) && v.length >= 2) {
          const varObj = { name: v[0], value: v[1] };
          targetVars.push(varObj);
          if (isStage) globalVariables.push(varObj);
        }
      });
    }

    // Extract lists
    const targetLists: { name: string; items: any[] }[] = [];
    if (target.lists) {
      Object.values(target.lists).forEach((l: any) => {
        if (Array.isArray(l) && l.length >= 2) {
          const listObj = { name: l[0], items: l[1] };
          targetLists.push(listObj);
          if (isStage) globalLists.push(listObj);
        }
      });
    }

    // Extract costumes
    const costumes: ParsedCostume[] = [];
    if (target.costumes && Array.isArray(target.costumes)) {
      for (const c of target.costumes) {
        const fileName = c.md5ext || `${c.assetId}.${c.dataFormat}`;
        const assetFile = zip.file(fileName);
        let url = '';

        if (assetFile) {
          try {
            if (c.dataFormat === 'svg') {
              const svgText = await assetFile.async('text');
              url = `data:image/svg+xml;utf8,${encodeURIComponent(svgText)}`;
            } else {
              const base64 = await assetFile.async('base64');
              const mime = c.dataFormat === 'png' ? 'image/png' : 'image/jpeg';
              url = `data:${mime};base64,${base64}`;
            }
          } catch {
            // ignore preview failures
          }
        }

        costumes.push({
          name: c.name || 'costume',
          assetId: c.assetId || '',
          dataFormat: c.dataFormat || 'svg',
          url,
          rotationCenterX: c.rotationCenterX || 0,
          rotationCenterY: c.rotationCenterY || 0,
        });
      }
    }

    // Extract sounds
    const sounds: ParsedSound[] = [];
    if (target.sounds && Array.isArray(target.sounds)) {
      for (const s of target.sounds) {
        const fileName = s.md5ext || `${s.assetId}.${s.dataFormat}`;
        const assetFile = zip.file(fileName);
        let url = '';

        if (assetFile) {
          try {
            const base64 = await assetFile.async('base64');
            const mime = s.dataFormat === 'mp3' ? 'audio/mpeg' : 'audio/wav';
            url = `data:${mime};base64,${base64}`;
          } catch {
            // ignore sound extraction error
          }
        }

        sounds.push({
          name: s.name || 'sound',
          assetId: s.assetId || '',
          dataFormat: s.dataFormat || 'wav',
          url,
          rate: s.rate || 44100,
          sampleCount: s.sampleCount || 0,
          durationSeconds: s.sampleCount && s.rate ? Math.round((s.sampleCount / s.rate) * 10) / 10 : undefined,
        });
      }
    }

    // Extract blocks & scripts
    const rawBlocks = target.blocks || {};
    const blocksList: ParsedBlock[] = [];
    const topLevelIds: string[] = [];

    Object.entries(rawBlocks).forEach(([bId, bVal]: [string, any]) => {
      if (bVal && typeof bVal === 'object' && bVal.opcode) {
        const opcode = bVal.opcode;
        const category = getOpcodeCategory(opcode);
        const label = formatOpcodeLabel(opcode, bVal.fields);
        const topLevel = !!bVal.topLevel;

        if (topLevel) topLevelIds.push(bId);

        blocksList.push({
          id: bId,
          opcode,
          category,
          label,
          topLevel,
          inputs: bVal.inputs,
          fields: bVal.fields,
        });
      }
    });

    totalBlockCount += blocksList.length;

    // Group blocks into scripts starting from topLevel blocks
    const scripts: ParsedScript[] = [];
    for (const topId of topLevelIds) {
      const topBlock = rawBlocks[topId];
      if (!topBlock) continue;

      const scriptBlocks: ParsedBlock[] = [];
      let currentId: string | null = topId;

      while (currentId && rawBlocks[currentId]) {
        const cur: any = rawBlocks[currentId];
        scriptBlocks.push({
          id: currentId,
          opcode: cur.opcode,
          category: getOpcodeCategory(cur.opcode),
          label: formatOpcodeLabel(cur.opcode, cur.fields),
          topLevel: !!cur.topLevel,
        });
        currentId = cur.next || null;
      }

      scripts.push({
        id: topId,
        hatOpcode: topBlock.opcode,
        hatLabel: formatOpcodeLabel(topBlock.opcode, topBlock.fields),
        blockCount: scriptBlocks.length,
        blocks: scriptBlocks,
      });
    }

    sprites.push({
      name,
      isStage,
      x: target.x || 0,
      y: target.y || 0,
      size: target.size || 100,
      direction: target.direction || 90,
      visible: target.visible !== false,
      currentCostumeIndex: target.currentCostume || 0,
      costumes,
      sounds,
      variables: targetVars,
      lists: targetLists,
      scripts,
      totalBlocks: blocksList.length,
    });
  }

  return {
    meta,
    extensions,
    broadcasts: Array.from(broadcastsSet),
    globalVariables,
    globalLists,
    sprites,
    totalBlockCount,
  };
}
