/**
 * 模型抽象层类型定义
 * 定义模型注册、配置、适配器相关的所有类型
 */

// ============================================
// 基础类型
// ============================================

/**
 * 模型类型
 */
export type ModelType = 'chat' | 'image' | 'video' | 'audio';

/**
 * 横竖屏比例类型
 */
export type AspectRatio = '16:9' | '9:16' | '1:1';

/**
 * 图片模型 API 协议类型
 * gemini: Google generateContent 风格
 * openai: OpenAI Images API 风格
 */
export type ImageApiFormat = 'gemini' | 'openai';

/**
 * 视频时长类型（仅异步视频模式支持）
 */
export type VideoDuration = 4 | 5 | 8 | 10 | 12 | 15;

/**
 * 视频生成模式
 */
export type VideoMode = 'sync' | 'async';

/**
 * 音频输出格式
 */
export type AudioOutputFormat = 'wav' | 'mp3';

// ============================================
// 模型参数配置
// ============================================

/**
 * 对话模型参数
 */
export interface ChatModelParams {
  temperature: number;           // 温度 0-2，默认 0.7
  maxTokens?: number;            // 最大 token，留空表示不限制
  topP?: number;                 // Top P，可选
  frequencyPenalty?: number;     // 频率惩罚，可选
  presencePenalty?: number;      // 存在惩罚，可选
}

/**
 * 图片模型参数
 */
export interface ImageModelParams {
  defaultAspectRatio: AspectRatio;
  supportedAspectRatios: AspectRatio[];
  apiFormat?: ImageApiFormat;
}

/**
 * 视频模型参数
 */
export interface VideoModelParams {
  mode: VideoMode;                        // sync=Veo, async=Sora
  defaultAspectRatio: AspectRatio;
  supportedAspectRatios: AspectRatio[];
  defaultDuration: VideoDuration;
  supportedDurations: VideoDuration[];
}

/**
 * 配音模型参数
 */
export interface AudioModelParams {
  defaultVoice: string;                   // 默认音色
  outputFormat: AudioOutputFormat;        // 输出音频格式
}

/**
 * 模型参数联合类型
 */
export type ModelParams = ChatModelParams | ImageModelParams | VideoModelParams | AudioModelParams;

// ============================================
// 模型定义
// ============================================

/**
 * 模型定义基础接口
 */
export interface ModelDefinitionBase {
  id: string;                    // 唯一标识，如 'gpt-5.1'
  apiModel?: string;             // API 实际模型名（可与其他模型重复）
  name: string;                  // 显示名称，如 'GPT-5.1'
  type: ModelType;               // 模型类型
  providerId: string;            // 提供商 ID
  endpoint?: string;             // API 端点（可覆盖默认）
  description?: string;          // 描述
  isBuiltIn: boolean;            // 是否内置（内置模型不可删除）
  isEnabled: boolean;            // 是否启用
  apiKey?: string;               // 模型专属 API Key（可选，为空时使用全局 Key）
}

/**
 * 对话模型定义
 */
export interface ChatModelDefinition extends ModelDefinitionBase {
  type: 'chat';
  params: ChatModelParams;
}

/**
 * 图片模型定义
 */
export interface ImageModelDefinition extends ModelDefinitionBase {
  type: 'image';
  params: ImageModelParams;
}

/**
 * 视频模型定义
 */
export interface VideoModelDefinition extends ModelDefinitionBase {
  type: 'video';
  params: VideoModelParams;
}

/**
 * 配音模型定义
 */
export interface AudioModelDefinition extends ModelDefinitionBase {
  type: 'audio';
  params: AudioModelParams;
}

/**
 * 模型定义联合类型
 */
export type ModelDefinition =
  | ChatModelDefinition
  | ImageModelDefinition
  | VideoModelDefinition
  | AudioModelDefinition;

// ============================================
// 提供商定义
// ============================================

/**
 * 模型提供商配置
 */
export interface ModelProvider {
  id: string;                    // 唯一标识
  name: string;                  // 显示名称
  baseUrl: string;               // API 基础 URL
  apiKey?: string;               // 独立 API Key（可选）
  isBuiltIn: boolean;            // 是否内置
  isDefault: boolean;            // 是否为默认提供商
}

// ============================================
// 注册中心状态
// ============================================

/**
 * 激活的模型配置
 */
export interface ActiveModels {
  chat: string;                  // 当前激活的对话模型 ID
  image: string;                 // 当前激活的图片模型 ID
  video: string;                 // 当前激活的视频模型 ID
  audio: string;                 // 当前激活的配音模型 ID
}

/**
 * 模型注册中心状态
 */
export interface ModelRegistryState {
  providers: ModelProvider[];
  models: ModelDefinition[];
  activeModels: ActiveModels;
  globalApiKey?: string;
}

// ============================================
// 服务调用参数
// ============================================

/**
 * 对话服务调用参数
 */
export interface ChatOptions {
  prompt: string;
  systemPrompt?: string;
  responseFormat?: 'text' | 'json';
  timeout?: number;
  // 可选覆盖模型参数
  overrideParams?: Partial<ChatModelParams>;
}

/**
 * 图片生成调用参数
 */
export interface ImageGenerateOptions {
  prompt: string;
  referenceImages?: string[];
  aspectRatio?: AspectRatio;
}

/**
 * 视频生成调用参数
 */
export interface VideoGenerateOptions {
  prompt: string;
  startImage?: string;
  endImage?: string;
  aspectRatio?: AspectRatio;
  duration?: VideoDuration;
}

// ============================================
// 默认值常量
// ============================================

/**
 * 默认对话模型参数
 */
export const DEFAULT_CHAT_PARAMS: ChatModelParams = {
  temperature: 0.7,
  maxTokens: undefined,
};

/**
 * 默认图片模型参数
 * 注意：Gemini 3 Pro Image 只支持横屏(16:9)和竖屏(9:16)，不支持方形(1:1)
 */
export const DEFAULT_IMAGE_PARAMS: ImageModelParams = {
  defaultAspectRatio: '16:9',
  supportedAspectRatios: ['16:9', '9:16'],
  apiFormat: 'gemini',
};

/**
 * OpenAI Images API 默认参数
 */
export const DEFAULT_IMAGE_PARAMS_OPENAI: ImageModelParams = {
  defaultAspectRatio: '16:9',
  supportedAspectRatios: ['16:9', '9:16', '1:1'],
  apiFormat: 'openai',
};

/**
 * 默认视频模型参数 (Veo 首尾帧模式)
 */
export const DEFAULT_VIDEO_PARAMS_VEO: VideoModelParams = {
  mode: 'sync',
  defaultAspectRatio: '16:9',
  supportedAspectRatios: ['16:9', '9:16'],  // Veo 不支持 1:1
  defaultDuration: 8,
  supportedDurations: [8],  // Veo 固定时长
};

/**
 * 默认视频模型参数 (Sora)
 */
export const DEFAULT_VIDEO_PARAMS_SORA: VideoModelParams = {
  mode: 'async',
  defaultAspectRatio: '16:9',
  supportedAspectRatios: ['16:9', '9:16', '1:1'],
  defaultDuration: 8,
  supportedDurations: [4, 8, 12],
};

/**
 * 默认视频模型参数 (Veo 3.1 Fast)
 */
export const DEFAULT_VIDEO_PARAMS_VEO_FAST: VideoModelParams = {
  mode: 'async',
  defaultAspectRatio: '16:9',
  supportedAspectRatios: ['16:9', '9:16'],
  defaultDuration: 8,
  supportedDurations: [8],
};

/**
 * 默认视频模型参数 (豆包 Seedance 1.5 Pro)
 * 火山引擎任务接口，当前按固定时长使用
 */
export const DEFAULT_VIDEO_PARAMS_DOUBAO_SEEDANCE_1_5: VideoModelParams = {
  mode: 'async',
  defaultAspectRatio: '16:9',
  supportedAspectRatios: ['16:9', '9:16'],
  defaultDuration: 8,
  supportedDurations: [4, 8, 12],
};

// Backward-compatible export for existing imports.
export const DEFAULT_VIDEO_PARAMS_DOUBAO_SEEDANCE: VideoModelParams =
  DEFAULT_VIDEO_PARAMS_DOUBAO_SEEDANCE_1_5;

/**
 * Default video model params (Doubao Seedance 2.0)
 * Volcengine async task API, currently using fixed durations.
 */
export const DEFAULT_VIDEO_PARAMS_DOUBAO_SEEDANCE_2_0: VideoModelParams = {
  mode: 'async',
  defaultAspectRatio: '16:9',
  supportedAspectRatios: ['16:9', '9:16'],
  defaultDuration: 5,
  supportedDurations: [5, 10, 15],
};

/**
 * 默认配音模型参数
 */
export const DEFAULT_AUDIO_PARAMS: AudioModelParams = {
  defaultVoice: 'alloy',
  outputFormat: 'wav',
};

// ============================================
// 内置模型定义
// ============================================

/**
 * 内置对话模型列表
 */
export const BUILTIN_CHAT_MODELS: ChatModelDefinition[] = [
   {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    type: 'chat',
    providerId: 'antsk',
    description: 'GPT-5 系列前沿模型：推理、编码与智能体任务表现更强，适合复杂工作流与高难度任务',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    type: 'chat',
    providerId: 'antsk',
    description: '旗舰通用推理：指令遵循与工具调用稳定，适合长文本分析、结构化提取与日常生产任务',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
 
  {
    id: 'gpt-41',
    name: 'GPT-4.1',
    type: 'chat',
    providerId: 'antsk',
    description: '高性价比稳健模型：指令遵循与代码能力强，支持超长上下文，适合规模化文本处理',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    type: 'chat',
    providerId: 'antsk',
    description: '速度与智能平衡优秀：支持自适应思考，适合代码、工具调用与常规 agent 场景',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'claude-opus-4-6-20260205',
    name: 'Claude Opus 4.6',
    type: 'chat',
    providerId: 'antsk',
    description: 'Claude 顶级智能：复杂推理、长流程 agent 与高难编码任务表现更强，适合高质量优先场景',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    type: 'chat',
    providerId: 'antsk',
    description: '均衡长文模型：日常编码、分析与内容整理稳定，适合高频生产与成本敏感任务',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview',
    type: 'chat',
    providerId: 'antsk',
    description: '多模态预览模型：支持超长上下文与复杂推理，适合文档理解、研究分析与工具增强流程',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
];

/**
 * 内置图片模型列表
 */
export const BUILTIN_IMAGE_MODELS: ImageModelDefinition[] = [
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image(Nano Banana Pro)',
    type: 'image',
    providerId: 'antsk',
    endpoint: '/v1beta/models/gemini-3-pro-image-preview:generateContent',
    description: '旗舰画质与高一致性：擅长复杂构图、精细文字与参考图控制，适合高要求角色与品牌场景（价格较高）',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_IMAGE_PARAMS },
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    name: 'Gemini 3.1 Flash Image Preview(Nano Banana 2)',
    type: 'image',
    providerId: 'antsk',
    endpoint: '/v1beta/models/gemini-3.1-flash-image-preview:generateContent',
    description: '高性价比高速模型：为快速交互和高吞吐生成优化，适合批量出图与频繁迭代（成本低于 Pro）',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_IMAGE_PARAMS },
  },
  {
    id: 'gpt-image-1.5',
    apiModel: 'gpt-image-1.5',
    name: 'GPT Image 1.5',
    type: 'image',
    providerId: 'antsk',
    endpoint: '/v1/images/generations',
    description: '高质量通用模型：提示词遵循和文本渲染表现优秀，适合角色与场景创作；参考一致性弱于 Nano Banana Pro',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_IMAGE_PARAMS_OPENAI },
  },
  {
    id: 'gpt-image-1-mini',
    apiModel: 'gpt-image-1-mini',
    name: 'GPT Image 1 Mini',
    type: 'image',
    providerId: 'antsk',
    endpoint: '/v1/images/generations',
    description: '低成本模型：支持文图输入与图片输出，适合草图预览和大批量试错（细节与一致性弱于 GPT Image 1.5）',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_IMAGE_PARAMS_OPENAI },
  },
];

/**
 * 内置视频模型列表
 */
export const BUILTIN_VIDEO_MODELS: VideoModelDefinition[] = [
  {
    id: 'veo_3_1-fast',
    name: 'Veo 3.1 Fast',
    type: 'video',
    providerId: 'antsk',
    endpoint: '/v1/videos',
    description: '异步模式，支持横屏/竖屏、支持单图和首尾帧，固定 8 秒时长,价格便宜速度快',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_VIDEO_PARAMS_VEO_FAST },
  },
  {
    id: 'sora-2',
    name: 'Sora-2',
    type: 'video',
    providerId: 'antsk',
    endpoint: '/v1/videos',
    description: 'OpenAI Sora 视频生成，异步模式，支持多种时长',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_VIDEO_PARAMS_SORA },
  },
  {
    id: 'doubao-seedance-1-5-pro',
    apiModel: 'doubao-seedance-1-5-pro',
    name: 'Doubao Seedance 1.5 Pro (AntSK)',
    type: 'video',
    providerId: 'antsk',
    endpoint: '/v1/videos',
    description: 'AntSK async video mode via /v1/videos with Sora-2-compatible request format, supporting 4/8/12 seconds.',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_VIDEO_PARAMS_SORA },
  },
  {
    id: 'doubao-seedance-1-5-pro-251215',
    apiModel: 'doubao-seedance-1-5-pro-251215',
    name: 'Doubao Seedance 1.5 Pro',
    type: 'video',
    providerId: 'volcengine',
    endpoint: '/api/v3/contents/generations/tasks',
    description: '火山引擎异步任务模式（create task + poll task），支持 4/8/12 秒',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_VIDEO_PARAMS_DOUBAO_SEEDANCE_1_5 },
  },
  {
    id: 'doubao-seedance-2-0-260128',
    apiModel: 'doubao-seedance-2-0-260128',
    name: 'Doubao Seedance 2.0',
    type: 'video',
    providerId: 'volcengine',
    endpoint: '/api/v3/contents/generations/tasks',
    description: '火山引擎异步任务模式（create task + poll task），支持 5/10/15 秒',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_VIDEO_PARAMS_DOUBAO_SEEDANCE_2_0 },
  },
];

/**
 * 内置配音模型列表
 */
export const BUILTIN_AUDIO_MODELS: AudioModelDefinition[] = [
  {
    id: 'gpt-audio-1.5',
    apiModel: 'gpt-audio-1.5',
    name: 'GPT Audio 1.5',
    type: 'audio',
    providerId: 'antsk',
    endpoint: '/v1/chat/completions',
    description: '高质量配音模型，适合情绪表达与影视旁白',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_AUDIO_PARAMS },
  },
  {
    id: 'gpt-audio-mini',
    apiModel: 'gpt-audio-mini',
    name: 'GPT Audio Mini',
    type: 'audio',
    providerId: 'antsk',
    endpoint: '/v1/chat/completions',
    description: '轻量配音模型，速度更快，适合快速迭代',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_AUDIO_PARAMS },
  },
];

/**
 * 内置提供商列表
 */
export const BUILTIN_PROVIDERS: ModelProvider[] = [
  {
    id: 'antsk',
    name: 'BigBanana API (api.antsk.cn)',
    baseUrl: 'https://api.antsk.cn',
    isBuiltIn: true,
    isDefault: true,
  },
  {
    id: 'volcengine',
    name: 'Volcengine Ark',
    baseUrl: 'https://ark.cn-beijing.volces.com',
    isBuiltIn: true,
    isDefault: false,
  },
];

/**
 * 所有内置模型
 */
export const ALL_BUILTIN_MODELS: ModelDefinition[] = [
  ...BUILTIN_CHAT_MODELS,
  ...BUILTIN_IMAGE_MODELS,
  ...BUILTIN_VIDEO_MODELS,
  ...BUILTIN_AUDIO_MODELS,
];

/**
 * 默认激活模型
 */
export const DEFAULT_ACTIVE_MODELS: ActiveModels = {
  chat: 'gpt-5.2',
  image: 'gemini-3-pro-image-preview',
  video: 'sora-2',
  audio: 'gpt-audio-1.5',
};
