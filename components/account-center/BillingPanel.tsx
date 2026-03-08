import React, { useMemo } from 'react';
import { CreditCard, ExternalLink, Loader2, RefreshCcw } from 'lucide-react';
import {
  NewApiPayMethod,
  NewApiSession,
  NewApiStatus,
  NewApiSubscriptionPlan,
  NewApiSubscriptionPlanItem,
  NewApiSubscriptionSummary,
  NewApiTopupInfo,
} from '../../services/newApiService';
import { formatPayableAmount, formatQuota } from './utils';
import { EmptyState, SectionCard, StatCard } from './ui';

interface BillingPanelProps {
  status: NewApiStatus | null;
  session: NewApiSession;
  topupInfo: NewApiTopupInfo | null;
  topupInfoLoading: boolean;
  walletLoading: boolean;
  paymentLoading: boolean;
  estimateLoading: boolean;
  estimateError: string | null;
  topupMethods: NewApiPayMethod[];
  subscriptionPlans: NewApiSubscriptionPlanItem[];
  subscriptionLoading: boolean;
  billingPreference: string;
  activeSubscriptions: NewApiSubscriptionSummary[];
  allSubscriptions: NewApiSubscriptionSummary[];
  selectedPaymentMethod: string;
  setSelectedPaymentMethod: React.Dispatch<React.SetStateAction<string>>;
  topupAmount: string;
  setTopupAmount: React.Dispatch<React.SetStateAction<string>>;
  payableAmount: number | null;
  redeemCode: string;
  setRedeemCode: React.Dispatch<React.SetStateAction<string>>;
  onOnlinePay: () => Promise<void>;
  onSubscriptionPay: (planId: number, paymentMethod: string) => Promise<void>;
  onRedeemCode: () => Promise<void>;
  onRefreshProfile: () => Promise<void>;
  onRefreshSubscriptions: () => Promise<unknown>;
}

const normalizeDisplayAmount = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

const getCurrencySymbol = (currency?: string, fallback = '￥') => {
  switch (String(currency || '').toUpperCase()) {
    case 'USD':
      return '$';
    case 'CNY':
    case 'RMB':
      return '¥';
    case 'EUR':
      return '€';
    default:
      return fallback;
  }
};

const formatSubscriptionPrice = (plan: NewApiSubscriptionPlan | undefined, status: NewApiStatus | null) => {
  const value = Number(plan?.price_amount ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '待配置';
  const symbol = getCurrencySymbol(plan?.currency, status?.custom_currency_symbol || '￥');
  return `${symbol}${normalizeDisplayAmount(value)}`;
};

const formatSubscriptionDuration = (plan: NewApiSubscriptionPlan | undefined) => {
  const unit = plan?.duration_unit || 'month';
  const value = Number(plan?.duration_value || 1);
  const unitLabels: Record<string, string> = {
    year: '年',
    month: '个月',
    day: '天',
    hour: '小时',
    custom: '自定义',
  };

  if (unit === 'custom') {
    const seconds = Number(plan?.custom_seconds || 0);
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} 天`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} 小时`;
    return `${seconds} 秒`;
  }

  return `${value} ${unitLabels[unit] || unit}`;
};

const formatSubscriptionResetPeriod = (plan: NewApiSubscriptionPlan | undefined) => {
  const period = plan?.quota_reset_period || 'never';
  if (period === 'never') return '不重置';
  if (period === 'daily') return '每天';
  if (period === 'weekly') return '每周';
  if (period === 'monthly') return '每月';
  if (period === 'custom') {
    const seconds = Number(plan?.quota_reset_custom_seconds || 0);
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} 天`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} 小时`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)} 分钟`;
    return `${seconds} 秒`;
  }
  return '不重置';
};

const formatPlanLimit = (limit: number | undefined) => {
  const value = Number(limit ?? 0);
  return Number.isFinite(value) && value > 0 ? `限购 ${value}` : null;
};

const formatBillingPreference = (value: string) => {
  switch (value) {
    case 'subscription_first':
      return '优先订阅';
    case 'subscription_only':
      return '仅用订阅';
    case 'wallet_only':
      return '仅用钱包';
    case 'wallet_first':
    default:
      return '优先钱包';
  }
};

const formatSubscriptionStatus = (status: string | undefined, isExpired: boolean) => {
  if (status === 'cancelled') return '已作废';
  if (status === 'active' && !isExpired) return '生效';
  return '已过期';
};

const formatSubscriptionEndPrefix = (status: string | undefined, isExpired: boolean) => {
  if (status === 'cancelled') return '作废于';
  if (status === 'active' && !isExpired) return '至';
  return '过期于';
};

const getRemainingDays = (subscription: NewApiSubscriptionSummary) => {
  const endTime = Number(subscription.subscription?.end_time || 0);
  if (!endTime) return 0;
  const now = Date.now() / 1000;
  return Math.max(0, Math.ceil((endTime - now) / 86400));
};

const getUsagePercent = (subscription: NewApiSubscriptionSummary) => {
  const total = Number(subscription.subscription?.amount_total || 0);
  const used = Number(subscription.subscription?.amount_used || 0);
  if (total <= 0) return 0;
  return Math.round((used / total) * 100);
};

const formatSubscriptionTime = (timestamp?: number) => {
  if (!timestamp) return '—';
  return new Date(timestamp * 1000).toLocaleString('zh-CN', { hour12: false });
};

const StatusPill: React.FC<{ active?: boolean; children: React.ReactNode }> = ({ active = false, children }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-tertiary)]'}`}>
    {children}
  </span>
);

export const BillingPanel: React.FC<BillingPanelProps> = ({
  status,
  session,
  topupInfo,
  topupInfoLoading,
  walletLoading,
  paymentLoading,
  estimateLoading,
  estimateError,
  topupMethods,
  subscriptionPlans,
  subscriptionLoading,
  billingPreference,
  activeSubscriptions,
  allSubscriptions,
  selectedPaymentMethod,
  setSelectedPaymentMethod,
  topupAmount,
  setTopupAmount,
  payableAmount,
  redeemCode,
  setRedeemCode,
  onOnlinePay,
  onSubscriptionPay,
  onRedeemCode,
  onRefreshProfile,
  onRefreshSubscriptions,
}) => {
  const amountOptions = topupInfo?.amount_options ?? [];
  const onlineTopupMethods = (topupInfo?.enable_online_topup === false ? [] : topupMethods).filter((method) => !['stripe', 'creem'].includes(method.type));
  const walletPayMethods = topupInfo?.enable_online_topup ? onlineTopupMethods : [];
  const hasPaymentMethod = onlineTopupMethods.length > 0;
  const hasSubscriptionPlans = subscriptionPlans.length > 0;
  const hasAnySubscription = allSubscriptions.length > 0;

  const paymentMethodTypes = new Set(topupMethods.map((method) => method.type));
  if (topupInfo?.enable_stripe_topup && subscriptionPlans.some((item) => item.plan?.stripe_price_id)) {
    paymentMethodTypes.add('stripe');
  }
  if (topupInfo?.enable_creem_topup && subscriptionPlans.some((item) => item.plan?.creem_product_id)) {
    paymentMethodTypes.add('creem');
  }

  const planTitleMap = useMemo(() => {
    const map = new Map<number, string>();
    subscriptionPlans.forEach((item) => {
      if (item.plan?.id) {
        map.set(item.plan.id, item.plan.title || '');
      }
    });
    return map;
  }, [subscriptionPlans]);

  const planPurchaseCountMap = useMemo(() => {
    const map = new Map<number, number>();
    allSubscriptions.forEach((item) => {
      const planId = item.subscription?.plan_id;
      if (!planId) return;
      map.set(planId, (map.get(planId) || 0) + 1);
    });
    return map;
  }, [allSubscriptions]);

  return (
    <div className="space-y-6">
      <SectionCard
        title="充值与余额"
        description="把充值、订阅、兑换码和余额刷新聚合到一个任务面板里，减少来回切换。"
        action={(
          <button
            onClick={() => void onRefreshProfile()}
            disabled={walletLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-primary)] px-4 py-2.5 text-sm transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-60"
          >
            {walletLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            刷新余额
          </button>
        )}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="当前余额" value={formatQuota(session.user?.quota, status)} hint="支付完成后可在这里立即确认到账" />
          <StatCard label="累计消耗" value={formatQuota(session.user?.used_quota, status)} hint="帮助你判断近期使用强度" />
          <StatCard label="支付方式" value={paymentMethodTypes.size || 0} hint={topupInfoLoading || subscriptionLoading ? '正在同步支付渠道' : '当前可选支付渠道数量'} />
        </div>
      </SectionCard>

      {(subscriptionLoading || hasSubscriptionPlans || hasAnySubscription) && (
        <SectionCard title="订阅充值" description="套餐有效期、额度重置、总额度和当前订阅展示与 new-api 页保持一致。">
          {subscriptionLoading ? (
            <div className="flex min-h-[220px] items-center justify-center text-[var(--text-tertiary)]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-base font-semibold text-[var(--text-primary)]">我的订阅</div>
                    {activeSubscriptions.length > 0 ? <StatusPill active>{activeSubscriptions.length} 个生效中</StatusPill> : <StatusPill>无生效</StatusPill>}
                    {allSubscriptions.length > activeSubscriptions.length && <StatusPill>{allSubscriptions.length - activeSubscriptions.length} 个已过期</StatusPill>}
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusPill>{formatBillingPreference(billingPreference)}</StatusPill>
                    <button
                      onClick={() => void onRefreshSubscriptions()}
                      disabled={subscriptionLoading}
                      className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-primary)] px-3 py-2 text-sm transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-60"
                    >
                      <RefreshCcw className={`h-4 w-4 ${subscriptionLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {hasAnySubscription ? (
                  <div className="mt-4 space-y-4 border-t border-[var(--border-primary)] pt-4">
                    {allSubscriptions.map((item, index) => {
                      const subscription = item.subscription;
                      const totalAmount = Number(subscription?.amount_total || 0);
                      const usedAmount = Number(subscription?.amount_used || 0);
                      const remainAmount = totalAmount > 0 ? Math.max(0, totalAmount - usedAmount) : 0;
                      const isExpired = Number(subscription?.end_time || 0) < Date.now() / 1000;
                      const isActive = subscription?.status === 'active' && !isExpired;
                      const title = subscription?.plan_id ? planTitleMap.get(subscription.plan_id) : '';

                      return (
                        <div key={subscription?.id || index} className={index > 0 ? 'border-t border-[var(--border-primary)] pt-4' : ''}>
                          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap items-center gap-2 text-[var(--text-secondary)]">
                              <span className="font-medium text-[var(--text-primary)]">{title ? `${title} · 订阅 #${subscription?.id}` : `订阅 #${subscription?.id}`}</span>
                              <StatusPill active={isActive}>{formatSubscriptionStatus(subscription?.status, isExpired)}</StatusPill>
                            </div>
                            {isActive && <span className="text-[var(--text-tertiary)]">剩余 {getRemainingDays(item)} 天</span>}
                          </div>

                          <div className="mt-2 text-sm text-[var(--text-tertiary)]">
                            {formatSubscriptionEndPrefix(subscription?.status, isExpired)} {formatSubscriptionTime(subscription?.end_time)}
                          </div>

                          <div className="mt-2 text-sm text-[var(--text-tertiary)]">
                            总额度:{' '}
                            {totalAmount > 0 ? (
                              <>
                                {formatQuota(usedAmount, status)}/{formatQuota(totalAmount, status)} · 剩余 {formatQuota(remainAmount, status)}
                                <span className="ml-2">已用 {getUsagePercent(item)}%</span>
                              </>
                            ) : '不限'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 text-sm text-[var(--text-tertiary)]">购买套餐后即可享受模型权益</div>
                )}
              </div>

              {hasSubscriptionPlans ? (
                <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                  {subscriptionPlans.map((item, index) => {
                    const plan = item.plan;
                    if (!plan?.id) return null;

                    const limit = Number(plan.max_purchase_per_user || 0);
                    const count = planPurchaseCountMap.get(plan.id) || 0;
                    const reachedLimit = limit > 0 && count >= limit;
                    const isRecommended = index === 0 && subscriptionPlans.length > 1;
                    const resetText = formatSubscriptionResetPeriod(plan);
                    const availableMethods = [
                      ...(plan.stripe_price_id && topupInfo?.enable_stripe_topup ? [{ key: 'stripe', label: 'Stripe' }] : []),
                      ...(plan.creem_product_id && topupInfo?.enable_creem_topup ? [{ key: 'creem', label: 'Creem' }] : []),
                      ...walletPayMethods.map((method) => ({ key: method.type, label: method.name })),
                    ];
                    const planBenefits = [
                      `有效期: ${formatSubscriptionDuration(plan)}`,
                      ...(resetText !== '不重置' ? [`额度重置: ${resetText}`] : []),
                      `总额度: ${Number(plan.total_amount || 0) > 0 ? formatQuota(Number(plan.total_amount || 0), status) : '不限'}`,
                      ...(formatPlanLimit(plan.max_purchase_per_user) ? [formatPlanLimit(plan.max_purchase_per_user) as string] : []),
                      ...(plan.upgrade_group ? [`升级分组: ${plan.upgrade_group}`] : []),
                    ];

                    return (
                      <div key={plan.id} className={`flex h-full flex-col rounded-2xl border bg-[var(--bg-secondary)] p-5 ${isRecommended ? 'border-[var(--accent)] shadow-[0_0_0_1px_rgba(99,102,241,0.35)]' : 'border-[var(--border-primary)]'}`}>
                        <div className="min-h-[72px]">
                          <div className="flex flex-wrap items-center gap-2">
                            {isRecommended && <span className="rounded-full bg-[var(--accent-bg)] px-2.5 py-1 text-xs text-[var(--accent-text)]">推荐</span>}
                            <div className="truncate text-2xl font-semibold text-[var(--text-primary)]">{plan.title || '订阅套餐'}</div>
                          </div>
                          {plan.subtitle && <div className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-tertiary)]">{plan.subtitle}</div>}
                        </div>

                        <div className="mt-6 text-4xl font-semibold text-[var(--text-primary)]">{formatSubscriptionPrice(plan, status)}</div>

                        <div className="mt-5 space-y-2 text-sm text-[var(--text-secondary)]">
                          {planBenefits.map((benefit) => (
                            <div key={benefit} className="flex items-start gap-2">
                              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-tertiary)]" />
                              <span>{benefit}</span>
                            </div>
                          ))}
                        </div>

                        <div className="mt-6 border-t border-[var(--border-primary)] pt-4">
                          {availableMethods.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {availableMethods.map((method) => (
                                <button
                                  key={`${plan.id}-${method.key}`}
                                  onClick={() => void onSubscriptionPay(plan.id, method.key)}
                                  disabled={paymentLoading || reachedLimit}
                                  className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-primary)] px-4 py-2.5 text-sm transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-60"
                                >
                                  {paymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                                  {reachedLimit ? '已达上限' : `立即订阅 · ${method.label}`}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-[var(--text-tertiary)]">当前套餐暂未配置可用支付渠道。</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : !hasAnySubscription ? (
                <EmptyState title="当前没有可购买订阅套餐" description="如果你已经在 new-api 后端配置了订阅商品，请确认当前账号具备查看套餐的权限。" />
              ) : null}
            </div>
          )}
        </SectionCard>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <SectionCard title="在线充值" description="金额会自动预估，无需额外点击计算，适合直接给钱包补充额度。">
          {topupInfoLoading ? (
            <div className="flex min-h-[240px] items-center justify-center text-[var(--text-tertiary)]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !hasPaymentMethod ? (
            <EmptyState title="当前没有可用钱包充值方式" description="如果你使用的是自建 new-api 实例，请先在后端配置在线支付渠道；订阅套餐和兑换码仍可在本页继续处理。" />
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {onlineTopupMethods.map((method) => (
                  <button
                    key={method.type}
                    onClick={() => setSelectedPaymentMethod(method.type)}
                    className={`rounded-2xl border px-4 py-4 text-left transition-colors ${selectedPaymentMethod === method.type ? 'border-[var(--accent)] bg-[var(--accent-bg)]' : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)]'}`}
                  >
                    <div className="font-semibold">{method.name}</div>
                    <div className="mt-1 text-xs text-[var(--text-tertiary)]">{method.type}</div>
                    {method.min_topup && <div className="mt-3 text-xs text-[var(--text-tertiary)]">最低充值：{method.min_topup}</div>}
                  </button>
                ))}
              </div>

              {amountOptions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {amountOptions.map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setTopupAmount(String(amount))}
                      className={`rounded-full border px-4 py-2 text-sm transition-colors ${String(amount) === topupAmount ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--accent-text)]' : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--border-secondary)] hover:text-[var(--text-primary)]'}`}
                    >
                      {`${normalizeDisplayAmount(amount)}$`}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  value={topupAmount}
                  onChange={(event) => setTopupAmount(event.target.value)}
                  placeholder="输入充值数量，例如 10"
                  className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 outline-none transition-colors focus:border-[var(--accent)]"
                />
                <button
                  onClick={() => void onOnlinePay()}
                  disabled={paymentLoading || !hasPaymentMethod}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] px-4 py-3 text-sm font-medium text-[var(--btn-primary-text)] transition-colors hover:bg-[var(--btn-primary-hover)] disabled:opacity-60"
                >
                  {paymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  立即支付
                </button>
              </div>

              <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-4">
                <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
                  <span>预估支付金额</span>
                  {estimateLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
                <div className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{estimateLoading ? '自动计算中…' : formatPayableAmount(payableAmount, status)}</div>
                <div className="mt-2 text-sm text-[var(--text-tertiary)] leading-6">
                  {estimateError || '如果你的后端设置了不同的币种和汇率，这里会自动按照当前 EndPoint 的展示规则计算。'}
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        <div className="space-y-6">
          <SectionCard
            title="兑换码"
            description="适合运营活动、手动发放额度，或从官方兑换码页购买后回到这里兑换。"
            action={status?.top_up_link ? (
              <a
                href={status.top_up_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-primary)] px-4 py-2.5 text-sm transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)]"
              >
                <ExternalLink className="h-4 w-4" />
                购买兑换码
              </a>
            ) : undefined}
          >
            <div className="space-y-3">
              <input
                value={redeemCode}
                onChange={(event) => setRedeemCode(event.target.value)}
                placeholder="输入兑换码"
                className="w-full rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 outline-none transition-colors focus:border-[var(--accent)]"
              />
              <button
                onClick={() => void onRedeemCode()}
                disabled={paymentLoading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border-primary)] px-4 py-3 transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-60"
              >
                {paymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                立即兑换
              </button>
            </div>
          </SectionCard>

          <SectionCard title="使用提示" description="按下面步骤完成在线充值或兑换码兑换，金额会自动更新。">
            <ul className="space-y-3 text-sm leading-6 text-[var(--text-secondary)]">
              <li>- 在线充值：先选择支付方式，再选择快捷金额或手动输入充值数量，确认无误后点击“立即支付”。</li>
              <li>- 金额说明：输入或切换充值数量后，下方“预估支付金额”会自动计算，无需额外操作。</li>
              <li>- 兑换码使用：已有兑换码时，直接在右上方输入兑换码并点击“立即兑换”。</li>
              <li>- 购买兑换码：如果还没有兑换码，可先点击“购买兑换码”，购买完成后返回此处兑换到账。</li>
              {topupInfo?.min_topup !== undefined && <li>- 当前最小充值数量：{topupInfo.min_topup}</li>}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
};
