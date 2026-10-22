import { useEffect } from "react";
import { X, Check, UserX } from "lucide-react";

// Admin-only picker. Uses the shared .gk-shade / .gk-sheet styles from grow-modules.css.
export default function AssignSalespersonSheet({ customer, salespeople, busy, onClose, onPick }) {
    useEffect(() => {
        if (!customer) return undefined;
        const k = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", k);
        return () => document.removeEventListener("keydown", k);
    }, [customer, onClose]);
    if (!customer) return null;
    const current = customer.assignment?.userId || null;

    return (
        <div className="gk gk-shade" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="gk-sheet" role="dialog" aria-modal="true" aria-label="Assign customer" style={{ maxHeight: "80dvh" }}>
                <div className="gk-sheet-h">
                    <h2>Assign {customer.name}</h2>
                    <button type="button" className="gk-icbtn" onClick={onClose} aria-label="Close"><X size={18} /></button>
                </div>
                <div className="gk-sheet-b" style={{ display: "grid", gap: 8 }}>
                    {salespeople.length === 0 && <p style={{ color: "var(--k-mute)" }}>No salespeople yet. Invite one from the Team panel and choose the Salesperson role.</p>}
                    {salespeople.map((s) => (
                        <button key={s.userId} type="button" className="gk-btn" disabled={busy}
                            style={{ justifyContent: "space-between", minHeight: 52 }} onClick={() => onPick(s.userId)}>
                            <span>{s.name}</span>{current === s.userId && <Check size={18} />}
                        </button>
                    ))}
                    {current && (
                        <button type="button" className="gk-btn danger" disabled={busy} onClick={() => onPick(null)}>
                            <UserX size={16} />Remove assignment
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}