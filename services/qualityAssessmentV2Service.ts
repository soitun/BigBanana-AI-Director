import { ScriptData, Shot, ShotQualityAssessment, QualityCheck } from '../types';
import {
  chatCompletion,
  parseJsonWithRecovery,
  retryOperation,
  getActiveChatModel,
} from './aiService';
import { assessShotQuality } from './qualityAssessmentService';

const QUALITY_SCHEMA_VERSION = 2;

const CHECK_DEFINITIONS = [
  { key: 'prompt-readiness', label: 'Prompt Readiness', weight: 30 },
  { key: 'asset-coverage', label: 'Asset Coverage', weight: 20 },
  { key: 'keyframe-execution', label: 'Keyframe Execution', weight: 30 },
  { key: 'video-execution', label: 'Video Execution', weight: 20 },
  { key: 'continuity-risk', label: 'Continuity Risk', weight: 10 },
] as const;

type CheckKey = typeof CHECK_DEFINITIONS[number]['key'];

interface LLMQualityAssessmentOptions {
  model?: string;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
  retries?: number;
}

interface LLMRawCheck {
  key?: string;
  score?: number;
  passed?: boolean;
  details?: string;
}

interface LLMRawResponse {
  score?: number;
  grade?: string;
  summary?: string;
  checks?: LLMRawCheck[];
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const truncateText = (value: string | undefined, maxLen: number) => {
  const text = (value || '').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
};

const toSafeScore = (value: unknown, fallback = 50): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return clamp(Math.round(num), 0, 100);
};

const isGrade = (value: unknown): value is ShotQualityAssessment['grade'] =>
  value === 'pass' || value === 'warning' || value === 'fail';

const resolveGrade = (score: number): ShotQualityAssessment['grade'] => {
  if (score >= 80) return 'pass';
  if (score >= 60) return 'warning';
  return 'fail';
};

const weightedScore = (checks: QualityCheck[]): number => {
  const weightedSum = checks.reduce((sum, check) => sum + check.score * check.weight, 0);
  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0) || 1;
  return Math.round(weightedSum / totalWeight);
};

const buildSummary = (checks: QualityCheck[], grade: ShotQualityAssessment['grade']): string => {
  const failedLabels = checks.filter((check) => !check.passed).map((check) => check.label);
  if (!failedLabels.length) {
    return 'AI评估通过，可直接进入生产。';
  }
  if (grade === 'fail') return `AI评估提示风险较高：${failedLabels.join('、')}`;
  if (grade === 'warning') return `AI评估建议优化：${failedLabels.join('、')}`;
  return `AI评估提示轻微问题：${failedLabels.join('、')}`;
};

const safeJsonParse = (raw: string): LLMRawResponse => {
  return parseJsonWithRecovery<LLMRawResponse>(raw, {});
};

const buildShotAssessmentContext = (shot: Shot, scriptData?: ScriptData | null) => {
  const scene = scriptData?.scenes.find((entry) => String(entry.id) === String(shot.sceneId));
  const startFrame = shot.keyframes?.find((frame) => frame.type === 'start');
  const endFrame = shot.keyframes?.find((frame) => frame.type === 'end');
  const characters = (shot.characters || []).map((charId) => {
    const char = scriptData?.characters.find((entry) => String(entry.id) === String(charId));
    const variationId = shot.characterVariations?.[charId];
    const variation = variationId ? char?.variations?.find((entry) => entry.id === variationId) : undefined;
    return {
      id: charId,
      name: char?.name || `unknown:${charId}`,
      hasReferenceImage: !!char?.referenceImage,
      selectedVariationName: variation?.name,
      selectedVariationHasReference: !!variation?.referenceImage,
    };
  });

  const props = (shot.props || []).map((propId) => {
    const prop = scriptData?.props?.find((entry) => String(entry.id) === String(propId));
    return {
      id: propId,
      name: prop?.name || `unknown:${propId}`,
      hasReferenceImage: !!prop?.referenceImage,
    };
  });

  return {
    shot: {
      id: shot.id,
      sceneId: shot.sceneId,
      cameraMovement: shot.cameraMovement || '',
      shotSize: shot.shotSize || '',
      actionSummary: truncateText(shot.actionSummary, 280),
      dialogue: truncateText(shot.dialogue, 200),
      videoModel: shot.videoModel || '',
    },
    scene: scene
      ? {
          id: scene.id,
          location: scene.location,
          time: scene.time,
          atmosphere: truncateText(scene.atmosphere, 200),
          hasReferenceImage: !!scene.referenceImage,
        }
      : null,
    characters,
    props,
    keyframes: {
      start: {
        status: startFrame?.status || 'pending',
        hasImage: !!startFrame?.imageUrl,
        promptLength: (startFrame?.visualPrompt || '').trim().length,
        promptExcerpt: truncateText(startFrame?.visualPrompt, 220),
      },
      end: {
        status: endFrame?.status || 'pending',
        hasImage: !!endFrame?.imageUrl,
        promptLength: (endFrame?.visualPrompt || '').trim().length,
        promptExcerpt: truncateText(endFrame?.visualPrompt, 220),
      },
    },
    interval: shot.interval
      ? {
          status: shot.interval.status,
          hasVideo: !!shot.interval.videoUrl,
          duration: shot.interval.duration,
          motionStrength: shot.interval.motionStrength,
          promptLength: (shot.interval.videoPrompt || '').trim().length,
          promptExcerpt: truncateText(shot.interval.videoPrompt, 220),
        }
      : null,
  };
};

const buildPrompt = (shot: Shot, scriptData?: ScriptData | null): string => {
  const context = buildShotAssessmentContext(shot, scriptData);
  const checks = CHECK_DEFINITIONS.map((item) => item.key).join(', ');

  return [
    '你是专业的AI漫剧分镜质检导演。',
    '请基于输入上下文评估当前镜头是否“可稳定出片”。',
    '评分越高代表越稳定、可执行。',
    '',
    '你必须输出 JSON 对象，且严格满足下列格式：',
    '{',
    '  "score": 0-100 的整数,',
    '  "grade": "pass" | "warning" | "fail",',
    '  "summary": "一句中文总结",',
    '  "checks": [',
    '    {"key":"prompt-readiness","score":0-100,"passed":true/false,"details":"中文说明"},',
    '    {"key":"asset-coverage","score":0-100,"passed":true/false,"details":"中文说明"},',
    '    {"key":"keyframe-execution","score":0-100,"passed":true/false,"details":"中文说明"},',
    '    {"key":"video-execution","score":0-100,"passed":true/false,"details":"中文说明"},',
    '    {"key":"continuity-risk","score":0-100,"passed":true/false,"details":"中文说明"}',
    '  ]',
    '}',
    '',
    `要求：checks 必须且只能包含这 5 个 key，顺序不限：${checks}`,
    '要求：details 必须说明“评分依据 + 风险点 + 建议动作”，中文输出，2-4句。',
    '要求：信息不足时要明确写“信息不足”，并保守给分。',
    '禁止输出 markdown、代码块、额外字段说明。',
    '',
    '输入上下文（JSON）：',
    JSON.stringify(context, null, 2),
  ].join('\n');
};

const normalizeChecks = (rawChecks: LLMRawCheck[] | undefined): QualityCheck[] => {
  const rawMap = new Map<string, LLMRawCheck>();
  (rawChecks || []).forEach((check) => {
    if (typeof check.key === 'string' && check.key.trim()) {
      rawMap.set(check.key.trim(), check);
    }
  });

  return CHECK_DEFINITIONS.map((definition) => {
    const raw = rawMap.get(definition.key);
    const score = toSafeScore(raw?.score, 50);
    const passed = typeof raw?.passed === 'boolean' ? raw.passed : score >= 70;
    const details = truncateText(raw?.details, 420) || '信息不足，模型未返回详细依据。';
    return {
      key: definition.key,
      label: definition.label,
      weight: definition.weight,
      score,
      passed,
      details,
    };
  });
};

const fallbackAssessment = (
  shot: Shot,
  scriptData?: ScriptData | null,
  reason?: string
): ShotQualityAssessment => {
  const base = assessShotQuality(shot, scriptData);
  const reasonMessage = truncateText(reason, 120);
  return {
    ...base,
    summary: reasonMessage
      ? `AI评估不可用，已回退规则评分：${reasonMessage}`
      : 'AI评估不可用，已回退规则评分。',
  };
};

const resolveAssessment = (parsed: LLMRawResponse): ShotQualityAssessment => {
  const checks = normalizeChecks(parsed.checks);
  const weighted = weightedScore(checks);
  const score = toSafeScore(parsed.score, weighted);
  const grade = isGrade(parsed.grade) ? parsed.grade : resolveGrade(score);
  const summary = truncateText(parsed.summary, 260) || buildSummary(checks, grade);

  return {
    version: QUALITY_SCHEMA_VERSION,
    score,
    grade,
    generatedAt: Date.now(),
    checks,
    summary,
  };
};

export const assessShotQualityWithLLM = async (
  shot: Shot,
  scriptData?: ScriptData | null,
  options?: LLMQualityAssessmentOptions
): Promise<ShotQualityAssessment> => {
  const activeChatModel = getActiveChatModel() as any;
  const model =
    options?.model ||
    activeChatModel?.id ||
    activeChatModel?.apiModel ||
    'gpt-5.2';

  try {
    const prompt = buildPrompt(shot, scriptData);
    const responseText = await retryOperation(
      () =>
        chatCompletion(
          prompt,
          model,
          options?.temperature ?? 0.2,
          options?.maxTokens ?? 4096,
          'json_object',
          options?.timeoutMs ?? 120000
        ),
      options?.retries ?? 2,
      1500
    );

    const parsed = safeJsonParse(responseText);
    return resolveAssessment(parsed);
  } catch (error: any) {
    console.warn('[quality-v2] LLM scoring failed, fallback to V1.', error);
    return fallbackAssessment(shot, scriptData, error?.message);
  }
};
