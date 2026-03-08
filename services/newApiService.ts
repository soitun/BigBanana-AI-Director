const DEFAULT_NEW_API_ENDPOINT = String(import.meta.env.VITE_NEW_API_ENDPOINT ?? 'https://api.antsk.cn').trim() || 'https://api.antsk.cn';

const NEW_API_ENDPOINT_STORAGE_KEY = 'bigbanana_new_api_endpoint';
const NEW_API_SESSION_STORAGE_KEY = 'bigbanana_new_api_session';

const normalizeEndpoint = (endpoint: string): string => String(endpoint || '').trim().replace(/\/+$/, '');

const buildQueryString = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === '') return;
    query.set(key, String(value));
  });
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
};

const getStoredJson = <T>(key: string): T | null => {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const setStoredJson = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

export interface NewApiStatus {
  system_name?: string;
  server_address?: string;
  email_verification?: boolean;
  turnstile_check?: boolean;
  turnstile_site_key?: string;
  top_up_link?: string;
  quota_per_unit?: number;
  display_in_currency?: boolean;
  quota_display_type?: string;
  custom_currency_symbol?: string;
  custom_currency_exchange_rate?: number;
  version?: string;
}

export interface NewApiAuthUser {
  id: number;
  username: string;
  display_name?: string;
  role?: number;
  status?: number;
  group?: string;
  require_2fa?: boolean;
}

export interface NewApiUser {
  id: number;
  username: string;
  display_name?: string;
  role?: number;
  status?: number;
  email?: string;
  group?: string;
  quota?: number;
  used_quota?: number;
  request_count?: number;
  aff_code?: string;
  aff_count?: number;
  aff_quota?: number;
  aff_history_quota?: number;
  inviter_id?: number;
  permissions?: Record<string, unknown>;
}

export interface NewApiSession {
  endpoint: string;
  userId: number;
  username: string;
  accessToken: string;
  user?: NewApiUser;
}

export interface NewApiPage<T> {
  page: number;
  page_size: number;
  total: number;
  items: T[];
}

export interface NewApiPayMethod {
  name: string;
  type: string;
  color?: string;
  min_topup?: string | number;
}

export interface NewApiTopupInfo {
  enable_online_topup?: boolean;
  enable_stripe_topup?: boolean;
  enable_creem_topup?: boolean;
  creem_products?: string;
  pay_methods?: NewApiPayMethod[] | string;
  min_topup?: number;
  stripe_min_topup?: number;
  amount_options?: number[];
  discount?: Record<string, number>;
}

export interface NewApiToken {
  id: number;
  user_id: number;
  key: string;
  status: number;
  name: string;
  created_time: number;
  accessed_time: number;
  expired_time: number;
  remain_quota: number;
  unlimited_quota: boolean;
  model_limits_enabled: boolean;
  model_limits: string;
  allow_ips?: string | null;
  used_quota: number;
  group: string;
  cross_group_retry?: boolean;
}

export interface NewApiTokenCreatePayload {
  name: string;
  remain_quota: number;
  unlimited_quota: boolean;
  expired_time: number;
  group?: string;
  model_limits_enabled?: boolean;
  model_limits?: string;
  allow_ips?: string | null;
  cross_group_retry?: boolean;
}

export interface NewApiLog {
  id: number;
  user_id: number;
  created_at: number;
  type: number;
  content: string;
  username: string;
  token_name: string;
  model_name: string;
  quota: number;
  prompt_tokens: number;
  completion_tokens: number;
  use_time: number;
  is_stream: boolean;
  channel: number;
  channel_name?: string;
  token_id: number;
  group: string;
  ip?: string;
  request_id?: string;
  other?: string;
}

export interface NewApiLogStats {
  quota: number;
  rpm: number;
  tpm: number;
}

interface NewApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  url?: string;
}

export interface NewApiLoginResult {
  requireTwoFactor: boolean;
  session?: NewApiSession;
  user?: NewApiUser;
}

export interface NewApiLogsQuery {
  page?: number;
  pageSize?: number;
  type?: number;
  tokenName?: string;
  modelName?: string;
  group?: string;
  requestId?: string;
  startTimestamp?: number;
  endTimestamp?: number;
}

const unwrapEnvelope = <T>(payload: NewApiEnvelope<T>): T => {
  if (!payload.success) {
    throw new Error(payload.message || '请求失败');
  }
  return payload.data;
};

const proxyFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });

  const payload = (await response.json()) as T;
  if (!response.ok) {
    const message = (payload as { message?: string })?.message;
    throw new Error(message || `请求失败（${response.status}）`);
  }
  return payload;
};

const toSession = (endpoint: string, user: NewApiUser): NewApiSession => ({
  endpoint: normalizeEndpoint(endpoint),
  userId: user.id,
  username: user.username,
  accessToken: '',
  user,
});

const saveSession = (session: NewApiSession | null) => {
  if (!session) {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(NEW_API_SESSION_STORAGE_KEY);
    }
    return;
  }
  setStoredJson(NEW_API_SESSION_STORAGE_KEY, session);
};

export const getNewApiEndpoint = (): string => {
  if (typeof window === 'undefined') return normalizeEndpoint(DEFAULT_NEW_API_ENDPOINT);
  const stored = window.localStorage.getItem(NEW_API_ENDPOINT_STORAGE_KEY);
  return normalizeEndpoint(stored || DEFAULT_NEW_API_ENDPOINT);
};

export const setNewApiEndpoint = (endpoint: string): string => {
  const normalized = normalizeEndpoint(endpoint);
  if (!normalized) {
    throw new Error('EndPoint 不能为空');
  }
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(NEW_API_ENDPOINT_STORAGE_KEY, normalized);
  }
  return normalized;
};

export const getNewApiSession = (): NewApiSession | null => getStoredJson<NewApiSession>(NEW_API_SESSION_STORAGE_KEY);

export const clearNewApiSession = (): void => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(NEW_API_SESSION_STORAGE_KEY);
  }
};

export const fetchNewApiStatus = async (endpoint = getNewApiEndpoint()): Promise<NewApiStatus> => {
  const payload = await proxyFetch<NewApiEnvelope<NewApiStatus>>(`/api/new-api/status${buildQueryString({ endpoint })}`);
  return unwrapEnvelope(payload);
};

export const bootstrapNewApiSession = async (endpoint = getNewApiEndpoint()): Promise<NewApiSession | null> => {
  const payload = await proxyFetch<NewApiEnvelope<NewApiUser | null>>(`/api/new-api/session${buildQueryString({ endpoint })}`);
  const user = payload.data;
  if (!user) {
    saveSession(null);
    return null;
  }
  const session = toSession(endpoint, user);
  saveSession(session);
  return session;
};

export const sendNewApiVerificationCode = async (email: string, endpoint = getNewApiEndpoint()): Promise<void> => {
  const payload = await proxyFetch<NewApiEnvelope<null>>('/api/new-api/verification', {
    method: 'POST',
    body: JSON.stringify({ endpoint, email }),
  });
  unwrapEnvelope(payload);
};

export const registerNewApiUser = async (
  input: { username: string; password: string; email?: string; verification_code?: string; aff_code?: string },
  endpoint = getNewApiEndpoint(),
): Promise<void> => {
  const payload = await proxyFetch<NewApiEnvelope<null>>('/api/new-api/register', {
    method: 'POST',
    body: JSON.stringify({ endpoint, ...input }),
  });
  unwrapEnvelope(payload);
};

export const loginNewApiUser = async (
  input: { username: string; password: string },
  endpoint = getNewApiEndpoint(),
): Promise<NewApiLoginResult> => {
  const payload = await proxyFetch<NewApiEnvelope<NewApiAuthUser>>('/api/new-api/session/login', {
    method: 'POST',
    body: JSON.stringify({ endpoint, ...input }),
  });
  const authUser = unwrapEnvelope(payload);
  if (authUser.require_2fa) {
    return { requireTwoFactor: true };
  }
  const session = toSession(endpoint, authUser as NewApiUser);
  saveSession(session);
  return { requireTwoFactor: false, session, user: authUser as NewApiUser };
};

export const verifyNewApiTwoFactor = async (code: string, endpoint = getNewApiEndpoint()): Promise<NewApiLoginResult> => {
  const payload = await proxyFetch<NewApiEnvelope<NewApiAuthUser>>('/api/new-api/session/2fa', {
    method: 'POST',
    body: JSON.stringify({ endpoint, code }),
  });
  const authUser = unwrapEnvelope(payload);
  const session = toSession(endpoint, authUser as NewApiUser);
  saveSession(session);
  return { requireTwoFactor: false, session, user: authUser as NewApiUser };
};

export const logoutNewApiUser = async (): Promise<void> => {
  try {
    await proxyFetch<NewApiEnvelope<null>>('/api/new-api/session/logout', { method: 'POST' });
  } finally {
    saveSession(null);
  }
};

export const getNewApiSelf = async (endpoint = getNewApiEndpoint()): Promise<NewApiUser> => {
  const payload = await proxyFetch<NewApiEnvelope<NewApiUser>>('/api/new-api/self');
  const user = unwrapEnvelope(payload);
  saveSession(toSession(endpoint, user));
  return user;
};

export const getNewApiTopupInfo = async (): Promise<NewApiTopupInfo> => {
  const payload = await proxyFetch<NewApiEnvelope<NewApiTopupInfo>>('/api/new-api/topup/info');
  return unwrapEnvelope(payload);
};

export const requestNewApiAmount = async (amount: number): Promise<number> => {
  const payload = await proxyFetch<NewApiEnvelope<string | number>>('/api/new-api/amount', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
  const value = unwrapEnvelope(payload);
  return Number(value);
};

export const requestNewApiPay = async (amount: number, paymentMethod: string): Promise<{ url: string; params: Record<string, string> }> => {
  const payload = await proxyFetch<NewApiEnvelope<Record<string, string>>>('/api/new-api/pay', {
    method: 'POST',
    body: JSON.stringify({ amount, payment_method: paymentMethod }),
  });
  return {
    url: payload.url || '',
    params: unwrapEnvelope(payload) || {},
  };
};

export const redeemNewApiCode = async (code: string): Promise<number> => {
  const payload = await proxyFetch<NewApiEnvelope<number>>('/api/new-api/topup', {
    method: 'POST',
    body: JSON.stringify({ key: code }),
  });
  return unwrapEnvelope(payload);
};

export const getNewApiTokens = async (page = 1, pageSize = 10): Promise<NewApiPage<NewApiToken>> => {
  const payload = await proxyFetch<NewApiEnvelope<NewApiPage<NewApiToken>>>(`/api/new-api/tokens${buildQueryString({ p: page, size: pageSize })}`);
  return unwrapEnvelope(payload);
};

export const createNewApiToken = async (input: NewApiTokenCreatePayload): Promise<void> => {
  const payload = await proxyFetch<NewApiEnvelope<null>>('/api/new-api/tokens', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  unwrapEnvelope(payload);
};

export const updateNewApiTokenStatus = async (tokenId: number, status: number): Promise<void> => {
  const payload = await proxyFetch<NewApiEnvelope<NewApiToken>>(`/api/new-api/tokens/${tokenId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  unwrapEnvelope(payload);
};

export const deleteNewApiToken = async (tokenId: number): Promise<void> => {
  const payload = await proxyFetch<NewApiEnvelope<null>>(`/api/new-api/tokens/${tokenId}`, {
    method: 'DELETE',
  });
  unwrapEnvelope(payload);
};

export const getNewApiLogs = async (query: NewApiLogsQuery): Promise<NewApiPage<NewApiLog>> => {
  const payload = await proxyFetch<NewApiEnvelope<NewApiPage<NewApiLog>>>(`/api/new-api/logs${buildQueryString({
    p: query.page ?? 1,
    page_size: query.pageSize ?? 20,
    type: query.type ?? 2,
    token_name: query.tokenName,
    model_name: query.modelName,
    group: query.group,
    request_id: query.requestId,
    start_timestamp: query.startTimestamp,
    end_timestamp: query.endTimestamp,
  })}`);
  return unwrapEnvelope(payload);
};

export const getNewApiLogsStat = async (query: Omit<NewApiLogsQuery, 'page' | 'pageSize' | 'requestId'>): Promise<NewApiLogStats> => {
  const payload = await proxyFetch<NewApiEnvelope<NewApiLogStats>>(`/api/new-api/logs/stat${buildQueryString({
    type: query.type ?? 2,
    token_name: query.tokenName,
    model_name: query.modelName,
    group: query.group,
    start_timestamp: query.startTimestamp,
    end_timestamp: query.endTimestamp,
  })}`);
  return unwrapEnvelope(payload);
};

