import React from 'react';
import { FileText, Users, Clapperboard, Film, ChevronLeft, ListTree, HelpCircle, Cpu, Sun, Moon, Loader2, FolderOpen, BookOpen, Globe, Palette, User } from 'lucide-react';
import logoImg from '../logo.png';
import { useTheme } from '../contexts/ThemeContext';
import { USER_MANUAL_URL, OFFICIAL_WEBSITE_URL, CREATIVE_HOME_URL, COPYRIGHT_TEXT } from '../constants/links';

interface SidebarProps {
  currentStage: string;
  setStage: (stage: 'script' | 'assets' | 'director' | 'export' | 'prompts') => void;
  onExit: () => void;
  projectName?: string;
  onShowOnboarding?: () => void;
  onShowModelConfig?: () => void;
  isNavigationLocked?: boolean;
  episodeInfo?: { projectId: string; projectTitle: string; episodeTitle: string };
  onGoToProject?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentStage, setStage, onExit, projectName, onShowOnboarding, onShowModelConfig, isNavigationLocked, episodeInfo, onGoToProject }) => {
  const { theme, toggleTheme } = useTheme();
  const navItems = [
    { id: 'script', label: '剧本与故事', icon: FileText, sub: '阶段 01' },
    { id: 'assets', label: '角色与场景', icon: Users, sub: '阶段 02' },
    { id: 'director', label: '导演工作台', icon: Clapperboard, sub: '阶段 03' },
    { id: 'export', label: '成片与导出', icon: Film, sub: '阶段 04' },
    { id: 'prompts', label: '提示词管理', icon: ListTree, sub: '高级' },
  ];

  return (
    <aside className="w-72 bg-[var(--bg-base)] border-r border-[var(--border-primary)] h-screen fixed left-0 top-0 flex flex-col z-50 select-none">
      <div className="p-6 border-b border-[var(--border-subtle)]">
        <a href="https://tree456.com/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 mb-6 group cursor-pointer">
          <img src={logoImg} alt="Logo" className="w-8 h-8 flex-shrink-0 transition-transform group-hover:scale-110" />
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold text-[var(--text-primary)] tracking-wider group-hover:text-[var(--text-secondary)] transition-colors">BigBanana</h1>
            <p className="text-[10px] text-[var(--text-tertiary)] tracking-widest group-hover:text-[var(--text-secondary)] transition-colors">专业版</p>
          </div>
        </a>
        <button
          onClick={onExit}
          className={`flex items-center gap-2 transition-colors text-xs font-mono uppercase tracking-wide group ${isNavigationLocked ? 'text-[var(--text-muted)] opacity-50 cursor-not-allowed' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
          title={isNavigationLocked ? '生成任务进行中，退出将导致数据丢失' : undefined}
        >
          <ChevronLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
          {episodeInfo ? '返回项目概览' : '返回项目列表'}
        </button>
      </div>

      <div className="px-6 py-4 border-b border-[var(--border-subtle)]">
        {episodeInfo ? (
          <>
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-1">当前项目</div>
            <button onClick={onGoToProject} className="text-xs text-[var(--accent-text)] hover:underline truncate block mb-2 text-left">
              <FolderOpen className="w-3 h-3 inline mr-1" />{episodeInfo.projectTitle}
            </button>
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-1">当前集数</div>
            <div className="text-sm font-medium text-[var(--text-secondary)] truncate font-mono">{episodeInfo.episodeTitle}</div>
          </>
        ) : (
          <>
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-1">当前项目</div>
            <div className="text-sm font-medium text-[var(--text-secondary)] truncate font-mono">{projectName || '未命名项目'}</div>
          </>
        )}
      </div>

      {isNavigationLocked && (
        <div className="mx-4 mt-4 px-3 py-2.5 rounded-lg bg-[var(--warning)]/10 border border-[var(--warning)]/30">
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 text-[var(--warning)] animate-spin flex-shrink-0" />
            <span className="text-[10px] font-medium text-[var(--warning)] uppercase tracking-wide">生成任务进行中</span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">切换页面将导致数据丢失</p>
        </div>
      )}

      <nav className="flex-1 py-6 space-y-1">
        {navItems.map((item) => {
          const isActive = currentStage === item.id;
          const isLocked = isNavigationLocked && !isActive;
          return (
            <button key={item.id} onClick={() => setStage(item.id as any)}
              className={`w-full flex items-center justify-between px-6 py-4 transition-all duration-200 group relative border-l-2 ${
                isActive ? 'border-[var(--text-primary)] bg-[var(--nav-active-bg)] text-[var(--text-primary)]'
                : isLocked ? 'border-transparent text-[var(--text-muted)] opacity-50 cursor-not-allowed'
                : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)]'
              }`}
              title={isLocked ? '生成任务进行中，切换页面将导致数据丢失' : undefined}
            >
              <div className="flex items-center gap-3">
                <item.icon className={`w-4 h-4 ${isActive ? 'text-[var(--text-primary)]' : isLocked ? 'text-[var(--text-muted)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'}`} />
                <span className="font-medium text-xs tracking-wider uppercase">{item.label}</span>
              </div>
              <span className={`text-[10px] font-mono ${isActive ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-muted)]'}`}>{item.sub}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-6 border-t border-[var(--border-subtle)] space-y-4">
        <button onClick={toggleTheme} className="w-full flex items-center justify-between text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer transition-colors" title={theme === 'dark' ? '切换亮色主题' : '切换暗色主题'}>
          <span className="font-mono text-[10px] uppercase tracking-widest">{theme === 'dark' ? '亮色主题' : '暗色主题'}</span>
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        {onShowOnboarding && (
          <button onClick={onShowOnboarding} className="w-full flex items-center justify-between text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer transition-colors">
            <span className="font-mono text-[10px] uppercase tracking-widest">新手引导</span>
            <HelpCircle className="w-4 h-4" />
          </button>
        )}
        <a
          href={USER_MANUAL_URL}
          target="_blank"
          rel="noreferrer"
          className="w-full flex items-center justify-between text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <span className="font-mono text-[10px] uppercase tracking-widest">使用手册</span>
          <BookOpen className="w-4 h-4" />
        </a>
        {onShowModelConfig && (
          <button onClick={onShowModelConfig} className="w-full flex items-center justify-between text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer transition-colors">
            <span className="font-mono text-[10px] uppercase tracking-widest">模型配置</span>
            <Cpu className="w-4 h-4" />
          </button>
        )}
        <a
          href="/account"
          className="w-full flex items-center justify-between text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <span className="font-mono text-[10px] uppercase tracking-widest">账号中心</span>
          <User className="w-4 h-4" />
        </a>
        <div className="flex gap-3 pt-2">
          <a href={OFFICIAL_WEBSITE_URL} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--accent-text)] transition-colors"
            title="树语智能官网"
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="font-mono text-[10px] tracking-wide">官网</span>
          </a>
          <span className="text-[var(--border-secondary)]">|</span>
          <a href={CREATIVE_HOME_URL} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--accent-text)] transition-colors"
            title="BigBanana 创作主页"
          >
            <Palette className="w-3.5 h-3.5" />
            <span className="font-mono text-[10px] tracking-wide">创作主页</span>
          </a>
        </div>
        <div className="text-[9px] text-[var(--text-muted)] font-mono tracking-wide opacity-60 pt-1">
          {COPYRIGHT_TEXT}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
