// components/orders/RaiseDisputeModal.jsx
// Step 1: what's wrong  ->  Step 2: specifics (depends on step 1)  ->  Step 3: describe + proof + desired outcome
import { useMemo, useState } from "react";
import { Loader2, ChevronRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { C } from "../catalog/tokens.js";
import { raiseOrderDispute } from "../../utils/api.disputes.js";
import { ModalShell, FilePicker, fmtDateTime } from "./disputeUi.jsx";
import {
    DISPUTE_CATEGORIES, DESIRED_RESOLUTIONS, findCategory,
    MIN_DESCRIPTION_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_EVIDENCE_FILES, MAX_EVIDENCE_BYTES, EVIDENCE_MIME_TYPES,
} from "../../../shared/disputeConfig.js";

function Radio({ active, onClick, disabled, children }) {
    return (
        <button type="button" role="radio" aria-checked={active} disabled={disabled} onClick={onClick}
            className="flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors"
            style={active ? { borderColor: C.secondary, background: `${C.secondary}0F` } : { borderColor: C.hair }}>
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: active ? C.secondary : C.hair }}>
                {active && <span className="h-2 w-2 rounded-full" style={{ background: C.secondary }} />}
            </span>
            <span className="text-[13px] font-semibold tracking-wide" style={{ color: C.ink }}>{children}</span>
        </button>
    );
}

const inputCls = "mt-1.5 w-full rounded-xl border px-3 py-2.5 text-[13px] font-medium outline-none focus:border-[#0B7285]";

export default function RaiseDisputeModal({ order, onClose, onSubmitted }) {
    const { token } = useAuth();
    const [step, setStep] = useState(0);
    const [categoryCode, setCategoryCode] = useState("");
    const [subReason, setSubReason] = useState("");
    const [details, setDetails] = useState({});
    const [description, setDescription] = useState("");
    const [desiredResolution, setDesiredResolution] = useState("");
    const [files, setFiles] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const category = useMemo(() => findCategory(categoryCode), [categoryCode]);

    const step1Ok = !!category;
    const step2Ok = !!category
        && (category.subReasons.length === 0 || !!subReason)
        && category.detailFields.every((f) => !f.required || (details[f.key] || "").trim());
    const descLen = description.trim().length;
    const step3Ok = descLen >= MIN_DESCRIPTION_LENGTH && !!desiredResolution && (!category?.evidenceRequired || files.length > 0);

    const pickCategory = (code) => {
        if (code !== categoryCode) { setCategoryCode(code); setSubReason(""); setDetails({}); }
        setStep(1);
    };

    const submit = async () => {
        if (!step3Ok || busy) return;
        setBusy(true); setError(null);
        const fd = new FormData();
        fd.append("category", category.code);
        fd.append("subReason", subReason);
        fd.append("details", JSON.stringify(details));
        fd.append("description", description.trim());
        fd.append("desiredResolution", desiredResolution);
        files.forEach((f) => fd.append("evidence", f));
        const res = await raiseOrderDispute(token, order.id, fd);
        setBusy(false);
        if (!res?.success) { setError(res?.message || "Couldn't raise the dispute. Please try again."); return; }
        setStep(3);
        onSubmitted?.(res);
    };

    const titles = ["What went wrong?", "Tell us more", "Describe the issue", "Dispute raised"];

    let footer = null;
    if (step === 1) footer = (
        <div className="flex gap-2">
            <button type="button" onClick={() => setStep(0)} className="flex-1 rounded-xl border px-4 py-2.5 text-[13px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>Back</button>
            <button type="button" disabled={!step2Ok} onClick={() => setStep(2)} className="flex-1 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.secondary }}>Continue</button>
        </div>
    );
    if (step === 2) footer = (
        <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => setStep(1)} className="flex-1 rounded-xl border px-4 py-2.5 text-[13px] font-bold disabled:opacity-50" style={{ borderColor: C.hair, color: C.ink }}>Back</button>
            <button type="button" disabled={!step3Ok || busy} onClick={submit}
                className="flex flex-1 items-center justify-center rounded-xl px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit dispute"}
            </button>
        </div>
    );
    if (step === 3) footer = (
        <button type="button" onClick={onClose} className="w-full rounded-xl px-4 py-2.5 text-[13px] font-bold text-white" style={{ background: C.secondary }}>Done</button>
    );

    return (
        <ModalShell title={titles[step]} subtitle={`Order ${order.order_number}`} onClose={onClose} busy={busy} footer={footer}>
            {step === 0 && (
                <div className="flex flex-col gap-2">
                    {order.dispute_window_ends_at && (
                        <p className="mb-1 text-[12px] font-semibold tracking-wide" style={{ color: C.muted }}>
                            You can raise a dispute until {fmtDateTime(order.dispute_window_ends_at)}.
                        </p>
                    )}
                    {DISPUTE_CATEGORIES.map((c) => (
                        <button key={c.code} type="button" onClick={() => pickCategory(c.code)}
                            className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors hover:bg-black/[0.02]" style={{ borderColor: C.hair }}>
                            <span className="min-w-0">
                                <span className="block text-[13.5px] font-bold tracking-wide" style={{ color: C.ink }}>{c.label}</span>
                                <span className="mt-0.5 block text-[11.5px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>{c.hint}</span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: C.muted }} />
                        </button>
                    ))}
                </div>
            )}

            {step === 1 && category && (
                <div className="flex flex-col gap-4">
                    <p className="text-[12.5px] font-semibold tracking-wide" style={{ color: C.muted }}>{category.label}</p>
                    {category.subReasons.length > 0 && (
                        <div>
                            <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>What best describes the problem?</p>
                            <div className="mt-2 flex flex-col gap-2" role="radiogroup">
                                {category.subReasons.map((s) => (
                                    <Radio key={s.code} active={subReason === s.code} onClick={() => setSubReason(s.code)}>{s.label}</Radio>
                                ))}
                            </div>
                        </div>
                    )}
                    {category.detailFields.map((f) => (
                        <div key={f.key}>
                            <label className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>
                                {f.label}{f.required ? "" : " (optional)"}
                            </label>
                            {f.type === "select" ? (
                                <div className="mt-2 flex flex-col gap-2" role="radiogroup">
                                    {f.options.map((o) => (
                                        <Radio key={o.value} active={details[f.key] === o.value} onClick={() => setDetails((d) => ({ ...d, [f.key]: o.value }))}>{o.label}</Radio>
                                    ))}
                                </div>
                            ) : (
                                <input value={details[f.key] || ""} maxLength={300} onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))}
                                    className={inputCls} style={{ borderColor: C.hair, color: C.ink }} />
                            )}
                        </div>
                    ))}
                    {category.subReasons.length === 0 && category.detailFields.length === 0 && (
                        <p className="text-[12.5px] font-medium tracking-wide" style={{ color: C.muted }}>No extra details needed — continue to describe the issue.</p>
                    )}
                </div>
            )}

            {step === 2 && category && (
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>What happened?</label>
                        <textarea value={description} rows={4} maxLength={MAX_DESCRIPTION_LENGTH} disabled={busy} onChange={(e) => setDescription(e.target.value)}
                            placeholder="Explain the issue clearly — what you ordered, what you received, and when you noticed."
                            className={`${inputCls} resize-none`} style={{ borderColor: C.hair, color: C.ink }} />
                        <p className="mt-1 text-right text-[10.5px] font-semibold tabular-nums" style={{ color: descLen >= MIN_DESCRIPTION_LENGTH ? C.muted : "#b45309" }}>
                            {descLen < MIN_DESCRIPTION_LENGTH ? `At least ${MIN_DESCRIPTION_LENGTH} characters · ` : ""}{descLen}/{MAX_DESCRIPTION_LENGTH}
                        </p>
                    </div>

                    <div>
                        <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>
                            Photos / documents {category.evidenceRequired ? "(required)" : "(recommended)"}
                        </p>
                        <p className="mb-2 mt-0.5 text-[11.5px] font-medium tracking-wide" style={{ color: C.muted }}>
                            Up to {MAX_EVIDENCE_FILES} files · JPG, PNG, WebP or PDF · {Math.round(MAX_EVIDENCE_BYTES / 1024 / 1024)} MB each
                        </p>
                        <FilePicker files={files} onChange={setFiles} max={MAX_EVIDENCE_FILES} maxBytes={MAX_EVIDENCE_BYTES} accept={EVIDENCE_MIME_TYPES} disabled={busy} />
                    </div>

                    <div>
                        <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>What outcome are you looking for?</p>
                        <div className="mt-2 flex flex-col gap-2" role="radiogroup">
                            {DESIRED_RESOLUTIONS.map((r) => (
                                <Radio key={r.code} active={desiredResolution === r.code} disabled={busy} onClick={() => setDesiredResolution(r.code)}>{r.label}</Radio>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3" style={{ background: "#0B72850D" }}>
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#0B7285" }} />
                        <ul className="list-disc space-y-1 pl-3.5 text-[11.5px] font-medium leading-snug tracking-wide" style={{ color: C.ink }}>
                            <li>The seller's payment for this order stays on hold.</li>
                            <li>The seller can share their side and proof.</li>
                            <li>Our admin team reviews both sides impartially and decides.</li>
                            <li>You'll see the decision on this order.</li>
                        </ul>
                    </div>
                    {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{error}</p>}
                </div>
            )}

            {step === 3 && (
                <div className="flex flex-col items-center px-2 py-6 text-center">
                    <CheckCircle2 className="h-12 w-12" style={{ color: "#059669" }} />
                    <p className="mt-3 text-[15px] font-extrabold tracking-wide" style={{ color: C.ink }}>We've received your dispute</p>
                    <p className="mt-1.5 max-w-xs text-[12.5px] font-medium leading-relaxed tracking-wide" style={{ color: C.muted }}>
                        The seller's payment is on hold while our team reviews this. We'll notify you as soon as there's an update.
                    </p>
                </div>
            )}
        </ModalShell>
    );
}