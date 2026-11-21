// src/utils/impersonationApi.js
import { apiGet, apiPost } from "./api.js";

export const searchImpersonationUsers = (token, q) =>
    apiGet(`/admin/impersonation/search?q=${encodeURIComponent(q)}`, token);

export const startImpersonation = (token, payload) =>
    apiPost("/admin/impersonation/start", token, payload);

export function listImpersonationSessions(token, { userId, status, limit = 20, before } = {}) {
    const p = new URLSearchParams({ limit: String(limit) });
    if (userId) p.set("userId", userId);
    if (status) p.set("status", status);
    if (before) p.set("before", before);
    return apiGet(`/admin/impersonation/sessions?${p}`, token);
}

export const getImpersonationLog = (token, id) =>
    apiGet(`/admin/impersonation/sessions/${id}/log`, token);

export const revokeImpersonationSession = (token, id) =>
    apiPost(`/admin/impersonation/sessions/${id}/revoke`, token);