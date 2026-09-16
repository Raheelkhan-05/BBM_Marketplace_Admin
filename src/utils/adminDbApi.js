// utils/adminDbApi.js
// Thin fetch wrapper for the generic admin DB endpoints. Adjust BASE if your
// app mounts the admin router somewhere other than /api/admin.

export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

async function req(path, token, opts = {}) {
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
        ...opts,
        headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || "Request failed"), { status: res.status, data });
    return data;
}

export const adminDbApi = {
    listTables: (token) => req("/admin/db/tables", token),
    getSchema: (token, table) => req(`/admin/db/tables/${table}/schema`, token),
    listRows: (token, table, { page = 0, pageSize = 50, sortBy, sortDir } = {}) => {
        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (sortBy) { params.set("sortBy", sortBy); params.set("sortDir", sortDir || "asc"); }
        return req(`/admin/db/tables/${table}/rows?${params.toString()}`, token);
    },
    getRow: (token, table, id, pk = "id") =>
        req(`/admin/db/tables/${table}/rows/${encodeURIComponent(id)}?pk=${pk}`, token),
    createRow: (token, table, body) =>
        req(`/admin/db/tables/${table}/rows`, token, { method: "POST", body: JSON.stringify(body) }),
    updateRow: (token, table, id, body, pk = "id") =>
        req(`/admin/db/tables/${table}/rows/${encodeURIComponent(id)}?pk=${pk}`, token, { method: "PATCH", body: JSON.stringify(body) }),
    deleteRow: (token, table, id, { pk = "id", cascade = false } = {}) =>
        req(`/admin/db/tables/${table}/rows/${encodeURIComponent(id)}?pk=${pk}&cascade=${cascade}`, token, { method: "DELETE" }),
    purgeRow: (token, table, id, { pk = "id", cascade = false } = {}) =>
        req(`/admin/db/tables/${table}/rows/${encodeURIComponent(id)}?pk=${pk}&purge=true&cascade=${cascade}`, token, { method: "DELETE" }),
    getDependents: (token, table, id, pk = "id") =>
        req(`/admin/db/tables/${table}/rows/${encodeURIComponent(id)}/dependents?pk=${pk}`, token),
};