import React, { useState, useEffect, useMemo } from 'react';
import { LayoutGrid, Sparkles, Loader2, AlertCircle, Edit2, Film, MessageSquare, Video as VideoIcon } from 'lucide-react';
import {
  ProjectState,
  Shot,
  Keyframe,
  AspectRatio,
  VideoDuration,
  NineGridPanel,
  NineGridData,
  StoryboardGridPanelCount,
  DubbingMode,
} from '../../types';
import { generateImage, generateVideo, generateActionSuggestion, optimizeKeyframePrompt, optimizeBothKeyframes, enhanceKeyframePrompt, splitShotIntoSubShots, generateNineGridPanels, translateNineGridPanels, reviseNineGridPanelsByInstruction, generateNineGridImage, getNegativePrompt, compressPromptWithLLM, generateDubbingAudio } from '../../services/aiService';
import { 
  getRefImagesForShot, 
  getPropsInfoForShot,
  buildKeyframePrompt,
  buildKeyframePromptWithAI,
  buildVideoPrompt,
  extractBasePrompt,
  generateId,
  delay,
  convertImageToBase64,
  createKeyframe,
  updateKeyframeInShot,
  generateSubShotIds,
  createSubShot,
  replaceShotWithSubShots,
  buildPromptFromNineGridPanel,
  cropPanelFromNineGrid,
  ensureNineGridVideoPromptGuardrails,
  resolveVideoModelRouting,
  routeVideoFrameInputs
} from './utils';
import { DEFAULTS, resolveStoryboardGridLayout } from './constants';
import EditModal from './EditModal';
import ShotCard from './ShotCard';
import ShotWorkbench from './ShotWorkbench';
import ImagePreviewModal from './ImagePreviewModal';
import NineGridPreview from './NineGridPreview';
import { useAlert } from '../GlobalAlert';
import { AspectRatioSelector } from '../AspectRatioSelector';
import { getUserAspectRatio, setUserAspectRatio, getModelById, getActiveImageModel, getActiveAudioModel } from '../../services/modelRegistry';
import { persistVideoReference } from '../../services/videoStorageService';
import { runKeyframePreflight, runVideoPreflight, formatLintIssues } from '../../services/promptLintService';
import { assessShotQuality, getProjectAverageQualityScore } from '../../services/qualityAssessmentService';
import { assessShotQualityWithLLM } from '../../services/qualityAssessmentV2Service';
import { updatePromptWithVersion } from '../../services/promptVersionService';
import { resolvePromptTemplateConfig } from '../../services/promptTemplateService';

interface Props {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => void;
  onApiKeyError?: (error: any) => boolean;
  onGeneratingChange?: (isGenerating: boolean) => void;
}

const StageDirector: React.FC<Props> = ({ project, updateProject, onApiKeyError, onGeneratingChange }) => {
  const { showAlert } = useAlert();
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{current: number, total: number, message: string} | null>(null);
  const [previewImage, setPreviewImage] = useState<{url: string, title: string} | null>(null);
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [isAIReassessing, setIsAIReassessing] = useState(false);
  const [useAIEnhancement, setUseAIEnhancement] = useState(false); // 是否使用AI增强提示词
  const [isSplittingShot, setIsSplittingShot] = useState(false); // 是否正在拆分镜头
  const [isNineGridTranslating, setIsNineGridTranslating] = useState(false); // 是否正在翻译九宫格描述
  const [isNineGridRevising, setIsNineGridRevising] = useState(false); // 是否正在按指令改写九宫格描述
  const [showNineGrid, setShowNineGrid] = useState(false); // 是否显示九宫格预览弹窗
  const [toastMessage, setToastMessage] = useState('');
  
  // 关键帧生成使用的横竖屏比例（从持久化配置读取）
  const [keyframeAspectRatio, setKeyframeAspectRatioState] = useState<AspectRatio>(() => getUserAspectRatio());
  
  // 包装 setKeyframeAspectRatio，同时持久化到模型配置
  const setKeyframeAspectRatio = (ratio: AspectRatio) => {
    setKeyframeAspectRatioState(ratio);
    setUserAspectRatio(ratio);
  };
  
  // 统一的编辑状态
  const [editModal, setEditModal] = useState<{
    type: 'action' | 'dialogue' | 'keyframe' | 'video';
    value: string;
    shotId?: string;
    frameType?: 'start' | 'end';
    aiInstruction?: string;
  } | null>(null);

  const activeShotIndex = project.shots.findIndex(s => s.id === activeShotId);
  const activeShot = project.shots[activeShotIndex];
  const projectQualityScore = getProjectAverageQualityScore(project.shots);
  const promptTemplates = useMemo(
    () => resolvePromptTemplateConfig(project.promptTemplateOverrides),
    [project.promptTemplateOverrides]
  );

  const getModelDefaultDuration = (modelId?: string): number => {
    const model = getModelById(modelId || DEFAULTS.videoModel) as any;
    const duration = model?.params?.defaultDuration;
    return typeof duration === 'number' && Number.isFinite(duration) ? duration : 8;
  };

  const getRecommendedVideoInputMode = (modelId: string): 'keyframes' | 'storyboard-grid' => {
    const routing = resolveVideoModelRouting(modelId);
    return routing.family === 'sora' || routing.family === 'doubao-task'
      ? 'storyboard-grid'
      : 'keyframes';
  };

  const applyShotQuality = (shot: Shot, scriptData: ProjectState['scriptData']): Shot => ({
    ...shot,
    qualityAssessment: assessShotQuality(shot, scriptData),
  });

  /**
   * 场景负面提示词里常包含“禁止人物”的约束（用于纯环境图），
   * 在角色镜头中应移除这些词条，避免与“必须出人”目标冲突。
   */
  const stripHumanExclusionTerms = (input?: string): string => {
    if (!input || typeof input !== 'string') return '';
    const humanBlockPatterns: RegExp[] = [
      /\bperson\b/i,
      /\bpeople\b/i,
      /\bhuman\b/i,
      /\bman\b/i,
      /\bwoman\b/i,
      /\bchild\b/i,
      /\bfigure\b/i,
      /\bsilhouette\b/i,
      /\bcrowd\b/i,
      /\bpedestrian\b/i,
      /\bcharacter\b/i,
    ];

    return input
      .split(/[,;，；\n]+/)
      .map(item => item.trim())
      .filter(Boolean)
      .filter(item => !humanBlockPatterns.some(pattern => pattern.test(item)))
      .join(', ');
  };

  const formatUserFriendlyError = (error: any, fallback: string): string => {
    if (!error) return fallback;

    const status = error?.status;
    const rawMessage = typeof error?.message === 'string' ? error.message : '';

    let normalizedMessage = rawMessage;
    if (!normalizedMessage) {
      if (status === 400) {
        normalizedMessage = '提示词可能被风控拦截，请修改提示词后重试。';
      } else if (status === 500 || status === 503) {
        normalizedMessage = '服务器繁忙，请稍后重试。';
      } else {
        normalizedMessage = fallback;
      }
    }

    if (!import.meta.env.DEV) {
      normalizedMessage = normalizedMessage.replace(/（接口信息：.*?）/g, '');
    }

    return normalizedMessage || fallback;
  };
  
  const buildShotNegativePrompt = (shot: Shot, visualStyle: string): string => {
    const parts: string[] = [];
    const shotHasCharacters = (shot.characters?.length || 0) > 0;
    const pushPrompt = (value?: string) => {
      if (!value || typeof value !== 'string') return;
      const trimmed = value.trim();
      if (trimmed) parts.push(trimmed);
    };

    pushPrompt(getNegativePrompt(visualStyle));

    const scriptData = project.scriptData;
    if (!scriptData) {
      return parts.join(', ');
    }

    const scene = scriptData.scenes.find(s => String(s.id) === String(shot.sceneId));
    pushPrompt(
      shotHasCharacters
        ? stripHumanExclusionTerms(scene?.negativePrompt)
        : scene?.negativePrompt
    );

    if (shot.characters?.length) {
      shot.characters.forEach(charId => {
        const char = scriptData.characters.find(c => String(c.id) === String(charId));
        if (!char) return;
        const variationId = shot.characterVariations?.[charId];
        const variation = variationId ? char.variations?.find(v => v.id === variationId) : undefined;
        pushPrompt(variation?.negativePrompt || char.negativePrompt);
      });
    }

    if (shot.props?.length && scriptData.props) {
      shot.props.forEach(propId => {
        const prop = scriptData.props?.find(p => String(p.id) === String(propId));
        pushPrompt(prop?.negativePrompt);
      });
    }

    const deduped: string[] = [];
    const seen = new Set<string>();
    parts
      .flatMap(part => part.split(/[,;，；\n]+/))
      .map(item => item.trim())
      .filter(Boolean)
      .forEach(item => {
        const key = item.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(item);
      });

    return deduped.slice(0, 80).join(', ');
  };
  
  const allStartFramesGenerated = project.shots.length > 0 && 
    project.shots.every(s => s.keyframes?.find(k => k.type === 'start')?.imageUrl);

  /**
   * 组件加载时，检测并重置卡住的生成状态
   * 解决关闭系统后重新打开时，状态仍为"generating"导致无法重新生成的问题
   */
  useEffect(() => {
    const hasStuckGenerating = project.shots.some(shot => {
      const stuckKeyframes = shot.keyframes?.some(kf => kf.status === 'generating');
      const stuckVideo = shot.interval?.status === 'generating';
      const stuckDubbing = shot.dubbing?.status === 'generating';
      const stuckNineGrid = shot.nineGrid?.status === 'generating_panels' || shot.nineGrid?.status === 'generating_image' || (shot.nineGrid?.status as string) === 'generating';
      return stuckKeyframes || stuckVideo || stuckDubbing || stuckNineGrid;
    });

    if (hasStuckGenerating) {
      console.log('🔧 检测到卡住的生成状态，正在重置...');
      updateProject((prevProject: ProjectState) => ({
        ...prevProject,
        shots: prevProject.shots.map(shot =>
          applyShotQuality({
            ...shot,
            keyframes: shot.keyframes?.map(kf => 
              kf.status === 'generating'
                ? { ...kf, status: 'failed' as const }
                : kf
            ),
            interval: shot.interval && shot.interval.status === 'generating'
              ? { ...shot.interval, status: 'failed' as const }
              : shot.interval,
            dubbing: shot.dubbing && shot.dubbing.status === 'generating'
              ? { ...shot.dubbing, status: 'failed' as const, error: '任务中断，请重新生成' }
              : shot.dubbing,
            nineGrid: shot.nineGrid && (shot.nineGrid.status === 'generating_panels' || shot.nineGrid.status === 'generating_image' || (shot.nineGrid.status as string) === 'generating')
              ? { ...shot.nineGrid, status: 'failed' as const }
              : shot.nineGrid
          }, prevProject.scriptData)
        )
      }));
    }
  }, []); // 进入导演页时执行一次，清理离开页面后遗留的 generating 状态

  /**
   * 上报生成状态给父组件，用于导航锁定
   * 检测所有可能的生成中状态：批量生成、单个关键帧、视频、九宫格、镜头拆分
   */
  useEffect(() => {
    const hasGeneratingKeyframes = project.shots.some(shot => 
      shot.keyframes?.some(kf => kf.status === 'generating')
    );
    const hasGeneratingVideo = project.shots.some(shot => 
      shot.interval?.status === 'generating'
    );
    const hasGeneratingDubbing = project.shots.some(
      shot => shot.dubbing?.status === 'generating'
    );
    const hasGeneratingNineGrid = project.shots.some(shot => 
      shot.nineGrid?.status === 'generating_panels' || shot.nineGrid?.status === 'generating_image'
    );
    
    const generating =
      !!batchProgress ||
      hasGeneratingKeyframes ||
      hasGeneratingVideo ||
      hasGeneratingDubbing ||
      hasGeneratingNineGrid ||
      isSplittingShot;
    onGeneratingChange?.(generating);
  }, [batchProgress, project.shots, isSplittingShot]);

  // 组件卸载时重置生成状态
  useEffect(() => {
    return () => {
      onGeneratingChange?.(false);
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timerId = setTimeout(() => setToastMessage(''), 1500);
    return () => clearTimeout(timerId);
  }, [toastMessage]);

  useEffect(() => {
    const hasMissingAssessment = project.shots.some((shot) => !shot.qualityAssessment);
    if (!hasMissingAssessment) return;

    updateProject((prevProject: ProjectState) => ({
      ...prevProject,
      shots: prevProject.shots.map((shot) =>
        shot.qualityAssessment ? shot : applyShotQuality(shot, prevProject.scriptData)
      ),
    }));
  }, [project.id]);

  /**
   * 更新镜头
   */
  const updateShot = (shotId: string, transform: (s: Shot) => Shot) => {
    updateProject((prevProject: ProjectState) => ({
      ...prevProject,
      shots: prevProject.shots.map((shot) =>
        shot.id === shotId
          ? applyShotQuality(transform(shot), prevProject.scriptData)
          : shot
      )
    }));
  };

  const handleAIReassessQuality = async () => {
    if (!activeShot) return;
    const targetShotId = activeShot.id;
    setIsAIReassessing(true);

    try {
      const assessment = await assessShotQualityWithLLM(activeShot, project.scriptData);
      updateProject((prevProject: ProjectState) => ({
        ...prevProject,
        shots: prevProject.shots.map((shot) =>
          shot.id === targetShotId
            ? { ...shot, qualityAssessment: assessment }
            : shot
        )
      }));

      const sourceLabel = assessment.version >= 2 ? 'AI V2' : 'Rule V1 Fallback';
      showAlert(`质量评分已更新（${sourceLabel}）：${assessment.score} 分`, { type: 'success' });
    } catch (error: any) {
      if (onApiKeyError && onApiKeyError(error)) return;
      showAlert(`AI重评估失败：${formatUserFriendlyError(error, '请稍后重试。')}`, { type: 'error' });
    } finally {
      setIsAIReassessing(false);
    }
  };

  /**
   * 删除分镜
   */
  const handleDeleteShot = (shotId: string) => {
    const shot = project.shots.find(s => s.id === shotId);
    if (!shot) return;

    const shotIndex = project.shots.findIndex(s => s.id === shotId);
    const displayName = `SHOT ${String(shotIndex + 1).padStart(3, '0')}`;

    showAlert(`确定要删除 ${displayName} 吗？此操作不可撤销。`, {
      type: 'warning',
      showCancel: true,
      onConfirm: () => {
        // 如果当前选中的就是被删除的分镜，则关闭工作台
        if (activeShotId === shotId) {
          setActiveShotId(null);
        }
        updateProject((prevProject: ProjectState) => ({
          ...prevProject,
          shots: prevProject.shots.filter(s => s.id !== shotId)
        }));
        showAlert(`${displayName} 已删除`, { type: 'success' });
      }
    });
  };

  /**
   * 生成关键帧
   */
  const handleGenerateKeyframe = async (shot: Shot, type: 'start' | 'end') => {
    const existingKf = shot.keyframes?.find(k => k.type === type);
    const kfId = existingKf?.id || generateId(`kf-${shot.id}-${type}`);
    const startKf = shot.keyframes?.find(k => k.type === 'start');
    
    const rawBasePrompt = existingKf?.visualPrompt 
      ? extractBasePrompt(existingKf.visualPrompt, shot.actionSummary)
      : shot.actionSummary;

    const continuityHint = type === 'end' && startKf?.visualPrompt
      ? `【连贯性约束】结束帧必须与起始帧保持同一角色身份、服装主体、场景锚点与光照逻辑，并在构图和动作结果上体现明确变化。起始帧参考：${extractBasePrompt(startKf.visualPrompt, shot.actionSummary).slice(0, 200)}`
      : '';

    const basePrompt = continuityHint && !rawBasePrompt.includes('【连贯性约束】')
      ? `${rawBasePrompt}\n\n${continuityHint}`
      : rawBasePrompt;
    
    const visualStyle = project.visualStyle || project.scriptData?.visualStyle || '3d-animation';
    const negativePrompt = buildShotNegativePrompt(shot, visualStyle);

    // 获取道具信息用于提示词注入
    const propsInfo = getPropsInfoForShot(shot, project.scriptData);
    
    // 根据开关选择是否使用AI增强
    let prompt: string;
    if (useAIEnhancement) {
      try {
        prompt = await buildKeyframePromptWithAI(
          basePrompt,
          visualStyle,
          shot.cameraMovement,
          type,
          true,
          propsInfo,
          promptTemplates
        );
      } catch (error) {
        console.error('AI增强失败,使用基础提示词:', error);
        prompt = buildKeyframePrompt(
          basePrompt,
          visualStyle,
          shot.cameraMovement,
          type,
          propsInfo,
          promptTemplates
        );
      }
    } else {
      prompt = buildKeyframePrompt(
        basePrompt,
        visualStyle,
        shot.cameraMovement,
        type,
        propsInfo,
        promptTemplates
      );
    }

    const refResult = getRefImagesForShot(shot, project.scriptData);
    const referenceImages = [...refResult.images];
    const continuityReferenceImage =
      type === 'end' && startKf?.imageUrl && !referenceImages.includes(startKf.imageUrl)
        ? startKf.imageUrl
        : undefined;
    const dedupedReferenceCount = new Set(
      [...referenceImages, continuityReferenceImage]
        .filter((img): img is string => !!img)
        .map((img) => img.trim())
        .filter(Boolean)
    ).size;
    const effectiveReferenceCount = Math.min(5, dedupedReferenceCount);
    if (dedupedReferenceCount > 5) {
      setToastMessage(
        `参考图数量 ${dedupedReferenceCount} 超过模型上限，已自动限制为 5 张（含连贯性参考图）。`
      );
    }

    const activeImageModel = getActiveImageModel() as any;
    const preflightResult = runKeyframePreflight({
      prompt,
      negativePrompt,
      hasCharacters: (shot.characters?.length || 0) > 0,
      frameType: type,
      hasStartFrameImage: !!startKf?.imageUrl,
      referenceImageCount: effectiveReferenceCount,
      aspectRatio: keyframeAspectRatio,
      supportedAspectRatios: activeImageModel?.params?.supportedAspectRatios,
    });

    if (!preflightResult.canProceed) {
      showAlert(`关键帧预检未通过：\n${formatLintIssues(preflightResult.issues)}`, { type: 'warning' });
      return;
    }

    const nonErrorIssues = preflightResult.issues.filter((issue) => issue.severity !== 'error');
    if (nonErrorIssues.length > 0) {
      setToastMessage(`关键帧预检提醒：\n${formatLintIssues(nonErrorIssues)}`);
    }

    const promptVersions = updatePromptWithVersion(
      existingKf?.visualPrompt,
      prompt,
      existingKf?.promptVersions,
      'ai-generated',
      `Generate ${type} keyframe`
    );

    // 立即设置生成状态，显示loading
    updateShot(shot.id, (s) => {
      const generatingKeyframe = {
        ...createKeyframe(kfId, type, prompt, undefined, 'generating'),
        promptVersions,
      };
      return updateKeyframeInShot(s, type, generatingKeyframe);
    });

    try {
      // 使用当前设置的横竖屏比例生成关键帧，传递 hasTurnaround 标记
      const url = await generateImage(
        prompt,
        referenceImages,
        keyframeAspectRatio,
        false,
        refResult.hasTurnaround,
        negativePrompt,
        continuityReferenceImage
          ? { continuityReferenceImage, referencePackType: 'shot' }
          : { referencePackType: 'shot' }
      );

      updateShot(shot.id, (s) => {
        const completedKeyframe = {
          ...createKeyframe(kfId, type, prompt, url, 'completed'),
          promptVersions,
        };
        return updateKeyframeInShot(s, type, completedKeyframe);
      });
    } catch (e: any) {
      console.error(e);
      updateShot(shot.id, (s) => {
        const failedKeyframe = {
          ...createKeyframe(kfId, type, prompt, undefined, 'failed'),
          promptVersions,
        };
        return updateKeyframeInShot(s, type, failedKeyframe);
      });
      
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`生成失败: ${formatUserFriendlyError(e, '图片生成失败，请稍后重试。')}`, { type: 'error' });
    }
  };

  /**
   * 上传关键帧图片
   */
  const handleUploadKeyframeImage = async (shot: Shot, type: 'start' | 'end') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      if (!file.type.startsWith('image/')) {
        showAlert('请选择图片文件！', { type: 'warning' });
        return;
      }
      
      try {
        const base64Url = await convertImageToBase64(file);
        const existingKf = shot.keyframes?.find(k => k.type === type);
        const kfId = existingKf?.id || generateId(`kf-${shot.id}-${type}`);
        
        updateShot(shot.id, (s) => {
          const visualPrompt = existingKf?.visualPrompt || shot.actionSummary;
          const uploadedKeyframe = {
            ...createKeyframe(kfId, type, visualPrompt, base64Url, 'completed'),
            promptVersions: existingKf?.promptVersions,
          };
          return updateKeyframeInShot(s, type, uploadedKeyframe);
        });
      } catch (error) {
        showAlert('读取文件失败！', { type: 'error' });
      }
    };
    
    input.click();
  };

  /**
   * 生成视频
   * @param shot - 镜头数据
   * @param aspectRatio - 横竖屏比例
  * @param duration - 视频时长（仅异步模型有效）
   * @param modelId - 视频模型 ID
   */
  const handleGenerateVideo = async (shot: Shot, aspectRatio: AspectRatio = '16:9', duration: VideoDuration = 8, modelId?: string) => {
    const sKf = shot.keyframes?.find(k => k.type === 'start');
    const eKf = shot.keyframes?.find(k => k.type === 'end');
    
    // 使用传入的 modelId 或默认模型
    const selectedModelInput: string = modelId || shot.videoModel || DEFAULTS.videoModel;
    const selectedModelRouting = resolveVideoModelRouting(selectedModelInput);
    const selectedModel = selectedModelRouting.normalizedModelId;
    // 规范化模型名称：旧模型名 -> 现行可用模型

    // 必须有起始帧
    if (!sKf?.imageUrl) {
      return showAlert("请先生成起始帧！", { type: 'warning' });
    }
    
    const projectLanguage = project.language || project.scriptData?.language || '中文';
    const visualStyle = project.visualStyle || project.scriptData?.visualStyle || 'live-action';
    
    const videoInputMode = shot.videoInputMode || getRecommendedVideoInputMode(selectedModel);
    // 检测是否为网格分镜模式：必须显式选择网格模式 + 首帧使用整张网格图
    const isNineGridMode = (
      videoInputMode === 'storyboard-grid' &&
      shot.nineGrid?.status === 'completed' &&
      shot.nineGrid?.imageUrl &&
      sKf?.imageUrl === shot.nineGrid.imageUrl
    );
    
    const routedFrames = routeVideoFrameInputs(
      selectedModel,
      sKf?.imageUrl,
      eKf?.imageUrl,
      videoInputMode
    );
    const routedEndKeyframeId = routedFrames.endImage ? (eKf?.id || '') : '';

    if (routedFrames.ignoredEndFrame) {
      if (videoInputMode === 'storyboard-grid' && !!eKf?.imageUrl) {
        setToastMessage('网格分镜模式已启用：视频生成将只使用首帧，尾帧输入已自动忽略。');
      } else {
        const modelName = selectedModelRouting.family === 'sora'
          ? 'Sora'
          : selectedModelRouting.family === 'doubao-task'
            ? 'Doubao Task'
            : selectedModel;
        setToastMessage(`能力路由：${modelName} 当前只使用首帧，已自动忽略尾帧输入。`);
      }
    }

    let videoPrompt = (shot.interval?.videoPrompt || '').trim();
    if (!videoPrompt) {
      videoPrompt = buildVideoPrompt(
        shot.actionSummary,
        shot.cameraMovement,
        selectedModel,
        projectLanguage,
        visualStyle,
        isNineGridMode ? shot.nineGrid : undefined,
        duration,
        {
          hasStartFrame: !!routedFrames.startImage,
          hasEndFrame: !!routedFrames.endImage,
        },
        promptTemplates
      );
    }
    if (isNineGridMode) {
      const panelCountForGuard = shot.nineGrid?.layout?.panelCount || shot.nineGrid?.panels?.length || 9;
      videoPrompt = ensureNineGridVideoPromptGuardrails(videoPrompt, panelCountForGuard, projectLanguage);
    }

    const videoPromptLength = Array.from(videoPrompt).length;
    if (videoPromptLength > 5000) {
      const compressionResult = await compressPromptWithLLM({
        text: videoPrompt,
        maxChars: 4920,
        mode: 'video',
        timeoutMs: 45000,
      });
      if (compressionResult.compressed) {
        videoPrompt = compressionResult.text;
        setToastMessage(
          `Video prompt compressed by ${compressionResult.model}: ` +
          `${compressionResult.originalLength} -> ${compressionResult.finalLength} chars`
        );
      }
    }

    const selectedModelConfig = (getModelById(selectedModelInput) || getModelById(selectedModel)) as any;
    const preflightResult = runVideoPreflight({
      prompt: videoPrompt,
      hasStartFrame: !!routedFrames.startImage,
      hasEndFrame: !!routedFrames.endImage,
      modelId: selectedModel,
      supportsEndFrame: selectedModelRouting.supportsEndFrame,
      aspectRatio,
      supportedAspectRatios: selectedModelConfig?.params?.supportedAspectRatios,
      duration,
      supportedDurations: selectedModelConfig?.params?.supportedDurations,
    });

    if (!preflightResult.canProceed) {
      showAlert(`视频预检未通过：\n${formatLintIssues(preflightResult.issues)}`, { type: 'warning' });
      return;
    }

    const nonErrorIssues = preflightResult.issues.filter((issue) => issue.severity !== 'error');
    if (nonErrorIssues.length > 0) {
      setToastMessage(`视频预检提醒：\n${formatLintIssues(nonErrorIssues)}`);
    }
    
    const intervalId = shot.interval?.id || generateId(`int-${shot.id}`);
    const intervalPromptVersions = updatePromptWithVersion(
      shot.interval?.videoPrompt,
      videoPrompt,
      shot.interval?.promptVersions,
      'ai-generated',
      `Generate video (${selectedModel})`
    );
    
    // 更新 shot 的 videoModel
    updateShot(shot.id, (s) => ({
      ...s,
      videoModel: selectedModel as any,
      interval: s.interval ? { ...s.interval, status: 'generating', videoPrompt, promptVersions: intervalPromptVersions } : {
        id: intervalId,
        startKeyframeId: sKf?.id || '',
        endKeyframeId: routedEndKeyframeId,
        duration: duration,
        motionStrength: 5,
        videoPrompt,
        promptVersions: intervalPromptVersions,
        status: 'generating'
      }
    }));
    
    try {
      const videoUrl = await generateVideo(
        videoPrompt, 
        routedFrames.startImage,
        routedFrames.endImage,
        selectedModel,
        aspectRatio,
        duration
      );
      const persistedVideoUrl = await persistVideoReference(videoUrl, {
        projectId: project.projectId || project.id,
        episodeId: project.id,
        shotId: shot.id,
      });

      updateShot(shot.id, (s) => ({
        ...s,
        interval: s.interval ? { ...s.interval, videoUrl: persistedVideoUrl, status: 'completed', promptVersions: intervalPromptVersions } : {
          id: intervalId,
          startKeyframeId: sKf?.id || '',
          endKeyframeId: routedEndKeyframeId,
          duration: duration,
          motionStrength: 5,
          videoPrompt,
          promptVersions: intervalPromptVersions,
          videoUrl: persistedVideoUrl,
          status: 'completed'
        }
      }));
    } catch (e: any) {
      console.error(e);
      updateShot(shot.id, (s) => ({
        ...s,
        interval: s.interval ? { ...s.interval, status: 'failed', promptVersions: intervalPromptVersions } : {
          id: intervalId,
          startKeyframeId: sKf?.id || '',
          endKeyframeId: routedEndKeyframeId,
          duration: duration,
          motionStrength: 5,
          videoPrompt,
          promptVersions: intervalPromptVersions,
          status: 'failed'
        }
      }));
      
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`视频生成失败: ${formatUserFriendlyError(e, '请稍后重试。')}`, { type: 'error' });
    }
  };

  /**
   * 生成镜头配音（旁白 / 对话）
   */
  const handleGenerateDubbing = async (
    shot: Shot,
    mode: DubbingMode,
    text: string,
    modelId?: string
  ) => {
    const cleanText = (text || '').trim();
    if (!cleanText) {
      showAlert(mode === 'dialogue' ? '请先填写对话文本' : '请先填写旁白文本', { type: 'warning' });
      return;
    }

    const selectedModelId = modelId || shot.dubbing?.modelId || getActiveAudioModel()?.id || 'gpt-audio-1.5';

    updateShot(shot.id, (s) => ({
      ...s,
      dubbing: {
        mode,
        text: cleanText,
        modelId: selectedModelId,
        status: 'generating',
      },
    }));

    try {
      const result = await generateDubbingAudio({
        text: cleanText,
        mode,
        model: selectedModelId,
        language: project.language || project.scriptData?.language || '中文',
      });

      updateShot(shot.id, (s) => ({
        ...s,
        dubbing: {
          mode,
          text: cleanText,
          modelId: selectedModelId,
          voice: result.usedVoice,
          outputFormat: result.usedFormat,
          transcript: result.transcript,
          audioUrl: result.audioDataUrl,
          status: 'completed',
          generatedAt: Date.now(),
        },
      }));

      showAlert('配音生成成功', { type: 'success' });
    } catch (e: any) {
      console.error('配音生成失败:', e);

      updateShot(shot.id, (s) => ({
        ...s,
        dubbing: {
          mode,
          text: cleanText,
          modelId: selectedModelId,
          status: 'failed',
          error: formatUserFriendlyError(e, '配音生成失败，请稍后重试。'),
        },
      }));

      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`配音生成失败: ${formatUserFriendlyError(e, '请稍后重试。')}`, { type: 'error' });
    }
  };

  /**
   * 复制上一镜头的结束帧
   */
  const handleCopyPreviousEndFrame = () => {
    if (activeShotIndex === 0 || !activeShot) return;
    
    const previousShot = project.shots[activeShotIndex - 1];
    const previousEndKf = previousShot?.keyframes?.find(k => k.type === 'end');
    
    if (!previousEndKf?.imageUrl) {
      showAlert("上一个镜头还没有生成结束帧", { type: 'warning' });
      return;
    }
    
    const existingStartKf = activeShot.keyframes?.find(k => k.type === 'start');
    const newStartKfId = existingStartKf?.id || generateId(`kf-${activeShot.id}-start`);
    
    updateShot(activeShot.id, (s) => {
      return updateKeyframeInShot(
        s, 
        'start', 
        createKeyframe(newStartKfId, 'start', previousEndKf.visualPrompt, previousEndKf.imageUrl, 'completed')
      );
    });
  };

  /**
   * 复制下一镜头的起始帧到当前镜头的结束帧
   */
  const handleCopyNextStartFrame = () => {
    if (activeShotIndex >= project.shots.length - 1 || !activeShot) return;
    
    const nextShot = project.shots[activeShotIndex + 1];
    const nextStartKf = nextShot?.keyframes?.find(k => k.type === 'start');
    
    if (!nextStartKf?.imageUrl) {
      showAlert("下一个镜头还没有生成起始帧", { type: 'warning' });
      return;
    }
    
    const existingEndKf = activeShot.keyframes?.find(k => k.type === 'end');
    const newEndKfId = existingEndKf?.id || generateId(`kf-${activeShot.id}-end`);
    
    updateShot(activeShot.id, (s) => {
      return updateKeyframeInShot(
        s, 
        'end', 
        createKeyframe(newEndKfId, 'end', nextStartKf.visualPrompt, nextStartKf.imageUrl, 'completed')
      );
    });
  };

  /**
   * 批量生成关键帧
   */
  const handleBatchGenerateImages = async () => {
    const isRegenerate = allStartFramesGenerated;
    
    let shotsToProcess = [];
    if (isRegenerate) {
      showAlert("确定要重新生成所有镜头的首帧吗？这将覆盖现有图片。", {
        type: 'warning',
        showCancel: true,
        onConfirm: async () => {
          shotsToProcess = [...project.shots];
          await executeBatchGenerate(shotsToProcess, isRegenerate);
        }
      });
      return;
    } else {
      shotsToProcess = project.shots.filter(s => !s.keyframes?.find(k => k.type === 'start')?.imageUrl);
    }
    
    if (shotsToProcess.length === 0) return;
    await executeBatchGenerate(shotsToProcess, isRegenerate);
  };

  const executeBatchGenerate = async (shotsToProcess: any[], isRegenerate: boolean) => {
    setBatchProgress({ 
      current: 0, 
      total: shotsToProcess.length, 
      message: isRegenerate ? "正在重新生成所有首帧..." : "正在批量生成缺失的首帧..." 
    });

    for (let i = 0; i < shotsToProcess.length; i++) {
      if (i > 0) await delay(DEFAULTS.batchGenerateDelay);
      
      const shot = shotsToProcess[i];
      setBatchProgress({ 
        current: i + 1, 
        total: shotsToProcess.length, 
        message: `正在生成镜头 ${i+1}/${shotsToProcess.length}...` 
      });
      
      try {
        await handleGenerateKeyframe(shot, 'start');
      } catch (e: any) {
        console.error(`Failed to generate for shot ${shot.id}`, e);
        if (onApiKeyError && onApiKeyError(e)) {
          setBatchProgress(null);
          return;
        }
      }
    }

    setBatchProgress(null);
  };

  /**
   * 保存编辑内容
   */
  const handleSaveEdit = () => {
    if (!editModal || !activeShot) return;
    
    switch (editModal.type) {
      case 'action':
        updateShot(activeShot.id, (s) => ({ ...s, actionSummary: editModal.value }));
        break;
      case 'dialogue':
        updateShot(activeShot.id, (s) => ({
          ...s,
          dialogue: editModal.value.trim() || undefined
        }));
        break;
      case 'keyframe':
        updateShot(activeShot.id, (s) => ({
          ...s,
          keyframes: s.keyframes?.map((kf) => {
            if (kf.type !== editModal.frameType) return kf;
            return {
              ...kf,
              visualPrompt: editModal.value,
              promptVersions: updatePromptWithVersion(
                kf.visualPrompt,
                editModal.value,
                kf.promptVersions,
                'manual-edit',
                `Manual ${kf.type} keyframe edit`
              ),
            };
          }) || []
        }));
        break;
      case 'video':
        updateShot(activeShot.id, (s) => ({
          ...s,
          interval: s.interval ? {
            ...s.interval,
            videoPrompt: editModal.value,
            promptVersions: updatePromptWithVersion(
              s.interval.videoPrompt,
              editModal.value,
              s.interval.promptVersions,
              'manual-edit',
              'Manual video prompt edit'
            ),
          } : {
            id: generateId(`int-${s.id}`),
            startKeyframeId: s.keyframes?.find((kf) => kf.type === 'start')?.id || '',
            endKeyframeId: s.keyframes?.find((kf) => kf.type === 'end')?.id || '',
            duration:
              Number(s.interval?.duration) ||
              getModelDefaultDuration(s.videoModel || DEFAULTS.videoModel),
            motionStrength: s.interval?.motionStrength ?? 5,
            videoPrompt: editModal.value,
            promptVersions: updatePromptWithVersion(
              undefined,
              editModal.value,
              undefined,
              'manual-edit',
              'Manual video prompt edit'
            ),
            status: s.interval?.status || 'pending',
          }
        }));
        break;
    }
    
    setEditModal(null);
  };

  /**
   * AI生成动作建议
   */
  const handleGenerateAIAction = async () => {
    if (!activeShot) return;
    
    const startKf = activeShot.keyframes?.find(k => k.type === 'start');
    const endKf = activeShot.keyframes?.find(k => k.type === 'end');
    
    // 检查是否有首帧和尾帧
    if (!startKf?.visualPrompt && !endKf?.visualPrompt) {
      showAlert('请先生成或编辑首帧和尾帧的提示词，以便AI更好地理解场景', { type: 'warning' });
      return;
    }
    
    setIsAIGenerating(true);
    
    try {
      const startPrompt = startKf?.visualPrompt || activeShot.actionSummary || '未定义的起始场景';
      const endPrompt = endKf?.visualPrompt || activeShot.actionSummary || '未定义的结束场景';
      const cameraMovement = activeShot.cameraMovement || '平移';
      const modelDuration = getModelDefaultDuration(activeShot.videoModel || DEFAULTS.videoModel);
      const planningDuration = Number(project.scriptData?.planningShotDuration) || modelDuration;
      const targetDurationSeconds = Math.max(1, Number(activeShot.interval?.duration) || planningDuration);
      
      const aiInstruction =
        editModal && editModal.type === 'action'
          ? editModal.aiInstruction?.trim()
          : undefined;

      const suggestion = await generateActionSuggestion(
        startPrompt,
        endPrompt,
        cameraMovement,
        aiInstruction,
        undefined,
        targetDurationSeconds
      );
      
      // 更新编辑框的内容
      if (editModal && editModal.type === 'action') {
        setEditModal({ ...editModal, value: suggestion });
      }
    } catch (e: any) {
      console.error('AI动作生成失败:', e);
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`AI动作生成失败: ${e.message}`, { type: 'error' });
    } finally {
      setIsAIGenerating(false);
    }
  };

  /**
   * AI优化关键帧提示词（单个）
   */
  const handleOptimizeKeyframeWithAI = async (type: 'start' | 'end') => {
    if (!activeShot) return;
    
    const scene = project.scriptData?.scenes.find(s => String(s.id) === String(activeShot.sceneId));
    if (!scene) {
      showAlert('找不到场景信息', { type: 'warning' });
      return;
    }
    
    setIsAIGenerating(true);
    
    try {
      // 获取角色信息
      const characterNames: string[] = [];
      if (activeShot.characters && project.scriptData?.characters) {
        activeShot.characters.forEach(charId => {
          const char = project.scriptData?.characters.find(c => String(c.id) === String(charId));
          if (char) characterNames.push(char.name);
        });
      }
      
      const visualStyle = project.visualStyle || project.scriptData?.visualStyle || 'live-action';
      const actionSummary = activeShot.actionSummary || '未定义的动作';
      const cameraMovement = activeShot.cameraMovement || '平移';
      
      const optimizedPrompt = await optimizeKeyframePrompt(
        type,
        actionSummary,
        cameraMovement,
        {
          location: scene.location,
          time: scene.time,
          atmosphere: scene.atmosphere
        },
        characterNames,
        visualStyle
      );
      
      // 更新关键帧的visualPrompt
      const existingKf = activeShot.keyframes?.find(k => k.type === type);
      const kfId = existingKf?.id || generateId(`kf-${activeShot.id}-${type}`);
      
      updateShot(activeShot.id, (s) => {
        return updateKeyframeInShot(
          s,
          type,
          createKeyframe(kfId, type, optimizedPrompt, existingKf?.imageUrl, existingKf?.status || 'pending')
        );
      });
      
      showAlert(`${type === 'start' ? '起始帧' : '结束帧'}提示词已优化`, { type: 'success' });
    } catch (e: any) {
      console.error('AI优化失败:', e);
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`AI优化失败: ${e.message}`, { type: 'error' });
    } finally {
      setIsAIGenerating(false);
    }
  };

  /**
   * AI一次性优化起始帧和结束帧（推荐）
   */
  const handleOptimizeBothKeyframes = async () => {
    if (!activeShot) return;
    
    const scene = project.scriptData?.scenes.find(s => String(s.id) === String(activeShot.sceneId));
    if (!scene) {
      showAlert('找不到场景信息', { type: 'warning' });
      return;
    }
    
    setIsAIGenerating(true);
    
    try {
      // 获取角色信息
      const characterNames: string[] = [];
      if (activeShot.characters && project.scriptData?.characters) {
        activeShot.characters.forEach(charId => {
          const char = project.scriptData?.characters.find(c => String(c.id) === String(charId));
          if (char) characterNames.push(char.name);
        });
      }
      
      const visualStyle = project.visualStyle || project.scriptData?.visualStyle || 'live-action';
      const actionSummary = activeShot.actionSummary || '未定义的动作';
      const cameraMovement = activeShot.cameraMovement || '平移';
      
      const result = await optimizeBothKeyframes(
        actionSummary,
        cameraMovement,
        {
          location: scene.location,
          time: scene.time,
          atmosphere: scene.atmosphere
        },
        characterNames,
        visualStyle
      );
      
      // 同时更新起始帧和结束帧
      const startKf = activeShot.keyframes?.find(k => k.type === 'start');
      const endKf = activeShot.keyframes?.find(k => k.type === 'end');
      const startKfId = startKf?.id || generateId(`kf-${activeShot.id}-start`);
      const endKfId = endKf?.id || generateId(`kf-${activeShot.id}-end`);
      
      updateShot(activeShot.id, (s) => {
        let updated = updateKeyframeInShot(
          s,
          'start',
          createKeyframe(startKfId, 'start', result.startPrompt, startKf?.imageUrl, startKf?.status || 'pending')
        );
        updated = updateKeyframeInShot(
          updated,
          'end',
          createKeyframe(endKfId, 'end', result.endPrompt, endKf?.imageUrl, endKf?.status || 'pending')
        );
        return updated;
      });
      
      showAlert('起始帧和结束帧提示词已优化', { type: 'success' });
    } catch (e: any) {
      console.error('AI优化失败:', e);
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`AI优化失败: ${e.message}`, { type: 'error' });
    } finally {
      setIsAIGenerating(false);
    }
  };

  /**
   * AI拆分镜头
   * 将单个镜头拆分为多个细致的子镜头（按景别和视角）
   */
  const handleSplitShot = async (shot: Shot) => {
    if (!shot) return;
    
    // 弹出确认提示，告知用户拆分的含义
    showAlert(
      'AI拆分镜头会将当前镜头按不同景别与视角拆分为多个子镜头，原镜头将被替换为拆分后的子镜头序列。此操作不可撤销，建议在拆分前确认镜头内容已编辑完成。\n\n确定要继续拆分吗？',
      {
        title: 'AI拆分镜头',
        type: 'warning',
        showCancel: true,
        confirmText: '确认拆分',
        cancelText: '取消',
        onConfirm: () => executeSplitShot(shot),
      }
    );
  };

  /** 执行AI拆分镜头的实际逻辑 */
  const executeSplitShot = async (shot: Shot) => {
    // 1. 获取场景信息
    const scene = project.scriptData?.scenes.find(s => String(s.id) === String(shot.sceneId));
    if (!scene) {
      showAlert('找不到场景信息', { type: 'warning' });
      return;
    }
    
    // 2. 获取角色名称
    const characterNames: string[] = [];
    if (shot.characters && project.scriptData?.characters) {
      shot.characters.forEach(charId => {
        const char = project.scriptData?.characters.find(c => String(c.id) === String(charId));
        if (char) characterNames.push(char.name);
      });
    }
    
    const visualStyle = project.visualStyle || project.scriptData?.visualStyle || 'live-action';
    const shotGenerationModel = project.shotGenerationModel || 'gpt-5.2';
    
    // 3. 调用AI拆分
    setIsSplittingShot(true);
    
    try {
      const subShotsData = await splitShotIntoSubShots(
        shot,
        {
          location: scene.location,
          time: scene.time,
          atmosphere: scene.atmosphere
        },
        characterNames,
        visualStyle,
        shotGenerationModel
      );
      
      // 4. 生成子镜头对象
      const subShotIds = generateSubShotIds(shot.id, subShotsData.subShots.length);
      const subShots = subShotsData.subShots.map((data, idx) => 
        createSubShot(shot, data, subShotIds[idx])
      );
      
      // 5. 替换原镜头
      updateProject((prevProject: ProjectState) => ({
        ...prevProject,
        shots: replaceShotWithSubShots(prevProject.shots, shot.id, subShots)
          .map((nextShot) => applyShotQuality(nextShot, prevProject.scriptData))
      }));
      
      // 6. 关闭工作台，显示成功提示
      setActiveShotId(null);
      showAlert(`镜头已拆分为 ${subShots.length} 个子镜头`, { type: 'success' });
    } catch (e: any) {
      console.error('镜头拆分失败:', e);
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`拆分失败: ${e.message}`, { type: 'error' });
    } finally {
      setIsSplittingShot(false);
    }
  };

  /**
   * 九宫格分镜预览 - 第一步：生成镜头描述
   * 使用 AI 将镜头拆分为网格视角描述（4/6/9），等待用户确认/编辑后再生成图片
   */
  const handleGenerateNineGrid = async (shot: Shot, panelCount?: StoryboardGridPanelCount) => {
    if (!shot) return;
    const layout = resolveStoryboardGridLayout(panelCount ?? shot.nineGrid?.layout?.panelCount);
    
    // 1. 获取场景信息
    const scene = project.scriptData?.scenes.find(s => String(s.id) === String(shot.sceneId));
    if (!scene) {
      showAlert('找不到场景信息', { type: 'warning' });
      return;
    }
    
    // 2. 获取角色名称
    const characterNames: string[] = [];
    if (shot.characters && project.scriptData?.characters) {
      shot.characters.forEach(charId => {
        const char = project.scriptData?.characters.find(c => String(c.id) === String(charId));
        if (char) characterNames.push(char.name);
      });
    }
    
    const visualStyle = project.visualStyle || project.scriptData?.visualStyle || 'live-action';
    const shotGenerationModel = project.shotGenerationModel || 'gpt-5.2';
    
    // 3. 显示弹窗并设置生成状态（仅生成面板描述）
    setShowNineGrid(true);
    updateShot(shot.id, (s) => ({
      ...s,
      nineGrid: {
        panels: [],
        layout: {
          panelCount: layout.panelCount,
          rows: layout.rows,
          cols: layout.cols,
        },
        status: 'generating_panels' as const
      }
    }));
    
    try {
      // 4. 调用 AI 拆分镜头为网格视角（仅文字描述，不生成图片）
      const panels = await generateNineGridPanels(
        shot.actionSummary,
        shot.cameraMovement,
        {
          location: scene.location,
          time: scene.time,
          atmosphere: scene.atmosphere
        },
        characterNames,
        visualStyle,
        shotGenerationModel,
        layout.panelCount,
        promptTemplates
      );
      
      // 5. 更新状态为 panels_ready，等待用户确认
      updateShot(shot.id, (s) => ({
        ...s,
        nineGrid: {
          panels,
          layout: {
            panelCount: layout.panelCount,
            rows: layout.rows,
            cols: layout.cols,
          },
          status: 'panels_ready' as const
        }
      }));
      
      showAlert(`${layout.panelCount}个镜头描述已生成，请检查并编辑后确认生成图片`, { type: 'success' });
      
    } catch (e: any) {
      console.error('网格镜头描述生成失败:', e);
      updateShot(shot.id, (s) => ({
        ...s,
        nineGrid: {
          panels: s.nineGrid?.panels || [],
          layout: s.nineGrid?.layout || {
            panelCount: layout.panelCount,
            rows: layout.rows,
            cols: layout.cols,
          },
          status: 'failed' as const
        }
      }));
      
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`镜头描述生成失败: ${e.message}`, { type: 'error' });
    }
  };

  /**
   * 九宫格分镜预览 - 第二步：确认并生成图片
   * 用户确认/编辑完面板描述后，调用图片生成 API 生成九宫格图片
   */
  const getShotById = (shotId: string): Shot | undefined =>
    project.shots.find(s => s.id === shotId);

  const handleConfirmNineGridPanels = async (shotId: string, confirmedPanels: NineGridPanel[]) => {
    const shot = getShotById(shotId);
    if (!shot) return;
    const layout = resolveStoryboardGridLayout(
      shot.nineGrid?.layout?.panelCount,
      confirmedPanels.length
    );

    const visualStyle = project.visualStyle || project.scriptData?.visualStyle || 'live-action';

    // 1. 更新面板数据并设置生成图片状态
    updateShot(shotId, (s) => ({
      ...s,
      nineGrid: {
        panels: confirmedPanels,
        layout: {
          panelCount: layout.panelCount,
          rows: layout.rows,
          cols: layout.cols,
        },
        status: 'generating_image' as const
      }
    }));

    try {
      // 2. 基于最新 shot 快照收集参考图片，避免重试时引用过期闭包数据
      const refResult = getRefImagesForShot(shot, project.scriptData);
      const dedupedRefCount = new Set(
        refResult.images.map((img) => String(img || '').trim()).filter(Boolean)
      ).size;
      if (dedupedRefCount > 5) {
        setToastMessage(`参考图数量 ${dedupedRefCount} 超过模型上限，已自动限制为 5 张。`);
      }
      if (refResult.images.length === 0) {
        console.warn(`[NineGrid] shot=${shotId} 没有可用参考图，将仅按文案生成。`);
      }

      // 3. 生成九宫格图片
      const imageUrl = await generateNineGridImage(
        confirmedPanels,
        refResult.images,
        visualStyle,
        keyframeAspectRatio,
        {
          hasTurnaround: refResult.hasTurnaround,
          panelCount: layout.panelCount,
          promptTemplates,
        }
      );

      // 4. 更新状态为完成
      updateShot(shotId, (s) => ({
        ...s,
        nineGrid: {
          panels: confirmedPanels,
          layout: {
            panelCount: layout.panelCount,
            rows: layout.rows,
            cols: layout.cols,
          },
          imageUrl,
          prompt: `${layout.label} Storyboard - ${shot.actionSummary}`,
          status: 'completed' as const
        }
      }));

      showAlert(`${layout.label}分镜图片生成完成！`, { type: 'success' });

    } catch (e: any) {
      console.error('网格分镜图片生成失败:', e);
      updateShot(shotId, (s) => ({
        ...s,
        nineGrid: {
          panels: confirmedPanels,
          layout: {
            panelCount: layout.panelCount,
            rows: layout.rows,
            cols: layout.cols,
          },
          status: 'failed' as const
        }
      }));

      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`网格图片生成失败: ${formatUserFriendlyError(e, '图片生成失败，请稍后重试。')}`, { type: 'error' });
    }
  };

  /**
   * 九宫格分镜预览 - 仅重新生成图片（保留已有的面板描述文案）
   * 当用户对文案满意但图片效果不好时使用
   */
  const handleRegenerateNineGridImage = async () => {
    if (!activeShot || !activeShot.nineGrid?.panels || activeShot.nineGrid.panels.length === 0) return;
    
    // 直接使用已有的面板描述重新生成图片
    await handleConfirmNineGridPanels(activeShot.id, activeShot.nineGrid.panels);
  };

  /**
   * 九宫格分镜预览 - 更新单个面板描述（用户在弹窗中编辑）
   */
  const handleUpdateNineGridPanel = (index: number, updatedPanel: Partial<NineGridPanel>) => {
    if (!activeShot || !activeShot.nineGrid) return;
    
    updateShot(activeShot.id, (s) => {
      if (!s.nineGrid) return s;
      const newPanels = [...s.nineGrid.panels];
      const nextPanel: NineGridPanel = { ...newPanels[index], ...updatedPanel };
      if (
        typeof updatedPanel.description === 'string' &&
        updatedPanel.description.trim() !== String(newPanels[index]?.description || '').trim() &&
        updatedPanel.descriptionZh === undefined
      ) {
        nextPanel.descriptionZh = undefined;
      }
      newPanels[index] = nextPanel;
      return {
        ...s,
        nineGrid: {
          ...s.nineGrid,
          panels: newPanels
        }
      };
    });
  };

  /**
   * 九宫格分镜预览 - 英文描述翻译为中文展示（不替换英文原文）
   */
  const handleTranslateNineGridPanels = async () => {
    if (!activeShot?.nineGrid?.panels?.length) return;
    const model = project.shotGenerationModel || 'gpt-5.2';
    setIsNineGridTranslating(true);
    try {
      const translations = await translateNineGridPanels(activeShot.nineGrid.panels, model);
      const translationMap = new Map<number, string>(
        translations.map((item) => [item.index, item.descriptionZh])
      );

      updateShot(activeShot.id, (s) => {
        if (!s.nineGrid) return s;
        return {
          ...s,
          nineGrid: {
            ...s.nineGrid,
            panels: s.nineGrid.panels.map((panel) => ({
              ...panel,
              descriptionZh: translationMap.get(panel.index) || panel.descriptionZh,
            })),
          },
        };
      });

      showAlert('已生成中文翻译展示，可切换查看。', { type: 'success' });
    } catch (e: any) {
      console.error('九宫格翻译失败:', e);
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`翻译失败: ${formatUserFriendlyError(e, '翻译失败，请稍后重试。')}`, { type: 'error' });
    } finally {
      setIsNineGridTranslating(false);
    }
  };

  /**
   * 九宫格分镜预览 - 按用户要求 AI 改写分镜文案
   */
  const handleReviseNineGridPanels = async (instruction: string) => {
    if (!activeShot?.nineGrid?.panels?.length) return;
    const normalizedInstruction = String(instruction || '').trim();
    if (!normalizedInstruction) {
      showAlert('请输入改写要求后再执行 AI 修改。', { type: 'warning' });
      return;
    }

    const model = project.shotGenerationModel || 'gpt-5.2';
    const scene = project.scriptData?.scenes.find(s => String(s.id) === String(activeShot.sceneId));
    const visualStyle = project.visualStyle || project.scriptData?.visualStyle || 'live-action';

    setIsNineGridRevising(true);
    try {
      const revisedPanels = await reviseNineGridPanelsByInstruction(
        activeShot.nineGrid.panels,
        normalizedInstruction,
        {
          actionSummary: activeShot.actionSummary,
          cameraMovement: activeShot.cameraMovement,
          visualStyle,
          sceneInfo: scene
            ? {
                location: scene.location,
                time: scene.time,
                atmosphere: scene.atmosphere,
              }
            : undefined,
        },
        model
      );

      updateShot(activeShot.id, (s) => {
        if (!s.nineGrid) return s;
        return {
          ...s,
          nineGrid: {
            ...s.nineGrid,
            panels: revisedPanels.map((panel) => ({ ...panel, descriptionZh: undefined })),
            status: 'panels_ready',
          },
        };
      });

      showAlert('AI 已按你的要求改写九宫格文案，请复核后生成图片。', { type: 'success' });
    } catch (e: any) {
      console.error('九宫格改写失败:', e);
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`AI修改失败: ${formatUserFriendlyError(e, '改写失败，请稍后重试。')}`, { type: 'error' });
    } finally {
      setIsNineGridRevising(false);
    }
  };

  /**
   * 九宫格分镜预览 - 选择面板
   * 从九宫格图片中裁剪选中的面板，直接作为首帧使用（九宫格与首帧是替代关系）
   */
  const handleSelectNineGridPanel = async (panel: NineGridPanel) => {
    if (!activeShot || !activeShot.nineGrid?.imageUrl) return;
    
    const visualStyle = project.visualStyle || project.scriptData?.visualStyle || 'live-action';
    
    // 1. 构建首帧提示词（保留视角信息，方便后续重新生成）
    const shotPropsInfo = getPropsInfoForShot(activeShot, project.scriptData);
    const prompt = buildPromptFromNineGridPanel(
      panel,
      activeShot.actionSummary,
      visualStyle,
      activeShot.cameraMovement,
      shotPropsInfo,
      activeShot.nineGrid?.layout,
      promptTemplates
    );
    
    const existingKf = activeShot.keyframes?.find(k => k.type === 'start');
    const kfId = existingKf?.id || generateId(`kf-${activeShot.id}-start`);
    
    try {
      // 2. 从九宫格图片中裁剪出选中的面板
      const croppedImageUrl = await cropPanelFromNineGrid(
        activeShot.nineGrid.imageUrl,
        panel.index,
        activeShot.nineGrid?.layout
      );
      
      // 3. 将裁剪后的图片直接设为首帧（九宫格与首帧是替代关系）
      updateShot(activeShot.id, (s) => {
        return updateKeyframeInShot(
          s,
          'start',
          createKeyframe(kfId, 'start', prompt, croppedImageUrl, 'completed')
        );
      });
      
      // 4. 关闭弹窗
      setShowNineGrid(false);
      showAlert(`已将「${panel.shotSize}/${panel.cameraAngle}」视角设为首帧`, { type: 'success' });
    } catch (e: any) {
      console.error('裁剪九宫格面板失败:', e);
      showAlert(`裁剪失败: ${e.message}`, { type: 'error' });
    }
  };

  /**
   * 九宫格分镜预览 - 整张图直接用作首帧
   */
  const handleUseWholeNineGridAsFrame = () => {
    if (!activeShot || !activeShot.nineGrid?.imageUrl) return;
    
    const existingKf = activeShot.keyframes?.find(k => k.type === 'start');
    const kfId = existingKf?.id || generateId(`kf-${activeShot.id}-start`);
    const layout = resolveStoryboardGridLayout(
      activeShot.nineGrid?.layout?.panelCount,
      activeShot.nineGrid?.panels?.length
    );
    const prompt = `${layout.label}分镜全图 - ${activeShot.actionSummary}`;
    
    updateShot(activeShot.id, (s) => {
      return updateKeyframeInShot(
        s,
        'start',
        createKeyframe(kfId, 'start', prompt, activeShot.nineGrid!.imageUrl!, 'completed')
      );
    });
    
    setShowNineGrid(false);
    showAlert('已将网格整图设为首帧', { type: 'success' });
  };

  // 空状态
  if (!project.shots.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--text-tertiary)] bg-[var(--bg-secondary)]">
        <AlertCircle className="w-12 h-12 mb-4 opacity-50"/>
        <p>暂无镜头数据，请先返回阶段 1 生成分镜表。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-secondary)] relative overflow-hidden">
      
      {/* Batch Progress Overlay */}
      {batchProgress && (
        <div className="absolute inset-0 z-50 bg-[var(--bg-base)]/80 flex flex-col items-center justify-center backdrop-blur-md animate-in fade-in">
          <Loader2 className="w-12 h-12 text-[var(--accent)] animate-spin mb-6" />
          <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">{batchProgress.message}</h3>
          <div className="w-64 h-1.5 bg-[var(--bg-hover)] rounded-full overflow-hidden">
            <div 
              className="h-full bg-[var(--accent)] transition-all duration-300" 
              style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
            />
          </div>
          <p className="text-[var(--text-tertiary)] mt-3 text-xs font-mono">
            {Math.round((batchProgress.current / batchProgress.total) * 100)}%
          </p>
        </div>
      )}

      {toastMessage && (
        <div className="fixed left-1/2 top-1/3 z-[9999] w-full max-w-md -translate-x-1/2 rounded-xl border border-[var(--border-secondary)] bg-black/80 px-4 py-3 shadow-2xl backdrop-blur">
          <div className="text-xs text-white whitespace-pre-line">{toastMessage}</div>
        </div>
      )}

      {/* Toolbar */}
      <div className="h-16 border-b border-[var(--border-primary)] bg-[var(--bg-elevated)] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-3">
            <LayoutGrid className="w-5 h-5 text-[var(--accent)]" />
            导演工作台
            <span className="text-xs text-[var(--text-muted)] font-mono font-normal uppercase tracking-wider bg-[var(--bg-base)]/30 px-2 py-1 rounded">
              Director Workbench
            </span>
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* 横竖屏选择 */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase">比例</span>
            <AspectRatioSelector
              value={keyframeAspectRatio}
              onChange={setKeyframeAspectRatio}
              allowSquare={false}
              disabled={!!batchProgress}
            />
          </div>
          <div className="w-px h-6 bg-[var(--bg-hover)]" />
          {/* AI增强开关 */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--bg-base)]/30 border border-[var(--border-primary)]">
            <Sparkles className={`w-3.5 h-3.5 ${useAIEnhancement ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)]'}`} />
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-[var(--text-tertiary)]">AI增强提示词</span>
              <input
                type="checkbox"
                checked={useAIEnhancement}
                onChange={(e) => setUseAIEnhancement(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[var(--border-secondary)] bg-[var(--bg-hover)] text-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-0 cursor-pointer"
              />
            </label>
          </div>
          
          <span className={`text-xs font-mono px-2 py-1 rounded border ${
            projectQualityScore >= 80
              ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
              : projectQualityScore >= 60
                ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                : 'text-rose-300 border-rose-500/40 bg-rose-500/10'
          }`}>
            质检分 {projectQualityScore}
          </span>
          <span className="text-xs text-[var(--text-tertiary)] mr-4 font-mono">
            {project.shots.filter(s => s.interval?.videoUrl).length} / {project.shots.length} 完成
          </span>
          <button 
            onClick={handleBatchGenerateImages}
            disabled={!!batchProgress}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all flex items-center gap-2 ${
              allStartFramesGenerated
                ? 'bg-[var(--bg-surface)] text-[var(--text-tertiary)] border border-[var(--border-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)]'
                : 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] shadow-lg shadow-[var(--btn-primary-shadow)]'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            {allStartFramesGenerated ? '重新生成所有首帧' : '批量生成首帧'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Grid View */}
        <div className={`flex-1 overflow-y-auto p-6 transition-all duration-500 ease-in-out ${activeShotId ? 'border-r border-[var(--border-primary)]' : ''}`}>
          <div className={`grid gap-4 ${activeShotId ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
            {project.shots.map((shot, idx) => (
              <ShotCard
                key={shot.id}
                shot={shot}
                index={idx}
                isActive={activeShotId === shot.id}
                onClick={() => setActiveShotId(shot.id)}
                onDelete={handleDeleteShot}
              />
            ))}
          </div>
        </div>

        {/* Workbench */}
        {activeShotId && activeShot && (
          <ShotWorkbench
            shot={activeShot}
            shotIndex={activeShotIndex}
            totalShots={project.shots.length}
            scriptData={project.scriptData}
            currentVideoModelId={activeShot.videoModel || DEFAULTS.videoModel}
            nextShotHasStartFrame={!!project.shots[activeShotIndex + 1]?.keyframes?.find(k => k.type === 'start')?.imageUrl}
            isAIOptimizing={isAIGenerating}
            isAIReassessing={isAIReassessing}
            isSplittingShot={isSplittingShot}
            onClose={() => setActiveShotId(null)}
            onPrevious={() => setActiveShotId(project.shots[activeShotIndex - 1].id)}
            onNext={() => setActiveShotId(project.shots[activeShotIndex + 1].id)}
            onAIReassessQuality={handleAIReassessQuality}
            onEditActionSummary={() =>
              setEditModal({
                type: 'action',
                value: activeShot.actionSummary,
                aiInstruction: '',
              })
            }
            onEditDialogue={() => setEditModal({ type: 'dialogue', value: activeShot.dialogue || '' })}
            onGenerateAIAction={handleGenerateAIAction}
            onSplitShot={() => handleSplitShot(activeShot)}
            onAddCharacter={(charId) => updateShot(activeShot.id, s => ({ ...s, characters: [...s.characters, charId] }))}
            onRemoveCharacter={(charId) => updateShot(activeShot.id, s => ({
              ...s,
              characters: s.characters.filter(id => id !== charId),
              characterVariations: Object.fromEntries(
                Object.entries(s.characterVariations || {}).filter(([k]) => k !== charId)
              )
            }))}
            onVariationChange={(charId, varId) => updateShot(activeShot.id, s => ({
              ...s,
              characterVariations: { ...(s.characterVariations || {}), [charId]: varId }
            }))}
            onSceneChange={(sceneId) => updateShot(activeShot.id, s => ({ ...s, sceneId }))}
            onAddProp={(propId) => updateShot(activeShot.id, s => ({ ...s, props: [...(s.props || []), propId] }))}
            onRemoveProp={(propId) => updateShot(activeShot.id, s => ({ ...s, props: (s.props || []).filter(id => id !== propId) }))}
            onGenerateKeyframe={(type) => handleGenerateKeyframe(activeShot, type)}
            onUploadKeyframe={(type) => handleUploadKeyframeImage(activeShot, type)}
            onEditKeyframePrompt={(type, prompt) => setEditModal({ type: 'keyframe', value: prompt, frameType: type })}
            onOptimizeKeyframeWithAI={(type) => handleOptimizeKeyframeWithAI(type)}
            onOptimizeBothKeyframes={handleOptimizeBothKeyframes}
            onCopyPreviousEndFrame={handleCopyPreviousEndFrame}
            onCopyNextStartFrame={handleCopyNextStartFrame}
            useAIEnhancement={useAIEnhancement}
            onToggleAIEnhancement={() => setUseAIEnhancement(!useAIEnhancement)}
            onGenerateVideo={(aspectRatio, duration, modelId) => handleGenerateVideo(activeShot, aspectRatio, duration, modelId)}
            onGenerateDubbing={(mode, text, modelId) => handleGenerateDubbing(activeShot, mode, text, modelId)}
            onClearDubbing={() =>
              updateShot(activeShot.id, (s) => ({
                ...s,
                dubbing: undefined,
              }))
            }
            onVideoModelChange={(modelId) => {
              const model = getModelById(modelId);
              const lines = [
                `已切换视频模型：${model?.name || modelId}`,
                model?.description
              ].filter(Boolean);
              setToastMessage(lines.join('\n'));
              updateShot(activeShot.id, s => ({
                ...s,
                videoModel: modelId as any
              }));
            }}
            videoInputMode={activeShot.videoInputMode}
            onVideoInputModeChange={(mode) =>
              updateShot(activeShot.id, (s) => ({
                ...s,
                videoInputMode: mode,
              }))
            }
            onEditVideoPrompt={() => {
              // 如果videoPrompt不存在，动态生成一个
              let promptValue = activeShot.interval?.videoPrompt;
              if (!promptValue) {
                const selectedModelInput = activeShot.videoModel || DEFAULTS.videoModel;
                const selectedModel = resolveVideoModelRouting(selectedModelInput).normalizedModelId;
                const projectLanguage = project.language || project.scriptData?.language || '中文';
                const visualStyle = project.visualStyle || project.scriptData?.visualStyle || 'live-action';
                const promptDuration =
                  Number(activeShot.interval?.duration) ||
                  getModelDefaultDuration(selectedModel) ||
                  Number(project.scriptData?.planningShotDuration) ||
                  8;
                const startKf = activeShot.keyframes?.find(k => k.type === 'start');
                const endKf = activeShot.keyframes?.find(k => k.type === 'end');
                const videoInputMode = activeShot.videoInputMode || getRecommendedVideoInputMode(selectedModel);
                const routedFrames = routeVideoFrameInputs(
                  selectedModel,
                  startKf?.imageUrl,
                  endKf?.imageUrl,
                  videoInputMode
                );
                // 首帧等于九宫格图 + 已选择网格模式时触发网格分镜提示词
                const isNineGridMode = (
                  videoInputMode === 'storyboard-grid' &&
                  activeShot.nineGrid?.status === 'completed' &&
                  activeShot.nineGrid?.imageUrl &&
                  startKf?.imageUrl === activeShot.nineGrid.imageUrl
                );
                promptValue = buildVideoPrompt(
                  activeShot.actionSummary,
                  activeShot.cameraMovement,
                  selectedModel,
                  projectLanguage,
                  visualStyle,
                  isNineGridMode ? activeShot.nineGrid : undefined,
                  promptDuration,
                  {
                    hasStartFrame: !!routedFrames.startImage,
                    hasEndFrame: !!routedFrames.endImage,
                  },
                  promptTemplates
                );
              }
              const editProjectLanguage = project.language || project.scriptData?.language || '中文';
              const editStartKf = activeShot.keyframes?.find(k => k.type === 'start');
              const editVideoInputMode = activeShot.videoInputMode || getRecommendedVideoInputMode(activeShot.videoModel || DEFAULTS.videoModel);
              const editIsNineGridMode = (
                editVideoInputMode === 'storyboard-grid' &&
                activeShot.nineGrid?.status === 'completed' &&
                activeShot.nineGrid?.imageUrl &&
                editStartKf?.imageUrl === activeShot.nineGrid.imageUrl
              );
              if (editIsNineGridMode && promptValue) {
                const panelCountForGuard = activeShot.nineGrid?.layout?.panelCount || activeShot.nineGrid?.panels?.length || 9;
                promptValue = ensureNineGridVideoPromptGuardrails(promptValue, panelCountForGuard, editProjectLanguage);
              }
              setEditModal({ 
                type: 'video', 
                value: promptValue
              });
            }}
            onImageClick={(url, title) => setPreviewImage({ url, title })}
            onGenerateNineGrid={(panelCount) => handleGenerateNineGrid(activeShot, panelCount)}
            nineGrid={activeShot.nineGrid}
            onSelectNineGridPanel={handleSelectNineGridPanel}
            onShowNineGrid={() => setShowNineGrid(true)}
          />
        )}
      </div>

      {/* Nine Grid Preview Modal */}
      {activeShot && (
        <NineGridPreview
          isOpen={showNineGrid}
          nineGrid={activeShot.nineGrid}
          onClose={() => setShowNineGrid(false)}
          onSelectPanel={handleSelectNineGridPanel}
          onUseWholeImage={handleUseWholeNineGridAsFrame}
          onRegenerate={() =>
            handleGenerateNineGrid(
              activeShot,
              resolveStoryboardGridLayout(
                activeShot.nineGrid?.layout?.panelCount,
                activeShot.nineGrid?.panels?.length
              ).panelCount
            )
          }
          onRegenerateImage={handleRegenerateNineGridImage}
          onConfirmPanels={(panels) => handleConfirmNineGridPanels(activeShot.id, panels)}
          onUpdatePanel={handleUpdateNineGridPanel}
          onTranslatePanels={handleTranslateNineGridPanels}
          onRevisePanels={handleReviseNineGridPanels}
          isTranslatingPanels={isNineGridTranslating}
          isRevisingPanels={isNineGridRevising}
          aspectRatio={keyframeAspectRatio}
        />
      )}

      {/* Edit Modal */}
      <EditModal
        isOpen={!!editModal}
        onClose={() => setEditModal(null)}
        onSave={handleSaveEdit}
        title={
          editModal?.type === 'action' ? '编辑叙事动作' :
          editModal?.type === 'dialogue' ? '编辑台词' :
          editModal?.type === 'keyframe' ? '编辑关键帧提示词' :
          '编辑视频提示词'
        }
        icon={
          editModal?.type === 'action' ? <Film className="w-4 h-4 text-[var(--accent-text)]" /> :
          editModal?.type === 'dialogue' ? <MessageSquare className="w-4 h-4 text-[var(--accent-text)]" /> :
          editModal?.type === 'keyframe' ? <Edit2 className="w-4 h-4 text-[var(--accent-text)]" /> :
          <VideoIcon className="w-4 h-4 text-[var(--accent-text)]" />
        }
        value={editModal?.value || ''}
        onChange={(value) => setEditModal(editModal ? { ...editModal, value } : null)}
        placeholder={
          editModal?.type === 'action' ? '描述镜头的动作和内容...' :
          editModal?.type === 'dialogue' ? '输入镜头台词（留空表示无台词）...' :
          editModal?.type === 'keyframe' ? '输入关键帧的提示词...' :
          '输入视频生成的提示词...'
        }
        textareaClassName={
          editModal?.type === 'keyframe' || editModal?.type === 'video'
            ? 'font-mono'
            : editModal?.type === 'dialogue'
              ? 'font-serif italic'
              : 'font-normal'
        }
        showAIGenerate={editModal?.type === 'action'}
        onAIGenerate={handleGenerateAIAction}
        isAIGenerating={isAIGenerating}
        aiInstruction={editModal?.type === 'action' ? (editModal.aiInstruction || '') : ''}
        onAIInstructionChange={(aiInstruction) =>
          setEditModal(editModal ? { ...editModal, aiInstruction } : null)
        }
      />

      {/* Image Preview Modal */}
      <ImagePreviewModal 
        imageUrl={previewImage?.url || null}
        title={previewImage?.title}
        onClose={() => setPreviewImage(null)}
      />
    </div>
  );
};

export default StageDirector;
