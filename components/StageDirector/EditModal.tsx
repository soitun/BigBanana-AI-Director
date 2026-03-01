import React from 'react';
import { X, Edit2, Check, Sparkles, Loader2 } from 'lucide-react';

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  title: string;
  icon?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  textareaClassName?: string;
  showAIGenerate?: boolean;
  onAIGenerate?: () => Promise<void>;
  isAIGenerating?: boolean;
  aiInstruction?: string;
  onAIInstructionChange?: (value: string) => void;
  aiInstructionPlaceholder?: string;
}

const EditModal: React.FC<EditModalProps> = ({
  isOpen,
  onClose,
  onSave,
  title,
  icon,
  value,
  onChange,
  placeholder = '输入内容...',
  textareaClassName = 'font-normal',
  showAIGenerate = false,
  onAIGenerate,
  isAIGenerating = false,
  aiInstruction = '',
  onAIInstructionChange,
  aiInstructionPlaceholder = '可选：输入你希望 AI 调整或强化的要求（如节奏、情绪、动作重点）',
}) => {
  if (!isOpen) return null;

  const handleAIGenerate = async () => {
    if (onAIGenerate && !isAIGenerating) {
      await onAIGenerate();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--overlay-heavy)] backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-elevated)] border border-[var(--border-secondary)] rounded-xl p-6 max-w-2xl w-full space-y-4 shadow-2xl animate-in fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[var(--text-primary)] font-bold flex items-center gap-2">
            {icon || <Edit2 className="w-4 h-4 text-[var(--accent-text)]" />}
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-hover)] rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {showAIGenerate && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleAIGenerate}
                disabled={isAIGenerating}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  isAIGenerating
                    ? 'bg-[var(--border-secondary)] text-[var(--text-tertiary)] cursor-not-allowed'
                    : 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] shadow-lg'
                }`}
              >
                {isAIGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    AI 正在生成动作建议...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    AI 生成动作建议
                  </>
                )}
              </button>
            </div>

            {onAIInstructionChange && (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[var(--text-secondary)]">
                  用户修改要求（可选）
                </label>
                <input
                  type="text"
                  value={aiInstruction}
                  onChange={(e) => onAIInstructionChange(e.target.value)}
                  placeholder={aiInstructionPlaceholder}
                  disabled={isAIGenerating}
                  className="w-full bg-[var(--bg-base)] text-[var(--text-primary)] border border-[var(--border-secondary)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent-primary)] transition-colors disabled:opacity-50"
                />
              </div>
            )}
          </div>
        )}

        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full h-64 bg-[var(--bg-base)] text-[var(--text-primary)] border border-[var(--border-secondary)] rounded-lg p-4 text-sm outline-none focus:border-[var(--border-secondary)] transition-colors resize-none ${textareaClassName}`}
          placeholder={placeholder}
          autoFocus
          disabled={isAIGenerating}
        />

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isAIGenerating}
            className="px-4 py-2 bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border-secondary)] rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={isAIGenerating}
            className="px-4 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] rounded-lg text-sm font-bold transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditModal;
