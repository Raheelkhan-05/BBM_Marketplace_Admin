// src/utils/teamApi.js
import * as api from "./api.js";

// Uses api.js's API_BASE if it is exported there; otherwise set VITE_API_BASE_URL (must include "/api").
const API_BASE = api.API_BASE || import.meta.env?.VITE_API_BASE_URL || "/api";

async function call(path, { token, method = "GET", body } = {}) {
    try {
        const res = await fetch(`${API_BASE}/team${path}`, {
            method,
            headers: {
                ...(body ? { "Content-Type": "application/json" } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        let data = {};
        try { data = await res.json(); } catch { /* non-JSON body */ }
        return { ...data, status: res.status, success: res.ok && data?.success !== false };
    } catch {
        return { success: false, status: 0, message: "Network error. Check your connection." };
    }
}

export const fetchTeam = (token) => call("", { token });
export const createTeamInvite = (token, value, role = "member") => call("/invites", { token, method: "POST", body: { value, role } });
export const resendTeamInvite = (token, id) => call(`/invites/${id}/resend`, { token, method: "POST" });
export const revokeTeamInvite = (token, id) => call(`/invites/${id}`, { token, method: "DELETE" });
export const removeTeamMember = (token, userId) => call(`/members/${userId}`, { token, method: "DELETE" });
export const fetchTeamActivity = (token, { memberId, before, after, limit = 30 } = {}) => {
    const p = new URLSearchParams({ limit: String(limit) });
    if (memberId) p.set("memberId", memberId);
    if (before) p.set("before", before);
    if (after) p.set("after", after);
    return call(`/activity?${p}`, { token });
};

// public (invite link)
export const fetchInviteInfo = (inviteToken) => call(`/join/${inviteToken}`);

export const requestInviteOtp = (inviteToken, extraValue) =>
    call(`/join/${inviteToken}/request-otp`, { method: "POST", body: { extraValue } });
export const acceptTeamInvite = (inviteToken, { otp, name, extraValue, extraOtp }) =>
    call(`/join/${inviteToken}/accept`, { method: "POST", body: { otp, name, extraValue, extraOtp } });

export const setTeamMemberRole = (token, userId, role) =>
    call(`/members/${userId}/role`, { token, method: "PATCH", body: { role } });