import {
  Shot,
  ProjectState,
  Keyframe,
  NineGridPanel,
  NineGridData,
  PromptTemplateConfig,
} from '../../types';
import {
  VISUAL_STYLE_PROMPTS,
  getStoryboardPositionLabel,
  resolveStoryboardGridLayout,
} from './constants';
import { getCameraMovementCompositionGuide } from './cameraMovementGuides';
import { enhanceKeyframePrompt } from '../../services/aiService';
import {
  DEFAULT_PROMPT_TEMPLATE_CONFIG,
  renderPromptTemplate,
  resolvePromptTemplateConfig,
  withTemplateFallback,
} from '../../services/promptTemplateService';

const KEYFRAME_META_SPLITTER = '\n\n---PROMPT_META_START---';

/**
 * getRefImagesForShot 的返回类型
 * hasTurnaround 标记是否包含了角色九宫格造型图，
 * 用于在提示词中告知 AI 如何正确解读多视角参考。
 */
export interface RefImagesResult {
  images: string[];
  hasTurnaround: boolean;
  selectedTurnaroundCount: number;
  droppedTurnaroundCount: number;
}

const MAX_SHOT_REFERENCE_IMAGES = 5;

const dedupeImageRefs = (images: string[]): string[] => {
  const output: string[] = [];
  const seen = new Set<string>();
  images.forEach((img) => {
    const normalized = String(img || '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    output.push(normalized);
  });
  return output;
};

export type VideoModelFamily = 'sora' | 'doubao-task' | 'veo-fast' | 'unknown';

export interface VideoModelRouting {
  family: VideoModelFamily;
  normalizedModelId: string;
  supportsStartFrame: boolean;
  supportsEndFrame: boolean;
  prefersNineGridStoryboard: boolean;
}

export interface VideoPromptContext {
  hasStartFrame?: boolean;
  hasEndFrame?: boolean;
}

const normalizeVideoModelIdForRouting = (videoModel: string): string => {
  const raw = (videoModel || '').trim();
  if (!raw) return 'sora-2';

  const normalized = raw.toLowerCase();

  if (normalized === 'veo_3_1-fast-4k') {
    return 'veo_3_1-fast';
  }

  if (
    normalized === 'veo' ||
    normalized === 'veo_3_1' ||
    normalized === 'veo-r2v' ||
    normalized.startsWith('veo_3_0_r2v')
  ) {
    return 'veo_3_1-fast';
  }

  return raw;
};

const SORA_COMPATIBLE_MODELS = new Set([
  'sora-2',
  'doubao-seedance-1-5-pro',
]);

export const resolveVideoModelRouting = (videoModel: string): VideoModelRouting => {
  const normalizedModelId = normalizeVideoModelIdForRouting(videoModel);
  const id = normalizedModelId.toLowerCase();

  if (SORA_COMPATIBLE_MODELS.has(id) || id.startsWith('sora')) {
    return {
      family: 'sora',
      normalizedModelId,
      supportsStartFrame: true,
      supportsEndFrame: false,
      prefersNineGridStoryboard: true,
    };
  }

  if (id.startsWith('doubao-seedance')) {
    return {
      family: 'doubao-task',
      normalizedModelId,
      supportsStartFrame: true,
      supportsEndFrame: false,
      prefersNineGridStoryboard: true,
    };
  }

  if (
    id.startsWith('veo_3_1-fast') ||
    id.startsWith('veo_3_1_t2v_fast') ||
    id.startsWith('veo_3_1_i2v_s_fast')
  ) {
    return {
      family: 'veo-fast',
      normalizedModelId,
      supportsStartFrame: true,
      supportsEndFrame: true,
      prefersNineGridStoryboard: true,
    };
  }

  return {
    family: 'unknown',
    normalizedModelId,
    supportsStartFrame: true,
    supportsEndFrame: true,
    prefersNineGridStoryboard: false,
  };
};

export const routeVideoFrameInputs = (
  videoModel: string,
  startImage?: string,
  endImage?: string,
  videoInputMode: 'keyframes' | 'storyboard-grid' = 'keyframes'
): {
  startImage?: string;
  endImage?: string;
  routing: VideoModelRouting;
  ignoredEndFrame: boolean;
} => {
  const routing = resolveVideoModelRouting(videoModel);
  const routedStartImage = startImage;
  const shouldIgnoreEndFrame =
    !!endImage && (!routing.supportsEndFrame || videoInputMode === 'storyboard-grid');
  const routedEndImage = shouldIgnoreEndFrame ? undefined : endImage;

  return {
    startImage: routedStartImage,
    endImage: routedEndImage,
    routing,
    ignoredEndFrame: shouldIgnoreEndFrame,
  };
};

/**
 * 获取镜头的参考图片
 * 增强版：如果角色有九宫格造型图，将整张九宫格图作为额外参考传入，
 * 并通过 hasTurnaround 标记告知调用方，以便在提示词中正确描述。
 */
export const getRefImagesForShot = (shot: Shot, scriptData: ProjectState['scriptData']): RefImagesResult => {
  const primaryImages: string[] = [];
  const turnaroundImages: string[] = [];

  if (!scriptData) {
    return {
      images: [],
      hasTurnaround: false,
      selectedTurnaroundCount: 0,
      droppedTurnaroundCount: 0,
    };
  }

  // 1. 场景参考图（环境/氛围） - 优先级最高
  const scene = scriptData.scenes.find(s => String(s.id) === String(shot.sceneId));
  if (scene?.referenceImage) {
    primaryImages.push(scene.referenceImage);
  }

  // 2. 角色参考图（外观）
  if (shot.characters) {
    shot.characters.forEach(charId => {
      const char = scriptData.characters.find(c => String(c.id) === String(charId));
      if (!char) return;

      // 检查是否为此镜头选择了特定变体
      const varId = shot.characterVariations?.[charId];
      if (varId) {
        const variation = char.variations?.find(v => v.id === varId);
        if (variation?.referenceImage) {
          primaryImages.push(variation.referenceImage);
          return; // 使用变体图片而不是基础图片
        }
      }

      // 基础参考图
      if (char.referenceImage) {
        primaryImages.push(char.referenceImage);
      }

      // 九宫格造型图属于“增强参考”，只在还有余量时再补充
      if (char.turnaround?.status === 'completed' && char.turnaround.imageUrl) {
        turnaroundImages.push(char.turnaround.imageUrl);
      }
    });
  }

  // 3. 道具参考图（物品一致性）
  if (shot.props && scriptData.props) {
    shot.props.forEach(propId => {
      const prop = scriptData.props.find(p => String(p.id) === String(propId));
      if (prop?.referenceImage) {
        primaryImages.push(prop.referenceImage);
      }
    });
  }

  const dedupedPrimary = dedupeImageRefs(primaryImages);
  const primarySet = new Set(dedupedPrimary);
  const dedupedTurnaround = dedupeImageRefs(turnaroundImages).filter((img) => !primarySet.has(img));
  const remainingSlots = Math.max(0, MAX_SHOT_REFERENCE_IMAGES - dedupedPrimary.length);
  const selectedTurnaround = dedupedTurnaround.slice(0, remainingSlots);

  return {
    images: [...dedupedPrimary, ...selectedTurnaround],
    hasTurnaround: selectedTurnaround.length > 0,
    selectedTurnaroundCount: selectedTurnaround.length,
    droppedTurnaroundCount: Math.max(0, dedupedTurnaround.length - selectedTurnaround.length),
  };
};

/**
 * 获取镜头关联的道具信息（用于提示词注入）
 * hasImage 标记该道具是否有参考图，用于提示词中区分"参考图一致性"和"文字描述约束"
 */
export const getPropsInfoForShot = (shot: Shot, scriptData: ProjectState['scriptData']): { name: string; description: string; hasImage: boolean }[] => {
  if (!scriptData || !shot.props || !scriptData.props) return [];
  
  return shot.props
    .map(propId => scriptData.props.find(p => String(p.id) === String(propId)))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map(p => ({ name: p.name, description: p.description || p.visualPrompt || '', hasImage: !!p.referenceImage }));
};

/**
 * 构建关键帧提示词 - 简化版
 * 为起始帧和结束帧生成基础的视觉描述
 * @param propsInfo - 可选，镜头关联的道具信息列表
 */
export const buildKeyframePrompt = (
  basePrompt: string,
  visualStyle: string,
  cameraMovement: string,
  frameType: 'start' | 'end',
  propsInfo?: { name: string; description: string; hasImage: boolean }[],
  promptTemplates?: PromptTemplateConfig
): string => {
  const templates = promptTemplates || resolvePromptTemplateConfig();
  const stylePrompt = VISUAL_STYLE_PROMPTS[visualStyle] || visualStyle;
  const cameraGuide = getCameraMovementCompositionGuide(cameraMovement, frameType);
  const startFrameGuideTemplate = withTemplateFallback(
    templates.keyframe.startFrameGuide,
    DEFAULT_PROMPT_TEMPLATE_CONFIG.keyframe.startFrameGuide
  );
  const endFrameGuideTemplate = withTemplateFallback(
    templates.keyframe.endFrameGuide,
    DEFAULT_PROMPT_TEMPLATE_CONFIG.keyframe.endFrameGuide
  );
  const characterConsistencyTemplate = withTemplateFallback(
    templates.keyframe.characterConsistencyGuide,
    DEFAULT_PROMPT_TEMPLATE_CONFIG.keyframe.characterConsistencyGuide
  );
  const propWithImageTemplate = withTemplateFallback(
    templates.keyframe.propWithImageGuide,
    DEFAULT_PROMPT_TEMPLATE_CONFIG.keyframe.propWithImageGuide
  );
  const propWithoutImageTemplate = withTemplateFallback(
    templates.keyframe.propWithoutImageGuide,
    DEFAULT_PROMPT_TEMPLATE_CONFIG.keyframe.propWithoutImageGuide
  );
  
  // 针对起始帧和结束帧的特定指导
  const frameSpecificGuide = frameType === 'start'
    ? startFrameGuideTemplate
    : endFrameGuideTemplate;

  // 角色一致性要求
  const characterConsistencyGuide = characterConsistencyTemplate;

  // 道具一致性要求（仅在有道具时添加）
  let propConsistencyGuide = '';
  if (propsInfo && propsInfo.length > 0) {
    const propsWithImage = propsInfo.filter(p => p.hasImage);
    const propsWithoutImage = propsInfo.filter(p => !p.hasImage);

    let sections: string[] = [];

    // 有参考图的道具：要求严格遵循参考图
    if (propsWithImage.length > 0) {
      const list = propsWithImage.map(p => `- ${p.name}: ${p.description}`).join('\n');
      sections.push(
        renderPromptTemplate(propWithImageTemplate, { propList: list })
      );
    }

    // 无参考图的道具：仅文字描述约束
    if (propsWithoutImage.length > 0) {
      const list = propsWithoutImage.map(p => `- ${p.name}: ${p.description}`).join('\n');
      sections.push(
        renderPromptTemplate(propWithoutImageTemplate, { propList: list })
      );
    }

    propConsistencyGuide = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【道具一致性要求】PROP CONSISTENCY REQUIREMENTS
${sections.join('\n\n')}`;
  }

  return `${basePrompt}${KEYFRAME_META_SPLITTER}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【视觉风格】Visual Style
${stylePrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【镜头运动】Camera Movement
${cameraMovement} (${frameType === 'start' ? 'Initial Frame 起始帧' : 'Final Frame 结束帧'})

【构图指导】Composition Guide
${cameraGuide}

${frameSpecificGuide}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${characterConsistencyGuide}${propConsistencyGuide}`;
};

/**
 * 构建关键帧提示词 - AI增强版
 * 使用LLM动态生成详细的技术规格和视觉细节
 * @param basePrompt - 基础提示词
 * @param visualStyle - 视觉风格
 * @param cameraMovement - 镜头运动
 * @param frameType - 帧类型
 * @param enhanceWithAI - 是否使用AI增强(默认true)
 * @param propsInfo - 可选，镜头关联的道具信息列表
 * @returns 返回完整的提示词或Promise
 */
export const buildKeyframePromptWithAI = async (
  basePrompt: string,
  visualStyle: string,
  cameraMovement: string,
  frameType: 'start' | 'end',
  enhanceWithAI: boolean = true,
  propsInfo?: { name: string; description: string; hasImage: boolean }[],
  promptTemplates?: PromptTemplateConfig
): Promise<string> => {
  // 先构建基础提示词
  const basicPrompt = buildKeyframePrompt(
    basePrompt,
    visualStyle,
    cameraMovement,
    frameType,
    propsInfo,
    promptTemplates
  );
  
  // 如果不需要AI增强,直接返回基础提示词
  if (!enhanceWithAI) {
    return basicPrompt;
  }
  
  // Use direct import from aiService; keep fallback behavior if enhancement fails.
  try {
    const enhanced = await enhanceKeyframePrompt(basicPrompt, visualStyle, cameraMovement, frameType);
    return enhanced;
  } catch (error) {
    console.error('AI增强失败,使用基础提示词:', error);
    return basicPrompt;
  }
};

/**
 * 构建视频生成提示词
 * @param visualStyle - 项目视觉风格，用于给视频生成添加风格锚点
 * @param nineGrid - 可选，如果首帧来自九宫格整图，则使用九宫格分镜模式的视频提示词
 * @param videoDuration - 视频总时长（秒），用于计算九宫格模式下每个面板的停留时间
 */
const MAX_VIDEO_PROMPT_CHARS = 5000;
const NINE_GRID_VIDEO_GUARDRAIL_MARKER = '[NINE_GRID_FULLSCREEN_SEQUENCE_RULES_V2]';

const normalizePromptField = (input: string): string =>
  String(input || '')
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const isChineseLanguage = (language: string): boolean => {
  const normalized = String(language || '').trim().toLowerCase();
  return normalized === '中文' || normalized === 'chinese' || normalized.startsWith('zh');
};

const compactPromptField = (
  input: string,
  maxChars: number,
  maxWords: number
): string => {
  const normalized = normalizePromptField(input);
  if (!normalized) return '';

  let candidate = normalized;
  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    candidate = words.slice(0, maxWords).join(' ');
  }

  const chars = Array.from(candidate);
  if (chars.length > maxChars) {
    candidate = chars.slice(0, maxChars).join('');
  }

  candidate = candidate.replace(/[,\s;:.!?]+$/g, '');
  return candidate.length < normalized.length ? `${candidate}...` : candidate;
};

const buildNineGridVideoGuardrails = (panelCount: number, language: string): string => {
  const count = Math.max(1, Math.floor(panelCount || 1));
  if (isChineseLanguage(language)) {
    return `${NINE_GRID_VIDEO_GUARDRAIL_MARKER}
HARD RULES（最高优先级）：
- 视频必须始终为单画面全屏输出，任意时刻只能有一个镜头占满100%画面。
- 严禁九宫格/六宫格/四宫格分屏、拼贴、画中画、多窗口、缩略图墙、多个面板并行动画。
- 网格图只作为镜头顺序参考，不是可展示内容。
- 镜头必须按 1→${count} 顺序逐个切换（可硬切或自然转场），禁止多个面板同时出现或同时运动。
- 若冲突，优先保证“单画面全屏 + 顺序切镜”，宁可忽略网格排版外观。`;
  }

  return `${NINE_GRID_VIDEO_GUARDRAIL_MARKER}
HARD RULES (HIGHEST PRIORITY):
- The video must remain single-shot full-screen at all times, with exactly one shot occupying 100% of the frame.
- Strictly forbid split-screen, collage, picture-in-picture, multi-window, thumbnail wall, or parallel multi-panel animation.
- The grid image is shot-order reference only, never visible output content.
- Transition strictly in order 1→${count}, one shot at a time (hard cuts or motivated transitions); never show multiple panels simultaneously.
- If constraints conflict, prioritize "single full-screen shot + sequential cuts" over preserving the grid layout appearance.`;
};

export const ensureNineGridVideoPromptGuardrails = (
  prompt: string,
  panelCount: number,
  language: string
): string => {
  const base = String(prompt || '').trim();
  if (!base) return base;
  if (base.includes(NINE_GRID_VIDEO_GUARDRAIL_MARKER)) return base;
  return `${base}\n\n${buildNineGridVideoGuardrails(panelCount, language)}`;
};

const buildNineGridPanelDescriptionsWithBudget = (
  panels: NineGridPanel[],
  budgetChars: number
): string => {
  if (!panels.length) return '';

  const prefixes = panels.map((panel, idx) => {
    const shotSize = normalizePromptField(panel.shotSize) || 'shot';
    const cameraAngle = normalizePromptField(panel.cameraAngle) || 'angle';
    return `${idx + 1}. [FULLSCREEN] ${shotSize}/${cameraAngle} - `;
  });

  const overhead = prefixes.reduce((sum, prefix) => sum + Array.from(prefix).length, 0) + Math.max(0, panels.length - 1);
  const availableForDescriptions = Math.max(9 * 28, budgetChars - overhead);
  const perPanelChars = Math.max(28, Math.floor(availableForDescriptions / panels.length));
  const perPanelWords = Math.max(8, Math.min(24, Math.floor(perPanelChars / 5)));

  return panels
    .map((panel, idx) => {
      const description = compactPromptField(panel.description, perPanelChars, perPanelWords);
      return `${prefixes[idx]}${description || 'subject action and composition continuity.'}`;
    })
    .join('\n');
};

const fitVideoPromptLength = (input: string, maxChars: number = MAX_VIDEO_PROMPT_CHARS): string => {
  let prompt = String(input || '')
    .replace(/\r/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const length = () => Array.from(prompt).length;
  if (length() <= maxChars) return prompt;

  prompt = prompt
    .split('\n')
    .map((line) => {
      if (Array.from(line).length <= 220) return line;
      return compactPromptField(line, 200, 42);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (length() <= maxChars) return prompt;

  const chars = Array.from(prompt);
  const hardCut = chars.slice(0, maxChars).join('');
  const breakpoints = ['\n\n', '\n', '. ', '; '];
  let best = -1;
  breakpoints.forEach((marker) => {
    const idx = hardCut.lastIndexOf(marker);
    if (idx > best) best = idx;
  });

  if (best > Math.floor(maxChars * 0.6)) {
    return hardCut.slice(0, best).trimEnd();
  }

  return hardCut.trimEnd();
};

export const buildVideoPrompt = (
  actionSummary: string,
  cameraMovement: string,
  videoModel: string,
  language: string,
  visualStyle: string,
  nineGrid?: NineGridData,
  videoDuration?: number,
  context?: VideoPromptContext,
  promptTemplates?: PromptTemplateConfig
): string => {
  const templates = promptTemplates || resolvePromptTemplateConfig();
  const isChinese = isChineseLanguage(language);
  const stylePrompt = VISUAL_STYLE_PROMPTS[visualStyle] || visualStyle;
  const visualStyleAnchor = compactPromptField(`${visualStyle} (${stylePrompt})`, 220, 40);
  const compactActionSummary = compactPromptField(actionSummary, 900, 160);
  const compactCameraMovement = compactPromptField(cameraMovement, 220, 48);
  
  const routing = resolveVideoModelRouting(videoModel);
  const hasUsableEndFrame = !!context?.hasEndFrame && routing.supportsEndFrame;
  const hasIgnoredEndFrame = !!context?.hasEndFrame && !routing.supportsEndFrame;

  const appendCapabilityNotes = (prompt: string): string => {
    const endFrameConstraint = hasUsableEndFrame
      ? '\n\nEND FRAME CONSTRAINT: Drive the final moment toward the provided end-frame composition, pose, and scene continuity.'
      : '';
    const ignoredEndFrameNote = hasIgnoredEndFrame
      ? '\n\nCapability routing: this model is start-frame-driven, so end-frame input is ignored automatically.'
      : '';
    return fitVideoPromptLength(`${prompt}${endFrameConstraint}${ignoredEndFrameNote}`);
  };

  // 网格分镜模式：按总预算动态压缩每个 panel 描述，保留顺序与镜头意图
  if (nineGrid && nineGrid.panels.length > 0 && routing.prefersNineGridStoryboard) {
    const layout = resolveStoryboardGridLayout(nineGrid.layout?.panelCount, nineGrid.panels.length);
    const panelCount = Math.max(1, Math.min(layout.panelCount, nineGrid.panels.length));
    const orderedPanels = nineGrid.panels.slice(0, panelCount);
    const gridLayoutText = `${layout.cols}x${layout.rows}`;
    const totalDuration = Math.max(1, videoDuration || 8);
    // Keep per-panel pacing compatible with very short durations (e.g. 4s) without exceeding total duration.
    const secondsPerPanel = Math.max(0.2, Math.floor((totalDuration / panelCount) * 100) / 100);
    
    const template = isChinese
      ? withTemplateFallback(
          templates.video.sora2NineGridChinese,
          DEFAULT_PROMPT_TEMPLATE_CONFIG.video.sora2NineGridChinese
        )
      : withTemplateFallback(
          templates.video.sora2NineGridEnglish,
          DEFAULT_PROMPT_TEMPLATE_CONFIG.video.sora2NineGridEnglish
        );
    const promptWithoutPanels = template
      .replace('{actionSummary}', compactActionSummary)
      .replace('{panelDescriptions}', '')
      .replace(/\{gridLayout\}/g, gridLayoutText)
      .replace(/\{panelCount\}/g, String(panelCount))
      .replace(/\{secondsPerPanel\}/g, String(secondsPerPanel))
      .replace('{cameraMovement}', compactCameraMovement)
      .replace('{visualStyle}', visualStyleAnchor)
      .replace('{language}', language);
    const panelBudget = Math.max(900, MAX_VIDEO_PROMPT_CHARS - Array.from(promptWithoutPanels).length - 180);
    const panelDescriptions = buildNineGridPanelDescriptionsWithBudget(orderedPanels, panelBudget);
    
    const routedPrompt = template
      .replace('{actionSummary}', compactActionSummary)
      .replace('{panelDescriptions}', panelDescriptions)
      .replace(/\{gridLayout\}/g, gridLayoutText)
      .replace(/\{panelCount\}/g, String(panelCount))
      .replace(/\{secondsPerPanel\}/g, String(secondsPerPanel))
      .replace('{cameraMovement}', compactCameraMovement)
      .replace('{visualStyle}', visualStyleAnchor)
      .replace('{language}', language);
    return appendCapabilityNotes(
      ensureNineGridVideoPromptGuardrails(routedPrompt, panelCount, language)
    );
  }
  
  // 普通模式
  if (routing.family === 'sora' || routing.family === 'doubao-task') {
    const template = isChinese
      ? withTemplateFallback(
          templates.video.sora2Chinese,
          DEFAULT_PROMPT_TEMPLATE_CONFIG.video.sora2Chinese
        )
      : withTemplateFallback(
          templates.video.sora2English,
          DEFAULT_PROMPT_TEMPLATE_CONFIG.video.sora2English
        );
    
    const routedPrompt = template
      .replace('{actionSummary}', compactActionSummary)
      .replace('{cameraMovement}', compactCameraMovement)
      .replace('{visualStyle}', visualStyleAnchor)
      .replace('{language}', language);
    return appendCapabilityNotes(routedPrompt);
  }
  const fallbackStartOnly = `Use the provided start frame as the exact opening composition.
Action: {actionSummary}
Camera Movement: {cameraMovement}
Visual Style Anchor: {visualStyle}
Language: {language}
Keep identity, scene lighting, and prop details consistent throughout the shot.`;
  const fallbackStartEnd = `Use the provided START and END frames as hard constraints.
Action: {actionSummary}
Camera Movement: {cameraMovement}
Visual Style Anchor: {visualStyle}
Language: {language}
The video must start from the start frame composition and progress naturally to a final state that matches the end frame.`;
  const template = hasUsableEndFrame
    ? withTemplateFallback(
        templates.video.veoStartEnd,
        withTemplateFallback(
          DEFAULT_PROMPT_TEMPLATE_CONFIG.video.veoStartEnd,
          fallbackStartEnd
        )
      )
    : withTemplateFallback(
        templates.video.veoStartOnly,
        withTemplateFallback(
          DEFAULT_PROMPT_TEMPLATE_CONFIG.video.veoStartOnly,
          fallbackStartOnly
        )
      );

  const routedPrompt = template
      .replace('{actionSummary}', compactActionSummary)
      .replace('{cameraMovement}', compactCameraMovement)
      .replace('{visualStyle}', visualStyleAnchor)
      .replace('{language}', isChinese ? '中文' : language);
  return appendCapabilityNotes(routedPrompt);
};

/**
 * 从现有提示词中提取基础部分（移除追加的样式信息）
 */
export const extractBasePrompt = (fullPrompt: string, fallback: string): string => {
  const sourcePrompt = (fullPrompt || '').trim();
  if (!sourcePrompt) {
    return fallback;
  }

  const splitters = [
    KEYFRAME_META_SPLITTER,
    '\n\n【视觉风格】Visual Style',
    '\n\nVisual Style:'
  ];

  for (const splitter of splitters) {
    const splitIndex = sourcePrompt.indexOf(splitter);
    if (splitIndex > 0) {
      return sourcePrompt.substring(0, splitIndex);
    }
  }

  return sourcePrompt;
};

/**
 * 生成唯一ID
 */
export const generateId = (prefix: string): string => {
  return `${prefix}-${Date.now()}`;
};

/**
 * 延迟执行
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * 图片文件转base64
 */
export const convertImageToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      resolve(event.target?.result as string);
    };
    reader.onerror = () => {
      reject(new Error('读取文件失败'));
    };
    reader.readAsDataURL(file);
  });
};

/**
 * 创建关键帧对象
 */
export const createKeyframe = (
  id: string,
  type: 'start' | 'end',
  visualPrompt: string,
  imageUrl?: string,
  status: 'pending' | 'generating' | 'completed' | 'failed' = 'pending'
): Keyframe => {
  return {
    id,
    type,
    visualPrompt,
    imageUrl,
    status
  };
};

/**
 * 更新镜头中的关键帧
 */
export const updateKeyframeInShot = (
  shot: Shot,
  type: 'start' | 'end',
  keyframe: Keyframe
): Shot => {
  const newKeyframes = [...(shot.keyframes || [])];
  const idx = newKeyframes.findIndex(k => k.type === type);
  
  if (idx >= 0) {
    const previous = newKeyframes[idx];
    newKeyframes[idx] =
      keyframe.promptVersions === undefined
        ? { ...keyframe, promptVersions: previous.promptVersions }
        : keyframe;
  } else {
    newKeyframes.push(keyframe);
  }
  
  return { ...shot, keyframes: newKeyframes };
};

/**
 * 生成子镜头ID数组
 * @param originalShotId - 原始镜头ID（如 "shot-1"）
 * @param count - 子镜头数量
 * @returns 子镜头ID数组（如 ["shot-1-1", "shot-1-2", "shot-1-3"]）
 */
export const generateSubShotIds = (originalShotId: string, count: number): string[] => {
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    ids.push(`${originalShotId}-${i}`);
  }
  return ids;
};

/**
 * 创建子镜头对象
 * @param originalShot - 原始镜头对象
 * @param subShotData - AI返回的子镜头数据
 * @param subShotId - 子镜头ID
 * @returns 新的Shot对象
 */
export const createSubShot = (
  originalShot: Shot,
  subShotData: any,
  subShotId: string
): Shot => {
  // 处理关键帧数组
  const keyframes: any[] = [];
  if (subShotData.keyframes && Array.isArray(subShotData.keyframes)) {
    subShotData.keyframes.forEach((kf: any) => {
      if (kf.type && kf.visualPrompt) {
        keyframes.push({
          id: `${subShotId}-${kf.type}`, // 如 "shot-1-1-start", "shot-1-1-end"
          type: kf.type,
          visualPrompt: kf.visualPrompt,
          status: 'pending' // 初始状态为pending，等待用户生成图像
        });
      }
    });
  }
  
  return {
    id: subShotId,
    sceneId: originalShot.sceneId, // 继承原镜头的场景ID
    actionSummary: subShotData.actionSummary, // 使用AI生成的动作描述
    dialogue: undefined, // 不继承对白 - 对白通常只在特定子镜头中出现，由AI在actionSummary中体现
    cameraMovement: subShotData.cameraMovement, // 使用AI生成的镜头运动
    shotSize: subShotData.shotSize, // 使用AI生成的景别
    characters: [...originalShot.characters], // 继承角色列表
    characterVariations: { ...originalShot.characterVariations }, // 继承角色变体映射
    keyframes: keyframes, // 使用AI生成的关键帧（包含visualPrompt）
    videoModel: originalShot.videoModel // 继承视频模型设置
  };
};

/**
 * 用子镜头数组替换原镜头
 * @param shots - 原始镜头数组
 * @param originalShotId - 要替换的原镜头ID
 * @param subShots - 子镜头数组
 * @returns 更新后的镜头数组
 */
export const replaceShotWithSubShots = (
  shots: Shot[],
  originalShotId: string,
  subShots: Shot[]
): Shot[] => {
  const originalIndex = shots.findIndex(s => s.id === originalShotId);
  
  if (originalIndex === -1) {
    console.error(`未找到ID为 ${originalShotId} 的镜头`);
    return shots;
  }
  
  // 创建新数组，在原位置插入子镜头
  const newShots = [
    ...shots.slice(0, originalIndex),
    ...subShots,
    ...shots.slice(originalIndex + 1)
  ];
  
  return newShots;
};

// ============================================
// 九宫格分镜预览工具函数（高级功能）
// ============================================

/**
 * 将选中的九宫格面板描述转换为首帧提示词
 * 将九宫格中选定的视角信息融合到首帧提示词中
 * @param panel - 选中的九宫格面板
 * @param actionSummary - 原始动作描述
 * @param visualStyle - 视觉风格
 * @param cameraMovement - 原始镜头运动
 * @returns 构建好的首帧提示词
 */
export const buildPromptFromNineGridPanel = (
  panel: NineGridPanel,
  actionSummary: string,
  visualStyle: string,
  cameraMovement: string,
  propsInfo?: { name: string; description: string; hasImage: boolean }[],
  layout?: NineGridData['layout'],
  promptTemplates?: PromptTemplateConfig
): string => {
  const templates = promptTemplates || resolvePromptTemplateConfig();
  const stylePrompt = VISUAL_STYLE_PROMPTS[visualStyle] || visualStyle;
  const characterConsistencyTemplate = withTemplateFallback(
    templates.keyframe.characterConsistencyGuide,
    DEFAULT_PROMPT_TEMPLATE_CONFIG.keyframe.characterConsistencyGuide
  );
  const propWithImageTemplate = withTemplateFallback(
    templates.keyframe.propWithImageGuide,
    DEFAULT_PROMPT_TEMPLATE_CONFIG.keyframe.propWithImageGuide
  );
  const propWithoutImageTemplate = withTemplateFallback(
    templates.keyframe.propWithoutImageGuide,
    DEFAULT_PROMPT_TEMPLATE_CONFIG.keyframe.propWithoutImageGuide
  );
  const nineGridSourceMetaTemplate = withTemplateFallback(
    templates.keyframe.nineGridSourceMeta,
    DEFAULT_PROMPT_TEMPLATE_CONFIG.keyframe.nineGridSourceMeta
  );
  const sourceLabel = getStoryboardPositionLabel(
    panel.index,
    layout?.panelCount,
    layout?.panelCount
  );
  
  // 角色一致性要求
  const characterConsistencyGuide = characterConsistencyTemplate;

  // 道具一致性要求（仅在有道具时添加）
  let propConsistencyGuide = '';
  if (propsInfo && propsInfo.length > 0) {
    const propsWithImage = propsInfo.filter(p => p.hasImage);
    const propsWithoutImage = propsInfo.filter(p => !p.hasImage);

    let sections: string[] = [];

    if (propsWithImage.length > 0) {
      const list = propsWithImage.map(p => `- ${p.name}: ${p.description}`).join('\n');
      sections.push(
        renderPromptTemplate(propWithImageTemplate, { propList: list })
      );
    }

    if (propsWithoutImage.length > 0) {
      const list = propsWithoutImage.map(p => `- ${p.name}: ${p.description}`).join('\n');
      sections.push(
        renderPromptTemplate(propWithoutImageTemplate, { propList: list })
      );
    }

    propConsistencyGuide = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【道具一致性要求】PROP CONSISTENCY REQUIREMENTS
${sections.join('\n\n')}`;
  }

  return `${panel.description}${KEYFRAME_META_SPLITTER}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${renderPromptTemplate(nineGridSourceMetaTemplate, {
  sourceLabel,
  shotSize: panel.shotSize,
  cameraAngle: panel.cameraAngle,
  actionSummary,
})}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【视觉风格】Visual Style
${stylePrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【镜头运动】Camera Movement
${cameraMovement}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${characterConsistencyGuide}${propConsistencyGuide}`;
};

/**
 * 从网格分镜图中裁剪出指定面板的图片
 * 支持 2x2 / 3x2 / 3x3 网格布局
 * @param nineGridImageUrl - 网格整图 (base64)
 * @param panelIndex - 面板索引 (0-(panelCount-1))
 * @param layout - 网格布局（可选，默认按 3x3 兼容）
 * @returns 裁剪后的 base64 图片
 */
export const cropPanelFromNineGrid = (
  nineGridImageUrl: string,
  panelIndex: number,
  layout?: NineGridData['layout']
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const resolvedLayout = resolveStoryboardGridLayout(layout?.panelCount, layout?.panelCount);
        if (panelIndex < 0 || panelIndex >= resolvedLayout.panelCount) {
          reject(new Error(`面板索引越界: ${panelIndex}`));
          return;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法创建 Canvas 上下文'));
          return;
        }
        
        // 计算裁剪区域：动态网格（2x2 / 3x2 / 3x3）
        const col = panelIndex % resolvedLayout.cols;
        const row = Math.floor(panelIndex / resolvedLayout.cols);
        
        const panelWidth = img.width / resolvedLayout.cols;
        const panelHeight = img.height / resolvedLayout.rows;
        
        const sx = col * panelWidth;
        const sy = row * panelHeight;
        
        // 设置输出 canvas 尺寸为单个面板大小
        canvas.width = Math.round(panelWidth);
        canvas.height = Math.round(panelHeight);
        
        // 裁剪并绘制
        ctx.drawImage(
          img,
          Math.round(sx), Math.round(sy),   // 源坐标
          Math.round(panelWidth), Math.round(panelHeight), // 源尺寸
          0, 0,                               // 目标坐标
          canvas.width, canvas.height          // 目标尺寸
        );
        
        // 转换为 base64
        const croppedBase64 = canvas.toDataURL('image/png');
        resolve(croppedBase64);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      reject(new Error('网格分镜图片加载失败'));
    };
    img.src = nineGridImageUrl;
  });
};
