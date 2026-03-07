/**
 * 分镜辅助服务
 * 包含关键帧优化、动作生成、镜头拆分、九宫格分镜等功能
 */

import {
  AspectRatio,
  NineGridPanel,
  PromptTemplateConfig,
  StoryboardGridPanelCount,
} from "../../types";
import { addRenderLogWithTokens } from '../renderLogService';
import {
  retryOperation,
  chatCompletion,
  getActiveChatModel,
  parseJsonWithRecovery,
} from './apiCore';
import { getStylePromptCN, getStylePrompt } from './promptConstants';
import { generateImage } from './visualService';
import {
  NINE_GRID_SPLIT_PROMPT,
  NINE_GRID_IMAGE_PROMPT_TEMPLATE,
  resolveStoryboardGridLayout,
} from './storyboardPromptTemplates';
import {
  DEFAULT_PROMPT_TEMPLATE_CONFIG,
  renderPromptTemplate,
  resolvePromptTemplateConfig,
  withTemplateFallback,
} from '../promptTemplateService';

const countEnglishWords = (text: string): number => {
  const matches = String(text || '').trim().match(/[A-Za-z0-9'-]+/g);
  return matches ? matches.length : 0;
};

const parseAndValidateNineGridPanels = (
  responseText: string,
  expectedPanelCount: number
): NineGridPanel[] => {
  const parsed = parseJsonWithRecovery<any>(responseText, { panels: [] });
  const rawPanels = Array.isArray(parsed?.panels) ? parsed.panels : [];

  if (rawPanels.length !== expectedPanelCount) {
    throw new Error(`AI返回的panel数量为 ${rawPanels.length}，必须为 ${expectedPanelCount}`);
  }

  const usedIndexes = new Set<number>();
  const normalizedPanels = rawPanels.map((p: any) => {
    const rawIndex = Number(p?.index);
    if (!Number.isInteger(rawIndex)) {
      throw new Error('panel.index 必须为整数');
    }
    if (rawIndex < 0 || rawIndex >= expectedPanelCount) {
      throw new Error(`panel.index 超出范围（当前 ${rawIndex}，要求 0-${expectedPanelCount - 1}）`);
    }
    if (usedIndexes.has(rawIndex)) {
      throw new Error(`panel.index 重复（index=${rawIndex}）`);
    }
    usedIndexes.add(rawIndex);

    return {
      index: rawIndex,
      shotSize: String(p?.shotSize || '').trim(),
      cameraAngle: String(p?.cameraAngle || '').trim(),
      description: String(p?.description || '').trim(),
    };
  });

  const orderedPanels = [...normalizedPanels].sort((a, b) => a.index - b.index);
  const missingIndex = orderedPanels.findIndex((p, idx) => p.index !== idx);
  if (missingIndex !== -1) {
    throw new Error(`panel.index 缺失或乱序（期望 index=${missingIndex}）`);
  }

  const invalidPanel = orderedPanels.find(p => !p.shotSize || !p.cameraAngle || !p.description);
  if (invalidPanel) {
    throw new Error('AI返回的panel字段不完整（shotSize/cameraAngle/description 不能为空）');
  }

  const invalidLengthPanel = orderedPanels.find((p) => {
    const words = countEnglishWords(p.description);
    return words < 10 || words > 30;
  });
  if (invalidLengthPanel) {
    const words = countEnglishWords(invalidLengthPanel.description);
    throw new Error(`panel description 词数超出范围（当前 ${words}，要求 10-30）`);
  }

  const seenViewCombos = new Set<string>();
  for (const panel of orderedPanels) {
    const combo = `${panel.shotSize}__${panel.cameraAngle}`;
    if (seenViewCombos.has(combo)) {
      throw new Error(`存在重复视角组合：${panel.shotSize}/${panel.cameraAngle}`);
    }
    seenViewCombos.add(combo);
  }

  const uniqueShotSizes = new Set(orderedPanels.map((p) => p.shotSize)).size;
  const requiredShotSizeKinds = expectedPanelCount >= 6 ? 3 : 2;
  if (uniqueShotSizes < requiredShotSizeKinds) {
    throw new Error(`shotSize 多样性不足（当前 ${uniqueShotSizes}，至少 ${requiredShotSizeKinds}）`);
  }

  return orderedPanels;
};

const parseNineGridTranslations = (
  responseText: string,
  expectedPanelCount: number
): { index: number; descriptionZh: string }[] => {
  const parsed = parseJsonWithRecovery<any>(responseText, { translations: [] });
  const rawTranslations = Array.isArray(parsed?.translations) ? parsed.translations : [];

  if (rawTranslations.length !== expectedPanelCount) {
    throw new Error(`翻译数量异常：当前 ${rawTranslations.length}，应为 ${expectedPanelCount}`);
  }

  const seenIndexes = new Set<number>();
  const normalized = rawTranslations.map((item: any) => {
    const index = Number(item?.index);
    if (!Number.isInteger(index)) {
      throw new Error('translations.index 必须为整数');
    }
    if (index < 0 || index >= expectedPanelCount) {
      throw new Error(`translations.index 超出范围（当前 ${index}，要求 0-${expectedPanelCount - 1}）`);
    }
    if (seenIndexes.has(index)) {
      throw new Error(`translations.index 重复（index=${index}）`);
    }
    seenIndexes.add(index);

    const descriptionZh = String(item?.descriptionZh || '').trim();
    if (!descriptionZh) {
      throw new Error(`第 ${index + 1} 格翻译为空`);
    }

    return { index, descriptionZh };
  });

  const ordered = [...normalized].sort((a, b) => a.index - b.index);
  const missingIndex = ordered.findIndex((item, idx) => item.index !== idx);
  if (missingIndex !== -1) {
    throw new Error(`translations 缺失 index=${missingIndex}`);
  }

  return ordered;
};


// ============================================
// 关键帧优化
// ============================================

/**
 * AI一次性优化起始帧和结束帧视觉描述（推荐使用）
 */
export const optimizeBothKeyframes = async (
  actionSummary: string,
  cameraMovement: string,
  sceneInfo: { location: string; time: string; atmosphere: string },
  characterInfo: string[],
  visualStyle: string,
  model: string = 'gpt-5.2',
  promptTemplates?: PromptTemplateConfig
): Promise<{ startPrompt: string; endPrompt: string }> => {
  console.log('🎨 optimizeBothKeyframes 调用 - 同时优化起始帧和结束帧 - 使用模型:', model);
  const startTime = Date.now();

  const styleDesc = getStylePromptCN(visualStyle);

  const templates = promptTemplates || resolvePromptTemplateConfig();
  const template = withTemplateFallback(
    templates.keyframe.optimizeBoth,
    DEFAULT_PROMPT_TEMPLATE_CONFIG.keyframe.optimizeBoth
  );
  const prompt = renderPromptTemplate(template, {
    sceneLocation: sceneInfo.location,
    sceneTime: sceneInfo.time,
    sceneAtmosphere: sceneInfo.atmosphere,
    actionSummary,
    cameraMovement,
    characters: characterInfo.length > 0 ? characterInfo.join('。') : '无特定角色',
    styleDesc,
  });

  try {
    const result = await retryOperation(() => chatCompletion(prompt, model, 0.7, 2048, 'json_object'));
    const duration = Date.now() - startTime;

    const parsed = parseJsonWithRecovery<any>(result, {});

    if (!parsed.startFrame || !parsed.endFrame) {
      throw new Error('AI返回的JSON格式不正确');
    }

    console.log('✅ AI同时优化起始帧和结束帧成功，耗时:', duration, 'ms');

    return {
      startPrompt: parsed.startFrame.trim(),
      endPrompt: parsed.endFrame.trim()
    };
  } catch (error: any) {
    console.error('❌ AI关键帧优化失败:', error);
    throw new Error(`AI关键帧优化失败: ${error.message}`);
  }
};

/**
 * AI优化单个关键帧视觉描述（兼容旧版，建议使用 optimizeBothKeyframes）
 */
export const optimizeKeyframePrompt = async (
  frameType: 'start' | 'end',
  actionSummary: string,
  cameraMovement: string,
  sceneInfo: { location: string; time: string; atmosphere: string },
  characterInfo: string[],
  visualStyle: string,
  model: string = 'gpt-5.2',
  promptTemplates?: PromptTemplateConfig
): Promise<string> => {
  console.log(`🎨 optimizeKeyframePrompt 调用 - ${frameType === 'start' ? '起始帧' : '结束帧'} - 使用模型:`, model);
  const startTime = Date.now();

  const frameLabel = frameType === 'start' ? '起始帧' : '结束帧';
  const frameFocus = frameType === 'start'
    ? '初始状态、起始姿态、预备动作、场景建立'
    : '最终状态、结束姿态、动作完成、情绪高潮';

  const styleDesc = getStylePromptCN(visualStyle);

  const frameSpecificRequirementsTemplate = frameType === 'start'
    ? `
- 建立清晰的初始场景和人物状态
- 为即将发生的动作预留视觉空间和动势
- 设定光影和色调基调
- 展现角色的起始表情、姿态和位置
- 根据镜头运动（{cameraMovement}）设置合适的初始构图
- 营造场景氛围，让观众明确故事的起点
`
    : `
- 展现动作完成后的最终状态和结果
- 体现镜头运动（{cameraMovement}）带来的视角和构图变化
- 展现角色的情绪变化、最终姿态和位置
- 可以有戏剧性的光影和色彩变化
- 达到视觉高潮或情绪释放点
- 为下一个镜头的衔接做准备
`;
  const frameSpecificRequirements = renderPromptTemplate(
    frameSpecificRequirementsTemplate,
    { cameraMovement }
  );
  const templates = promptTemplates || resolvePromptTemplateConfig();
  const template = withTemplateFallback(
    templates.keyframe.optimizeSingle,
    DEFAULT_PROMPT_TEMPLATE_CONFIG.keyframe.optimizeSingle
  );
  const prompt = renderPromptTemplate(template, {
    frameLabel,
    frameFocus,
    frameSpecificRequirements,
    sceneLocation: sceneInfo.location,
    sceneTime: sceneInfo.time,
    sceneAtmosphere: sceneInfo.atmosphere,
    actionSummary,
    cameraMovement,
    characters: characterInfo.length > 0 ? characterInfo.join('。') : '无特定角色',
    styleDesc,
  });

  try {
    const result = await retryOperation(() => chatCompletion(prompt, model, 0.7, 1024));
    const duration = Date.now() - startTime;

    console.log(`✅ AI ${frameLabel}优化成功，耗时:`, duration, 'ms');

    return result.trim();
  } catch (error: any) {
    console.error(`❌ AI ${frameLabel}优化失败:`, error);
    throw new Error(`AI ${frameLabel}优化失败: ${error.message}`);
  }
};

// ============================================
// 动作生成
// ============================================

/**
 * AI生成叙事动作建议
 */
export const generateActionSuggestion = async (
  startFramePrompt: string,
  endFramePrompt: string,
  cameraMovement: string,
  userInstruction?: string,
  model: string = 'gpt-5.2',
  targetDurationSeconds: number = 8,
  promptTemplates?: PromptTemplateConfig
): Promise<string> => {
  console.log('🎬 generateActionSuggestion 调用 - 使用模型:', model);
  const startTime = Date.now();
  const normalizedDuration = Math.max(2, Math.min(20, Math.round(targetDurationSeconds * 10) / 10));
  const normalizedUserInstruction = userInstruction?.trim();
  const userInstructionBlock = normalizedUserInstruction
    ? `
## User Revision Requirement
${normalizedUserInstruction}

Please prioritize this requirement while still following all duration and single-shot constraints.
`
    : '';

  const templates = promptTemplates || resolvePromptTemplateConfig();
  const template = withTemplateFallback(
    templates.storyboard.actionSuggestion,
    DEFAULT_PROMPT_TEMPLATE_CONFIG.storyboard.actionSuggestion
  );
  const prompt = renderPromptTemplate(template, {
    targetDuration: normalizedDuration,
    startFramePrompt,
    endFramePrompt,
    cameraMovement,
    userInstructionBlock,
  });

  try {
    const result = await retryOperation(() => chatCompletion(prompt, model, 0.8, 2048));
    const duration = Date.now() - startTime;

    console.log('✅ AI动作生成成功，耗时:', duration, 'ms');

    return result.trim();
  } catch (error: any) {
    console.error('❌ AI动作生成失败:', error);
    throw new Error(`AI动作生成失败: ${error.message}`);
  }
};

// ============================================
// 镜头拆分
// ============================================

/**
 * AI镜头拆分功能 - 将单个镜头拆分为多个细致的子镜头
 */
export const splitShotIntoSubShots = async (
  shot: any,
  sceneInfo: { location: string; time: string; atmosphere: string },
  characterNames: string[],
  visualStyle: string,
  model: string = 'gpt-5.2',
  promptTemplates?: PromptTemplateConfig
): Promise<{ subShots: any[] }> => {
  console.log('✂️ splitShotIntoSubShots 调用 - 使用模型:', model);
  const startTime = Date.now();

  const styleDesc = getStylePromptCN(visualStyle);

  const dialogueBlock = shot.dialogue && String(shot.dialogue).trim()
    ? `**对白：**
${String(shot.dialogue).trim()}`
    : '';
  const templates = promptTemplates || resolvePromptTemplateConfig();
  const template = withTemplateFallback(
    templates.storyboard.shotSplit,
    DEFAULT_PROMPT_TEMPLATE_CONFIG.storyboard.shotSplit
  );
  const prompt = renderPromptTemplate(template, {
    sceneLocation: sceneInfo.location,
    sceneTime: sceneInfo.time,
    sceneAtmosphere: sceneInfo.atmosphere,
    characters: characterNames.length > 0 ? characterNames.join('。') : '无特定角色',
    styleDesc,
    cameraMovement: shot.cameraMovement,
    actionSummary: shot.actionSummary,
    dialogueBlock,
  });

  try {
    const result = await retryOperation(() => chatCompletion(prompt, model, 0.7, 4096, 'json_object'));
    const duration = Date.now() - startTime;

    const parsed = parseJsonWithRecovery<any>(result, {});

    if (!parsed.subShots || !Array.isArray(parsed.subShots) || parsed.subShots.length === 0) {
      throw new Error('AI返回的JSON格式不正确或子镜头数组为空');
    }

    // 验证每个子镜头
    for (const subShot of parsed.subShots) {
      if (!subShot.shotSize || !subShot.cameraMovement || !subShot.actionSummary || !subShot.visualFocus) {
        throw new Error('子镜头缺少必需字段（shotSize、cameraMovement、actionSummary、visualFocus）');
      }
      if (!subShot.keyframes || !Array.isArray(subShot.keyframes) || subShot.keyframes.length === 0) {
        throw new Error('子镜头缺少关键帧数组（keyframes）');
      }
      for (const kf of subShot.keyframes) {
        if (!kf.type || !kf.visualPrompt) {
          throw new Error('关键帧缺少必需字段（type、visualPrompt）');
        }
        if (kf.type !== 'start' && kf.type !== 'end') {
          throw new Error('关键帧type必须是"start"或"end"');
        }
      }
    }

    console.log(`✅ 镜头拆分成功，生成 ${parsed.subShots.length} 个子镜头，耗时:`, duration, 'ms');

    addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: `shot-split-${shot.id}-${Date.now()}`,
      resourceName: `镜头拆分 - ${shot.actionSummary.substring(0, 30)}...`,
      status: 'success',
      model: model,
      prompt: prompt.substring(0, 200) + '...',
      duration: duration
    });

    return parsed;
  } catch (error: any) {
    console.error('❌ 镜头拆分失败:', error);

    addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: `shot-split-${shot.id}-${Date.now()}`,
      resourceName: `镜头拆分 - ${shot.actionSummary.substring(0, 30)}...`,
      status: 'failed',
      model: model,
      prompt: prompt.substring(0, 200) + '...',
      error: error.message,
      duration: Date.now() - startTime
    });

    throw new Error(`镜头拆分失败: ${error.message}`);
  }
};

// ============================================
// 关键帧增强
// ============================================

/**
 * AI增强关键帧提示词 - 添加详细的技术规格和视觉细节
 */
export const enhanceKeyframePrompt = async (
  basePrompt: string,
  visualStyle: string,
  cameraMovement: string,
  frameType: 'start' | 'end',
  model: string = 'gpt-5.2',
  promptTemplates?: PromptTemplateConfig
): Promise<string> => {
  console.log(`🎨 enhanceKeyframePrompt 调用 - ${frameType === 'start' ? '起始帧' : '结束帧'} - 使用模型:`, model);
  const startTime = Date.now();

  const styleDesc = getStylePromptCN(visualStyle);
  const frameLabel = frameType === 'start' ? '起始帧' : '结束帧';
  const frameFocus = frameType === 'start'
    ? '建立清晰起点：主体初始姿态、空间关系、光线基调，并为后续运动预留视觉空间。'
    : '呈现明确终点：动作结果、姿态与情绪变化，并与起始状态形成可推导的连续变化。';
  const templates = promptTemplates || resolvePromptTemplateConfig();
  const template = withTemplateFallback(
    templates.keyframe.enhance,
    DEFAULT_PROMPT_TEMPLATE_CONFIG.keyframe.enhance
  );
  const prompt = renderPromptTemplate(template, {
    basePrompt,
    styleDesc,
    cameraMovement,
    frameLabel,
    frameFocus,
  });

  try {
    const result = await retryOperation(() => chatCompletion(prompt, model, 0.6, 1536));
    const duration = Date.now() - startTime;

    console.log(`✅ AI ${frameLabel}增强成功，耗时:`, duration, 'ms');

    return result.trim();
  } catch (error: any) {
    console.error(`❌ AI ${frameLabel}增强失败:`, error);
    console.warn('⚠️ 回退到基础提示词');
    return basePrompt;
  }
};

// ============================================
// 九宫格分镜预览
// ============================================

/**
 * 使用 Chat 模型将镜头动作拆分为网格分镜（4/6/9）
 */
const buildStoryboardGridPromptContext = (
  layout: ReturnType<typeof resolveStoryboardGridLayout>
) => {
  const gridLayout = `${layout.cols}x${layout.rows}`;
  const rowCount = layout.rows;
  const columnCount = layout.cols;
  const layoutInstruction = `exactly ${rowCount} rows x ${columnCount} columns`;
  const layoutExample = Array.from({ length: rowCount }, (_, rowIndex) => {
    const startPanel = rowIndex * columnCount + 1;
    const endPanel = startPanel + columnCount - 1;
    return `Row ${rowIndex + 1}: panels ${startPanel}-${endPanel}`;
  }).join('; ');

  const layoutSpecificConstraint = layout.panelCount === 6
    ? 'CRITICAL: six-panel mode means exactly TWO rows and THREE columns. Never create a third row, a 3x3 / 9-panel board, blank extra boxes, or merged panels.'
    : layout.panelCount === 4
      ? 'CRITICAL: four-panel mode means exactly TWO rows and TWO columns. Never switch to 6-panel or 9-panel boards, and never use merged or unequal panels.'
      : 'CRITICAL: nine-panel mode means exactly THREE rows and THREE columns. Never omit panels, merge panels, or turn it into an irregular collage.';

  const layoutNegativePrompt = layout.panelCount === 6
    ? '3x3 grid, 9-panel grid, third row, extra row, extra panel, blank extra panel, merged panels, unequal panel sizes, masonry collage, oversized hero panel'
    : layout.panelCount === 4
      ? '3x3 grid, 9-panel grid, 2x3 grid, 6-panel grid, extra row, extra panel, merged panels, unequal panel sizes, masonry collage, oversized hero panel'
      : '2x3 grid, 6-panel grid, 2x2 grid, 4-panel grid, missing panel, merged panels, unequal panel sizes, masonry collage, oversized hero panel';

  return {
    gridLayout,
    rowCount,
    columnCount,
    layoutInstruction,
    layoutExample,
    layoutSpecificConstraint,
    layoutNegativePrompt,
  };
};

export const generateNineGridPanels = async (
  actionSummary: string,
  cameraMovement: string,
  sceneInfo: { location: string; time: string; atmosphere: string },
  characterNames: string[],
  visualStyle: string,
  model?: string,
  panelCount: StoryboardGridPanelCount = 9,
  promptTemplates?: PromptTemplateConfig
): Promise<NineGridPanel[]> => {
  const startTime = Date.now();
  const layout = resolveStoryboardGridLayout(panelCount);
  const gridPromptContext = buildStoryboardGridPromptContext(layout);
  const {
    gridLayout,
    rowCount,
    columnCount,
    layoutInstruction,
    layoutExample,
    layoutSpecificConstraint,
  } = gridPromptContext;
  const templates = promptTemplates || resolvePromptTemplateConfig();
  const splitSystemTemplate = withTemplateFallback(
    templates.nineGrid.splitSystem,
    withTemplateFallback(
      DEFAULT_PROMPT_TEMPLATE_CONFIG.nineGrid.splitSystem,
      NINE_GRID_SPLIT_PROMPT.system
    )
  );
  const splitUserTemplate = withTemplateFallback(
    templates.nineGrid.splitUser,
    withTemplateFallback(
      DEFAULT_PROMPT_TEMPLATE_CONFIG.nineGrid.splitUser,
      NINE_GRID_SPLIT_PROMPT.user
    )
  );
  console.log(`🎬 ${layout.label}分镜 - 开始AI拆分视角...`);

  const resolvedModel = model || getActiveChatModel()?.id || 'gpt-5.2';
  const systemPrompt = renderPromptTemplate(
    splitSystemTemplate,
    {
      panelCount: layout.panelCount,
      gridLayout,
      rowCount,
      columnCount,
      layoutInstruction,
      layoutExample,
      layoutSpecificConstraint,
    }
  );
  const userPrompt = renderPromptTemplate(
    splitUserTemplate,
    {
      panelCount: layout.panelCount,
      lastIndex: layout.panelCount - 1,
      gridLayout,
      rowCount,
      columnCount,
      layoutInstruction,
      layoutExample,
      layoutSpecificConstraint,
      actionSummary,
      cameraMovement,
      location: sceneInfo.location,
      time: sceneInfo.time,
      atmosphere: sceneInfo.atmosphere,
      characters: characterNames.length > 0 ? characterNames.join('。') : '无特定角色',
      visualStyle,
    }
  );

  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  const parsePanels = (responseText: string): NineGridPanel[] =>
    parseAndValidateNineGridPanels(responseText, layout.panelCount);

  try {
    const responseText = await retryOperation(() => chatCompletion(fullPrompt, resolvedModel, 0.7, 4096, 'json_object'));
    const duration = Date.now() - startTime;

    let panels: NineGridPanel[];
    try {
      panels = parsePanels(responseText);
    } catch (parseError: any) {
      console.warn(`⚠️ ${layout.label}首次解析不符合规范，尝试自动纠偏重试:`, parseError.message);
      const repairPrompt = `${fullPrompt}

你上一次输出不符合要求（原因：${parseError.message}）。
请严格重新输出 JSON 对象，且必须满足：
1) "panels" 恰好 ${layout.panelCount} 个，且每项必须包含唯一 index（0-${layout.panelCount - 1}）
2) 每个 panel 必须包含非空的 shotSize、cameraAngle、description
3) description 使用英文单句，严格控制在 10-30 词
4) shotSize + cameraAngle 组合不得重复，且 shotSize 至少包含 ${layout.panelCount >= 6 ? 3 : 2} 种
5) 只输出 JSON，不要任何解释文字`;

      const repairedText = await retryOperation(() => chatCompletion(repairPrompt, resolvedModel, 0.4, 4096, 'json_object'));
      panels = parsePanels(repairedText);
    }

    console.log(`✅ ${layout.label}分镜 - AI拆分完成，耗时: ${duration}ms`);
    return panels;
  } catch (error: any) {
    console.error(`❌ ${layout.label}分镜 - AI拆分失败:`, error);
    throw new Error(`${layout.label}视角拆分失败: ${error.message}`);
  }
};

export interface NineGridRewriteContext {
  actionSummary: string;
  cameraMovement: string;
  visualStyle: string;
  sceneInfo?: {
    location?: string;
    time?: string;
    atmosphere?: string;
  };
}

/**
 * 将九宫格英文描述翻译为中文展示文案（不改写原英文描述）
 */
export const translateNineGridPanels = async (
  panels: NineGridPanel[],
  model?: string,
  promptTemplates?: PromptTemplateConfig
): Promise<Array<{ index: number; descriptionZh: string }>> => {
  if (!panels.length) return [];
  const expectedCount = panels.length;
  const resolvedModel = model || getActiveChatModel()?.id || 'gpt-5.2';

  const templates = promptTemplates || resolvePromptTemplateConfig();
  const template = withTemplateFallback(
    templates.nineGrid.translatePrompt,
    DEFAULT_PROMPT_TEMPLATE_CONFIG.nineGrid.translatePrompt
  );
  const prompt = renderPromptTemplate(template, {
    panelsJson: JSON.stringify(panels, null, 2),
    expectedCount,
    expectedCountMinusOne: expectedCount - 1,
  });

  try {
    const responseText = await retryOperation(() =>
      chatCompletion(prompt, resolvedModel, 0.3, 2048, 'json_object')
    );
    return parseNineGridTranslations(responseText, expectedCount);
  } catch (error: any) {
    throw new Error(`九宫格翻译失败: ${error.message}`);
  }
};

/**
 * 按用户指令批量改写九宫格分镜文案
 * 保持面板结构不变，输出仍为可用于生图的英文 description。
 */
export const reviseNineGridPanelsByInstruction = async (
  panels: NineGridPanel[],
  instruction: string,
  context: NineGridRewriteContext,
  model?: string,
  promptTemplates?: PromptTemplateConfig
): Promise<NineGridPanel[]> => {
  const expectedCount = panels.length;
  if (!expectedCount) return [];
  const normalizedInstruction = String(instruction || '').trim();
  if (!normalizedInstruction) {
    throw new Error('改写要求不能为空');
  }

  const resolvedModel = model || getActiveChatModel()?.id || 'gpt-5.2';
  const sceneLocation = context.sceneInfo?.location || '未指定';
  const sceneTime = context.sceneInfo?.time || '未指定';
  const sceneAtmosphere = context.sceneInfo?.atmosphere || '未指定';

  const requiredShotSizeKinds = expectedCount >= 6 ? 3 : 2;
  const templates = promptTemplates || resolvePromptTemplateConfig();
  const template = withTemplateFallback(
    templates.nineGrid.rewritePrompt,
    DEFAULT_PROMPT_TEMPLATE_CONFIG.nineGrid.rewritePrompt
  );
  const basePrompt = renderPromptTemplate(template, {
    instruction: normalizedInstruction,
    actionSummary: context.actionSummary || '未指定',
    cameraMovement: context.cameraMovement || '未指定',
    sceneLocation,
    sceneTime,
    sceneAtmosphere,
    visualStyle: context.visualStyle || '未指定',
    panelsJson: JSON.stringify(panels, null, 2),
    expectedCount,
    expectedCountMinusOne: expectedCount - 1,
    requiredShotSizeKinds,
  });

  try {
    const responseText = await retryOperation(() =>
      chatCompletion(basePrompt, resolvedModel, 0.6, 4096, 'json_object')
    );

    try {
      return parseAndValidateNineGridPanels(responseText, expectedCount);
    } catch (parseError: any) {
      const repairPrompt = `${basePrompt}

你上一次输出不符合要求（原因：${parseError.message}）。
请严格重新输出 JSON，并保证所有规则完全满足。`;
      const repairedText = await retryOperation(() =>
        chatCompletion(repairPrompt, resolvedModel, 0.3, 4096, 'json_object')
      );
      return parseAndValidateNineGridPanels(repairedText, expectedCount);
    }
  } catch (error: any) {
    throw new Error(`九宫格改写失败: ${error.message}`);
  }
};

/**
 * 使用图像模型生成网格分镜图片（4/6/9）
 */
export const generateNineGridImage = async (
  panels: NineGridPanel[],
  referenceImages: string[] = [],
  visualStyle: string,
  aspectRatio: AspectRatio = '16:9',
  options?: {
    hasTurnaround?: boolean;
    panelCount?: StoryboardGridPanelCount;
    promptTemplates?: PromptTemplateConfig;
  }
): Promise<string> => {
  const startTime = Date.now();
  const layout = resolveStoryboardGridLayout(options?.panelCount || panels.length);
  const gridPromptContext = buildStoryboardGridPromptContext(layout);
  const {
    gridLayout,
    rowCount,
    columnCount,
    layoutInstruction,
    layoutExample,
    layoutSpecificConstraint,
    layoutNegativePrompt,
  } = gridPromptContext;
  const templates = options?.promptTemplates || resolvePromptTemplateConfig();
  const imagePrefixTemplate = withTemplateFallback(
    templates.nineGrid.imagePrefix,
    withTemplateFallback(
      DEFAULT_PROMPT_TEMPLATE_CONFIG.nineGrid.imagePrefix,
      NINE_GRID_IMAGE_PROMPT_TEMPLATE.prefix
    )
  );
  const imagePanelTemplate = withTemplateFallback(
    templates.nineGrid.imagePanelTemplate,
    withTemplateFallback(
      DEFAULT_PROMPT_TEMPLATE_CONFIG.nineGrid.imagePanelTemplate,
      NINE_GRID_IMAGE_PROMPT_TEMPLATE.panelTemplate
    )
  );
  const imageSuffixTemplate = withTemplateFallback(
    templates.nineGrid.imageSuffix,
    withTemplateFallback(
      DEFAULT_PROMPT_TEMPLATE_CONFIG.nineGrid.imageSuffix,
      NINE_GRID_IMAGE_PROMPT_TEMPLATE.suffix
    )
  );
  const imageNoTextConstraintTemplate = withTemplateFallback(
    templates.nineGrid.imageNoTextConstraint,
    DEFAULT_PROMPT_TEMPLATE_CONFIG.nineGrid.imageNoTextConstraint
  );
  console.log(`🎬 ${layout.label}分镜 - 开始生成网格图片...`);

  const stylePrompt = getStylePrompt(visualStyle);

  if (panels.length !== layout.panelCount) {
    throw new Error(`网格图片生成前校验失败：panels 数量为 ${panels.length}，必须为 ${layout.panelCount}`);
  }

  const panelDescriptions = panels.map((panel, idx) =>
    renderPromptTemplate(
      imagePanelTemplate,
      {
        index: idx + 1,
        position: layout.positionLabels[idx] || `Panel-${idx + 1}`,
        shotSize: panel.shotSize,
        cameraAngle: panel.cameraAngle,
        description: panel.description,
      }
    )
  ).join('\n');

  const nineGridPrompt = `${renderPromptTemplate(
    imagePrefixTemplate,
    {
      gridLayout,
      panelCount: layout.panelCount,
      rowCount,
      columnCount,
      layoutInstruction,
      layoutExample,
      layoutSpecificConstraint,
      visualStyle: stylePrompt,
    }
  )}
${panelDescriptions}

${renderPromptTemplate(
  imageSuffixTemplate,
  {
    gridLayout,
    panelCount: layout.panelCount,
    rowCount,
    columnCount,
    layoutInstruction,
    layoutExample,
    layoutSpecificConstraint,
  }
)}

${imageNoTextConstraintTemplate}`;

  try {
    const imageUrl = await generateImage(
      nineGridPrompt,
      referenceImages,
      aspectRatio,
      false,
      !!options?.hasTurnaround,
      layoutNegativePrompt,
      { referencePackType: 'shot' }
    );
    const duration = Date.now() - startTime;

    console.log(`✅ ${layout.label}分镜 - 图片生成完成，耗时: ${duration}ms`);
    return imageUrl;
  } catch (error: any) {
    console.error(`❌ ${layout.label}分镜 - 图片生成失败:`, error);
    throw new Error(`${layout.label}图片生成失败: ${error.message}`);
  }
};
