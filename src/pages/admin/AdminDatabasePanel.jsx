// components/admin/AdminDatabasePanel.jsx
//
// A generic, schema-driven database admin panel: sidebar of every table in
// the DB (grouped for readability), a responsive row browser (table on
// desktop, cards on mobile), a full record edit drawer built from the live
// column schema, and a cascade-aware delete flow that previews exactly what
// else will be affected before anything happens.
//
// Nothing here is hardcoded to a specific table — it reads /db/tables and
// /db/tables/:table/schema and renders itself accordingly, so it keeps
// working as your schema evolves.
//
// Drop this in, add a route to it, done:
//   <Route path="/admin/database" element={<AdminDatabasePanel />} />

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search, Database, X, Pencil, Trash2, Plus, ChevronLeft, ChevronRight,
    ChevronUp, ChevronDown, RefreshCw, AlertTriangle, Link2, Check, Copy,
} from "lucide-react";
import { adminDbApi } from "../../utils/adminDbApi";
import { useAuth } from "../../context/AuthContext";

const C = {
    ink: "#0B1116", muted: "#667077", primary: "#D2462B", secondary: "#006F83",
    hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)", danger: "#c71f11",
    dangerSoft: "#fdecea", bg: "#FAFAF9",
};
const EASE = [0.16, 1, 0.3, 1];
const PAGE_SIZE = 25;
const AUTO_REFRESH_MS = 6000;

// ---------------------------------------------------------------------------
// Table grouping — purely cosmetic (sidebar sections). Anything not matched
// falls into "Other", so new tables never disappear from the panel.
// ---------------------------------------------------------------------------
const GROUP_RULES = [
    { label: "Catalog", test: (t) => t.startsWith("hs_") || t === "listing_policy_options" || t === "home_feed_cache" },
    { label: "Sellers", test: (t) => t.startsWith("seller_") || t === "business_profiles" },
    { label: "Orders & Payments", test: (t) => t.startsWith("order") || t === "cart_items" || t === "payment_proofs" || t === "pincode_geo" },
    { label: "Wallet & Billing", test: (t) => t.startsWith("wallet_") },
    { label: "Chat & Credit", test: (t) => t.startsWith("chat_") || t.startsWith("buyer_seller_credit") },
    { label: "Users & Access", test: (t) => t === "profiles" || t.startsWith("otp_") || t === "login_otp_sessions" || t === "buyer_addresses" || t === "notifications" },
    { label: "Platform & Geo", test: (t) => t === "platform_settings" || t === "geo_locations" },
];
function groupFor(tableName) {
    return GROUP_RULES.find((g) => g.test(tableName))?.label || "Other";
}

function prettify(name) {
    return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isJsonType(dataType) {
    return dataType === "jsonb" || dataType === "json";
}
function isBoolType(dataType) {
    return dataType === "boolean";
}
function isNumberType(dataType) {
    return /^(numeric|integer|bigint|smallint|real|double precision)/.test(dataType || "");
}
function isDateType(dataType) {
    return /timestamp|^date$/.test(dataType || "");
}
function isArrayType(dataType) {
    return (dataType || "").endsWith("[]");
}

function toDatetimeLocalValue(v) {
    if (!v) return "";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function cellPreview(value) {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "object") return JSON.stringify(value);
    const s = String(value);
    return s.length > 60 ? s.slice(0, 60) + "…" : s;
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------
function Pill({ children, tone = "muted" }) {
    const tones = {
        muted: { background: C.hairSoft, color: C.muted },
        good: { background: `${C.secondary}14`, color: C.secondary },
        warn: { background: "#fef3c7", color: "#a16207" },
        danger: { background: C.dangerSoft, color: C.danger },
    };
    return (
        <span className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide" style={tones[tone]}>
            {children}
        </span>
    );
}

function LiveDot({ pulsing }) {
    return (
        <span className="relative flex h-2 w-2">
            {pulsing && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: C.secondary }} />}
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: C.secondary }} />
        </span>
    );
}

function IconButton({ icon: Icon, onClick, tone = "muted", label, disabled }) {
    const colors = { muted: C.muted, danger: C.danger, secondary: C.secondary };
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            title={label}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-black/[0.05] disabled:opacity-40"
        >
            <Icon className="h-4 w-4" style={{ color: colors[tone] }} />
        </button>
    );
}

// Generic field renderer used both in the row-edit drawer and the
// create-row form. `col` is one column's metadata from admin_table_columns.
function FieldInput({ col, value, onChange, disabled }) {
    const dataType = col.data_type;

    // Hooks must run unconditionally on every render of this component, so
    // the JSON-editor's local text buffer lives here regardless of which
    // branch below ends up rendering.
    const jsonText = useMemo(() => {
        if (value === null || value === undefined) return "";
        return typeof value === "string" ? value : JSON.stringify(value, null, 2);
    }, [value]);
    const [jsonLocal, setJsonLocal] = useState(jsonText);
    const [jsonInvalid, setJsonInvalid] = useState(false);
    useEffect(() => setJsonLocal(jsonText), [jsonText]);

    if (col.is_pk) {
        return (
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: C.hair, background: C.hairSoft }}>
                <span className="min-w-0 flex-1 truncate text-[13px] font-mono" style={{ color: C.muted }}>{value ?? "—"}</span>
                <Copy
                    className="h-3.5 w-3.5 shrink-0 cursor-pointer"
                    style={{ color: C.muted }}
                    onClick={() => navigator.clipboard?.writeText(String(value ?? ""))}
                />
            </div>
        );
    }

    if (isBoolType(dataType)) {
        return (
            <div className="flex gap-1 rounded-lg p-1" style={{ background: C.hairSoft, width: "fit-content" }}>
                {[{ v: true, t: "True" }, { v: false, t: "False" }, { v: null, t: "Null" }].map(({ v, t }) => (
                    <button
                        key={t}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(v)}
                        className="rounded-md px-3 py-1 text-[12.5px] font-bold tracking-wide transition-colors duration-150"
                        style={value === v ? { background: C.secondary, color: "#fff" } : { color: C.muted }}
                    >
                        {t}
                    </button>
                ))}
            </div>
        );
    }

    if (isJsonType(dataType) || isArrayType(dataType)) {
        return (
            <div>
                <textarea
                    disabled={disabled}
                    rows={5}
                    value={jsonLocal}
                    onChange={(e) => {
                        setJsonLocal(e.target.value);
                        try {
                            const parsed = e.target.value.trim() === "" ? null : JSON.parse(e.target.value);
                            setJsonInvalid(false);
                            onChange(parsed);
                        } catch {
                            setJsonInvalid(true);
                        }
                    }}
                    className="w-full resize-y rounded-lg border px-3 py-2 font-mono text-[12.5px] focus:outline-none focus:ring-2"
                    style={{ borderColor: jsonInvalid ? "#f2b3ab" : C.hair, color: C.ink, ["--tw-ring-color"]: `${C.secondary}22` }}
                />
                {jsonInvalid && <p className="mt-1 text-[11px] font-semibold" style={{ color: C.danger }}>Invalid JSON — not saved until fixed.</p>}
            </div>
        );
    }

    if (isDateType(dataType)) {
        return (
            <input
                type="datetime-local"
                disabled={disabled}
                value={toDatetimeLocalValue(value)}
                onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
                className="w-full rounded-lg border px-3 py-2 text-[13.5px] font-semibold focus:outline-none focus:ring-2"
                style={{ borderColor: C.hair, color: C.ink, ["--tw-ring-color"]: `${C.secondary}22` }}
            />
        );
    }

    if (isNumberType(dataType)) {
        return (
            <input
                type="number"
                inputMode="decimal"
                disabled={disabled}
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
                className="w-full rounded-lg border px-3 py-2 text-[13.5px] font-semibold tabular-nums focus:outline-none focus:ring-2"
                style={{ borderColor: C.hair, color: C.ink, ["--tw-ring-color"]: `${C.secondary}22` }}
            />
        );
    }

    const long = (value && String(value).length > 60) || /text$/.test(dataType || "");
    const Tag = long ? "textarea" : "input";
    return (
        <Tag
            rows={long ? 3 : undefined}
            disabled={disabled}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-[13.5px] font-semibold focus:outline-none focus:ring-2 ${long ? "resize-y" : ""}`}
            style={{ borderColor: C.hair, color: C.ink, ["--tw-ring-color"]: `${C.secondary}22` }}
        />
    );
}

// ---------------------------------------------------------------------------
// Cascade-aware delete confirmation
// ---------------------------------------------------------------------------
function DeleteConfirmModal({ table, row, pkCol, dependents, token, mode = "delete", onClose, onDeleted }) {
    const [confirmText, setConfirmText] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const totalDependents = (dependents || []).reduce((s, d) => s + Number(d.count || 0), 0);
    const needsCascade = totalDependents > 0;
    const isPurge = mode === "purge";

    const hasSkipped = (dependents || []).some((d) => d.action === "skipped");
    const canConfirm = confirmText.trim().toUpperCase() === "DELETE";

    const doDelete = async (cascade) => {
        setBusy(true);
        setError(null);
        try {
            if (isPurge) {
                await adminDbApi.purgeRow(token, table, row[pkCol], { pk: pkCol, cascade });
            } else {
                await adminDbApi.deleteRow(token, table, row[pkCol], { pk: pkCol, cascade });
            }
            onDeleted();
        } catch (e) {
            setError(e.data?.message || e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <motion.div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.2, ease: EASE }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
                <div className="flex items-start gap-3 border-b px-5 py-4" style={{ borderColor: C.hairSoft }}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: C.dangerSoft }}>
                        <AlertTriangle className="h-4.5 w-4.5" style={{ color: C.danger }} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-extrabold tracking-wide" style={{ color: C.ink }}>
                            {isPurge ? "Permanently delete this record?" : "Delete this record?"}
                        </p>
                        <p className="mt-0.5 text-[12.5px] font-medium tracking-wide" style={{ color: C.muted }}>
                            {prettify(table)} · {String(row[pkCol]).slice(0, 24)}
                        </p>
                    </div>
                    <button onClick={onClose} className="rounded-full p-1 hover:bg-black/5"><X className="h-4 w-4" style={{ color: C.muted }} /></button>
                </div>

                <div className="max-h-[50vh] overflow-y-auto px-5 py-4">
                    {isPurge && !needsCascade && (
                        <p className="mb-3 text-[12.5px] font-bold" style={{ color: C.danger }}>
                            This cannot be undone — the data will be gone, not just hidden.
                        </p>
                    )}
                    {needsCascade ? (
                        <div className="flex flex-col gap-2">
                            <p className="text-[13px] font-semibold tracking-wide" style={{ color: C.ink }}>
                                {isPurge
                                    ? "This record is still referenced elsewhere. Permanently deleting it will also remove:"
                                    : "This record is still referenced elsewhere. Deleting it will also remove:"}
                            </p>
                            <div className="flex flex-col gap-1.5 rounded-xl border p-3" style={{ borderColor: C.hair, background: C.bg }}>
                                {dependents.map((d, i) => (
                                    <div key={`${d.table || "table"}-${d.column || "col"}-${i}`} className="flex items-center justify-between gap-2 text-[12.5px]">
                                        <span className="flex min-w-0 items-center gap-1.5 truncate font-bold" style={{ color: C.ink }}>
                                            <Link2 className="h-3 w-3 shrink-0" style={{ color: C.muted }} />
                                            {prettify(d.table)}
                                        </span>
                                        <Pill tone={d.action === "deleted" ? "danger" : d.action === "delinked" ? "warn" : "good"}>
                                            {d.action === "skipped"
                                                ? "left untouched"
                                                : `${d.count} row${d.count === 1 ? "" : "s"} · ${d.action === "deleted" ? "will be deleted" : "will be delinked"}`}
                                        </Pill>
                                    </div>
                                ))}
                            </div>
                            <p className="mt-1 text-[11.5px] font-medium leading-relaxed" style={{ color: C.muted }}>
                                Rows marked <strong>will be deleted</strong> only belong to this record and are removed with it.
                                Rows marked <strong>will be delinked</strong> are shared data — they're kept, just unlinked from this record.
                                Rows marked <strong>left untouched</strong> involve other people or transactions and won't be touched at all.
                                {isPurge ? " This cannot be undone." : " "}Type <strong>DELETE</strong> below to confirm.
                            </p>
                        </div>
                    ) : (
                        <p className="text-[13px] font-semibold tracking-wide" style={{ color: C.muted }}>
                            Nothing else references this record — it can be removed safely.
                        </p>
                    )}

                    {needsCascade && (
                        <input
                            autoFocus
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            placeholder='Type "DELETE" to confirm'
                            className="mt-3 w-full rounded-lg border px-3 py-2 text-[13.5px] font-bold tracking-widest focus:outline-none focus:ring-2"
                            style={{ borderColor: C.hair, color: C.ink, ["--tw-ring-color"]: `${C.danger}22` }}
                        />
                    )}

                    {error && <p className="mt-2 text-[12px] font-semibold" style={{ color: C.danger }}>{error}</p>}
                </div>

                <div className="flex items-center justify-end gap-2 border-t px-5 py-3.5" style={{ borderColor: C.hairSoft }}>
                    <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-[13px] font-bold tracking-wide" style={{ color: C.muted }}>
                        Cancel
                    </button>
                    <button
                        disabled={busy || (needsCascade && !canConfirm)}
                        onClick={() => doDelete(needsCascade)}
                        className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold tracking-wide text-white transition-opacity disabled:opacity-40"
                        style={{ background: C.danger }}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        {needsCascade ? (isPurge ? "Permanently delete & cascade" : "Delete & cascade") : (isPurge ? "Permanently delete" : "Delete")}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

// ---------------------------------------------------------------------------
// Row edit / create drawer
// ---------------------------------------------------------------------------
function RowDrawer({ table, schema, row, pkCol, mode, token, onClose, onSaved, onRequestDelete, onRequestPurge }) {
    const [draft, setDraft] = useState(() => row || {});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [savedFlash, setSavedFlash] = useState(false);
    const dirtyRef = useRef(false);

    useEffect(() => { setDraft(row || {}); dirtyRef.current = false; }, [row]);

    const columns = schema?.columns || [];
    const setField = (name, val) => {
        dirtyRef.current = true;
        setDraft((d) => ({ ...d, [name]: val }));
    };

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            if (mode === "create") {
                const { row: created } = await adminDbApi.createRow(token, table, draft);
                onSaved(created, "create");
            } else {
                const changed = {};
                for (const c of columns) {
                    if (c.is_pk) continue;
                    if (draft[c.column_name] !== row[c.column_name]) changed[c.column_name] = draft[c.column_name];
                }
                if (!Object.keys(changed).length) { onClose(); return; }
                const { row: updated } = await adminDbApi.updateRow(token, table, row[pkCol], changed, pkCol);
                onSaved(updated, "update");
            }
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 1200);
        } catch (e) {
            setError(e.data?.message || e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div
            className="fixed inset-0 z-[250] flex justify-end bg-black/40 backdrop-blur-[1px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
                transition={{ duration: 0.26, ease: EASE }}
                onClick={(e) => e.stopPropagation()}
                className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl"
            >
                <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: C.hairSoft }}>
                    <div className="min-w-0">
                        <p className="text-[15px] font-extrabold tracking-wide" style={{ color: C.ink }}>
                            {mode === "create" ? `New ${prettify(table)} row` : prettify(table)}
                        </p>
                        {mode !== "create" && (
                            <p className="truncate text-[11.5px] font-mono" style={{ color: C.muted }}>{row?.[pkCol]}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        {savedFlash && (
                            <span className="flex items-center gap-1 text-[11.5px] font-bold" style={{ color: C.secondary }}>
                                <Check className="h-3.5 w-3.5" /> Saved
                            </span>
                        )}
                        <button onClick={onClose} className="rounded-full p-1.5 hover:bg-black/5"><X className="h-4 w-4" style={{ color: C.muted }} /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4" data-lenis-prevent>
                    <div className="flex flex-col gap-4">
                        {columns.map((col) => (
                            <div key={col.column_name} className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[11.5px] font-extrabold uppercase tracking-wide" style={{ color: "#4A535B" }}>
                                        {col.column_name}
                                    </span>
                                    {col.is_pk && <Pill>PK</Pill>}
                                    {col.fk_table && <Pill tone="good">→ {col.fk_table}</Pill>}
                                    {!col.is_nullable && !col.is_pk && <Pill tone="warn">required</Pill>}
                                </div>
                                <FieldInput
                                    col={col}
                                    value={draft[col.column_name]}
                                    onChange={(v) => setField(col.column_name, v)}
                                    disabled={col.is_pk || col.is_identity}
                                />
                            </div>
                        ))}
                    </div>

                    {error && (
                        <div className="mt-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ background: C.dangerSoft, color: C.danger }}>
                            {error}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between gap-2 border-t px-5 py-3.5" style={{ borderColor: C.hairSoft }}>
                    {mode === "edit" ? (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onRequestDelete(row)}
                                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold tracking-wide transition-colors hover:bg-red-50"
                                style={{ color: C.danger }}
                            >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                            {row?.deleted_at && (
                                <button
                                    onClick={() => onRequestPurge(row)}
                                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold tracking-wide transition-colors hover:bg-red-50"
                                    style={{ color: C.danger }}
                                >
                                    <Trash2 className="h-3.5 w-3.5" /> Permanently delete
                                </button>
                            )}
                        </div>
                    ) : <span />}
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-[13px] font-bold tracking-wide" style={{ color: C.muted }}>
                            Cancel
                        </button>
                        <button
                            disabled={saving}
                            onClick={save}
                            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold tracking-wide text-white transition-opacity disabled:opacity-50"
                            style={{ background: C.secondary }}
                        >
                            {saving ? "Saving…" : mode === "create" ? "Create row" : "Save changes"}
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
function Sidebar({ tables, activeTable, onSelect, search, onSearch, mobileOpen, onCloseMobile, tablesLoading, tablesError, onRetryTables }) {
    const filtered = tables.filter((t) => t.table_name.toLowerCase().includes(search.toLowerCase()));
    const groups = useMemo(() => {
        const map = new Map();
        for (const t of filtered) {
            const g = groupFor(t.table_name);
            if (!map.has(g)) map.set(g, []);
            map.get(g).push(t);
        }
        return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [filtered]);

    const content = (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b px-4 py-4" style={{ borderColor: C.hairSoft }}>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: `${C.secondary}14` }}>
                    <Database className="h-4 w-4" style={{ color: C.secondary }} />
                </span>
                <p className="text-[14.5px] font-extrabold tracking-wide" style={{ color: C.ink }}>Database</p>
                <button onClick={onCloseMobile} className="ml-auto rounded-full p-1 hover:bg-black/5 lg:hidden">
                    <X className="h-4 w-4" style={{ color: C.muted }} />
                </button>
            </div>

            <div className="px-3 py-3">
                <div className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5" style={{ borderColor: C.hair }}>
                    <Search className="h-3.5 w-3.5" style={{ color: C.muted }} />
                    <input
                        value={search}
                        onChange={(e) => onSearch(e.target.value)}
                        placeholder="Search tables…"
                        className="w-full bg-transparent text-[13px] font-semibold focus:outline-none"
                        style={{ color: C.ink }}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-4" data-lenis-prevent>
                {tablesError ? (
                    <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                        <AlertTriangle className="h-4.5 w-4.5" style={{ color: C.danger }} />
                        <p className="text-[12px] font-semibold" style={{ color: C.muted }}>{tablesError}</p>
                        <button
                            onClick={onRetryTables}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold tracking-wide text-white"
                            style={{ background: C.secondary }}
                        >
                            <RefreshCw className="h-3 w-3" /> Retry
                        </button>
                    </div>
                ) : tablesLoading ? (
                    <div className="flex flex-col gap-2 px-2 py-2">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-7 w-full animate-pulse rounded-lg" style={{ background: C.hairSoft }} />
                        ))}
                    </div>
                ) : groups.map(([label, list]) => (
                    <div key={label} className="mb-3">
                        <p className="px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wider" style={{ color: C.muted }}>{label}</p>
                        {list.map((t) => (
                            <button
                                key={t.table_name}
                                onClick={() => onSelect(t.table_name)}
                                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors duration-100"
                                style={activeTable === t.table_name ? { background: `${C.secondary}12` } : {}}
                            >
                                <span
                                    className="min-w-0 truncate text-[13px] font-bold tracking-wide"
                                    style={{ color: activeTable === t.table_name ? C.secondary : C.ink }}
                                >
                                    {t.table_name}
                                </span>
                                {/* <span className="shrink-0 text-[10.5px] font-bold tabular-nums" style={{ color: C.muted }}>
                                    {Number(t.row_estimate).toLocaleString()}
                                </span> */}
                            </button>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <>
            <div className="hidden h-full w-64 shrink-0 border-r bg-white lg:block" style={{ borderColor: C.hair }}>
                {content}
            </div>
            <AnimatePresence>
                {mobileOpen && (
                    <motion.div className="fixed inset-0 z-[220] flex lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="absolute inset-0 bg-black/40" onClick={onCloseMobile} />
                        <motion.div
                            initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
                            transition={{ duration: 0.24, ease: EASE }}
                            className="relative h-full w-72 bg-white shadow-2xl"
                        >
                            {content}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

// ---------------------------------------------------------------------------
// Row browser (table on desktop / cards on mobile)
// ---------------------------------------------------------------------------
function RowBrowser({ table, schema, rows, onOpenRow, sort, onSort }) {
    const columns = schema?.columns || [];
    // Keep the visible column set sane for wide tables — primary key first,
    // then the next handful of scalar columns; everything is still fully
    // editable in the drawer regardless of what's shown in the grid.
    const visibleCols = useMemo(() => {
        const pk = columns.filter((c) => c.is_pk);
        const rest = columns.filter((c) => !c.is_pk && !isJsonType(c.data_type)).slice(0, 6);
        return [...pk, ...rest];
    }, [columns]);

    if (!rows.length) {
        return (
            <div className="flex flex-col items-center gap-1.5 px-6 py-16 text-center">
                <Database className="h-6 w-6" style={{ color: C.hair }} />
                <p className="text-[13px] font-bold" style={{ color: C.ink }}>No rows yet</p>
            </div>
        );
    }

    return (
        <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block" data-lenis-prevent>
                <table className="w-full border-collapse text-left">
                    <thead>
                        <tr className="border-b" style={{ borderColor: C.hair }}>
                            {visibleCols.map((c) => (
                                <th
                                    key={c.column_name}
                                    onClick={() => onSort(c.column_name)}
                                    className="cursor-pointer whitespace-nowrap px-3.5 py-2.5 text-[10.5px] font-extrabold uppercase tracking-wider"
                                    style={{ color: C.muted }}
                                >
                                    <span className="flex items-center gap-1">
                                        {c.column_name}
                                        {sort.sortBy === c.column_name && (sort.sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                                    </span>
                                </th>
                            ))}
                            <th className="w-10" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => (
                            <tr
                                key={i}
                                onClick={() => onOpenRow(row)}
                                className="cursor-pointer border-b transition-colors duration-100 hover:bg-black/[0.02]"
                                style={{ borderColor: C.hairSoft }}
                            >
                                {visibleCols.map((c) => (
                                    <td key={c.column_name} className="whitespace-nowrap px-3.5 py-2.5 text-[12.5px] font-semibold tabular-nums" style={{ color: C.ink }}>
                                        {cellPreview(row[c.column_name])}
                                    </td>
                                ))}
                                <td className="px-2 text-right"><Pencil className="ml-auto h-3.5 w-3.5" style={{ color: C.muted }} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile cards */}
            <div className="flex flex-col divide-y md:hidden" style={{ borderColor: C.hairSoft }}>
                {rows.map((row, i) => (
                    <button key={i} onClick={() => onOpenRow(row)} className="flex flex-col gap-1 px-4 py-3 text-left">
                        {visibleCols.slice(0, 4).map((c) => (
                            <div key={c.column_name} className="flex items-center justify-between gap-3 text-[12.5px]">
                                <span className="font-bold uppercase tracking-wide" style={{ color: C.muted, fontSize: 10 }}>{c.column_name}</span>
                                <span className="min-w-0 truncate font-semibold" style={{ color: C.ink }}>{cellPreview(row[c.column_name])}</span>
                            </div>
                        ))}
                    </button>
                ))}
            </div>
        </>
    );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------
export default function AdminDatabasePanel() {
    const { token } = useAuth();
    const [tables, setTables] = useState([]);
    const [tablesLoading, setTablesLoading] = useState(true);
    const [tablesError, setTablesError] = useState(null);
    const [sidebarSearch, setSidebarSearch] = useState("");
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    const [activeTable, setActiveTable] = useState(null);
    const [schema, setSchema] = useState(null);
    const [schemaError, setSchemaError] = useState(null);
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [sort, setSort] = useState({ sortBy: null, sortDir: "asc" });
    const [rowsLoading, setRowsLoading] = useState(false);
    const [rowsError, setRowsError] = useState(null);
    const [purgeTarget, setPurgeTarget] = useState(null);
    const [liveTick, setLiveTick] = useState(false);

    const [drawer, setDrawer] = useState(null); // { mode: 'edit'|'create', row }
    const [deleteTarget, setDeleteTarget] = useState(null); // { row, dependents }
    const drawerOpenRef = useRef(false);
    drawerOpenRef.current = !!drawer;

    const pkCol = useMemo(() => schema?.columns.find((c) => c.is_pk)?.column_name || "id", [schema]);

    // ---- load table list once ----
    const loadTables = useCallback(() => {
        if (!token) return; // wait for auth to hydrate — firing before token exists (or with a stale one) 401s
        setTablesLoading(true);
        setTablesError(null);
        adminDbApi.listTables(token)
            .then((res) => {
                setTables(res.tables || []);
                if (res.tables?.length) setActiveTable((prev) => prev || res.tables[0].table_name);
            })
            .catch((e) => {
                console.error("[AdminDatabasePanel] failed to load tables:", e);
                setTablesError(e.data?.message || e.message || "Couldn't reach the admin API.");
            })
            .finally(() => setTablesLoading(false));
    }, [token]);
    useEffect(() => { loadTables(); }, [loadTables]);

    // ---- load schema + rows whenever the active table / page / sort changes ----
    const loadRows = useCallback((silent = false) => {
        if (!activeTable || !token) return; // same race — wait for both
        if (!silent) { setRowsLoading(true); setRowsError(null); }
        adminDbApi.listRows(token, activeTable, { page, pageSize: PAGE_SIZE, sortBy: sort.sortBy, sortDir: sort.sortDir })
            .then((res) => {
                setRows(res.rows || []);
                setTotal(res.total || 0);
                if (silent) { setLiveTick(true); setTimeout(() => setLiveTick(false), 900); }
            })
            .catch((e) => {
                console.error(`[AdminDatabasePanel] failed to load rows for "${activeTable}":`, e);
                if (!silent) setRowsError(e.data?.message || e.message || "Couldn't load rows.");
            })
            .finally(() => {
                if (!silent) setRowsLoading(false);
            });
    }, [activeTable, page, sort, token]);

    useEffect(() => {
        if (!activeTable) return;
        setSchema(null);
        setSchemaError(null);
        adminDbApi.getSchema(token, activeTable)
            .then(setSchema)
            .catch((e) => {
                console.error(`[AdminDatabasePanel] failed to load schema for "${activeTable}":`, e);
                setSchemaError(e.data?.message || e.message || "Couldn't load table schema.");
            });
        setPage(0);
        setSort({ sortBy: null, sortDir: "asc" });
    }, [activeTable]);

    useEffect(() => { loadRows(false); }, [loadRows]);

    // ---- lightweight auto-refresh so the grid stays current without a
    //      full page reload; paused while a drawer is open so it never
    //      clobbers an in-progress edit ----
    useEffect(() => {
        const id = setInterval(() => {
            if (!drawerOpenRef.current && !deleteTarget && !purgeTarget) loadRows(true);
        }, AUTO_REFRESH_MS);
        return () => clearInterval(id);
    }, [loadRows, deleteTarget]);

    const openEdit = (row) => setDrawer({ mode: "edit", row });
    const openCreate = () => setDrawer({ mode: "create", row: Object.fromEntries((schema?.columns || []).map((c) => [c.column_name, c.column_default ?? null])) });

    const handleSaved = () => {
        setDrawer(null);
        loadRows(true);
    };

    const requestPurge = async (row) => {
        setDrawer(null);
        const { dependents } = await adminDbApi.getDependents(token, activeTable, row[pkCol], pkCol);
        setPurgeTarget({ row, dependents: dependents || [] });
    };

    const handlePurged = () => {
        setPurgeTarget(null);
        loadRows(true);
    };

    const requestDelete = async (row) => {
        setDrawer(null);
        const { dependents } = await adminDbApi.getDependents(token, activeTable, row[pkCol], pkCol);
        setDeleteTarget({ row, dependents: dependents || [] });
    };

    const handleDeleted = () => {
        setDeleteTarget(null);
        loadRows(true);
    };

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="flex h-screen w-full overflow-hidden" style={{ background: C.bg }}>
            <Sidebar
                tables={tables}
                activeTable={activeTable}
                onSelect={(t) => { setActiveTable(t); setMobileSidebarOpen(false); }}
                search={sidebarSearch}
                onSearch={setSidebarSearch}
                mobileOpen={mobileSidebarOpen}
                onCloseMobile={() => setMobileSidebarOpen(false)}
                tablesLoading={tablesLoading}
                tablesError={tablesError}
                onRetryTables={loadTables}
            />

            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-3 border-b bg-white px-4 py-3.5 sm:px-6" style={{ borderColor: C.hair }}>
                    <button onClick={() => setMobileSidebarOpen(true)} className="rounded-lg p-1.5 hover:bg-black/5 lg:hidden">
                        <Database className="h-4.5 w-4.5" style={{ color: C.ink }} />
                    </button>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-extrabold tracking-wide" style={{ color: C.ink }}>
                            {tablesError ? "Couldn't load tables" : activeTable ? prettify(activeTable) : tablesLoading ? "Loading…" : "Select a table"}
                        </p>
                        <p className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: C.muted }}>
                            <LiveDot pulsing={liveTick} /> {total.toLocaleString()} row{total === 1 ? "" : "s"}
                        </p>
                    </div>
                    <IconButton icon={RefreshCw} label="Refresh" onClick={() => loadRows(false)} />
                    {activeTable && (
                        <button
                            onClick={openCreate}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold tracking-wide text-white"
                            style={{ background: C.secondary }}
                        >
                            <Plus className="h-3.5 w-3.5" /> New row
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto" data-lenis-prevent>
                    <div className="mx-auto max-w-6xl px-0 py-0 sm:px-4 sm:py-4">
                        <div className="overflow-hidden rounded-none border-y bg-white sm:rounded-2xl sm:border" style={{ borderColor: C.hair }}>
                            {schemaError || rowsError ? (
                                <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                                    <AlertTriangle className="h-5 w-5" style={{ color: C.danger }} />
                                    <p className="text-[13px] font-bold" style={{ color: C.ink }}>Couldn't load this table</p>
                                    <p className="max-w-sm text-[12px] font-medium" style={{ color: C.muted }}>{schemaError || rowsError}</p>
                                    <button
                                        onClick={() => { adminDbApi.getSchema(token, activeTable).then(setSchema).catch((e) => setSchemaError(e.data?.message || e.message)); loadRows(false); }}
                                        className="mt-1 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold tracking-wide text-white"
                                        style={{ background: C.secondary }}
                                    >
                                        <RefreshCw className="h-3.5 w-3.5" /> Retry
                                    </button>
                                </div>
                            ) : rowsLoading || !schema ? (
                                <div className="flex flex-col gap-2 p-4">
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <div key={i} className="h-9 w-full animate-pulse rounded-lg" style={{ background: C.hairSoft }} />
                                    ))}
                                </div>
                            ) : (
                                <RowBrowser
                                    table={activeTable}
                                    schema={schema}
                                    rows={rows}
                                    onOpenRow={openEdit}
                                    sort={sort}
                                    onSort={(col) => setSort((s) => ({ sortBy: col, sortDir: s.sortBy === col && s.sortDir === "asc" ? "desc" : "asc" }))}
                                />
                            )}
                        </div>

                        {total > PAGE_SIZE && (
                            <div className="flex items-center justify-between px-2 py-3">
                                <p className="text-[12px] font-semibold" style={{ color: C.muted }}>
                                    Page {page + 1} of {totalPages}
                                </p>
                                <div className="flex items-center gap-1">
                                    <IconButton icon={ChevronLeft} label="Previous page" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} />
                                    <IconButton icon={ChevronRight} label="Next page" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {drawer && (
                    <RowDrawer
                        table={activeTable}
                        schema={schema}
                        row={drawer.row}
                        pkCol={pkCol}
                        mode={drawer.mode}
                        token={token}
                        onClose={() => setDrawer(null)}
                        onSaved={handleSaved}
                        onRequestDelete={requestDelete}
                        onRequestPurge={requestPurge}

                    />
                )}
                {deleteTarget && (
                    <DeleteConfirmModal
                        table={activeTable}
                        row={deleteTarget.row}
                        pkCol={pkCol}
                        dependents={deleteTarget.dependents}
                        token={token}
                        onClose={() => setDeleteTarget(null)}
                        onDeleted={handleDeleted}
                    />
                )}
                {purgeTarget && (
                    <DeleteConfirmModal
                        table={activeTable}
                        row={purgeTarget.row}
                        pkCol={pkCol}
                        dependents={purgeTarget.dependents}
                        token={token}
                        mode="purge"
                        onClose={() => setPurgeTarget(null)}
                        onDeleted={handlePurged}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}