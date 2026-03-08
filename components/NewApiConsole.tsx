import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Copy,
  CreditCard,
  ExternalLink,
  Key,
  Loader2,
  LogIn,
  Mail,
  Plus,
  Power,
  RefreshCcw,
  Search,
  Server,
  Shield,
  Trash2,
  User,
  UserPlus,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAlert } from './GlobalAlert';
import { setGlobalApiKey } from '../services/aiService';
import {
  NewApiLog,
  NewApiLogStats,
  NewApiPayMethod,
  NewApiSession,
  NewApiStatus,
  NewApiToken,
  bootstrapNewApiSession,
  clearNewApiSession,
  createNewApiToken,
  deleteNewApiToken,
  fetchNewApiStatus,
  getNewApiEndpoint,
  getNewApiLogs,
  getNewApiLogsStat,
  getNewApiSession,
  getNewApiSelf,
  getNewApiTokens,
  getNewApiTopupInfo,
  loginNewApiUser,
  logoutNewApiUser,
  redeemNewApiCode,
  registerNewApiUser,
  requestNewApiAmount,
  requestNewApiPay,
  sendNewApiVerificationCode,
  setNewApiEndpoint,
  updateNewApiTokenStatus,
  verifyNewApiTwoFactor,
} from '../services/newApiService';

type AuthTab = 'login' | 'register';

const TOKEN_STATUS_ENABLED = 1;
const TOKEN_STATUS_DISABLED = 2;
const TOKEN_STATUS_EXPIRED = 3;
const TOKEN_STATUS_EXHAUSTED = 4;

const formatDateTimeInput = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toUnixTimestamp = (value: string): number | undefined => {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return undefined;
  return Math.floor(timestamp / 1000);
};

const formatDateTime = (timestamp?: number) => {
  if (!timestamp) return '—';
  return new Date(timestamp * 1000).toLocaleString('zh-CN', { hour12: false });
};

const getQuotaPerUnit = (status: NewApiStatus | null) => {
  const value = Number(status?.quota_per_unit ?? 500000);
  return Number.isFinite(value) && value > 0 ? value : 500000;
};

const formatQuota = (quota: number | undefined, status: NewApiStatus | null) => {
  if (quota === undefined || quota === null) return '—';
  const credits = quota / getQuotaPerUnit(status);
  const symbol = status?.custom_currency_symbol || '$';
  const exchangeRate = Number(status?.custom_currency_exchange_rate ?? 1);

  if (status?.display_in_currency && Number.isFinite(exchangeRate) && exchangeRate > 0) {
    return `${symbol}${(credits * exchangeRate).toFixed(2)}`;
  }

  return `$${credits.toFixed(2)}`;
};

const creditsToQuota = (credits: number, status: NewApiStatus | null) => {
  return Math.max(0, Math.round(credits * getQuotaPerUnit(status)));
};

const maskTokenKey = (key: string) => {
  if (!key) return '—';
  if (key.length <= 8) return `sk-${key}`;
  return `sk-${key.slice(0, 4)}********${key.slice(-4)}`;
};

const normalizePayMethods = (value: NewApiPayMethod[] | string | undefined): NewApiPayMethod[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value) as NewApiPayMethod[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getTokenStatusMeta = (status: number) => {
  switch (status) {
    case TOKEN_STATUS_ENABLED:
      return { label: '已启用', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' };
    case TOKEN_STATUS_DISABLED:
      return { label: '已禁用', className: 'bg-slate-500/10 text-slate-300 border border-slate-500/30' };
    case TOKEN_STATUS_EXPIRED:
      return { label: '已过期', className: 'bg-amber-500/10 text-amber-400 border border-amber-500/30' };
    case TOKEN_STATUS_EXHAUSTED:
      return { label: '已耗尽', className: 'bg-rose-500/10 text-rose-400 border border-rose-500/30' };
    default:
      return { label: '未知', className: 'bg-slate-500/10 text-slate-300 border border-slate-500/30' };
  }
};

const submitPaymentForm = (url: string, params: Record<string, string>) => {
  const form = document.createElement('form');
  form.action = url;
  form.method = 'POST';
  form.target = '_blank';

  Object.entries(params).forEach(([key, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
};

const NewApiConsole: React.FC = () => {
  const navigate = useNavigate();
  const { showAlert } = useAlert();

  const [endpointInput, setEndpointInput] = useState(getNewApiEndpoint());
  const [activeEndpoint, setActiveEndpoint] = useState(getNewApiEndpoint());
  const [status, setStatus] = useState<NewApiStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [session, setSession] = useState<NewApiSession | null>(() => getNewApiSession());
  const [authTab, setAuthTab] = useState<AuthTab>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);

  const [loginForm, setLoginForm] = useState({ username: '', password: '', twoFactorCode: '' });
  const [registerForm, setRegisterForm] = useState({
    username: '',
    email: '',
    verificationCode: '',
    password: '',
    confirmPassword: '',
    affCode: '',
  });

  const [verificationLoading, setVerificationLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [topupInfoLoading, setTopupInfoLoading] = useState(false);
  const [payableAmount, setPayableAmount] = useState<number | null>(null);
  const [topupAmount, setTopupAmount] = useState('10');
  const [redeemCode, setRedeemCode] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [topupMethods, setTopupMethods] = useState<NewApiPayMethod[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(false);

  const [tokens, setTokens] = useState<NewApiToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokenPage, setTokenPage] = useState(1);
  const [tokenTotal, setTokenTotal] = useState(0);
  const [tokenPageSize] = useState(10);
  const [createTokenLoading, setCreateTokenLoading] = useState(false);
  const [tokenForm, setTokenForm] = useState({
    name: 'BigBanana',
    unlimitedQuota: true,
    creditsLimit: '5',
    expiredAt: '',
  });

  const defaultStart = useMemo(() => formatDateTimeInput(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), []);
  const defaultEnd = useMemo(() => formatDateTimeInput(new Date()), []);

  const [logType, setLogType] = useState(2);
  const [logStart, setLogStart] = useState(defaultStart);
  const [logEnd, setLogEnd] = useState(defaultEnd);
  const [logTokenName, setLogTokenName] = useState('');
  const [logModelName, setLogModelName] = useState('');
  const [logs, setLogs] = useState<NewApiLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logPage, setLogPage] = useState(1);
  const [logPageSize] = useState(20);
  const [logTotal, setLogTotal] = useState(0);
  const [logStats, setLogStats] = useState<NewApiLogStats | null>(null);
  const sessionUserId = session?.userId ?? null;

  const loadStatusAndSession = useCallback(async (endpoint: string, silent = false) => {
    setStatusLoading(true);
    try {
      const nextStatus = await fetchNewApiStatus(endpoint);
      setStatus(nextStatus);
    } catch (error) {
      setStatus(null);
      if (!silent) {
        showAlert(error instanceof Error ? error.message : '获取 new-api 状态失败', { type: 'error' });
      }
    }

    const nextSession = await bootstrapNewApiSession(endpoint);
    setSession(nextSession);
    setStatusLoading(false);
  }, [showAlert]);

  const refreshProfile = useCallback(async () => {
    setWalletLoading(true);
    try {
      const user = await getNewApiSelf(activeEndpoint);
      setSession((current) => current ? { ...current, user, username: user.username } : current);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '刷新账户信息失败', { type: 'error' });
    } finally {
      setWalletLoading(false);
    }
  }, [activeEndpoint, showAlert]);

  const loadTopupInfo = useCallback(async () => {
    setTopupInfoLoading(true);
    try {
      const info = await getNewApiTopupInfo();
      const payMethods = normalizePayMethods(info.pay_methods).filter((item) => item?.name && item?.type);
      setTopupMethods(payMethods);
      setSelectedPaymentMethod((current) => current || payMethods[0]?.type || '');
      if ((info.amount_options?.length || 0) > 0) {
        setTopupAmount((current) => current || String(info.amount_options?.[0] ?? '10'));
      }
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '获取充值配置失败', { type: 'error' });
    } finally {
      setTopupInfoLoading(false);
    }
  }, [showAlert]);

  const loadTokens = useCallback(async (page = 1) => {
    setTokensLoading(true);
    try {
      const payload = await getNewApiTokens(page, tokenPageSize);
      setTokens(payload.items || []);
      setTokenPage(payload.page || page);
      setTokenTotal(payload.total || 0);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '获取令牌列表失败', { type: 'error' });
    } finally {
      setTokensLoading(false);
    }
  }, [showAlert, tokenPageSize]);

  const loadLogs = useCallback(async (page = 1) => {
    setLogsLoading(true);
    try {
      const startTimestamp = toUnixTimestamp(logStart);
      const endTimestamp = toUnixTimestamp(logEnd);

      const [pageData, statsData] = await Promise.all([
        getNewApiLogs({
          page,
          pageSize: logPageSize,
          type: logType,
          tokenName: logTokenName,
          modelName: logModelName,
          startTimestamp,
          endTimestamp,
        }),
        getNewApiLogsStat({
          type: logType,
          tokenName: logTokenName,
          modelName: logModelName,
          startTimestamp,
          endTimestamp,
        }),
      ]);

      setLogs(pageData.items || []);
      setLogPage(pageData.page || page);
      setLogTotal(pageData.total || 0);
      setLogStats(statsData);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '获取使用日志失败', { type: 'error' });
    } finally {
      setLogsLoading(false);
    }
  }, [logEnd, logModelName, logPageSize, logStart, logTokenName, logType, showAlert]);

  useEffect(() => {
    loadStatusAndSession(activeEndpoint, true).catch(() => undefined);
  }, [activeEndpoint, loadStatusAndSession]);

  useEffect(() => {
    if (!sessionUserId) {
      setTokens([]);
      setLogs([]);
      setLogStats(null);
      return;
    }

    refreshProfile().catch(() => undefined);
    loadTopupInfo().catch(() => undefined);
    loadTokens(1).catch(() => undefined);
    loadLogs(1).catch(() => undefined);
  }, [sessionUserId, refreshProfile, loadTopupInfo, loadTokens, loadLogs]);

  const handleSaveEndpoint = async () => {
    try {
      const nextEndpoint = setNewApiEndpoint(endpointInput);
      clearNewApiSession();
      setSession(null);
      setNeedsTwoFactor(false);
      setActiveEndpoint(nextEndpoint);
      showAlert('EndPoint 已保存，登录态已按新地址重新初始化。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '保存 EndPoint 失败', { type: 'error' });
    }
  };

  const handleLogin = async () => {
    if (!loginForm.username.trim() || !loginForm.password.trim()) {
      showAlert('请输入用户名和密码。', { type: 'warning' });
      return;
    }
    if (status?.turnstile_check) {
      showAlert('当前 EndPoint 开启了 Turnstile 校验，本页暂未接入该组件，请先在 new-api 原站登录或关闭 Turnstile。', { type: 'warning' });
      return;
    }
    setAuthLoading(true);
    try {
      const result = await loginNewApiUser({ username: loginForm.username.trim(), password: loginForm.password }, activeEndpoint);
      if (result.requireTwoFactor) {
        setNeedsTwoFactor(true);
        showAlert('该账户开启了 2FA，请继续输入一次性验证码。', { type: 'info' });
        return;
      }
      setNeedsTwoFactor(false);
      setSession(result.session || null);
      showAlert('登录成功。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '登录失败', { type: 'error' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyTwoFactor = async () => {
    if (!loginForm.twoFactorCode.trim()) {
      showAlert('请输入 2FA 验证码。', { type: 'warning' });
      return;
    }
    setAuthLoading(true);
    try {
      const result = await verifyNewApiTwoFactor(loginForm.twoFactorCode.trim(), activeEndpoint);
      setNeedsTwoFactor(false);
      setSession(result.session || null);
      showAlert('登录成功。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '2FA 校验失败', { type: 'error' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!registerForm.username.trim()) {
      showAlert('请输入用户名。', { type: 'warning' });
      return;
    }
    if (registerForm.password.length < 8) {
      showAlert('密码长度至少 8 位。', { type: 'warning' });
      return;
    }
    if (registerForm.password !== registerForm.confirmPassword) {
      showAlert('两次输入的密码不一致。', { type: 'warning' });
      return;
    }
    if (status?.email_verification) {
      if (!registerForm.email.trim()) {
        showAlert('当前 EndPoint 开启了邮箱验证，请填写邮箱。', { type: 'warning' });
        return;
      }
      if (!registerForm.verificationCode.trim()) {
        showAlert('请输入邮箱验证码。', { type: 'warning' });
        return;
      }
    }
    if (status?.turnstile_check) {
      showAlert('当前 EndPoint 开启了 Turnstile 校验，本页暂未接入该组件，请先在 new-api 原站注册或关闭 Turnstile。', { type: 'warning' });
      return;
    }

    setAuthLoading(true);
    try {
      await registerNewApiUser({
        username: registerForm.username.trim(),
        password: registerForm.password,
        email: registerForm.email.trim() || undefined,
        verification_code: registerForm.verificationCode.trim() || undefined,
        aff_code: registerForm.affCode.trim() || undefined,
      }, activeEndpoint);
      setAuthTab('login');
      setLoginForm((current) => ({ ...current, username: registerForm.username.trim(), password: '' }));
      showAlert('注册成功，请直接登录。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '注册失败', { type: 'error' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSendVerificationCode = async () => {
    if (!registerForm.email.trim()) {
      showAlert('请先填写邮箱地址。', { type: 'warning' });
      return;
    }
    if (status?.turnstile_check) {
      showAlert('当前 EndPoint 开启了 Turnstile 校验，本页暂未接入该组件。', { type: 'warning' });
      return;
    }

    setVerificationLoading(true);
    try {
      await sendNewApiVerificationCode(registerForm.email.trim(), activeEndpoint);
      showAlert('验证码已发送，请检查邮箱。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '验证码发送失败', { type: 'error' });
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleLogout = async () => {
    setAuthLoading(true);
    try {
      await logoutNewApiUser();
      setSession(null);
      showAlert('已退出登录。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '退出登录失败', { type: 'error' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEstimateAmount = async () => {
    const amountValue = Number(topupAmount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      showAlert('请输入正确的充值数量。', { type: 'warning' });
      return;
    }

    setPaymentLoading(true);
    try {
      const amount = await requestNewApiAmount(amountValue);
      setPayableAmount(amount);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '获取支付金额失败', { type: 'error' });
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleOnlinePay = async () => {
    const amountValue = Number(topupAmount);
    if (!selectedPaymentMethod) {
      showAlert('请选择支付方式。', { type: 'warning' });
      return;
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      showAlert('请输入正确的充值数量。', { type: 'warning' });
      return;
    }

    setPaymentLoading(true);
    try {
      const { url, params } = await requestNewApiPay(amountValue, selectedPaymentMethod);
      if (!url) {
        throw new Error('支付链接为空');
      }
      submitPaymentForm(url, params);
      showAlert('支付页面已在新窗口中拉起。支付完成后可点击刷新余额。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '拉起支付失败', { type: 'error' });
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleRedeemCode = async () => {
    if (!redeemCode.trim()) {
      showAlert('请输入兑换码。', { type: 'warning' });
      return;
    }

    setPaymentLoading(true);
    try {
      const quota = await redeemNewApiCode(redeemCode.trim());
      setRedeemCode('');
      await refreshProfile();
      showAlert(`兑换成功，到账额度：${formatQuota(quota, status)}。`, { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '兑换失败', { type: 'error' });
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleCreateToken = async () => {
    if (!tokenForm.name.trim()) {
      showAlert('请输入令牌名称。', { type: 'warning' });
      return;
    }

    const creditsLimit = Number(tokenForm.creditsLimit || '0');
    if (!tokenForm.unlimitedQuota && (!Number.isFinite(creditsLimit) || creditsLimit < 0)) {
      showAlert('请输入正确的额度上限。', { type: 'warning' });
      return;
    }

    setCreateTokenLoading(true);
    try {
      await createNewApiToken({
        name: tokenForm.name.trim(),
        unlimited_quota: tokenForm.unlimitedQuota,
        remain_quota: tokenForm.unlimitedQuota ? 0 : creditsToQuota(creditsLimit, status),
        expired_time: tokenForm.expiredAt ? Math.floor(Date.parse(tokenForm.expiredAt) / 1000) : -1,
      });
      await loadTokens(1);
      setTokenForm({ name: 'BigBanana', unlimitedQuota: true, creditsLimit: '5', expiredAt: '' });
      showAlert('令牌已创建，请在列表中复制或直接设为当前创作 Key。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '创建令牌失败', { type: 'error' });
    } finally {
      setCreateTokenLoading(false);
    }
  };

  const handleToggleToken = async (token: NewApiToken) => {
    const nextStatus = token.status === TOKEN_STATUS_ENABLED ? TOKEN_STATUS_DISABLED : TOKEN_STATUS_ENABLED;
    setTokensLoading(true);
    try {
      await updateNewApiTokenStatus(token.id, nextStatus);
      await loadTokens(tokenPage);
      showAlert(nextStatus === TOKEN_STATUS_ENABLED ? '令牌已启用。' : '令牌已禁用。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '更新令牌状态失败', { type: 'error' });
    } finally {
      setTokensLoading(false);
    }
  };

  const handleDeleteToken = async (token: NewApiToken) => {
    showAlert(`确定删除令牌「${token.name}」吗？`, {
      type: 'warning',
      showCancel: true,
      onConfirm: async () => {
        try {
          await deleteNewApiToken(token.id);
          await loadTokens(Math.max(1, tokenPage));
          showAlert('令牌已删除。', { type: 'success' });
        } catch (error) {
          showAlert(error instanceof Error ? error.message : '删除令牌失败', { type: 'error' });
        }
      },
    });
  };

  const handleCopyToken = async (token: NewApiToken) => {
    const fullKey = `sk-${token.key}`;
    await navigator.clipboard.writeText(fullKey);
    showAlert('令牌已复制到剪贴板。', { type: 'success' });
  };

  const handleUseTokenInProject = (token: NewApiToken) => {
    const fullKey = `sk-${token.key}`;
    localStorage.setItem('antsk_api_key', fullKey);
    setGlobalApiKey(fullKey);
    showAlert('已将该令牌设为当前项目的全局 API Key。', { type: 'success' });
  };

  const totalTokenPages = Math.max(1, Math.ceil(tokenTotal / tokenPageSize));
  const totalLogPages = Math.max(1, Math.ceil(logTotal / logPageSize));
  const paymentMethodsAvailable = topupMethods.length > 0;

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回
            </button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">AntSK 账号中心</h1>
              <p className="text-sm text-[var(--text-tertiary)] mt-2">
                在当前项目内直接完成登录、注册、充值、创建秘钥、查看使用日志。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => loadStatusAndSession(activeEndpoint).catch(() => undefined)}
              className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--border-primary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <RefreshCcw className={`w-4 h-4 ${statusLoading ? 'animate-spin' : ''}`} />
              刷新状态
            </button>
            {session && (
              <button
                onClick={handleLogout}
                disabled={authLoading}
                className="inline-flex items-center gap-2 px-4 py-2 border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-60"
              >
                <Power className="w-4 h-4" />
                退出登录
              </button>
            )}
          </div>
        </header>

        <section className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
          <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Server className="w-4 h-4 text-[var(--accent-text)]" />
              云端 EndPoint
            </div>
            <div className="flex flex-col md:flex-row gap-3">
              <input
                value={endpointInput}
                onChange={(event) => setEndpointInput(event.target.value)}
                placeholder="https://api.antsk.cn"
                className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none focus:border-[var(--accent)] font-mono text-sm"
              />
              <button
                onClick={handleSaveEndpoint}
                className="px-5 py-3 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] transition-colors"
              >
                保存并重连
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
                <div className="text-[var(--text-tertiary)] text-xs uppercase tracking-widest">System</div>
                <div className="mt-2 font-semibold">{status?.system_name || '未连接'}</div>
              </div>
              <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
                <div className="text-[var(--text-tertiary)] text-xs uppercase tracking-widest">Version</div>
                <div className="mt-2 font-semibold">{status?.version || '—'}</div>
              </div>
              <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
                <div className="text-[var(--text-tertiary)] text-xs uppercase tracking-widest">Session</div>
                <div className="mt-2 font-semibold">{session ? `已登录 · ${session.username}` : '未登录'}</div>
              </div>
            </div>
            {status?.turnstile_check && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                当前 EndPoint 开启了 Turnstile。当前账号中心通过本站同源代理接入 `new-api`，但还没有内嵌 Turnstile 组件；如需直接在本页完成登录/注册，建议先在 `new-api` 端关闭 Turnstile，或后续把校验组件嵌进当前站点。
              </div>
            )}
          </div>

          <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Shield className="w-4 h-4 text-[var(--accent-text)]" />
              接入说明
            </div>
            <ul className="space-y-3 text-sm text-[var(--text-secondary)] leading-6">
              <li>- 登录成功后，浏览器只保存本站会话，`new-api` 的登录 Cookie 由本站代理在服务端托管，后续调用不需要再跳转到 new-api 控制台。</li>
              <li>- 你可以把创建出的令牌一键设为当前项目的 `Global API Key`，创作链路直接复用。</li>
              <li>- 当前线上 `https://api.antsk.cn` 已开启邮箱验证码注册，未开启 Turnstile。</li>
              <li>- 支付仍然走 new-api 的支付网关，只是从当前页面直接拉起，不再跳去 new-api 控制台操作。</li>
            </ul>
          </div>
        </section>

        {!session ? (
          <section className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
            <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-5">
              <div className="flex gap-2">
                <button
                  onClick={() => { setAuthTab('login'); setNeedsTwoFactor(false); }}
                  className={`px-4 py-2 rounded-xl text-sm transition-colors ${authTab === 'login' ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                  <span className="inline-flex items-center gap-2"><LogIn className="w-4 h-4" /> 登录</span>
                </button>
                <button
                  onClick={() => { setAuthTab('register'); setNeedsTwoFactor(false); }}
                  className={`px-4 py-2 rounded-xl text-sm transition-colors ${authTab === 'register' ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                  <span className="inline-flex items-center gap-2"><UserPlus className="w-4 h-4" /> 注册</span>
                </button>
              </div>

              {authTab === 'login' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm mb-2 text-[var(--text-secondary)]">用户名或邮箱</label>
                    <input
                      value={loginForm.username}
                      onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                      className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none focus:border-[var(--accent)]"
                      placeholder="请输入用户名或邮箱"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-2 text-[var(--text-secondary)]">密码</label>
                    <input
                      type="password"
                      value={loginForm.password}
                      onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                      className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none focus:border-[var(--accent)]"
                      placeholder="请输入密码"
                    />
                  </div>

                  {needsTwoFactor && (
                    <div>
                      <label className="block text-sm mb-2 text-[var(--text-secondary)]">2FA 验证码</label>
                      <input
                        value={loginForm.twoFactorCode}
                        onChange={(event) => setLoginForm((current) => ({ ...current, twoFactorCode: event.target.value }))}
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none focus:border-[var(--accent)]"
                        placeholder="请输入 6 位验证码或备用码"
                      />
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={needsTwoFactor ? handleVerifyTwoFactor : handleLogin}
                      disabled={authLoading}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] px-4 py-3 hover:bg-[var(--btn-primary-hover)] transition-colors disabled:opacity-60"
                    >
                      {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                      {needsTwoFactor ? '完成验证' : '立即登录'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm mb-2 text-[var(--text-secondary)]">用户名</label>
                    <input
                      value={registerForm.username}
                      onChange={(event) => setRegisterForm((current) => ({ ...current, username: event.target.value }))}
                      className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none focus:border-[var(--accent)]"
                      placeholder="建议使用可识别的用户名"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2 text-[var(--text-secondary)]">邮箱{status?.email_verification ? '（必填）' : '（选填）'}</label>
                    <div className="flex gap-3">
                      <input
                        type="email"
                        value={registerForm.email}
                        onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))}
                        className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none focus:border-[var(--accent)]"
                        placeholder="请输入邮箱地址"
                      />
                      {status?.email_verification && (
                        <button
                          onClick={handleSendVerificationCode}
                          disabled={verificationLoading}
                          className="px-4 py-3 rounded-xl border border-[var(--border-primary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-60"
                        >
                          {verificationLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {status?.email_verification && (
                    <div>
                      <label className="block text-sm mb-2 text-[var(--text-secondary)]">邮箱验证码</label>
                      <input
                        value={registerForm.verificationCode}
                        onChange={(event) => setRegisterForm((current) => ({ ...current, verificationCode: event.target.value }))}
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none focus:border-[var(--accent)]"
                        placeholder="请输入邮箱验证码"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm mb-2 text-[var(--text-secondary)]">密码</label>
                      <input
                        type="password"
                        value={registerForm.password}
                        onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))}
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none focus:border-[var(--accent)]"
                        placeholder="至少 8 位"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-2 text-[var(--text-secondary)]">确认密码</label>
                      <input
                        type="password"
                        value={registerForm.confirmPassword}
                        onChange={(event) => setRegisterForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none focus:border-[var(--accent)]"
                        placeholder="再次输入密码"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm mb-2 text-[var(--text-secondary)]">邀请码（选填）</label>
                    <input
                      value={registerForm.affCode}
                      onChange={(event) => setRegisterForm((current) => ({ ...current, affCode: event.target.value }))}
                      className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none focus:border-[var(--accent)]"
                      placeholder="有邀请码可填写"
                    />
                  </div>

                  <button
                    onClick={handleRegister}
                    disabled={authLoading}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] px-4 py-3 hover:bg-[var(--btn-primary-hover)] transition-colors disabled:opacity-60"
                  >
                    {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    创建账号
                  </button>
                </div>
              )}
            </div>

            <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="w-4 h-4 text-[var(--accent-text)]" />
                为什么推荐在这里集成
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
                  <div className="font-semibold">更顺滑的登录链路</div>
                  <div className="text-[var(--text-tertiary)] mt-2 leading-6">用户不用再跳去 `new-api` 控制台完成注册和登录，创作中断会少很多。</div>
                </div>
                <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
                  <div className="font-semibold">令牌直接回填创作</div>
                  <div className="text-[var(--text-tertiary)] mt-2 leading-6">创建出的令牌可以一键设为当前项目 API Key，减少复制粘贴与配置错误。</div>
                </div>
                <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
                  <div className="font-semibold">充值动作就在当前站点</div>
                  <div className="text-[var(--text-tertiary)] mt-2 leading-6">支付仍走 new-api 原有计费链路，但体验是当前页面发起，不需要离开创作工具。</div>
                </div>
                <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
                  <div className="font-semibold">可切换不同云端</div>
                  <div className="text-[var(--text-tertiary)] mt-2 leading-6">上面的 EndPoint 独立可配置，后续你换成别的 `new-api` 实例也能继续用。</div>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl p-5">
                <div className="text-xs uppercase tracking-widest text-[var(--text-tertiary)]">当前用户</div>
                <div className="mt-3 text-xl font-semibold">{session.user?.display_name || session.user?.username || session.username}</div>
                <div className="mt-1 text-sm text-[var(--text-tertiary)]">{session.user?.email || '未绑定邮箱'}</div>
              </div>
              <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl p-5">
                <div className="text-xs uppercase tracking-widest text-[var(--text-tertiary)]">余额</div>
                <div className="mt-3 text-xl font-semibold">{formatQuota(session.user?.quota, status)}</div>
                <div className="mt-1 text-sm text-[var(--text-tertiary)]">已消耗：{formatQuota(session.user?.used_quota, status)}</div>
              </div>
              <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl p-5">
                <div className="text-xs uppercase tracking-widest text-[var(--text-tertiary)]">请求次数</div>
                <div className="mt-3 text-xl font-semibold">{session.user?.request_count ?? 0}</div>
                <div className="mt-1 text-sm text-[var(--text-tertiary)]">用户组：{session.user?.group || 'default'}</div>
              </div>
              <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl p-5 flex flex-col justify-between">
                <div>
                  <div className="text-xs uppercase tracking-widest text-[var(--text-tertiary)]">账户同步</div>
                  <div className="mt-3 text-xl font-semibold">实时刷新</div>
                  <div className="mt-1 text-sm text-[var(--text-tertiary)]">支付后点这里更新余额与账单状态</div>
                </div>
                <button
                  onClick={refreshProfile}
                  disabled={walletLoading}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border-primary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] px-4 py-3 transition-colors disabled:opacity-60"
                >
                  {walletLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                  刷新余额
                </button>
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-[0.92fr_1.08fr] gap-6">
              <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CreditCard className="w-4 h-4 text-[var(--accent-text)]" />
                  充值与兑换
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {topupMethods.map((method) => (
                    <button
                      key={method.type}
                      onClick={() => setSelectedPaymentMethod(method.type)}
                      className={`rounded-xl border px-4 py-3 text-left transition-colors ${selectedPaymentMethod === method.type ? 'border-[var(--accent)] bg-[var(--accent-bg)]' : 'border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-secondary)]'}`}
                    >
                      <div className="font-semibold">{method.name}</div>
                      <div className="text-xs text-[var(--text-tertiary)] mt-1">{method.type}</div>
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  <label className="block text-sm text-[var(--text-secondary)]">充值数量</label>
                  <div className="flex flex-col md:flex-row gap-3">
                    <input
                      value={topupAmount}
                      onChange={(event) => setTopupAmount(event.target.value)}
                      className="min-w-[200px] flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none focus:border-[var(--accent)]"
                      placeholder="例如 10"
                    />
                    <button
                      onClick={handleEstimateAmount}
                      disabled={paymentLoading || topupInfoLoading}
                      className="px-4 py-3 rounded-xl border border-[var(--border-primary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-60"
                    >
                      计算金额
                    </button>
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    预估支付金额：<span className="font-semibold">{payableAmount === null ? '未计算' : `${status?.custom_currency_symbol || '￥'}${payableAmount.toFixed(2)}`}</span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleOnlinePay}
                      disabled={paymentLoading || !paymentMethodsAvailable}
                      className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] transition-colors disabled:opacity-60"
                    >
                      {paymentLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                      立即支付
                    </button>
                    {status?.top_up_link && (
                      <a
                        href={status.top_up_link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-[var(--border-primary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        打开官方充值页
                      </a>
                    )}
                  </div>
                </div>

                <div className="border-t border-[var(--border-primary)] pt-5 space-y-3">
                  <label className="block text-sm text-[var(--text-secondary)]">兑换码</label>
                  <div className="flex flex-col md:flex-row gap-3">
                    <input
                      value={redeemCode}
                      onChange={(event) => setRedeemCode(event.target.value)}
                      className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none focus:border-[var(--accent)]"
                      placeholder="输入兑换码直接入账"
                    />
                    <button
                      onClick={handleRedeemCode}
                      disabled={paymentLoading}
                      className="px-4 py-3 rounded-xl border border-[var(--border-primary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-60"
                    >
                      立即兑换
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Key className="w-4 h-4 text-[var(--accent-text)]" />
                    令牌管理
                  </div>
                  <button
                    onClick={() => loadTokens(tokenPage).catch(() => undefined)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border-primary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <RefreshCcw className="w-4 h-4" />
                    刷新令牌
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input
                    value={tokenForm.name}
                    onChange={(event) => setTokenForm((current) => ({ ...current, name: event.target.value }))}
                    className="md:col-span-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none focus:border-[var(--accent)]"
                    placeholder="令牌名称"
                  />
                  <input
                    value={tokenForm.creditsLimit}
                    onChange={(event) => setTokenForm((current) => ({ ...current, creditsLimit: event.target.value }))}
                    disabled={tokenForm.unlimitedQuota}
                    className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none focus:border-[var(--accent)] disabled:opacity-50"
                    placeholder="额度上限（例如 5）"
                  />
                  <input
                    type="datetime-local"
                    value={tokenForm.expiredAt}
                    onChange={(event) => setTokenForm((current) => ({ ...current, expiredAt: event.target.value }))}
                    className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={tokenForm.unlimitedQuota}
                      onChange={(event) => setTokenForm((current) => ({ ...current, unlimitedQuota: event.target.checked }))}
                    />
                    无限额度
                  </label>
                  <button
                    onClick={handleCreateToken}
                    disabled={createTokenLoading}
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] transition-colors disabled:opacity-60"
                  >
                    {createTokenLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    创建令牌
                  </button>
                </div>

                <div className="space-y-3">
                  {tokensLoading ? (
                    <div className="flex items-center justify-center py-10 text-[var(--text-tertiary)]">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  ) : tokens.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--border-primary)] px-4 py-8 text-center text-[var(--text-tertiary)]">
                      暂无令牌，先创建一个新的用于当前项目。
                    </div>
                  ) : tokens.map((token) => {
                    const statusMeta = getTokenStatusMeta(token.status);
                    return (
                      <div key={token.id} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 space-y-3">
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-3">
                              <div className="font-semibold">{token.name}</div>
                              <span className={`px-2.5 py-1 rounded-full text-xs ${statusMeta.className}`}>{statusMeta.label}</span>
                            </div>
                            <div className="text-sm text-[var(--text-tertiary)] mt-1 font-mono">{maskTokenKey(token.key)}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => handleCopyToken(token).catch(() => undefined)}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border-primary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                            >
                              <Copy className="w-4 h-4" />
                              复制
                            </button>
                            <button
                              onClick={() => handleUseTokenInProject(token)}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border-primary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                            >
                              <User className="w-4 h-4" />
                              设为当前创作 Key
                            </button>
                            {(token.status === TOKEN_STATUS_ENABLED || token.status === TOKEN_STATUS_DISABLED) && (
                              <button
                                onClick={() => handleToggleToken(token).catch(() => undefined)}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border-primary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                              >
                                <Power className="w-4 h-4" />
                                {token.status === TOKEN_STATUS_ENABLED ? '禁用' : '启用'}
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteToken(token)}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              删除
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <div className="text-[var(--text-tertiary)] text-xs">剩余额度</div>
                            <div className="mt-1 font-semibold">{token.unlimited_quota ? '无限额度' : formatQuota(token.remain_quota, status)}</div>
                          </div>
                          <div>
                            <div className="text-[var(--text-tertiary)] text-xs">已用额度</div>
                            <div className="mt-1 font-semibold">{formatQuota(token.used_quota, status)}</div>
                          </div>
                          <div>
                            <div className="text-[var(--text-tertiary)] text-xs">创建时间</div>
                            <div className="mt-1 font-semibold">{formatDateTime(token.created_time)}</div>
                          </div>
                          <div>
                            <div className="text-[var(--text-tertiary)] text-xs">过期时间</div>
                            <div className="mt-1 font-semibold">{token.expired_time === -1 ? '永不过期' : formatDateTime(token.expired_time)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {tokenTotal > tokenPageSize && (
                  <div className="flex items-center justify-between text-sm text-[var(--text-secondary)] pt-2">
                    <span>第 {tokenPage} / {totalTokenPages} 页，共 {tokenTotal} 条</span>
                    <div className="flex gap-2">
                      <button onClick={() => loadTokens(Math.max(1, tokenPage - 1)).catch(() => undefined)} disabled={tokenPage <= 1} className="px-3 py-2 rounded-xl border border-[var(--border-primary)] disabled:opacity-40">上一页</button>
                      <button onClick={() => loadTokens(Math.min(totalTokenPages, tokenPage + 1)).catch(() => undefined)} disabled={tokenPage >= totalTokenPages} className="px-3 py-2 rounded-xl border border-[var(--border-primary)] disabled:opacity-40">下一页</button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Activity className="w-4 h-4 text-[var(--accent-text)]" />
                  使用日志
                </div>
                <div className="flex flex-wrap gap-3">
                  <select value={logType} onChange={(event) => setLogType(Number(event.target.value))} className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-3 py-2 outline-none">
                    <option value={0}>全部类型</option>
                    <option value={2}>消费日志</option>
                    <option value={5}>错误日志</option>
                    <option value={1}>充值日志</option>
                  </select>
                  <button onClick={() => loadLogs(1).catch(() => undefined)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border-primary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] transition-colors">
                    <Search className="w-4 h-4" />
                    查询
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <input type="datetime-local" value={logStart} onChange={(event) => setLogStart(event.target.value)} className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none" />
                <input type="datetime-local" value={logEnd} onChange={(event) => setLogEnd(event.target.value)} className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none" />
                <input value={logTokenName} onChange={(event) => setLogTokenName(event.target.value)} placeholder="按令牌名称筛选" className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none" />
                <input value={logModelName} onChange={(event) => setLogModelName(event.target.value)} placeholder="按模型名称筛选" className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 outline-none" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] p-4"><div className="text-xs text-[var(--text-tertiary)] uppercase tracking-widest">消耗额度</div><div className="mt-2 text-xl font-semibold">{formatQuota(logStats?.quota, status)}</div></div>
                <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] p-4"><div className="text-xs text-[var(--text-tertiary)] uppercase tracking-widest">RPM</div><div className="mt-2 text-xl font-semibold">{logStats?.rpm ?? 0}</div></div>
                <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] p-4"><div className="text-xs text-[var(--text-tertiary)] uppercase tracking-widest">TPM</div><div className="mt-2 text-xl font-semibold">{logStats?.tpm ?? 0}</div></div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-[var(--border-primary)]">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--bg-secondary)] text-[var(--text-tertiary)]"><tr><th className="text-left px-4 py-3 font-medium">时间</th><th className="text-left px-4 py-3 font-medium">令牌</th><th className="text-left px-4 py-3 font-medium">模型</th><th className="text-left px-4 py-3 font-medium">输入/输出</th><th className="text-left px-4 py-3 font-medium">花费</th><th className="text-left px-4 py-3 font-medium">详情</th></tr></thead>
                  <tbody>
                    {logsLoading ? (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-[var(--text-tertiary)]"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></td></tr>
                    ) : logs.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-[var(--text-tertiary)]">当前筛选条件下暂无日志。</td></tr>
                    ) : logs.map((log) => (
                      <tr key={log.id} className="border-t border-[var(--border-primary)] align-top">
                        <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                        <td className="px-4 py-3">{log.token_name || '—'}</td>
                        <td className="px-4 py-3">{log.model_name || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{log.prompt_tokens ?? 0} / {log.completion_tokens ?? 0}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatQuota(log.quota, status)}</td>
                        <td className="px-4 py-3 max-w-[420px] text-[var(--text-secondary)] break-words">{log.content || log.request_id || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {logTotal > logPageSize && (
                <div className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
                  <span>第 {logPage} / {totalLogPages} 页，共 {logTotal} 条</span>
                  <div className="flex gap-2">
                    <button onClick={() => loadLogs(Math.max(1, logPage - 1)).catch(() => undefined)} disabled={logPage <= 1} className="px-3 py-2 rounded-xl border border-[var(--border-primary)] disabled:opacity-40">上一页</button>
                    <button onClick={() => loadLogs(Math.min(totalLogPages, logPage + 1)).catch(() => undefined)} disabled={logPage >= totalLogPages} className="px-3 py-2 rounded-xl border border-[var(--border-primary)] disabled:opacity-40">下一页</button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default NewApiConsole;
