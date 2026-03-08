import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Folder, ChevronRight, Calendar, AlertTriangle, X, HelpCircle, Cpu, Archive, Search, Users, MapPin, Package, Database, Settings, Sun, Moon, Film, ExternalLink, User } from 'lucide-react';
import { SeriesProject, AssetLibraryItem, Character, Scene, Prop, ProjectState } from '../types';
import { getAllSeriesProjects, createNewSeriesProject, saveSeriesProject, deleteSeriesProject, createNewSeries, saveSeries, createNewEpisode, saveEpisode, getAllAssetLibraryItems, deleteAssetFromLibrary, exportIndexedDBData } from '../services/storageService';
import { useAlert } from './GlobalAlert';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import qrCodeImg from '../images/qrcode.jpg';
import wxQrImg from '../images/wx.jpg';
import {
  useBackupTransfer,
  DEFAULT_BACKUP_TRANSFER_MESSAGES,
  globalBackupFileName,
} from '../hooks/useBackupTransfer';
import { DIRECTOR_HUB_URL } from '../constants/links';

interface Props {
  onOpenProject: (project: ProjectState) => void;
  onShowOnboarding?: () => void;
  onShowModelConfig?: () => void;
}

const Dashboard: React.FC<Props> = ({ onOpenProject, onShowOnboarding, onShowModelConfig }) => {
  const { showAlert } = useAlert();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<SeriesProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showGroupQr, setShowGroupQr] = useState(false);
  const [libraryItems, setLibraryItems] = useState<AssetLibraryItem[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'character' | 'scene' | 'prop'>('all');
  const [libraryProjectFilter, setLibraryProjectFilter] = useState('all');
  const [assetToUse, setAssetToUse] = useState<AssetLibraryItem | null>(null);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const list = await getAllSeriesProjects();
      setProjects(list);
    } catch (e) {
      console.error("Failed to load projects", e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLibrary = async () => {
    setIsLibraryLoading(true);
    try {
      const items = await getAllAssetLibraryItems();
      setLibraryItems(items);
    } catch (e) {
      console.error('Failed to load asset library', e);
    } finally {
      setIsLibraryLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (showLibraryModal) {
      loadLibrary();
    }
  }, [showLibraryModal]);

  const handleCreate = async () => {
    const sp = createNewSeriesProject();
    await saveSeriesProject(sp);
    const s = createNewSeries(sp.id, '第一季', 0);
    await saveSeries(s);
    const ep = createNewEpisode(sp.id, s.id, 1, '第 1 集');
    await saveEpisode(ep);
    navigate(`/project/${sp.id}`);
  };

  const requestDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(null);
  };

  const confirmDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const proj = projects.find(p => p.id === id);
    const projectName = proj?.title || '未命名项目';
    try {
        await deleteSeriesProject(id);
        await loadProjects();
        console.log(`Project "${projectName}" deleted`);
    } catch (error) {
        showAlert(`删除项目失败: ${error instanceof Error ? error.message : '未知错误'}`, { type: 'error' });
    } finally {
        setDeleteConfirmId(null);
    }
  };

  const handleDeleteLibraryItem = (itemId: string) => {
    showAlert('确定从资产库删除该资源吗？', {
      type: 'warning',
      showCancel: true,
      onConfirm: async () => {
        try {
          await deleteAssetFromLibrary(itemId);
          setLibraryItems((prev) => prev.filter((item) => item.id !== itemId));
        } catch (error) {
          showAlert(`删除资产失败: ${error instanceof Error ? error.message : '未知错误'}`, { type: 'error' });
        }
      }
    });
  };

  const handleUseAsset = async (projectId: string) => {
    if (!assetToUse) return;
    setAssetToUse(null);
    navigate(`/project/${projectId}`);
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const getLibraryProjectName = (item: AssetLibraryItem): string => {
    const projectName = typeof item.projectName === 'string' ? item.projectName.trim() : '';
    return projectName || 'Unknown Project';
  };

  const projectNameOptions = Array.from<string>(
    new Set<string>(
      libraryItems.map((item) => getLibraryProjectName(item))
    )
  ).sort((a, b) => a.localeCompare(b, 'zh-CN'));

  const filteredLibraryItems = libraryItems.filter((item) => {
    if (libraryFilter !== 'all' && item.type !== libraryFilter) return false;
    if (libraryProjectFilter !== 'all') {
      const projectName = getLibraryProjectName(item);
      if (projectName !== libraryProjectFilter) return false;
    }
    if (!libraryQuery.trim()) return true;
    const query = libraryQuery.trim().toLowerCase();
    return item.name.toLowerCase().includes(query);
  });

  const {
    importInputRef,
    isDataExporting,
    isDataImporting,
    handleExportData,
    handleImportData,
    handleImportFileChange,
  } = useBackupTransfer({
    exporter: exportIndexedDBData,
    exportFileName: globalBackupFileName,
    showAlert,
    messages: DEFAULT_BACKUP_TRANSFER_MESSAGES,
    onImportSuccess: async () => {
      await loadProjects();
      if (showLibraryModal) {
        await loadLibrary();
      }
    },
  });

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-secondary)] p-8 md:p-12 font-sans selection:bg-[var(--selection-bg)]">
      <div className="max-w-7xl mx-auto">
        <header className="mb-16 border-b border-[var(--border-subtle)] pb-8 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-light text-[var(--text-primary)] tracking-tight mb-2 flex items-center gap-3">
              项目库
              <span className="text-[var(--text-muted)] text-lg">/</span>
              <span className="text-[var(--text-muted)] text-sm font-mono tracking-widest uppercase">Projects Database</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowGroupQr(true)}
              className="group flex items-center gap-2 px-4 py-3 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)] transition-colors"
              title="加入交流群"
            >
              <span className="font-medium text-xs tracking-widest uppercase">交流群</span>
            </button>
            {onShowOnboarding && (
              <button 
                onClick={onShowOnboarding}
                className="group flex items-center gap-2 px-4 py-3 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)] transition-colors"
                title="查看新手引导"
              >
                <HelpCircle className="w-4 h-4" />
                <span className="font-medium text-xs tracking-widest uppercase">帮助</span>
              </button>
            )}
            <button
              onClick={() => navigate('/account')}
              className="group flex items-center gap-2 px-4 py-3 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)] transition-colors"
            >
              <User className="w-4 h-4" />
              <span className="font-medium text-xs tracking-widest uppercase">账号中心</span>
            </button>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="group flex items-center gap-2 px-4 py-3 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)] transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="font-medium text-xs tracking-widest uppercase">系统设置</span>
            </button>
            <button
              onClick={toggleTheme}
              className="group flex items-center gap-2 px-4 py-3 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)] transition-colors"
              title={theme === 'dark' ? '切换亮色主题' : '切换暗色主题'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span className="font-medium text-xs tracking-widest uppercase">{theme === 'dark' ? '亮色' : '暗色'}</span>
            </button>
            <button 
              onClick={handleCreate}
              className="group flex items-center gap-3 px-6 py-3 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="font-bold text-xs tracking-widest uppercase">新建项目</span>
            </button>
          </div>
        </header>

        <section className="mb-8 border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <h2 className="text-sm md:text-base font-bold text-[var(--text-primary)] tracking-wide">DirectorHub 资源共创平台</h2>
              <p className="text-xs text-[var(--text-tertiary)] leading-relaxed max-w-3xl">
                DirectorHub 是一个面向创作者的资源共创平台。在这里你可以上传、下载并分享优质资源，与更多创作者协作成长。我们鼓励原创与高质量内容，对优秀作品提供平台额度补助。
              </p>
            </div>
            <a
              href={DIRECTOR_HUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-3 border border-[var(--border-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors text-xs font-medium tracking-wide whitespace-nowrap"
            >
              访问 DirectorHub
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </section>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-[var(--text-muted)] animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            
            {/* Create New Card */}
            <div 
              onClick={handleCreate}
              className="group cursor-pointer border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-primary)] flex flex-col items-center justify-center min-h-[280px] transition-all"
            >
              <div className="w-12 h-12 border border-[var(--border-secondary)] flex items-center justify-center mb-6 group-hover:bg-[var(--bg-hover)] transition-colors">
                <Plus className="w-5 h-5 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]" />
              </div>
              <span className="text-[var(--text-muted)] font-mono text-[10px] uppercase tracking-widest group-hover:text-[var(--text-secondary)]">Create New Project</span>
            </div>

            {/* Project List */}
            {projects.map((proj) => (
              <div 
                key={proj.id}
                onClick={() => navigate(`/project/${proj.id}`)}
                className="group bg-[var(--bg-primary)] border border-[var(--border-primary)] hover:border-[var(--border-secondary)] p-0 flex flex-col cursor-pointer transition-all relative overflow-hidden h-[280px]"
              >
                  {deleteConfirmId === proj.id && (
                    <div className="absolute inset-0 z-20 bg-[var(--bg-primary)] flex flex-col items-center justify-center p-6 space-y-4 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="w-10 h-10 bg-[var(--error-hover-bg)] flex items-center justify-center rounded-full">
                           <AlertTriangle className="w-5 h-5 text-[var(--error)]" />
                        </div>
                        <div className="text-center space-y-2">
                            <p className="text-[var(--text-primary)] font-bold text-xs uppercase tracking-widest">确认删除项目？</p>
                            <p className="text-[var(--text-tertiary)] text-[10px] font-mono">将删除所有剧集和角色库数据</p>
                        </div>
                        <div className="flex gap-2 w-full pt-2">
                            <button onClick={cancelDelete} className="flex-1 py-3 bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-[10px] font-bold uppercase tracking-wider transition-colors border border-[var(--border-primary)]">取消</button>
                            <button onClick={(e) => confirmDelete(e, proj.id)} className="flex-1 py-3 bg-[var(--error-hover-bg)] text-[var(--error-text)] text-[10px] font-bold uppercase tracking-wider transition-colors border border-[var(--error-border)]">永久删除</button>
                        </div>
                    </div>
                  )}

                  <div className="flex-1 p-6 relative flex flex-col">
                     <button onClick={(e) => requestDelete(e, proj.id)} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 p-2 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--error-text)] transition-all rounded-sm z-10" title="删除项目">
                        <Trash2 className="w-4 h-4" />
                    </button>
                     <div className="flex-1">
                        <Folder className="w-8 h-8 text-[var(--text-muted)] mb-6 group-hover:text-[var(--text-tertiary)] transition-colors" />
                        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2 line-clamp-1 tracking-wide">{proj.title}</h3>
                        <div className="flex flex-wrap gap-2 mb-4">
                            <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-primary)] px-1.5 py-0.5 uppercase tracking-wider">
                              <Users className="w-3 h-3 inline mr-1" />{proj.characterLibrary?.length || 0} 角色
                            </span>
                            <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-primary)] px-1.5 py-0.5 uppercase tracking-wider">
                              <Film className="w-3 h-3 inline mr-1" />多剧集
                            </span>
                        </div>
                        {proj.description && (
                            <p className="text-[10px] text-[var(--text-muted)] line-clamp-2 leading-relaxed font-mono border-l border-[var(--border-primary)] pl-2">{proj.description}</p>
                        )}
                     </div>
                  </div>

                  <div className="px-6 py-3 border-t border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-sunken)]">
                    <div className="flex items-center gap-2 text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-widest">
                        <Calendar className="w-3 h-3" />
                        {formatDate(proj.lastModified)}
                    </div>
                    <ChevronRight className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" />
                  </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Group QR Modal */}
      {showGroupQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/70 p-6" onClick={() => setShowGroupQr(false)}>
          <div
            className="relative w-full max-w-xl bg-[var(--bg-primary)] border border-[var(--border-primary)] p-6 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowGroupQr(false)}
              className="absolute right-4 top-4 p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="space-y-4 text-center">
              <div className="text-[var(--text-primary)] text-sm font-bold tracking-widest uppercase">加入交流群</div>
              <div className="text-[10px] text-[var(--text-tertiary)] font-mono">扫码进入产品体验群</div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <div>
                  <img src={qrCodeImg} alt="交流群二维码" className="w-56 h-56 object-contain" />
                </div>
                <div>
                  <img src={wxQrImg} alt="备用微信群二维码" className="w-56 h-56 object-contain" />
                </div>
              </div>
              <div className="text-[10px] text-[var(--text-muted)] font-mono">二维码有效期请以实际为准</div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/70 p-6" onClick={() => setShowSettingsModal(false)}>
          <div
            className="relative w-full max-w-xl bg-[var(--bg-primary)] border border-[var(--border-primary)] p-6 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowSettingsModal(false)}
              className="absolute right-4 top-4 p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-end justify-between border-b border-[var(--border-subtle)] pb-4 mb-6">
              <div>
                <h2 className="text-lg text-[var(--text-primary)] flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[var(--accent-text)]" />
                  系统设置
                  <span className="text-[var(--text-muted)] text-xs font-mono uppercase tracking-widest">Settings</span>
                </h2>
                <p className="text-xs text-[var(--text-tertiary)] mt-2">管理模型配置、资产库以及数据导入导出</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  navigate('/account');
                }}
                className="p-4 border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-left"
              >
                <div className="flex items-center gap-2 text-[var(--text-primary)] text-sm font-bold">
                  <User className="w-4 h-4 text-[var(--accent-text)]" />
                  账号中心
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-2">登录、注册、充值、令牌与日志</div>
              </button>

              {onShowModelConfig && (
                <button
                  onClick={() => {
                    setShowSettingsModal(false);
                    onShowModelConfig();
                  }}
                  className="p-4 border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-left"
                >
                  <div className="flex items-center gap-2 text-[var(--text-primary)] text-sm font-bold">
                    <Cpu className="w-4 h-4 text-[var(--accent-text)]" />
                    模型配置
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-2">管理模型与 API 设置</div>
                </button>
              )}

              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  setShowLibraryModal(true);
                }}
                className="p-4 border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-left"
              >
                <div className="flex items-center gap-2 text-[var(--text-primary)] text-sm font-bold">
                  <Archive className="w-4 h-4 text-[var(--accent-text)]" />
                  资产库
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-2">浏览并复用角色与场景资产</div>
              </button>

              <button
                onClick={handleExportData}
                disabled={isDataExporting}
                className="p-4 border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 text-[var(--text-primary)] text-sm font-bold">
                  <Database className="w-4 h-4 text-[var(--accent-text)]" />
                  导出数据
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-2">导出全部项目与资产库备份</div>
              </button>

              <button
                onClick={handleImportData}
                disabled={isDataImporting}
                className="p-4 border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 text-[var(--text-primary)] text-sm font-bold">
                  <Database className="w-4 h-4 text-[var(--accent-text)]" />
                  导入数据
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-2">导入全部项目与资产库备份</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Asset Library Modal */}
      {showLibraryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/70 p-6" onClick={() => setShowLibraryModal(false)}>
          <div
            className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-[var(--bg-primary)] border border-[var(--border-primary)] p-6 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowLibraryModal(false)}
              className="absolute right-4 top-4 p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-end justify-between border-b border-[var(--border-subtle)] pb-6 mb-6">
              <div>
                <h2 className="text-lg text-[var(--text-primary)] flex items-center gap-2">
                  <Archive className="w-4 h-4 text-[var(--accent-text)]" />
                  资产库
                  <span className="text-[var(--text-muted)] text-xs font-mono uppercase tracking-widest">Asset Library</span>
                </h2>
                <p className="text-xs text-[var(--text-tertiary)] mt-2">
                  在项目里将角色与场景加入资产库，跨项目复用
                </p>
              </div>
              <div className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-widest">
                {libraryItems.length} assets
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={libraryQuery}
                  onChange={(e) => setLibraryQuery(e.target.value)}
                  placeholder="搜索资产名称..."
                  className="w-full pl-9 pr-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-secondary)]"
                />
              </div>
              <div className="min-w-[180px]">
                <select
                  value={libraryProjectFilter}
                  onChange={(e) => setLibraryProjectFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-secondary)]"
                >
                  <option value="all">全部项目</option>
                  {projectNameOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                {(['all', 'character', 'scene', 'prop'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setLibraryFilter(type)}
                    className={`px-3 py-2 text-[10px] font-bold uppercase tracking-widest border rounded ${
                      libraryFilter === type
                        ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-[var(--btn-primary-bg)]'
                        : 'bg-transparent text-[var(--text-tertiary)] border-[var(--border-primary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)]'
                    }`}
                  >
                    {type === 'all' ? '全部' : type === 'character' ? '角色' : type === 'scene' ? '场景' : '道具'}
                  </button>
                ))}
              </div>
            </div>

            {isLibraryLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 text-[var(--text-muted)] animate-spin" />
              </div>
            ) : filteredLibraryItems.length === 0 ? (
              <div className="border border-dashed border-[var(--border-primary)] rounded-xl p-10 text-center text-[var(--text-muted)] text-sm">
                暂无资产。可在项目的“角色与场景”中加入资产库。
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredLibraryItems.map((item) => {
                  const preview =
                    item.type === 'character'
                      ? (item.data as Character).referenceImage
                      : item.type === 'scene'
                      ? (item.data as Scene).referenceImage
                      : (item.data as Prop).referenceImage;
                  return (
                    <div
                      key={item.id}
                      className="bg-[var(--bg-primary)] border border-[var(--border-primary)] hover:border-[var(--border-secondary)] transition-colors rounded-xl overflow-hidden"
                    >
                      <div className="aspect-video bg-[var(--bg-elevated)]">
                        {preview ? (
                          <img src={preview} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                            {item.type === 'character' ? (
                              <Users className="w-8 h-8 opacity-30" />
                            ) : item.type === 'scene' ? (
                              <MapPin className="w-8 h-8 opacity-30" />
                            ) : (
                              <Package className="w-8 h-8 opacity-30" />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="p-4 space-y-3">
                        <div>
                          <div className="text-sm text-[var(--text-primary)] font-bold line-clamp-1">{item.name}</div>
                          <div className="text-[10px] text-[var(--text-tertiary)] font-mono uppercase tracking-widest mt-1">
                            {item.type === 'character' ? '角色' : item.type === 'scene' ? '场景' : '道具'}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] font-mono mt-1 line-clamp-1">
                            {(item.projectName && item.projectName.trim()) || '未知项目'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setAssetToUse(item)}
                            className="flex-1 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                          >
                            选择项目使用
                          </button>
                          <button
                            onClick={() => handleDeleteLibraryItem(item.id)}
                            className="p-2 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--error-text)] hover:border-[var(--error-border)] rounded transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Asset Library Project Picker */}
      {assetToUse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/70 p-6" onClick={() => setAssetToUse(null)}>
          <div
            className="relative w-full max-w-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] p-6 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setAssetToUse(null)}
              className="absolute right-4 top-4 p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="space-y-4">
              <div className="text-[var(--text-primary)] text-sm font-bold tracking-widest uppercase">选择项目使用</div>
              <div className="text-[10px] text-[var(--text-tertiary)] font-mono">
                将资产“{assetToUse.name}”导入到以下项目
              </div>
              {projects.length === 0 ? (
                <div className="text-[var(--text-muted)] text-sm">暂无项目可用</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {projects.map((proj) => (
                    <button
                      key={proj.id}
                      onClick={() => handleUseAsset(proj.id)}
                      className="p-4 text-left border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-deep)] hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      <div className="text-sm text-[var(--text-primary)] font-bold line-clamp-1">{proj.title}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-1">最后修改: {formatDate(proj.lastModified)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleImportFileChange}
      />
    </div>
  );
};

export default Dashboard;
