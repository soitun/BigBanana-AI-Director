import crypto from 'node:crypto';

const SESSION_COOKIE_NAME = 'bigbanana_new_api_sid';
const SESSION_TTL_SECONDS = Number.parseInt(process.env.NEW_API_PROXY_SESSION_TTL || '604800', 10);
const ALLOW_PRIVATE_HOSTS = String(process.env.NEW_API_ALLOW_PRIVATE_HOSTS || '').toLowerCase() === 'true';
const ALLOWED_HOST_SUFFIXES = String(process.env.NEW_API_ALLOWED_HOSTS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

const sessions = new Map();

const json = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  return JSON.parse(text);
};

const parseCookieHeader = (cookieHeader = '') => {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex <= 0) return acc;

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      acc[key] = value;
      return acc;
    }, {});
};

const cookieJarToHeader = (jar = {}) => {
  return Object.entries(jar)
    .filter(([key, value]) => key && value)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
};

const mergeSetCookieIntoJar = (jar, response) => {
  const getSetCookie = response.headers.getSetCookie?.bind(response.headers);
  const lines = typeof getSetCookie === 'function'
    ? getSetCookie()
    : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);

  lines.forEach((line) => {
    if (!line) return;

    const firstPart = String(line).split(';', 1)[0]?.trim();
    const separatorIndex = firstPart.indexOf('=');
    if (separatorIndex <= 0) return;

    const key = firstPart.slice(0, separatorIndex).trim();
    const value = firstPart.slice(separatorIndex + 1).trim();
    if (!key) return;

    jar[key] = value;
  });
};

const isPrivateHostname = (hostname) => {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower === '::1') return true;
  if (/^127\./.test(lower)) return true;
  if (/^10\./.test(lower)) return true;
  if (/^192\.168\./.test(lower)) return true;

  const match172 = lower.match(/^172\.(\d+)\./);
  if (match172) {
    const secondOctet = Number.parseInt(match172[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }

  return false;
};

const normalizeEndpoint = (value) => String(value || '').trim().replace(/\/+$/, '');

const validateEndpoint = (value) => {
  const normalized = normalizeEndpoint(value);
  if (!normalized) {
    throw new Error('缺少 EndPoint');
  }

  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error('EndPoint 格式不正确');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('EndPoint 仅支持 http/https');
  }

  if (!ALLOW_PRIVATE_HOSTS && isPrivateHostname(url.hostname)) {
    throw new Error('不允许访问私网或本地地址');
  }

  if (ALLOWED_HOST_SUFFIXES.length > 0) {
    const hostname = url.hostname.toLowerCase();
    const allowed = ALLOWED_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
    if (!allowed) {
      throw new Error('该 EndPoint 不在允许列表中');
    }
  }

  return normalized;
};

const getCookieSecureFlag = (req) => {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  if (forwardedProto === 'https') return true;
  return Boolean(req.socket?.encrypted);
};

const setSessionCookie = (req, res, sessionId) => {
  const secure = getCookieSecureFlag(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=${sessionId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];

  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
};

const clearSessionCookie = (req, res) => {
  const secure = getCookieSecureFlag(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];

  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
};

const cleanupExpiredSessions = () => {
  const now = Date.now();
  for (const [key, session] of sessions.entries()) {
    if (!session?.expiresAt || session.expiresAt <= now) {
      sessions.delete(key);
    }
  }
};

const getLocalSession = (req) => {
  cleanupExpiredSessions();

  const cookies = parseCookieHeader(req.headers.cookie || '');
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (!sessionId) return null;

  const session = sessions.get(sessionId);
  if (!session) return null;

  session.expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  return { sessionId, session };
};

const saveLocalSession = (session) => {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, {
    ...session,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  });
  return sessionId;
};

const updateLocalSession = (sessionId, patch) => {
  const current = sessions.get(sessionId);
  if (!current) return;

  sessions.set(sessionId, {
    ...current,
    ...patch,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  });
};

const destroyLocalSession = (sessionId) => {
  if (!sessionId) return;
  sessions.delete(sessionId);
};

const buildQueryString = (params = {}) => {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
};

const parseUpstreamJson = async (response) => {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { success: false, message: text, data: null };
  }
};

const normalizeUpstreamEnvelope = (response, payload) => {
  if (payload && typeof payload === 'object' && 'success' in payload) {
    return payload;
  }

  if (payload === null) {
    return {
      success: response.ok,
      message: response.ok ? '' : `Upstream returned an empty response (HTTP ${response.status || 500})`,
      data: null,
    };
  }

  if (payload && typeof payload === 'object' && ('message' in payload || 'data' in payload || 'url' in payload)) {
    const rawMessage = typeof payload.message === 'string' ? payload.message.trim() : '';
    const normalizedMessage = rawMessage.toLowerCase();
    const success = response.ok && !['error', 'fail', 'failed'].includes(normalizedMessage);

    return {
      success,
      message: success && normalizedMessage === 'success' ? '' : rawMessage,
      data: payload.data ?? null,
      ...(payload.url ? { url: payload.url } : {}),
    };
  }

  if (response.ok) {
    return {
      success: true,
      message: '',
      data: payload,
    };
  }

  return {
    success: false,
    message: typeof payload === 'string' && payload ? payload : `Upstream response error (HTTP ${response.status || 500})`,
    data: null,
  };
};

const callNewApi = async ({ endpoint, path, method = 'GET', body, jar, userId }) => {
  const headers = {
    Accept: 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const cookieHeader = cookieJarToHeader(jar);
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  if (userId) {
    headers['New-Api-User'] = String(userId);
  }

  return fetch(`${endpoint}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'follow',
  });
};

const proxyStatus = async (req, res, endpoint) => {
  const response = await callNewApi({ endpoint, path: '/api/status' });
  const payload = normalizeUpstreamEnvelope(response, await parseUpstreamJson(response));
  json(res, response.status || 200, payload);
};

const proxyVerification = async (req, res, endpoint, body) => {
  const email = String(body.email || '').trim();
  const response = await callNewApi({
    endpoint,
    path: `/api/verification${buildQueryString({ email })}`,
  });

  const payload = normalizeUpstreamEnvelope(response, await parseUpstreamJson(response));
  json(res, response.status || 200, payload);
};

const proxyRegister = async (req, res, endpoint, body) => {
  const response = await callNewApi({
    endpoint,
    path: '/api/user/register',
    method: 'POST',
    body,
  });

  const payload = normalizeUpstreamEnvelope(response, await parseUpstreamJson(response));
  json(res, response.status || 200, payload);
};

const proxyLogin = async (req, res, endpoint, body) => {
  const upstreamJar = {};
  const response = await callNewApi({
    endpoint,
    path: '/api/user/login',
    method: 'POST',
    body: {
      username: body.username,
      password: body.password,
    },
  });

  mergeSetCookieIntoJar(upstreamJar, response);
  const payload = normalizeUpstreamEnvelope(response, await parseUpstreamJson(response));

  if (payload.success) {
    const sessionId = saveLocalSession({
      endpoint,
      upstreamJar,
      user: payload.data?.require_2fa ? null : payload.data,
      pendingTwoFactor: Boolean(payload.data?.require_2fa),
    });
    setSessionCookie(req, res, sessionId);
  }

  json(res, response.status || 200, payload);
};

const proxyTwoFactor = async (req, res, body) => {
  const local = getLocalSession(req);
  if (!local?.session) {
    json(res, 401, { success: false, message: '登录会话已失效，请重新登录', data: null });
    return;
  }

  const { sessionId, session } = local;
  const response = await callNewApi({
    endpoint: session.endpoint,
    path: '/api/user/login/2fa',
    method: 'POST',
    body: { code: body.code },
    jar: session.upstreamJar,
  });

  mergeSetCookieIntoJar(session.upstreamJar, response);
  const payload = normalizeUpstreamEnvelope(response, await parseUpstreamJson(response));

  if (payload.success) {
    updateLocalSession(sessionId, {
      upstreamJar: session.upstreamJar,
      user: payload.data,
      pendingTwoFactor: false,
    });
  }

  json(res, response.status || 200, payload);
};

const proxySession = async (req, res, endpoint) => {
  const local = getLocalSession(req);
  if (!local?.session) {
    json(res, 200, { success: true, message: '', data: null });
    return;
  }

  const { sessionId, session } = local;
  if (endpoint && session.endpoint !== endpoint) {
    destroyLocalSession(sessionId);
    clearSessionCookie(req, res);
    json(res, 200, { success: true, message: '', data: null });
    return;
  }

  if (!session.user?.id) {
    json(res, 200, { success: true, message: '', data: null });
    return;
  }

  const response = await callNewApi({
    endpoint: session.endpoint,
    path: '/api/user/self',
    jar: session.upstreamJar,
    userId: session.user.id,
  });

  const payload = normalizeUpstreamEnvelope(response, await parseUpstreamJson(response));
  if (!payload.success) {
    destroyLocalSession(sessionId);
    clearSessionCookie(req, res);
    json(res, 200, { success: true, message: '', data: null });
    return;
  }

  updateLocalSession(sessionId, { user: payload.data });
  json(res, response.status || 200, payload);
};

const proxyLogout = async (req, res) => {
  const local = getLocalSession(req);
  if (local?.session) {
    try {
      await callNewApi({
        endpoint: local.session.endpoint,
        path: '/api/user/logout',
        jar: local.session.upstreamJar,
      });
    } catch {
      // ignore upstream logout failures
    }

    destroyLocalSession(local.sessionId);
  }

  clearSessionCookie(req, res);
  json(res, 200, { success: true, message: '', data: null });
};

const requireAuthedSession = (req, res) => {
  const local = getLocalSession(req);
  if (!local?.session?.user?.id) {
    json(res, 401, { success: false, message: '请先登录账号中心', data: null });
    return null;
  }

  return local;
};

const proxyAuthed = async (req, res, upstreamPath, options = {}) => {
  const local = requireAuthedSession(req, res);
  if (!local) return;

  const { session } = local;
  const response = await callNewApi({
    endpoint: session.endpoint,
    path: upstreamPath,
    method: options.method || req.method || 'GET',
    body: options.body,
    jar: session.upstreamJar,
    userId: session.user.id,
  });

  mergeSetCookieIntoJar(session.upstreamJar, response);
  updateLocalSession(local.sessionId, { upstreamJar: session.upstreamJar });

  const payload = normalizeUpstreamEnvelope(response, await parseUpstreamJson(response));

  if (!payload.success && [401, 403].includes(response.status)) {
    destroyLocalSession(local.sessionId);
    clearSessionCookie(req, res);
  }

  json(res, response.status || 200, payload);
};

export const createNewApiProxyHandler = () => {
  return async (req, res, next) => {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    const pathname = requestUrl.pathname;

    if (!pathname.startsWith('/api/new-api')) {
      if (typeof next === 'function') {
        next();
        return;
      }

      json(res, 404, { success: false, message: 'Not Found', data: null });
      return;
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(req.method).toUpperCase())
        ? await readBody(req)
        : {};

      const endpointInput = body.endpoint || requestUrl.searchParams.get('endpoint');
      const endpoint = endpointInput ? validateEndpoint(endpointInput) : '';

      if (pathname === '/api/new-api/status' && req.method === 'GET') {
        await proxyStatus(req, res, endpoint);
        return;
      }

      if (pathname === '/api/new-api/verification' && req.method === 'POST') {
        await proxyVerification(req, res, endpoint, body);
        return;
      }

      if (pathname === '/api/new-api/register' && req.method === 'POST') {
        await proxyRegister(req, res, endpoint, body);
        return;
      }

      if (pathname === '/api/new-api/session/login' && req.method === 'POST') {
        await proxyLogin(req, res, endpoint, body);
        return;
      }

      if (pathname === '/api/new-api/session/2fa' && req.method === 'POST') {
        await proxyTwoFactor(req, res, body);
        return;
      }

      if (pathname === '/api/new-api/session' && req.method === 'GET') {
        await proxySession(req, res, endpoint);
        return;
      }

      if (pathname === '/api/new-api/session/logout' && req.method === 'POST') {
        await proxyLogout(req, res);
        return;
      }

      if (pathname === '/api/new-api/self' && req.method === 'GET') {
        await proxyAuthed(req, res, '/api/user/self');
        return;
      }

      if (pathname === '/api/new-api/topup/info' && req.method === 'GET') {
        await proxyAuthed(req, res, '/api/user/topup/info');
        return;
      }

      if (pathname === '/api/new-api/amount' && req.method === 'POST') {
        await proxyAuthed(req, res, '/api/user/amount', { method: 'POST', body });
        return;
      }

      if (pathname === '/api/new-api/pay' && req.method === 'POST') {
        await proxyAuthed(req, res, '/api/user/pay', { method: 'POST', body });
        return;
      }

      if (pathname === '/api/new-api/topup' && req.method === 'POST') {
        await proxyAuthed(req, res, '/api/user/topup', { method: 'POST', body });
        return;
      }

      if (pathname === '/api/new-api/tokens' && req.method === 'GET') {
        await proxyAuthed(
          req,
          res,
          `/api/token/${buildQueryString({
            p: requestUrl.searchParams.get('p'),
            size: requestUrl.searchParams.get('size'),
          })}`,
        );
        return;
      }

      if (pathname === '/api/new-api/tokens' && req.method === 'POST') {
        await proxyAuthed(req, res, '/api/token/', { method: 'POST', body });
        return;
      }

      const tokenStatusMatch = pathname.match(/^\/api\/new-api\/tokens\/(\d+)\/status$/);
      if (tokenStatusMatch && req.method === 'PATCH') {
        await proxyAuthed(req, res, '/api/token/?status_only=true', {
          method: 'PUT',
          body: {
            id: Number.parseInt(tokenStatusMatch[1], 10),
            status: body.status,
          },
        });
        return;
      }

      const tokenDeleteMatch = pathname.match(/^\/api\/new-api\/tokens\/(\d+)$/);
      if (tokenDeleteMatch && req.method === 'DELETE') {
        await proxyAuthed(req, res, `/api/token/${tokenDeleteMatch[1]}`, { method: 'DELETE' });
        return;
      }

      if (pathname === '/api/new-api/logs' && req.method === 'GET') {
        await proxyAuthed(
          req,
          res,
          `/api/log/self${buildQueryString({
            p: requestUrl.searchParams.get('p'),
            page_size: requestUrl.searchParams.get('page_size'),
            type: requestUrl.searchParams.get('type'),
            token_name: requestUrl.searchParams.get('token_name'),
            model_name: requestUrl.searchParams.get('model_name'),
            group: requestUrl.searchParams.get('group'),
            request_id: requestUrl.searchParams.get('request_id'),
            start_timestamp: requestUrl.searchParams.get('start_timestamp'),
            end_timestamp: requestUrl.searchParams.get('end_timestamp'),
          })}`,
        );
        return;
      }

      if (pathname === '/api/new-api/logs/stat' && req.method === 'GET') {
        await proxyAuthed(
          req,
          res,
          `/api/log/self/stat${buildQueryString({
            type: requestUrl.searchParams.get('type'),
            token_name: requestUrl.searchParams.get('token_name'),
            model_name: requestUrl.searchParams.get('model_name'),
            group: requestUrl.searchParams.get('group'),
            start_timestamp: requestUrl.searchParams.get('start_timestamp'),
            end_timestamp: requestUrl.searchParams.get('end_timestamp'),
          })}`,
        );
        return;
      }

      json(res, 404, { success: false, message: '未找到对应代理接口', data: null });
    } catch (error) {
      json(res, 500, {
        success: false,
        message: error instanceof Error ? error.message : '代理服务异常',
        data: null,
      });
    }
  };
};
