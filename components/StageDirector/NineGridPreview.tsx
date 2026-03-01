import React, { useState, useEffect } from 'react';
import { X, Loader2, RefreshCw, Check, Grid3x3, AlertCircle, Image as ImageIcon, Crop, Edit2, Save, ArrowRight, Wand2, ImagePlus, Languages } from 'lucide-react';
import { NineGridData, NineGridPanel, AspectRatio } from '../../types';
import { NINE_GRID, resolveStoryboardGridLayout } from './constants';

interface NineGridPreviewProps {
  isOpen: boolean;
  nineGrid?: NineGridData;
  onClose: () => void;
  onSelectPanel: (panel: NineGridPanel) => void;
  onUseWholeImage: () => void;  // 整张九宫格图直接用作首帧
  onRegenerate: () => void;
  onRegenerateImage: () => void; // 仅重新生成图片（保留已有的面板文案描述）
  onConfirmPanels: (panels: NineGridPanel[]) => void; // 用户确认面板后生成图片
  onUpdatePanel: (index: number, panel: Partial<NineGridPanel>) => void; // 编辑单个面板
  onTranslatePanels?: () => Promise<void> | void; // AI翻译英文描述为中文展示（不替换英文原文）
  onRevisePanels?: (instruction: string) => Promise<void> | void; // AI按要求改写九宫格描述
  isTranslatingPanels?: boolean;
  isRevisingPanels?: boolean;
  /** 当前画面比例（横屏/竖屏），用于调整预览布局 */
  aspectRatio?: AspectRatio;
}

const countEnglishWords = (text: string): number => {
  const matches = String(text || '').trim().match(/[A-Za-z0-9'-]+/g);
  return matches ? matches.length : 0;
};

const validateNineGridPanels = (
  panels: NineGridPanel[],
  expectedCount: number
): string | null => {
  if (panels.length !== expectedCount) {
    return `面板数量异常：当前 ${panels.length}，应为 ${expectedCount}。`;
  }

  const seenCombos = new Set<string>();
  for (let idx = 0; idx < panels.length; idx += 1) {
    const panel = panels[idx];
    const panelNo = idx + 1;
    const shotSize = String(panel.shotSize || '').trim();
    const cameraAngle = String(panel.cameraAngle || '').trim();
    const description = String(panel.description || '').trim();
    if (!shotSize || !cameraAngle || !description) {
      return `第 ${panelNo} 格存在空字段，请补全景别、机位和描述。`;
    }
    if (panel.index !== idx) {
      return `第 ${panelNo} 格 index 异常（当前 ${panel.index}，应为 ${idx}），请重新生成描述。`;
    }

    const wordCount = countEnglishWords(description);
    if (wordCount < 10 || wordCount > 30) {
      return `第 ${panelNo} 格 description 需为 10-30 个英文词（当前 ${wordCount}）。`;
    }

    const combo = `${shotSize}__${cameraAngle}`;
    if (seenCombos.has(combo)) {
      return `存在重复视角组合：${shotSize}/${cameraAngle}。请调整为不同机位或景别。`;
    }
    seenCombos.add(combo);
  }

  const uniqueShotSizes = new Set(
    panels.map((panel) => String(panel.shotSize || '').trim()).filter(Boolean)
  ).size;
  const minShotSizes = expectedCount >= 6 ? 3 : 2;
  if (uniqueShotSizes < minShotSizes) {
    return `景别多样性不足：当前仅 ${uniqueShotSizes} 种，至少需要 ${minShotSizes} 种。`;
  }

  return null;
};

const NineGridPreview: React.FC<NineGridPreviewProps> = ({
  isOpen,
  nineGrid,
  onClose,
  onSelectPanel,
  onUseWholeImage,
  onRegenerate,
  onRegenerateImage,
  onConfirmPanels,
  onUpdatePanel,
  onTranslatePanels,
  onRevisePanels,
  isTranslatingPanels = false,
  isRevisingPanels = false,
  aspectRatio = '16:9'
}) => {
  const [hoveredPanel, setHoveredPanel] = useState<number | null>(null);
  const [selectedPanel, setSelectedPanel] = useState<number | null>(null);
  const [editingPanel, setEditingPanel] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showChineseDescriptions, setShowChineseDescriptions] = useState(false);
  const [reviseInstruction, setReviseInstruction] = useState('');
  const [editForm, setEditForm] = useState<{ shotSize: string; cameraAngle: string; description: string }>({
    shotSize: '', cameraAngle: '', description: ''
  });

  // 当编辑面板时，初始化编辑表单
  useEffect(() => {
    if (editingPanel !== null && nineGrid?.panels?.[editingPanel]) {
      const panel = nineGrid.panels[editingPanel];
      setEditForm({
        shotSize: panel.shotSize,
        cameraAngle: panel.cameraAngle,
        description: panel.description
      });
    }
  }, [editingPanel, nineGrid?.panels]);

  useEffect(() => {
    setValidationError(null);
  }, [isOpen, nineGrid?.status]);

  useEffect(() => {
    if (!isOpen) {
      setShowChineseDescriptions(false);
      setReviseInstruction('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isGeneratingPanels = nineGrid?.status === 'generating_panels';
  const isPanelsReady = nineGrid?.status === 'panels_ready';
  const isGeneratingImage = nineGrid?.status === 'generating_image';
  const hasFailed = nineGrid?.status === 'failed';
  const isCompleted = nineGrid?.status === 'completed' && nineGrid?.imageUrl;
  // 兼容旧的 generating 状态
  const isGenerating = nineGrid?.status === 'generating_panels'
    || nineGrid?.status === 'generating_image'
    || (nineGrid?.status as string) === 'generating';
  const gridLayout = resolveStoryboardGridLayout(nineGrid?.layout?.panelCount, nineGrid?.panels?.length);
  const gridName = gridLayout.label;
  const panelCount = gridLayout.panelCount;
  const activePanels = nineGrid?.panels?.slice(0, panelCount) || [];
  const hasChineseDescriptions = activePanels.some((panel) => !!String(panel.descriptionZh || '').trim());

  const handlePanelClick = (index: number) => {
    setValidationError(null);
    if (isPanelsReady) {
      // 在 panels_ready 模式下，点击进入编辑
      setEditingPanel(editingPanel === index ? null : index);
    } else {
      setSelectedPanel(selectedPanel === index ? null : index);
    }
  };

  const handleConfirmSelect = () => {
    if (selectedPanel !== null && activePanels[selectedPanel]) {
      onSelectPanel(activePanels[selectedPanel]);
      setSelectedPanel(null);
    }
  };

  const handleSaveEdit = () => {
    if (editingPanel === null) return;

    const normalizedPanel = {
      shotSize: String(editForm.shotSize || '').trim(),
      cameraAngle: String(editForm.cameraAngle || '').trim(),
      description: String(editForm.description || '').trim(),
    };
    if (!normalizedPanel.shotSize || !normalizedPanel.cameraAngle || !normalizedPanel.description) {
      setValidationError(`第 ${editingPanel + 1} 格存在空字段，请补全后再保存。`);
      return;
    }
    const wordCount = countEnglishWords(normalizedPanel.description);
    if (wordCount < 10 || wordCount > 30) {
      setValidationError(`第 ${editingPanel + 1} 格 description 需为 10-30 个英文词（当前 ${wordCount}）。`);
      return;
    }

    setValidationError(null);
    onUpdatePanel(editingPanel, normalizedPanel);
    setEditingPanel(null);
  };

  const handleConfirmAndGenerate = () => {
    if (editingPanel !== null) {
      setValidationError('请先保存或取消当前正在编辑的面板。');
      return;
    }
    const validationMessage = validateNineGridPanels(activePanels, panelCount);
    if (validationMessage) {
      setValidationError(validationMessage);
      return;
    }
    setValidationError(null);
    onConfirmPanels(activePanels);
  };

  const handleTranslatePanels = async () => {
    if (!onTranslatePanels) return;
    setValidationError(null);
    try {
      await Promise.resolve(onTranslatePanels());
      setShowChineseDescriptions(true);
    } catch {
      // 错误提示由父层统一展示
    }
  };

  const handleRevisePanels = async () => {
    if (!onRevisePanels) return;
    if (editingPanel !== null) {
      setValidationError('请先保存或取消当前正在编辑的面板。');
      return;
    }
    const normalizedInstruction = reviseInstruction.trim();
    if (!normalizedInstruction) {
      setValidationError('请先输入改写要求。');
      return;
    }
    setValidationError(null);
    try {
      await Promise.resolve(onRevisePanels(normalizedInstruction));
      setReviseInstruction('');
      setShowChineseDescriptions(false);
    } catch {
      // 错误提示由父层统一展示
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-[var(--overlay-heavy)] backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-[var(--bg-elevated)] border border-[var(--border-secondary)] rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 px-6 border-b border-[var(--border-primary)] flex items-center justify-between bg-[var(--bg-surface)] shrink-0">
          <div className="flex items-center gap-3">
            <Grid3x3 className="w-4 h-4 text-[var(--accent-text)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {gridName}分镜预览
            </h3>
            {isPanelsReady && (
              <span className="text-[10px] text-[var(--warning-text)] font-bold uppercase tracking-wider bg-[var(--warning-bg)] px-2 py-0.5 rounded border border-[var(--warning-border)]">
                待确认
              </span>
            )}
            {isCompleted && (
              <span className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wider bg-[var(--bg-base)]/30 px-2 py-0.5 rounded">
                Advanced
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isCompleted && (
              <button
                onClick={onRegenerateImage}
                className="px-3 py-1.5 bg-[var(--accent-bg)] hover:bg-[var(--accent-hover-bg)] text-[var(--accent-text)] border border-[var(--accent-border)] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
                title={`保留镜头描述，仅重新生成${gridName}图片`}
              >
                <ImagePlus className="w-3 h-3" />
                重新生成图片
              </button>
            )}
            {(isCompleted || isPanelsReady) && (
              <button
                onClick={onRegenerate}
                className="px-3 py-1.5 bg-[var(--bg-hover)] hover:bg-[var(--border-secondary)] text-[var(--text-secondary)] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
                title="重新生成镜头描述和图片"
              >
                <RefreshCw className="w-3 h-3" />
                重新生成描述
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-[var(--error-hover-bg)] rounded text-[var(--text-tertiary)] hover:text-[var(--error-text)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Loading Panels State */}
          {isGeneratingPanels && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-12 h-12 text-[var(--accent)] animate-spin mb-6" />
              <h4 className="text-lg font-bold text-[var(--text-primary)] mb-2">
                正在生成镜头描述...
              </h4>
              <p className="text-sm text-[var(--text-tertiary)]">
                AI正在将镜头拆分为{panelCount}个不同视角，请耐心等待
              </p>
            </div>
          )}

          {/* Loading Image State */}
          {isGeneratingImage && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-12 h-12 text-[var(--accent)] animate-spin mb-6" />
              <h4 className="text-lg font-bold text-[var(--text-primary)] mb-2">
                正在生成{gridName}图片...
              </h4>
              <p className="text-sm text-[var(--text-tertiary)]">
                根据确认的镜头描述生成预览图，请耐心等待
              </p>
              {/* 显示已确认的面板列表 */}
              {activePanels.length > 0 && (
                <div className="mt-6 w-full max-w-lg space-y-1.5 px-6">
                  {activePanels.map((panel, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-[var(--bg-surface)] rounded-lg border border-[var(--border-primary)]">
                      <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-[10px] font-bold text-[var(--text-secondary)]">
                        {panel.shotSize} / {panel.cameraAngle}
                      </span>
                      <span className="text-[9px] text-[var(--text-muted)] truncate flex-1">
                        {panel.description.substring(0, 50)}...
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Failed State */}
          {hasFailed && (
            <div className="flex flex-col items-center justify-center py-20">
              <AlertCircle className="w-12 h-12 text-[var(--error)] mb-6 opacity-60" />
              <h4 className="text-lg font-bold text-[var(--text-primary)] mb-2">
                生成失败
              </h4>
              <p className="text-sm text-[var(--text-tertiary)] mb-6">
                {activePanels.length > 0
                  ? `${gridName}图片生成失败，您可以重新确认生成或修改描述后重试`
                  : '镜头描述生成失败，请重试'
                }
              </p>
              {validationError && (
                <div className="mb-4 max-w-2xl px-4 py-3 bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-lg text-xs text-[var(--warning-text)]">
                  {validationError}
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={onRegenerate}
                  className="px-4 py-2 bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-[var(--btn-primary-text)] rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="w-3 h-3" />
                  重新生成描述
                </button>
                {/* 如果面板描述已有，允许直接重试图片生成 */}
                {activePanels.length === panelCount && (
                  <button
                    onClick={handleConfirmAndGenerate}
                    className="px-4 py-2 bg-[var(--accent-bg)] hover:bg-[var(--accent-hover-bg)] text-[var(--accent-text)] border border-[var(--accent-border)] rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
                  >
                    <ArrowRight className="w-3 h-3" />
                    重试生成图片
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Panels Ready State - 用户审核和编辑面板描述 */}
          {isPanelsReady && activePanels.length > 0 && (
            <div className="p-6 space-y-4">
              {/* 提示信息 */}
              <div className="flex items-start gap-3 p-4 bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-lg">
                <Wand2 className="w-5 h-5 text-[var(--warning-text)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-[var(--warning-text)] mb-1">
                    AI已生成{panelCount}个镜头描述，请检查后确认
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    点击任意镜头可编辑其景别、机位角度和描述内容。确认无误后点击「确认并生成图片」按钮。
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-surface)] p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTranslatePanels}
                    disabled={!onTranslatePanels || isTranslatingPanels || isRevisingPanels}
                    className="px-3 py-1.5 rounded-md border border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent-text)] text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                    title="将英文描述翻译为中文展示（不替换英文原文）"
                  >
                    {isTranslatingPanels ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                    {isTranslatingPanels ? '翻译中...' : 'AI翻译为中文'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowChineseDescriptions((prev) => !prev)}
                    disabled={!hasChineseDescriptions}
                    className="px-3 py-1.5 rounded-md border border-[var(--border-primary)] text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider hover:border-[var(--border-secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {showChineseDescriptions ? '显示英文原文' : '显示中文译文'}
                  </button>
                  {!hasChineseDescriptions && (
                    <span className="text-[10px] text-[var(--text-muted)]">
                      尚未生成中文译文
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    AI修改要求
                  </label>
                  <textarea
                    value={reviseInstruction}
                    onChange={(e) => setReviseInstruction(e.target.value)}
                    placeholder="例如：加强紧张感，镜头从稳到动，前3格偏建立环境，后3格强化人物情绪。"
                    className="w-full min-h-[84px] bg-[var(--bg-base)] text-[var(--text-primary)] border border-[var(--border-secondary)] rounded-md p-2 text-xs leading-relaxed focus:border-[var(--accent)] outline-none resize-y"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleRevisePanels}
                      disabled={!onRevisePanels || isRevisingPanels || isTranslatingPanels}
                      className="px-3.5 py-1.5 rounded-md bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-[10px] font-bold uppercase tracking-wider hover:bg-[var(--btn-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      {isRevisingPanels ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                      {isRevisingPanels ? 'AI修改中...' : 'AI按要求修改'}
                    </button>
                  </div>
                </div>
              </div>
              {validationError && (
                <div className="px-4 py-3 bg-[var(--error-bg)] border border-[var(--error-border)] rounded-lg text-xs text-[var(--error-text)]">
                  {validationError}
                </div>
              )}

              {/* 面板列表 - 可编辑 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {activePanels.map((panel, idx) => (
                  <div
                    key={idx}
                    className={`relative p-3 rounded-lg border-2 transition-all duration-200 ${
                      editingPanel === idx
                        ? 'border-[var(--accent)] bg-[var(--accent-bg)] shadow-lg'
                        : 'border-[var(--border-primary)] bg-[var(--bg-surface)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer'
                    }`}
                    onClick={() => editingPanel !== idx && handlePanelClick(idx)}
                  >
                    {/* 面板头部 */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          editingPanel === idx
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)]'
                        }`}>
                          {idx + 1}
                        </span>
                        {editingPanel !== idx && (
                          <span className="text-[11px] font-bold text-[var(--text-secondary)]">
                            {panel.shotSize} / {panel.cameraAngle}
                          </span>
                        )}
                      </div>
                      {editingPanel !== idx && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePanelClick(idx); }}
                          className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--accent-text)] transition-colors"
                          title="编辑"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* 编辑模式 */}
                    {editingPanel === idx ? (
                      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-[8px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-0.5 block">景别</label>
                            <input
                              type="text"
                              value={editForm.shotSize}
                              onChange={(e) => setEditForm(prev => ({ ...prev, shotSize: e.target.value }))}
                              list="nine-grid-shot-size-suggestions"
                              placeholder="例如：中景"
                              className="w-full text-[10px] p-1.5 bg-[var(--bg-base)] border border-[var(--border-secondary)] rounded text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
                            />
                            <datalist id="nine-grid-shot-size-suggestions">
                              {NINE_GRID.defaultShotSizes.map((size) => (
                                <option key={size} value={size} />
                              ))}
                            </datalist>
                          </div>
                          <div className="flex-1">
                            <label className="text-[8px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-0.5 block">机位</label>
                            <input
                              type="text"
                              value={editForm.cameraAngle}
                              onChange={(e) => setEditForm(prev => ({ ...prev, cameraAngle: e.target.value }))}
                              list="nine-grid-camera-angle-suggestions"
                              placeholder="例如：平视"
                              className="w-full text-[10px] p-1.5 bg-[var(--bg-base)] border border-[var(--border-secondary)] rounded text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
                            />
                            <datalist id="nine-grid-camera-angle-suggestions">
                              {NINE_GRID.defaultCameraAngles.map((angle) => (
                                <option key={angle} value={angle} />
                              ))}
                            </datalist>
                          </div>
                        </div>
                        <div>
                          <label className="text-[8px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-0.5 block">画面描述</label>
                          <textarea
                            value={editForm.description}
                            onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                            className="w-full text-[10px] p-2 bg-[var(--bg-base)] border border-[var(--border-secondary)] rounded text-[var(--text-primary)] focus:border-[var(--accent)] outline-none resize-none font-mono leading-relaxed"
                            rows={4}
                          />
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => setEditingPanel(null)}
                            className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                          >
                            取消
                          </button>
                          <button
                            onClick={handleSaveEdit}
                            className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded text-[9px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1"
                          >
                            <Save className="w-3 h-3" />
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* 预览模式 */
                      <div className="space-y-1">
                        <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed line-clamp-3">
                          {panel.description}
                        </p>
                        {showChineseDescriptions && panel.descriptionZh && (
                          <p className="text-[10px] text-[var(--accent-text)] leading-relaxed line-clamp-3 border-t border-[var(--border-primary)] pt-1">
                            {panel.descriptionZh}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 确认生成按钮 */}
              <div className="flex items-center justify-between pt-4 border-t border-[var(--border-primary)]">
                <p className="text-[10px] text-[var(--text-muted)] max-w-[400px]">
                  确认{panelCount}个镜头描述无误后，将根据这些描述生成一张{gridLayout.cols}x{gridLayout.rows}{gridName}分镜预览图
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="px-3 py-2 bg-[var(--bg-hover)] hover:bg-[var(--border-secondary)] text-[var(--text-secondary)] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                  >
                    稍后确认
                  </button>
                  <button
                    onClick={handleConfirmAndGenerate}
                    className="px-4 py-2.5 bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-[var(--btn-primary-text)] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-2 shadow-lg shadow-[var(--btn-primary-shadow)]"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    确认并生成图片
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Completed State - Main Content (与之前相同) */}
          {isCompleted && nineGrid && (
            <div className="p-6 space-y-4">
              <div className={`flex gap-6 ${aspectRatio === '9:16' ? 'items-start' : ''}`}>
                {/* Left: Nine Grid Image with overlay grid */}
                <div className={aspectRatio === '9:16' ? 'w-[320px] shrink-0' : 'flex-1 min-w-0'}>
                  <div className="relative bg-[var(--bg-base)] rounded-lg border border-[var(--border-primary)] overflow-hidden">
                    {/* Base Image - 自适应实际图片比例 */}
                    <img
                      src={nineGrid.imageUrl}
                      className="w-full h-auto block"
                      alt={`${gridName}分镜预览`}
                    />
                    
                    {/* Overlay Grid - dynamic clickable areas, 完全覆盖图片 */}
                    <div
                      className="absolute inset-0 grid"
                      style={{
                        gridTemplateColumns: `repeat(${gridLayout.cols}, minmax(0, 1fr))`,
                        gridTemplateRows: `repeat(${gridLayout.rows}, minmax(0, 1fr))`,
                      }}
                    >
                      {Array.from({ length: panelCount }).map((_, idx) => (
                        <div
                          key={idx}
                          className={`relative border transition-all duration-200 cursor-pointer group/cell ${
                            selectedPanel === idx
                              ? 'border-[var(--accent)] border-2 bg-[var(--accent)]/10 shadow-[inset_0_0_20px_rgba(var(--accent-rgb),0.15)]'
                              : hoveredPanel === idx
                                ? 'border-white/40 bg-white/5'
                                : 'border-transparent hover:border-white/20'
                          }`}
                          onMouseEnter={() => setHoveredPanel(idx)}
                          onMouseLeave={() => setHoveredPanel(null)}
                          onClick={() => handlePanelClick(idx)}
                        >
                          {/* Panel index badge */}
                          <div className={`absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-opacity ${
                            hoveredPanel === idx || selectedPanel === idx
                              ? 'opacity-100'
                              : 'opacity-0 group-hover/cell:opacity-60'
                          } ${
                            selectedPanel === idx
                              ? 'bg-[var(--accent)] text-white'
                              : 'bg-black/60 text-white'
                          }`}>
                            {idx + 1}
                          </div>

                          {/* Selected checkmark */}
                          {selectedPanel === idx && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-[var(--accent)] rounded-full flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}

                          {/* Hover tooltip */}
                          {hoveredPanel === idx && activePanels[idx] && (
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
                              <p className="text-white text-[9px] font-bold">
                                {activePanels[idx].shotSize} / {activePanels[idx].cameraAngle}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right: Panel descriptions list */}
                <div className={`${aspectRatio === '9:16' ? 'flex-1 min-w-0' : 'w-64 shrink-0'} space-y-2`}>
                  <h4 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest pb-1 border-b border-[var(--border-primary)]">
                    视角列表 ({panelCount})
                  </h4>
                  <div className="space-y-1.5 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
                    {activePanels.map((panel, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-lg border cursor-pointer transition-all duration-150 ${
                          selectedPanel === idx
                            ? 'bg-[var(--accent-bg)] border-[var(--accent-border)] ring-1 ring-[var(--accent)]'
                            : hoveredPanel === idx
                              ? 'bg-[var(--bg-hover)] border-[var(--border-secondary)]'
                              : 'bg-[var(--bg-surface)] border-[var(--border-primary)] hover:bg-[var(--bg-hover)]'
                        }`}
                        onMouseEnter={() => setHoveredPanel(idx)}
                        onMouseLeave={() => setHoveredPanel(null)}
                        onClick={() => handlePanelClick(idx)}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                            selectedPanel === idx
                              ? 'bg-[var(--accent)] text-white'
                              : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)]'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="text-[10px] font-bold text-[var(--text-secondary)] truncate">
                            {panel.shotSize} / {panel.cameraAngle}
                          </span>
                        </div>
                        <p className="text-[9px] text-[var(--text-tertiary)] leading-relaxed line-clamp-2 ml-7">
                          {panel.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between pt-3 border-t border-[var(--border-primary)]">
                <p className="text-[10px] text-[var(--text-muted)] max-w-[280px]">
                  {selectedPanel !== null 
                    ? `已选择面板 ${selectedPanel + 1}: ${activePanels[selectedPanel]?.shotSize} / ${activePanels[selectedPanel]?.cameraAngle}`
                    : `可直接使用整张${gridName}图作为首帧，或点击选择某个格子裁剪使用`
                  }
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="px-3 py-2 bg-[var(--bg-hover)] hover:bg-[var(--border-secondary)] text-[var(--text-secondary)] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={onUseWholeImage}
                    className="px-3 py-2 bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-primary)] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
                  >
                    <ImageIcon className="w-3 h-3" />
                    整图用作首帧
                  </button>
                  <button
                    onClick={handleConfirmSelect}
                    disabled={selectedPanel === null}
                    className="px-3 py-2 bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-[var(--btn-primary-text)] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[var(--btn-primary-shadow)]"
                  >
                    <Crop className="w-3 h-3" />
                    裁剪选中格用作首帧
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Pending State (initial, before first generation) */}
          {!nineGrid && (
            <div className="flex flex-col items-center justify-center py-20">
              <Grid3x3 className="w-12 h-12 text-[var(--text-muted)] mb-6 opacity-40" />
              <h4 className="text-lg font-bold text-[var(--text-primary)] mb-2">
                网格分镜预览
              </h4>
              <p className="text-sm text-[var(--text-tertiary)] mb-6 text-center max-w-md">
                AI将自动将当前镜头拆分为多视角，<br/>
                生成网格分镜预览图，帮助你选择最佳构图方案
              </p>
              <button
                onClick={onRegenerate}
                className="px-4 py-2 bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-[var(--btn-primary-text)] rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 shadow-lg shadow-[var(--btn-primary-shadow)]"
              >
                <Grid3x3 className="w-3.5 h-3.5" />
                开始生成
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NineGridPreview;
