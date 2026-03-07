import type {
  PromptTemplateConfig,
  PromptTemplateOverrides,
} from '../types';

const CAMERA_MOVEMENT_REFERENCE = `- Horizontal Left Shot (向左平移) - Camera moves left
- Horizontal Right Shot (向右平移) - Camera moves right
- Pan Left Shot (平行向左扫视) - Pan left
- Pan Right Shot (平行向右扫视) - Pan right
- Vertical Up Shot (向上直线运动) - Move up vertically
- Vertical Down Shot (向下直线运动) - Move down vertically
- Tilt Up Shot (向上仰角运动) - Tilt upward
- Tilt Down Shot (向下俯角运动) - Tilt downward
- Zoom Out Shot (镜头缩小/拉远) - Pull back/zoom out
- Zoom In Shot (镜头放大/拉近) - Push in/zoom in
- Dolly Shot (推镜头) - Dolly in/out movement
- Circular Shot (环绕拍摄) - Orbit around subject
- Over the Shoulder Shot (越肩镜头) - Over shoulder perspective
- Pan Shot (摇镜头) - Pan movement
- Low Angle Shot (仰视镜头) - Low angle view
- High Angle Shot (俯视镜头) - High angle view
- Tracking Shot (跟踪镜头) - Follow subject
- Handheld Shot (摇摄镜头) - Handheld camera
- Static Shot (静止镜头) - Fixed camera position
- POV Shot (主观视角) - Point of view
- Bird's Eye View Shot (俯瞰镜头) - Overhead view
- 360-Degree Circular Shot (360度环绕) - Full circle
- Parallel Tracking Shot (平行跟踪) - Side tracking
- Diagonal Tracking Shot (对角跟踪) - Diagonal tracking
- Rotating Shot (旋转镜头) - Rotating movement
- Slow Motion Shot (慢动作) - Slow-mo effect
- Time-Lapse Shot (延时摄影) - Time-lapse
- Canted Shot (斜视镜头) - Dutch angle
- Cinematic Dolly Zoom (电影式变焦推轨) - Vertigo effect`;

export const DEFAULT_PROMPT_TEMPLATE_CONFIG: PromptTemplateConfig = {
  storyboard: {
    shotGeneration: `Act as a professional cinematographer. Generate a detailed shot list (Camera blocking) for Scene {sceneIndex}.
Language for Text Output: {lang}.

IMPORTANT VISUAL STYLE: {stylePrompt}
All 'visualPrompt' fields MUST describe shots in this "{visualStyle}" style.
{artDirectionBlock}
Scene Details:
Location: {sceneLocation}
Time: {sceneTime}
Atmosphere: {sceneAtmosphere}

Scene Action:
"{sceneAction}"
Scene Action Source: {actionSource}

Context:
Genre: {genre}
Visual Style: {visualStyle} ({stylePrompt})
Target Duration (Whole Script): {targetDuration}
Active Video Model: {activeVideoModel}
Shot Duration Baseline: {shotDurationSeconds}s per shot
Total Shots Budget: {totalShotsNeeded} shots
Shots for This Scene: {shotsPerScene} shots (EXACT)

Characters:
{charactersJson}
Props:
{propsJson}

Professional Camera Movement Reference (Choose from these categories):
{cameraMovementReference}

Instructions:
1. Create EXACTLY {shotsPerScene} shots for this scene.
2. CRITICAL: Each shot should represent about {shotDurationSeconds} seconds. Total planning formula: {targetSeconds} seconds ÷ {shotDurationSeconds} ≈ {totalShotsNeeded} shots across all scenes.
3. DO NOT output more or fewer than {shotsPerScene} shots for this scene.
4. 'cameraMovement': Can reference the Professional Camera Movement Reference list above for inspiration, or use your own creative camera movements. You may use the exact English terms (e.g., "Dolly Shot", "Pan Right Shot", "Zoom In Shot", "Tracking Shot") or describe custom movements.
5. 'shotSize': Specify the field of view (e.g., Extreme Close-up, Medium Shot, Wide Shot).
6. 'actionSummary': Detailed description of what happens in the shot (in {lang}).
7. 'characters': Return ONLY IDs from provided Characters list.
8. 'props': Return ONLY IDs from provided Props list when a prop is visibly involved. Use [] if none.
9. 'visualPrompt': Detailed description for image generation in {visualStyle} style (OUTPUT IN {lang}). Include style-specific keywords.{artDirectionVisualPromptConstraint} Keep it under 50 words.
10. Every shot MUST include all required keys. Do not omit keys; use "" or [] when a value is empty.
11. keyframes MUST contain BOTH a start frame and an end frame.
12. Keys and string values MUST use standard JSON double quotes only.

Output ONLY a valid JSON OBJECT with this exact structure (no markdown, no extra text):
{
  "shots": [
    {
      "id": "string",
      "sceneId": "{sceneId}",
      "actionSummary": "string",
      "dialogue": "string (empty if none)",
      "cameraMovement": "string",
      "shotSize": "string",
      "characters": ["string"],
      "props": ["string"],
      "keyframes": [
        {"id": "string", "type": "start|end", "visualPrompt": "string (MUST include {visualStyle} style keywords{keyframeVisualPromptConstraint})"}
      ]
    }
  ]
}

JSON Example (shape reference only — replace the content, but keep the schema valid):
{
  "shots": [
    {
      "id": "scene-{sceneIndex}-shot-1",
      "sceneId": "{sceneId}",
      "actionSummary": "角色停在门口，短暂观察后推门进入。",
      "dialogue": "",
      "cameraMovement": "Slow Push In",
      "shotSize": "Medium Shot",
      "characters": ["char_1"],
      "props": [],
      "keyframes": [
        {"id": "scene-{sceneIndex}-shot-1-start", "type": "start", "visualPrompt": "{visualStyle} style, the character pauses at the doorway, cautious posture, interior shadows, cinematic framing"},
        {"id": "scene-{sceneIndex}-shot-1-end", "type": "end", "visualPrompt": "{visualStyle} style, the character pushes the door and steps inside, motion implied, consistent lighting, cinematic framing"}
      ]
    }
  ]
}`,
    shotRepair: `You previously returned {actualShots} shots for Scene {sceneIndex}, but EXACTLY {shotsPerScene} shots are required.

Scene Details:
Location: {sceneLocation}
Time: {sceneTime}
Atmosphere: {sceneAtmosphere}

Scene Action:
"{sceneAction}"

Requirements:
1. Return EXACTLY {shotsPerScene} shots in JSON object format: {"shots":[...]}.
2. Keep story continuity and preserve the original cinematic intent.
3. Each shot represents about {shotDurationSeconds} seconds.
4. Include fields: id, sceneId, actionSummary, dialogue, cameraMovement, shotSize, characters, props, keyframes.
5. characters/props must be arrays of valid IDs from provided context.
6. keyframes must include type=start/end and visualPrompt.
7. Do not omit keys; use "" or [] when a value is empty.
8. Keys and string values MUST use standard JSON double quotes only.
9. Output ONLY valid JSON object (no markdown, no prose, no comments).

JSON Example (shape reference only):
{
  "shots": [
    {
      "id": "scene-{sceneIndex}-shot-1",
      "sceneId": "{sceneId}",
      "actionSummary": "示例动作",
      "dialogue": "",
      "cameraMovement": "Static",
      "shotSize": "Wide Shot",
      "characters": [],
      "props": [],
      "keyframes": [
        {"id": "scene-{sceneIndex}-shot-1-start", "type": "start", "visualPrompt": "{visualStyle} style, starting frame"},
        {"id": "scene-{sceneIndex}-shot-1-end", "type": "end", "visualPrompt": "{visualStyle} style, ending frame"}
      ]
    }
  ]
}`,
    actionSuggestion: `你是一位专业的电影动作导演和叙事顾问。请根据提供的首帧和尾帧信息，结合镜头运动，设计一个既符合叙事逻辑又充满视觉冲击力的动作场景。

## 重要约束
⏱️ **时长限制**：目标总时长约 {targetDuration} 秒（允许±0.5秒），请严格控制动作复杂度
📹 **镜头要求**：这是一个连续镜头，不要设计多个镜头切换

## 输入信息
**首帧描述：** {startFramePrompt}
**尾帧描述：** {endFramePrompt}
**镜头运动：** {cameraMovement}

{userInstructionBlock}

## 单镜头高质量参考（结构参考，不要照抄）

### 示例A：压迫推进
角色在雨夜天台静立，镜头低位缓慢推近，背景霓虹被雨幕拉出光带。角色抬手瞬间，画面出现短促电弧与风压波纹，镜头保持连续推进，最终停在半身近景，表情从平静过渡到决断，动作收于蓄力完成。

### 示例B：高速位移
镜头与角色平行跟拍，先中景稳定滑行，随后角色突然加速，画面边缘出现可控运动模糊与拖影。镜头不切换，只做同向快速平移并微微拉近，最终在角色前方刹停，落在近景对峙姿态。

### 示例C：情绪爆发
镜头从肩后视角开始缓慢环绕，角色呼吸急促、手部发抖，环境光由冷色逐步转暖。环绕到正面时角色完成关键动作，粒子与体积光同步增强，镜头在特写处稳定落点，形成情绪高潮与动作终点。

## 任务要求
1. **时长适配**：动作设计必须能在约 {targetDuration} 秒内完成，避免超负荷动作链
2. **单镜头思维**：优先设计一个连贯的镜头内动作，而非多镜头组合
3. **自然衔接**：动作需要自然地从首帧过渡到尾帧，确保逻辑合理
4. **风格借鉴**：参考上述示例的风格和语言，但要简化步骤：
   - 富有张力但简洁的描述语言
   - 强调关键的视觉冲击点
   - 电影级的运镜描述但避免过度分解
5. **创新适配**：不要重复已有提示词，结合当前场景创新
6. **镜头语言**：根据提供的镜头运动（{cameraMovement}），设计相应的运镜方案

## 输出格式
请直接输出动作描述文本，无需JSON格式或额外标记。内容应包含：
- 简洁的单镜头动作场景描述（不要“镜头1、镜头2...”分段）
- 关键的运镜说明（推拉摇移等）
- 核心的视觉特效或情感氛围
- 确保描述具有电影感但控制篇幅

❌ 避免：任何多镜头切换、冗长分步描述、时长明显超出 {targetDuration} 秒负荷的复杂动作序列
✅ 追求：精炼、有冲击力、符合约 {targetDuration} 秒时长的单镜头动作

请开始创作：`,
    shotSplit: `你是一位专业的电影分镜师和导演。你的任务是将一个粗略的镜头描述，拆分为多个细致、专业的子镜头。

## 原始镜头信息

**场景地点：** {sceneLocation}
**场景时间：** {sceneTime}
**场景氛围：** {sceneAtmosphere}
**角色：** {characters}
**视觉风格：** {styleDesc}
**原始镜头运动：** {cameraMovement}

**原始动作描述：**
{actionSummary}

{dialogueBlock}

## 拆分要求

### 核心原则
1. **单一职责**：每个子镜头只负责一个视角或动作细节，避免混合多个视角
2. **时长控制**：每个子镜头时长约2-4秒，总时长保持在8-10秒左右
3. **景别多样化**：合理运用全景、中景、特写等不同景别
4. **连贯性**：子镜头之间要有逻辑的视觉过渡和叙事连贯性

### 拆分维度示例

**景别分类（Shot Size）：**
- **远景 Long Shot / 全景 Wide Shot**：展示整体环境、人物位置关系、空间布局
- **中景 Medium Shot**：展示人物上半身或腰部以上，强调动作和表情
- **近景 Close-up**：展示人物头部或重要物体，强调情感和细节
- **特写 Extreme Close-up**：聚焦关键细节（如手部动作、眼神、物体特写）

### 必须包含的字段

每个子镜头必须包含以下信息：

1. **shotSize**（景别）：明确标注景别类型
2. **cameraMovement**（镜头运动）：描述镜头如何移动
3. **actionSummary**（动作描述）：清晰、具体的动作和画面内容描述（60-100字）
4. **visualFocus**（视觉焦点）：这个镜头的视觉重点
5. **keyframes**（关键帧数组）：包含起始帧(start)和结束帧(end)的视觉描述

### 专业镜头运动参考
- 静止镜头 Static Shot
- 推镜头 Dolly Shot / 拉镜头 Zoom Out
- 跟踪镜头 Tracking Shot
- 平移镜头 Pan Shot
- 环绕镜头 Circular Shot
- 俯视镜头 High Angle / 仰视镜头 Low Angle
- 主观视角 POV Shot
- 越肩镜头 Over the Shoulder

## 输出格式

请输出JSON格式，结构如下：

\`\`\`json
{
  "subShots": [
    {
      "shotSize": "全景 Wide Shot",
      "cameraMovement": "静止镜头 Static Shot",
      "actionSummary": "动作描述...",
      "visualFocus": "视觉焦点描述",
      "keyframes": [
        {
          "type": "start",
          "visualPrompt": "起始帧视觉描述，{styleDesc}，100-150字..."
        },
        {
          "type": "end",
          "visualPrompt": "结束帧视觉描述，{styleDesc}，100-150字..."
        }
      ]
    }
  ]
}
\`\`\`

**关键帧visualPrompt要求**：
- 必须包含视觉风格标记（{styleDesc}）
- 详细描述画面构图、光影、色彩、景深等视觉元素
- 起始帧和结束帧要有明显的视觉差异
- 长度控制在100-150字

## 重要提示

❌ **避免：**
- 不要在单个子镜头中混合多个视角或景别
- 不要拆分过细导致总时长超过10秒
- 不要忽略视觉连贯性

✅ **追求：**
- 每个子镜头职责清晰、画面感强
- 景别和视角多样化但符合叙事逻辑
- 保持电影级的专业表达

请开始拆分，直接输出JSON格式（不要包含markdown代码块标记）：`,
  },
  keyframe: {
    startFrameGuide: `【起始帧要求】建立清晰的初始状态和场景氛围,人物/物体的起始位置、姿态和表情要明确,为后续运动预留视觉空间和动势。`,
    endFrameGuide: `【结束帧要求】展现动作完成后的最终状态,人物/物体的终点位置、姿态和情绪变化,体现镜头运动带来的视角变化。`,
    characterConsistencyGuide: `【角色一致性要求】CHARACTER CONSISTENCY REQUIREMENTS - CRITICAL
⚠️ 如果提供了角色参考图,画面中的人物外观必须严格遵循参考图:
• 面部特征: 五官轮廓、眼睛颜色和形状、鼻子和嘴巴的结构必须完全一致
• 发型发色: 头发的长度、颜色、质感、发型样式必须保持一致
• 服装造型: 服装的款式、颜色、材质、配饰必须与参考图匹配
• 体型特征: 身材比例、身高体型必须保持一致
⚠️ 这是最高优先级要求,不可妥协!`,
    propWithImageGuide: `⚠️ 以下道具已提供参考图,画面中出现时必须严格遵循参考图:
• 外形特征: 道具的形状、大小、比例必须与参考图一致
• 颜色材质: 颜色、材质、纹理必须保持一致
• 细节元素: 图案、文字、装饰细节必须与参考图匹配
⚠️ 这是高优先级要求!

有参考图的道具:
{propList}`,
    propWithoutImageGuide: `以下道具无参考图,请根据文字描述准确呈现:
{propList}`,
    nineGridSourceMeta: `【来源】网格分镜预览 - {sourceLabel}
【景别】{shotSize}
【机位角度】{cameraAngle}
【原始动作】{actionSummary}`,
    optimizeBoth: `你是一位专业的电影视觉导演和概念艺术家。请为以下镜头同时创作起始帧和结束帧的详细视觉描述。

## 场景信息
**地点：** {sceneLocation}
**时间：** {sceneTime}
**氛围：** {sceneAtmosphere}

## 叙事动作
{actionSummary}

## 镜头运动
{cameraMovement}

## 角色信息
{characters}

## 视觉风格
{styleDesc}

## 任务要求

你需要为这个8-10秒的镜头创作**起始帧**和**结束帧**两个关键画面的视觉描述。

### 起始帧要求：
• 建立清晰的初始场景和人物状态
• 为即将发生的动作预留视觉空间和动势
• 设定光影和色调基调
• 展现角色的起始表情、姿态和位置
• 根据镜头运动（{cameraMovement}）设置合适的初始构图
• 营造场景氛围，让观众明确故事的起点

### 结束帧要求：
• 展现动作完成后的最终状态和结果
• 体现镜头运动（{cameraMovement}）带来的视角和构图变化
• 展现角色的情绪变化、最终姿态和位置
• 可以有戏剧性的光影和色彩变化
• 达到视觉高潮或情绪释放点
• 为下一个镜头的衔接做准备

### 两帧协调性：
⚠️ **关键**：起始帧和结束帧必须在视觉上连贯协调
- 保持一致的视觉风格和色调基础
- 镜头运动轨迹要清晰可推导
- 人物/物体的空间位置变化要合理
- 光影变化要有逻辑性
- 两帧描述应该能够自然串联成一个流畅的视觉叙事

### 每帧必须包含的视觉元素：

**1. 构图与景别**
- 根据镜头运动确定画面框架和视角
- 主体在画面中的位置和大小
- 前景、中景、背景的层次关系

**2. 光影与色彩**
- 光源的方向、强度和色温
- 主光、辅光、轮廓光的配置
- 整体色调和色彩情绪（暖色/冷色）
- 阴影的长度和密度

**3. 角色细节**（如有）
- 面部表情和眼神方向
- 肢体姿态和重心分布
- 服装状态和细节
- 与环境的互动关系

**4. 环境细节**
- 场景的具体视觉元素
- 环境氛围（雾气、光束、粒子等）
- 背景的清晰度和景深效果
- 环境对叙事的支持

**5. 运动暗示**
- 动态模糊或静止清晰
- 运动方向的视觉引导
- 张力和动势的体现

**6. 电影感细节**
- 画面质感和材质
- 大气透视效果
- 电影级的视觉特征

## 输出格式

请按以下JSON格式输出（注意：描述文本用中文，每个约100-150字）：

\`\`\`json
{
  "startFrame": "起始帧的详细视觉描述...",
  "endFrame": "结束帧的详细视觉描述..."
}
\`\`\`

❌ 避免：
- 不要在描述中包含"Visual Style:"等标签
- 不要分段或使用项目符号
- 不要过于技术化的术语
- 不要描述整个动作过程，只描述画面本身

✅ 追求：
- 流畅的单段描述
- 富有画面感的语言
- 两帧描述相互呼应、逻辑连贯
- 与叙事动作和镜头运动协调一致
- 具体、可视觉化的细节

请开始创作：`,
    optimizeSingle: `你是一位专业的电影视觉导演和概念艺术家。请为以下镜头的{frameLabel}创作详细的视觉描述。

## 场景信息
**地点：** {sceneLocation}
**时间：** {sceneTime}
**氛围：** {sceneAtmosphere}

## 叙事动作
{actionSummary}

## 镜头运动
{cameraMovement}

## 角色信息
{characters}

## 视觉风格
{styleDesc}

## 任务要求

作为{frameLabel}，你需要重点描述：**{frameFocus}**

### {frameLabel}特殊要求：
{frameSpecificRequirements}

### 必须包含的视觉元素：

**1. 构图与景别**
- 根据镜头运动确定画面框架和视角
- 主体在画面中的位置和大小
- 前景、中景、背景的层次关系

**2. 光影与色彩**
- 光源的方向、强度和色温
- 主光、辅光、轮廓光的配置
- 整体色调和色彩情绪（暖色/冷色）
- 阴影的长度和密度

**3. 角色细节**（如有）
- 面部表情和眼神方向
- 肢体姿态和重心分布
- 服装状态和细节
- 与环境的互动关系

**4. 环境细节**
- 场景的具体视觉元素
- 环境氛围（雾气、光束、粒子等）
- 背景的清晰度和景深效果
- 环境对叙事的支持

**5. 运动暗示**
- 动态模糊或静止清晰
- 运动方向的视觉引导
- 张力和动势的体现

**6. 电影感细节**
- 画面质感和材质
- 大气透视效果
- 电影级的视觉特征

## 输出格式

请直接输出简洁但详细的视觉描述，约100-150字，用中文。

❌ 避免：
- 不要包含"Visual Style:"等标签
- 不要分段或使用项目符号
- 不要过于技术化的术语
- 不要描述整个动作过程，只描述这一帧的画面

✅ 追求：
- 流畅的单段描述
- 富有画面感的语言
- 突出{frameLabel}的特点
- 与叙事动作和镜头运动协调一致
- 具体、可视觉化的细节

请开始创作这一帧的视觉描述：`,
    enhance: `你是一位资深的电影摄影指导与提示词工程师。请将“基础提示词”重写为可直接用于图像生成的最终提示词。

## 基础提示词
{basePrompt}

## 视觉风格
{styleDesc}

## 镜头运动
{cameraMovement}

## {frameLabel}重点
{frameFocus}

## 任务要求
1. 必须保留并整合基础提示词中的核心信息，不丢失主体、场景、动作与镜头运动。
2. 强化电影感细节（构图、光影、景深、材质、氛围），但不要堆砌术语。
3. 如存在角色一致性要求，必须保留并强调“外观不可漂移”。
4. 输出必须是“单段中文提示词”，不要分节、不要项目符号、不要Markdown。
5. 不要重复基础提示词同义句，避免冗长；控制在120-220字。

仅输出最终提示词文本:`,
  },
  nineGrid: {
    splitSystem: `你是专业分镜师。请把同一镜头拆成{panelCount}个不重复视角，用于{gridLayout}网格分镜。网格布局必须严格为 {layoutInstruction}。保持同一场景与角色连续性。`,
    splitUser: `请将以下镜头动作拆解为{panelCount}个不同的摄影视角，用于生成一张{gridLayout}网格分镜图。
网格硬约束：必须严格为 {layoutInstruction}，顺序为从左到右、从上到下。{layoutSpecificConstraint}
行列顺序示意：{layoutExample}

【镜头动作】{actionSummary}
【原始镜头运动】{cameraMovement}
【场景信息】地点: {location}, 时间: {time}, 氛围: {atmosphere}
【角色】{characters}
【视觉风格】{visualStyle}

输出规则（只输出JSON）：
1) 顶层为 {"panels":[...]}
2) panels 必须恰好{panelCount}项；每项必须显式包含 index 字段，index=0-{lastIndex}，不可重复，整体顺序为左到右、上到下
3) 每项含 shotSize、cameraAngle、description，均不能为空
4) shotSize/cameraAngle 用简短中文；description 用英文单句（10-30词），聚焦主体、动作、构图
5) 视角多样性：shotSize + cameraAngle 组合不得重复；当{panelCount}>=6时，至少使用3种不同 shotSize（否则至少2种）
6) 叙事节奏：index=0 建立场景与主体，最后一格呈现动作结果/情绪落点，中间格逐步推进动作
7) 连续性：保持角色外观、服装、道具、主运动方向一致；若需要反打/轴线跨越，必须在 description 明确说明动机`,
    imagePrefix: `Create ONE cinematic storyboard contact sheet.
Fixed layout: exactly {layoutInstruction} ({panelCount} equal panels, thin white separators).
Panel order: {layoutExample}
{layoutSpecificConstraint}
The grid geometry is non-negotiable. Every panel must have identical size; no panel may span multiple cells.
All panels depict the SAME scene; vary camera angle and shot size only.
Style: {visualStyle}
Panels (left-to-right, top-to-bottom):`,
    imagePanelTemplate: `Panel {index} ({position}): [{shotSize} / {cameraAngle}] - {description}`,
    imageSuffix: `Constraints:
- Output one single storyboard grid image only
- Exact layout = {layoutInstruction} and exactly {panelCount} panels total
- Keep character identity consistent across all panels
- Keep lighting/color/mood consistent across all panels
- Each panel is a complete cinematic keyframe
- All panel sizes must be identical; no merged cells, no oversized panels, no inset panels
- Do NOT add extra rows, extra columns, blank panels, missing panels, or alternative layouts
- {layoutSpecificConstraint}
- ABSOLUTE NO-TEXT RULE: include zero readable text in every panel
- Forbidden text elements: letters, words, numbers, subtitles, captions, logos, watermarks, signage, UI labels, speech bubbles
- If signs/screens/documents appear, render text areas as blank or illegible marks with no recognizable characters`,
    imageNoTextConstraint: `HARD RULE (HIGHEST PRIORITY):
- This storyboard grid image must contain ZERO readable text in every panel.
- Do NOT include letters, words, numbers, subtitles, captions, logos, watermarks, signage, UI labels, or speech bubbles.
- If signs/screens/documents/books/posters appear, render text areas as blank or illegible marks with no recognizable characters`,
    translatePrompt: `你是影视分镜翻译编辑。请将以下英文分镜描述翻译为自然、简洁的中文，仅用于界面展示。
输入 JSON：
{panelsJson}

输出要求（只输出JSON）：
1) 顶层结构：{"translations":[...]}
2) translations 数量必须为 {expectedCount}，index 必须完整覆盖 0-{expectedCountMinusOne}
3) 每项格式：{"index": number, "descriptionZh": "string"}
4) descriptionZh 要忠实原句的主体、动作、构图与镜头意图，不添加新剧情
5) 每条中文建议 18-42 字，语气简洁有画面感
6) 只输出 JSON，不要解释`,
    rewritePrompt: `你是电影分镜提示词编辑器。请根据用户要求改写网格分镜描述。
【用户改写要求】：
{instruction}

【镜头上下文】
动作摘要: {actionSummary}
镜头运动: {cameraMovement}
场景: 地点={sceneLocation}，时间={sceneTime}，氛围={sceneAtmosphere}
视觉风格: {visualStyle}

【当前面板 JSON】
{panelsJson}

输出规则（只输出JSON）：
1) 顶层为{"panels":[...]}
2) panels 必须恰好 {expectedCount} 项，index 必须唯一且完整覆盖 0-{expectedCountMinusOne}
3) 每项必须包含非空 shotSize、cameraAngle、description
4) shotSize/cameraAngle 用简短中文；description 必须是英文单句，10-30词
5) 在满足用户要求的同时，保持同一场景/角色连贯性与镜头顺序
6) shotSize + cameraAngle 组合不得重复，且 shotSize 至少包含 {requiredShotSizeKinds} 种
7) 只输出 JSON，不要解释`,
  },
  video: {
    sora2Chinese: `基于提供的参考图片生成视频。
动作描述：{actionSummary}
视觉风格锚点：{visualStyle}

技术要求：
- 关键：视频必须从参考图的精确构图和画面内容开始，再自然发展后续动作
- 镜头运动：{cameraMovement}
- 运动：确保动作流畅自然，避免突兀跳变或不连续
- 视觉风格：电影质感，保持一致的光照与色调
- 细节：角色外观和场景环境需全程一致
- 音频：允许使用{language}配音/旁白
- 文本限制：禁止字幕及任何画面文字（含片头片尾字卡、UI叠字）`,
    sora2English: `Generate a video based on the provided reference image.

Action Description: {actionSummary}
Visual Style Anchor: {visualStyle}

Technical Requirements:
- CRITICAL: The video MUST begin with the exact composition and content of the reference image, then naturally develop the subsequent action
- Camera Movement: {cameraMovement}
- Motion: Ensure smooth and natural movement, avoid abrupt jumps or discontinuities
- Visual Style: Cinematic quality with consistent lighting and color tone throughout
- Details: Maintain character appearance and scene environment consistency throughout
- Audio: Voiceover/narration in {language} is allowed
- Text constraints: No subtitles and no on-screen text (including title cards and UI text overlays)`,
    sora2NineGridChinese: `⚠️ 最高优先级指令：参考图是{gridLayout}网格分镜板（共{panelCount}格），仅用于镜头顺序参考，严禁作为视频可见内容。
⚠️ 视频第一帧必须是面板1的全屏场景画面（单画面占满100%屏幕）。
⚠️ 绝对禁止：网格原图、网格线、缩略图拼贴、多画面分屏、画中画、多窗口并行动画。

动作描述：{actionSummary}
视觉风格锚点：{visualStyle}

网格镜头顺序（参考图从左到右、从上到下）：
{panelDescriptions}

镜头切换必须按1→{panelCount}顺序逐个出现；任意时刻只允许一个全屏镜头，禁止多个面板同时运动。
每个视角约{secondsPerPanel}秒，可用硬切或自然转场，镜头运动：{cameraMovement}
保持角色外观一致与电影质感。可{language}配音/旁白，但禁止字幕与任何画面文字。`,
    sora2NineGridEnglish: `⚠️ HIGHEST PRIORITY: The reference image is a {gridLayout} storyboard grid ({panelCount} panels), used ONLY as shot-order guidance and NEVER as visible video content.
⚠️ The first frame MUST be the full-screen scene from Panel 1 (a single shot occupying 100% of the frame).
⚠️ FORBIDDEN: grid image, grid lines, thumbnail collage, split-screen, picture-in-picture, multi-window, or parallel panel animation.

Action: {actionSummary}
Visual Style Anchor: {visualStyle}

Storyboard shot sequence (reference grid, left-to-right, top-to-bottom):
{panelDescriptions}

Transition strictly in order 1→{panelCount}, one shot at a time; never animate multiple panels simultaneously.
~{secondsPerPanel}s per angle using hard cuts or motivated transitions. Camera: {cameraMovement}
Maintain character consistency, cinematic quality.
Voiceover in {language} is allowed, but no subtitles or any on-screen text.`,
    veoStartOnly: `Use the provided start frame as the exact opening composition.
Action: {actionSummary}
Camera Movement: {cameraMovement}
Visual Style Anchor: {visualStyle}
Language: {language}
Keep identity, scene lighting, and prop details consistent throughout the shot.`,
    veoStartEnd: `Use the provided START and END frames as hard constraints.
Action: {actionSummary}
Camera Movement: {cameraMovement}
Visual Style Anchor: {visualStyle}
Language: {language}
The video must start from the start frame composition and progress naturally to a final state that matches the end frame.`,
    nineGridGuardrailsChinese: `HARD RULES（最高优先级）：
- 视频必须始终为单画面全屏输出，任意时刻只能有一个镜头占满100%画面。
- 严禁九宫格/六宫格/四宫格分屏、拼贴、画中画、多窗口、缩略图墙、多面板并行动画。
- 网格图只作为镜头顺序参考，不是可展示内容。
- 镜头必须按 1→{panelCount} 顺序逐个切换（可硬切或自然转场），禁止多个面板同时出现或同时运动。
- 若冲突，优先保证“单画面全屏 + 顺序切镜”，宁可忽略网格排版外观。`,
    nineGridGuardrailsEnglish: `HARD RULES (HIGHEST PRIORITY):
- The video must remain single-shot full-screen at all times, with exactly one shot occupying 100% of the frame.
- Strictly forbid split-screen, collage, picture-in-picture, multi-window, thumbnail wall, or parallel multi-panel animation.
- The grid image is shot-order reference only, never visible output content.
- Transition strictly in order 1→{panelCount}, one shot at a time (hard cuts or motivated transitions); never show multiple panels simultaneously.
- If constraints conflict, prioritize "single full-screen shot + sequential cuts" over preserving the grid layout appearance.`,
    endFrameConstraintNote: `END FRAME CONSTRAINT: Drive the final moment toward the provided end-frame composition, pose, and scene continuity.`,
    ignoredEndFrameNote: `Capability routing: this model is start-frame-driven, so end-frame input is ignored automatically.`,
  },
};

export type PromptTemplateCategory = keyof PromptTemplateConfig;

export type PromptTemplatePath =
  | 'storyboard.shotGeneration'
  | 'storyboard.shotRepair'
  | 'storyboard.actionSuggestion'
  | 'storyboard.shotSplit'
  | 'keyframe.startFrameGuide'
  | 'keyframe.endFrameGuide'
  | 'keyframe.characterConsistencyGuide'
  | 'keyframe.propWithImageGuide'
  | 'keyframe.propWithoutImageGuide'
  | 'keyframe.nineGridSourceMeta'
  | 'keyframe.optimizeBoth'
  | 'keyframe.optimizeSingle'
  | 'keyframe.enhance'
  | 'nineGrid.splitSystem'
  | 'nineGrid.splitUser'
  | 'nineGrid.imagePrefix'
  | 'nineGrid.imagePanelTemplate'
  | 'nineGrid.imageSuffix'
  | 'nineGrid.imageNoTextConstraint'
  | 'nineGrid.translatePrompt'
  | 'nineGrid.rewritePrompt'
  | 'video.sora2Chinese'
  | 'video.sora2English'
  | 'video.sora2NineGridChinese'
  | 'video.sora2NineGridEnglish'
  | 'video.veoStartOnly'
  | 'video.veoStartEnd'
  | 'video.nineGridGuardrailsChinese'
  | 'video.nineGridGuardrailsEnglish'
  | 'video.endFrameConstraintNote'
  | 'video.ignoredEndFrameNote';

export interface PromptTemplateFieldDefinition {
  path: PromptTemplatePath;
  category: PromptTemplateCategory;
  title: string;
  description: string;
  placeholders: string[];
}

export const PROMPT_TEMPLATE_FIELD_DEFINITIONS: PromptTemplateFieldDefinition[] = [
  {
    path: 'storyboard.shotGeneration',
    category: 'storyboard',
    title: '分镜生成主提示词',
    description: '用于生成场景分镜列表的主模板。',
    placeholders: [
      'sceneIndex',
      'lang',
      'visualStyle',
      'sceneLocation',
      'sceneAction',
      'shotsPerScene',
    ],
  },
  {
    path: 'storyboard.shotRepair',
    category: 'storyboard',
    title: '分镜纠偏提示词',
    description: '当分镜数量不符时触发的自动纠偏模板。',
    placeholders: ['actualShots', 'sceneIndex', 'shotsPerScene', 'sceneAction'],
  },
  {
    path: 'storyboard.actionSuggestion',
    category: 'storyboard',
    title: '动作建议模板',
    description: 'AI 生成动作建议的模板',
    placeholders: ['startFramePrompt', 'endFramePrompt', 'cameraMovement', 'targetDuration', 'userInstructionBlock'],
  },
  {
    path: 'storyboard.shotSplit',
    category: 'storyboard',
    title: '镜头拆分模板',
    description: 'AI 拆分镜头为子镜头的模板',
    placeholders: ['sceneLocation', 'sceneTime', 'sceneAtmosphere', 'characters', 'styleDesc', 'cameraMovement', 'actionSummary', 'dialogueBlock'],
  },
  {
    path: 'keyframe.startFrameGuide',
    category: 'keyframe',
    title: '首帧约束',
    description: '生成首帧提示词时附加的要求。',
    placeholders: [],
  },
  {
    path: 'keyframe.endFrameGuide',
    category: 'keyframe',
    title: '尾帧约束',
    description: '生成尾帧提示词时附加的要求。',
    placeholders: [],
  },
  {
    path: 'keyframe.characterConsistencyGuide',
    category: 'keyframe',
    title: '角色一致性约束',
    description: '首尾帧都使用的角色一致性规则块。',
    placeholders: [],
  },
  {
    path: 'keyframe.propWithImageGuide',
    category: 'keyframe',
    title: '有图道具一致性约束',
    description: '道具带参考图时的约束模板。',
    placeholders: ['propList'],
  },
  {
    path: 'keyframe.propWithoutImageGuide',
    category: 'keyframe',
    title: '无图道具描述约束',
    description: '道具无参考图时的文字约束模板。',
    placeholders: ['propList'],
  },
  {
    path: 'keyframe.nineGridSourceMeta',
    category: 'keyframe',
    title: '九宫格首帧来源描述',
    description: '从网格面板生成首帧时写入的来源元信息。',
    placeholders: ['sourceLabel', 'shotSize', 'cameraAngle', 'actionSummary'],
  },
  {
    path: 'keyframe.optimizeBoth',
    category: 'keyframe',
    title: '关键帧同时优化',
    description: 'AI 同时优化起始帧和结束帧的模板。',
    placeholders: [
      'sceneLocation',
      'sceneTime',
      'sceneAtmosphere',
      'actionSummary',
      'cameraMovement',
      'characters',
      'styleDesc',
    ],
  },
  {
    path: 'keyframe.optimizeSingle',
    category: 'keyframe',
    title: '关键帧单帧优化',
    description: 'AI 优化单个关键帧提示词的模板。',
    placeholders: [
      'frameLabel',
      'sceneLocation',
      'sceneTime',
      'sceneAtmosphere',
      'actionSummary',
      'cameraMovement',
      'characters',
      'styleDesc',
      'frameFocus',
      'frameSpecificRequirements',
    ],
  },
  {
    path: 'keyframe.enhance',
    category: 'keyframe',
    title: '关键帧提示词增强',
    description: 'AI 增强基础提示词用于图像生成的模板。',
    placeholders: [
      'basePrompt',
      'styleDesc',
      'cameraMovement',
      'frameLabel',
      'frameFocus',
    ],
  },

  {
    path: 'nineGrid.splitSystem',
    category: 'nineGrid',
    title: '九宫格拆分 System 模板',
    description: '网格拆分第一步使用的系统提示词。',
    placeholders: ['panelCount', 'gridLayout', 'rowCount', 'columnCount', 'layoutInstruction', 'layoutExample', 'layoutSpecificConstraint'],
  },
  {
    path: 'nineGrid.splitUser',
    category: 'nineGrid',
    title: '九宫格拆分 User 模板',
    description: '网格拆分第一步使用的用户提示词。',
    placeholders: [
      'panelCount',
      'gridLayout',
      'rowCount',
      'columnCount',
      'layoutInstruction',
      'layoutExample',
      'layoutSpecificConstraint',
      'actionSummary',
      'cameraMovement',
      'characters',
      'visualStyle',
    ],
  },
  {
    path: 'nineGrid.imagePrefix',
    category: 'nineGrid',
    title: '九宫格图片前缀模板',
    description: '网格图片生成提示词前缀。',
    placeholders: ['gridLayout', 'panelCount', 'rowCount', 'columnCount', 'layoutInstruction', 'layoutExample', 'layoutSpecificConstraint', 'visualStyle'],
  },
  {
    path: 'nineGrid.imagePanelTemplate',
    category: 'nineGrid',
    title: '九宫格单格模板',
    description: '每个面板拼接时的模板。',
    placeholders: ['index', 'position', 'shotSize', 'cameraAngle', 'description'],
  },
  {
    path: 'nineGrid.imageSuffix',
    category: 'nineGrid',
    title: '九宫格图片后缀模板',
    description: '网格图片生成提示词后缀。',
    placeholders: ['gridLayout', 'panelCount', 'rowCount', 'columnCount', 'layoutInstruction', 'layoutExample', 'layoutSpecificConstraint'],
  },
  {
    path: 'nineGrid.imageNoTextConstraint',
    category: 'nineGrid',
    title: '九宫格无文字硬约束',
    description: '九宫格图像禁止文字的硬约束。',
    placeholders: [],
  },
  {
    path: 'nineGrid.translatePrompt',
    category: 'nineGrid',
    title: '九宫格翻译模板',
    description: 'AI 将九宫格英文描述翻译为中文的模板。',
    placeholders: ['panelsJson', 'expectedCount', 'expectedCountMinusOne'],
  },
  {
    path: 'nineGrid.rewritePrompt',
    category: 'nineGrid',
    title: '九宫格改写模板',
    description: 'AI 按指令批量改写九宫格面板的模板。',
    placeholders: [
      'instruction',
      'actionSummary',
      'cameraMovement',
      'sceneLocation',
      'sceneTime',
      'sceneAtmosphere',
      'visualStyle',
      'panelsJson',
      'expectedCount',
      'expectedCountMinusOne',
      'requiredShotSizeKinds',
    ],
  },

  {
    path: 'video.sora2Chinese',
    category: 'video',
    title: '视频模板-Sora 中文',
    description: '普通模式下中文视频提示词模板。',
    placeholders: ['actionSummary', 'cameraMovement', 'visualStyle', 'language'],
  },
  {
    path: 'video.sora2English',
    category: 'video',
    title: '视频模板-Sora 英文',
    description: '普通模式下英文视频提示词模板。',
    placeholders: ['actionSummary', 'cameraMovement', 'visualStyle', 'language'],
  },
  {
    path: 'video.sora2NineGridChinese',
    category: 'video',
    title: '视频模板-九宫格中文',
    description: '网格分镜模式下中文视频提示词模板。',
    placeholders: [
      'actionSummary',
      'visualStyle',
      'gridLayout',
      'panelCount',
      'panelDescriptions',
      'secondsPerPanel',
      'cameraMovement',
      'language',
    ],
  },
  {
    path: 'video.sora2NineGridEnglish',
    category: 'video',
    title: '视频模板-九宫格英文',
    description: '网格分镜模式下英文视频提示词模板。',
    placeholders: [
      'actionSummary',
      'visualStyle',
      'gridLayout',
      'panelCount',
      'panelDescriptions',
      'secondsPerPanel',
      'cameraMovement',
      'language',
    ],
  },
  {
    path: 'video.veoStartOnly',
    category: 'video',
    title: '视频模板-Veo 首帧模式',
    description: '仅首帧驱动时使用的模板。',
    placeholders: ['actionSummary', 'cameraMovement', 'visualStyle', 'language'],
  },
  {
    path: 'video.veoStartEnd',
    category: 'video',
    title: '视频模板-Veo 首尾帧模式',
    description: '首尾帧双约束模式使用的模板。',
    placeholders: ['actionSummary', 'cameraMovement', 'visualStyle', 'language'],
  },
  {
    path: 'video.nineGridGuardrailsChinese',
    category: 'video',
    title: '九宫格视频硬约束-中文',
    description: '九宫格视频的中文硬约束模板。',
    placeholders: ['panelCount'],
  },
  {
    path: 'video.nineGridGuardrailsEnglish',
    category: 'video',
    title: '九宫格视频硬约束-英文',
    description: '九宫格视频的英文硬约束模板。',
    placeholders: ['panelCount'],
  },
  {
    path: 'video.endFrameConstraintNote',
    category: 'video',
    title: '尾帧约束备注',
    description: '模型支持尾帧时追加的备注。',
    placeholders: [],
  },
  {
    path: 'video.ignoredEndFrameNote',
    category: 'video',
    title: '忽略尾帧备注',
    description: '模型忽略尾帧时追加的备注。',
    placeholders: [],
  },

];

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const sanitizeSection = <T extends Record<string, string>>(
  input: unknown,
  defaults: T
): Partial<T> | undefined => {
  if (!isObject(input)) return undefined;
  const sanitized: Partial<T> = {};
  (Object.keys(defaults) as Array<keyof T>).forEach((key) => {
    const value = input[String(key)];
    if (typeof value === 'string') {
      sanitized[key] = value;
    }
  });
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
};

export const sanitizePromptTemplateOverrides = (
  overrides?: PromptTemplateOverrides | null
): PromptTemplateOverrides | undefined => {
  if (!isObject(overrides)) return undefined;

  const storyboard = sanitizeSection(overrides.storyboard, DEFAULT_PROMPT_TEMPLATE_CONFIG.storyboard);
  const keyframe = sanitizeSection(overrides.keyframe, DEFAULT_PROMPT_TEMPLATE_CONFIG.keyframe);
  const nineGrid = sanitizeSection(overrides.nineGrid, DEFAULT_PROMPT_TEMPLATE_CONFIG.nineGrid);
  const video = sanitizeSection(overrides.video, DEFAULT_PROMPT_TEMPLATE_CONFIG.video);

  const normalized: PromptTemplateOverrides = {};
  if (storyboard) normalized.storyboard = storyboard;
  if (keyframe) normalized.keyframe = keyframe;
  if (nineGrid) normalized.nineGrid = nineGrid;
  if (video) normalized.video = video;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

export const resolvePromptTemplateConfig = (
  overrides?: PromptTemplateOverrides | null
): PromptTemplateConfig => {
  const normalizedOverrides = sanitizePromptTemplateOverrides(overrides);
  return {
    storyboard: {
      ...DEFAULT_PROMPT_TEMPLATE_CONFIG.storyboard,
      ...(normalizedOverrides?.storyboard || {}),
    },
    keyframe: {
      ...DEFAULT_PROMPT_TEMPLATE_CONFIG.keyframe,
      ...(normalizedOverrides?.keyframe || {}),
    },
    nineGrid: {
      ...DEFAULT_PROMPT_TEMPLATE_CONFIG.nineGrid,
      ...(normalizedOverrides?.nineGrid || {}),
    },
    video: {
      ...DEFAULT_PROMPT_TEMPLATE_CONFIG.video,
      ...(normalizedOverrides?.video || {}),
    },
  };
};

const splitPromptTemplatePath = (
  path: PromptTemplatePath
): [PromptTemplateCategory, string] => {
  const [category, key] = path.split('.') as [PromptTemplateCategory, string];
  return [category, key];
};

export const getPromptTemplateValueByPath = (
  config: PromptTemplateConfig,
  path: PromptTemplatePath
): string => {
  const [category, key] = splitPromptTemplatePath(path);
  const section = config[category] as Record<string, string>;
  return section[key] || '';
};

export const getDefaultPromptTemplateValue = (path: PromptTemplatePath): string => {
  return getPromptTemplateValueByPath(DEFAULT_PROMPT_TEMPLATE_CONFIG, path);
};

export const hasPromptTemplateOverride = (
  overrides: PromptTemplateOverrides | undefined,
  path: PromptTemplatePath
): boolean => {
  const normalized = sanitizePromptTemplateOverrides(overrides);
  if (!normalized) return false;
  const [category, key] = splitPromptTemplatePath(path);
  return typeof (normalized[category] as Record<string, string> | undefined)?.[key] === 'string';
};

export const setPromptTemplateOverride = (
  overrides: PromptTemplateOverrides | undefined,
  path: PromptTemplatePath,
  value: string
): PromptTemplateOverrides => {
  const normalized = sanitizePromptTemplateOverrides(overrides) || {};
  const [category, key] = splitPromptTemplatePath(path);
  const nextSection = {
    ...((normalized[category] as Record<string, string>) || {}),
    [key]: value,
  };
  const next: PromptTemplateOverrides = {
    ...normalized,
    [category]: nextSection,
  };
  return sanitizePromptTemplateOverrides(next) || {};
};

export const removePromptTemplateOverride = (
  overrides: PromptTemplateOverrides | undefined,
  path: PromptTemplatePath
): PromptTemplateOverrides | undefined => {
  const normalized = sanitizePromptTemplateOverrides(overrides);
  if (!normalized) return undefined;

  const [category, key] = splitPromptTemplatePath(path);
  const currentSection = { ...((normalized[category] as Record<string, string>) || {}) };
  delete currentSection[key];

  const next: PromptTemplateOverrides = {
    ...normalized,
  };

  if (Object.keys(currentSection).length === 0) {
    delete next[category];
  } else {
    next[category] = currentSection as any;
  }

  return sanitizePromptTemplateOverrides(next);
};

export const searchPromptTemplateFields = (
  config: PromptTemplateConfig,
  query: string
): PromptTemplateFieldDefinition[] => {
  const keyword = String(query || '').trim().toLowerCase();
  if (!keyword) return PROMPT_TEMPLATE_FIELD_DEFINITIONS;

  return PROMPT_TEMPLATE_FIELD_DEFINITIONS.filter((field) => {
    const currentValue = getPromptTemplateValueByPath(config, field.path).toLowerCase();
    return (
      field.title.toLowerCase().includes(keyword) ||
      field.description.toLowerCase().includes(keyword) ||
      field.path.toLowerCase().includes(keyword) ||
      field.category.toLowerCase().includes(keyword) ||
      currentValue.includes(keyword)
    );
  });
};

export const getPromptTemplateCategoryLabel = (category: PromptTemplateCategory): string => {
  switch (category) {
    case 'storyboard':
      return '分镜';
    case 'keyframe':
      return '首尾帧';
    case 'nineGrid':
      return '九宫格';
    case 'video':
      return '视频';
    default:
      return category;
  }
};

export const renderPromptTemplate = (
  template: string,
  variables: Record<string, string | number | undefined | null>
): string => {
  return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
    const value = variables[key];
    if (value === undefined || value === null) {
      return `{${key}}`;
    }
    return String(value);
  });
};

export const withTemplateFallback = (
  candidate: string | undefined | null,
  fallback: string
): string => {
  const value = String(candidate ?? '');
  return value.trim().length > 0 ? value : fallback;
};

export const getStoryboardCameraMovementReference = (): string => CAMERA_MOVEMENT_REFERENCE;
