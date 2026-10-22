// src/pages/GrowStorePage.jsx — "My shop" in the new GROW UI (route: /grow/shop).
// Same data and actions as SellerStorePage: fetchSellerDashboard, updateSellerProfile,
// fetchSellerBankDetails / saveSellerBankDetails, uploadSellerFile, lookupPincode.
//   1. Shop card          – logo, name, share + view shop
//   2. GST registration   – read-only            (collapsed by default)
//   3. Contact            – contact person + logo (collapsed by default)
//   4. Operations         – working days, transport, order hours, dispatch pincode (collapsed by default)
//   5. Bank details                              (collapsed by default)
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
    fetchSellerDashboard, updateSellerProfile,
    fetchSellerBankDetails, saveSellerBankDetails, uploadSellerFile,
} from "../utils/api.js";
import { lookupPincode } from "../utils/sellerListingApi.js";
import { WEEKDAYS } from "../components/seller/fieldConfigs.js";
import { TRANSPORT_OPTIONS } from "../../shared/transportOptions.js";
import Ic from "../components/growSeller/Ic.jsx";
import { Empty } from "../components/growSeller/ui.jsx";
import { useGrowSeller } from "../context/GrowSellerContext.js";
import "../components/growSeller/grow-store.css";

const ICON = {
    gst: { d: "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9 12l2 2 4-4", s: { background: "#E6F0FB", color: "#0F63B5" } },
    contact: { d: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c0-4 4-6 8-6s8 2 8 6", s: { background: "#FDE9E2", color: "#C23A0B" } },
    ops: { d: "M3 6h11v10H3zM14 10h4l3 3v3h-7M7 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4M17 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4", s: { background: "#E3F5EC", color: "#12794A" } },
    bank: { d: "M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18", s: { background: "#FFF4C2", color: "#8A6500" } },
};

const hhmm = (t) => String(t || "").slice(0, 5);
const arr = (v) => (Array.isArray(v) ? v : []);

async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
    try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch { return false; }
}

/* ---------- small pieces ---------- */

// Collapsible card used by every section. Starts collapsed. The body stays
// mounted (just hidden) so unsaved edits are kept when the section is
// closed, and data a section loads on mount (bank details) is ready on open.
function Collapsible({ id, title, sub, right, defaultOpen = false, children }) {
    const [open, setOpen] = useState(defaultOpen);
    const ic = ICON[id];
    const bodyId = `st-body-${id}`;
    return (
        <section className="card">
            <button type="button" className="st-tog" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}>
                <span className="st-ico" style={ic.s}><svg className="ic" viewBox="0 0 24 24"><path d={ic.d} /></svg></span>
                <span className="st-h" style={{ flex: 1, margin: 0, display: "block" }}>
                    <b>{title}</b><small>{sub}</small>
                </span>
                {right}
                <Ic n="chev" />
            </button>
            <div id={bodyId} hidden={!open} style={{ marginTop: 12 }}>
                {children}
            </div>
        </section>
    );
}

function SaveRow({ dirty, saving, error, onSave, label = "Save changes", disabled }) {
    return (
        <div className="st-save">
            <button type="button" className="bt go sm" disabled={!dirty || saving || disabled} onClick={onSave}>
                {saving ? <><Ic n="spin" />Saving…</> : label}
            </button>
            {error && <span className="st-err" role="alert">{error}</span>}
        </div>
    );
}

function Chips({ value, onChange, options }) {
    return (
        <div className="st-chips">
            {options.map(([k, t]) => {
                const on = value.includes(k);
                return (
                    <button key={k} type="button" aria-pressed={on}
                        onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}>{t}</button>
                );
            })}
        </div>
    );
}

/* ---------- sections ---------- */
function ShopCard({ seller }) {
    const { say } = useGrowSeller();
    const slug = seller.shop_slug;
    const link = slug ? `${window.location.origin}/home/?shop=${encodeURIComponent(slug)}` : "";
    const letter = (seller.display_name || "S").trim()[0]?.toUpperCase();

    const share = async () => {
        // Start the copy and the share in the same tick: Safari only allows the share sheet right after a tap.
        const copying = copyText(link);
        if (typeof navigator !== "undefined" && navigator.share) {
            try { await navigator.share({ title: seller.display_name || "Our shop", text: "Browse our products", url: link }); } catch { /* dismissed */ }
        }
        if (await copying) say("Shop link copied.");
    };

    return (
        <div className="card">
            <div className="st-hero">
                <div className="st-logo">{seller.logo_url ? <img src={seller.logo_url} alt="" /> : letter}</div>
                <div className="st-who">
                    <h2>{seller.display_name || "Your shop"}</h2>
                    {seller.status === "approved" && <span className="stt approved">Live</span>}
                </div>
            </div>
            {link ? (
                <>
                    <div className="st-link">{link}</div>
                    <div className="st-acts">
                        <a className="bt sm" href={link} target="_blank" rel="noreferrer">View my shop</a>
                        <button type="button" className="bt go sm" onClick={share}><Ic n="share" />Share</button>
                    </div>
                </>
            ) : <p className="sub2">Your shop link will appear here once your shop is set up.</p>}
        </div>
    );
}

function GstSection({ business }) {
    const b = business || {};
    const nature = Array.isArray(b.nature_of_business) ? b.nature_of_business.join(", ") : b.nature_of_business;
    const rows = [
        ["Legal name", b.legal_name], ["Trade name", b.trade_name], ["GSTIN", b.gstin],
        ["GSTIN status", b.gstin_status ?? b.status], ["Constitution", b.constitution],
        ["Taxpayer type", b.taxpayer_type], ["Registration date", b.gst_registration_date ?? b.registration_date],
        ["Registered address", b.registered_address ?? b.address], ["District", b.district],
        ["State", b.state], ["Pincode", b.pincode], ["PAN", b.pan], ["Nature of business", nature],
    ].filter(([, v]) => v);
    return (
        <Collapsible id="gst" title="GST registration" sub="Taken from your GST record" right={<span className="st-pill">Read only</span>}>
            {rows.length
                ? rows.map(([k, v]) => <div className="st-row" key={k}><small>{k}</small><b>{v}</b></div>)
                : <p className="sub2">No GST details on file.</p>}
        </Collapsible>
    );
}

function ContactSection({ seller, email, token, onSaved }) {
    const { say } = useGrowSeller();
    const initial = seller.contact_person || "";
    const initialLogo = seller.logo_url || "";
    const [person, setPerson] = useState(initial);
    const [logo, setLogo] = useState(initialLogo);
    const [logoBusy, setLogoBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const dirty = (person.trim() !== initial || logo !== initialLogo) && !logoBusy;
    const letter = (seller.display_name || "S").trim()[0]?.toUpperCase();

    const pickLogo = async (file) => {
        if (!file) return;
        if (!file.type?.startsWith("image/")) return setError("Please choose an image file.");
        setError(null);
        setLogoBusy(true);
        try {
            const r = await uploadSellerFile(token, file, "logo");
            if (r?.success) setLogo(r.url); else setError(r?.message || "Logo upload failed. Try again.");
        } catch { setError("Logo upload failed. Try again."); }
        finally { setLogoBusy(false); }
    };

    const save = async () => {
        setError(null);
        if (person.trim().length < 2) return setError("Enter the contact person's name.");
        setSaving(true);
        let res = null;
        try { res = await updateSellerProfile(token, { contact_person: person.trim(), logo_url: logo || null }); } catch { res = null; }
        setSaving(false);
        if (!res?.success) return setError(res?.message || "Couldn't save changes.");
        say(res.staged ? "Saved. Changes will go live after review." : "Contact details saved.");
        onSaved();
    };

    return (
        <Collapsible id="contact" title="Contact" sub="Who buyers and our team reach out to">
            <div className="f">
                <label htmlFor="st-person">Contact person</label>
                <div className="inp"><input id="st-person" value={person} autoComplete="name" placeholder="Full name" onChange={(e) => { setPerson(e.target.value); setError(null); }} /></div>
            </div>
            <div className="st-two">
                <div className="f"><label>Contact number</label>
                    <div className="inp ro"><input readOnly value={seller.whatsapp_number ? `+91 ${seller.whatsapp_number}` : ""} /></div></div>
                <div className="f"><label>Email</label>
                    <div className="inp ro"><input readOnly value={email || ""} /></div></div>
            </div>
            <div className="f">
                <label>Company logo (optional)</label>
                <div className="st-lg">
                    <div className="st-logo">{logo ? <img src={logo} alt="Company logo" /> : letter}</div>
                    <div className="st-btns">
                        <label className={`st-up${logoBusy ? " off" : ""}`}>
                            {logoBusy
                                ? <><Ic n="spin" />Uploading…</>
                                : <>
                                    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
                                    {logo ? "Replace logo" : "Add logo"}
                                </>}
                            <input type="file" accept="image/*" hidden disabled={logoBusy}
                                onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ""; }} />
                        </label>
                        {logo && !logoBusy && <button type="button" className="st-rm" onClick={() => setLogo("")}>Remove</button>}
                    </div>
                </div>
            </div>
            <SaveRow dirty={dirty} saving={saving} error={error} onSave={save} />
        </Collapsible>
    );
}

function OperationsSection({ seller, token, onSaved }) {
    const { say } = useGrowSeller();
    const init = () => ({
        working_days: arr(seller.working_days),
        transport_options: arr(seller.transport_options),
        order_acceptance_start: hhmm(seller.order_acceptance_start),
        order_acceptance_end: hhmm(seller.order_acceptance_end),
        dispatch_pincode: seller.dispatch_pincode || "",
        dispatch_district: seller.dispatch_district || "",
        dispatch_state: seller.dispatch_state || "",
    });
    const [f, setF] = useState(init);
    const [base, setBase] = useState(init);
    const [pin, setPin] = useState(null); // null | checking | error
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const dirty = JSON.stringify(f) !== JSON.stringify(base);
    const set = (patch) => { setF((p) => ({ ...p, ...patch })); setError(null); };

    useEffect(() => { // resolve district/state whenever a complete pincode has none
        const p = f.dispatch_pincode;
        if (!/^\d{6}$/.test(p) || (f.dispatch_district && f.dispatch_state)) return undefined;
        let live = true;
        setPin("checking");
        lookupPincode(p).then((r) => {
            if (!live) return;
            if (r?.success) { setF((x) => (x.dispatch_pincode === p ? { ...x, dispatch_district: r.district, dispatch_state: r.state } : x)); setPin(null); }
            else setPin("error");
        }).catch(() => live && setPin("error"));
        return () => { live = false; };
    }, [f.dispatch_pincode, f.dispatch_district, f.dispatch_state]);

    const valid = f.working_days.length > 0 && f.transport_options.length > 0
        && !!f.order_acceptance_start && !!f.order_acceptance_end && /^\d{6}$/.test(f.dispatch_pincode);

    const save = async () => {
        setError(null);
        if (!valid) return setError("Choose working days, transport, order hours and a 6-digit pincode.");
        setSaving(true);
        let res = null;
        try { res = await updateSellerProfile(token, f); } catch { res = null; }
        setSaving(false);
        if (!res?.success) return setError(res?.message || "Couldn't save changes.");
        setBase(f);
        say(res.staged ? "Saved. Changes will go live after review." : "Operations saved.");
        onSaved();
    };

    const where = f.dispatch_district && f.dispatch_state ? `${f.dispatch_district}, ${f.dispatch_state}` : "";

    return (
        <Collapsible id="ops" title="Operations" sub="Working days, transport and dispatch">
            <div className="f">
                <label>Working days</label>
                <Chips value={f.working_days} onChange={(v) => set({ working_days: WEEKDAYS.filter((d) => v.includes(d)) })}
                    options={WEEKDAYS.map((d) => [d, d.slice(0, 3)])} />
            </div>
            <div className="f">
                <label>Transport channels you can service</label>
                <Chips value={f.transport_options} onChange={(v) => set({ transport_options: v })}
                    options={TRANSPORT_OPTIONS.map((t) => [t.key, t.label])} />
                <p className="st-cap">Buyers can only request the methods you select here.</p>
            </div>
            <div className="st-two">
                <div className="f"><label htmlFor="st-from">Orders from</label>
                    <div className="inp"><input id="st-from" type="time" value={f.order_acceptance_start} onChange={(e) => set({ order_acceptance_start: e.target.value })} /></div></div>
                <div className="f"><label htmlFor="st-until">Orders until</label>
                    <div className="inp"><input id="st-until" type="time" value={f.order_acceptance_end} onChange={(e) => set({ order_acceptance_end: e.target.value })} /></div></div>
            </div>
            <div className="f">
                <label htmlFor="st-pin">Dispatch pincode</label>
                <div className="inp">
                    <input id="st-pin" inputMode="numeric" maxLength={6} placeholder="6-digit pincode" autoComplete="postal-code"
                        value={f.dispatch_pincode}
                        onChange={(e) => { setPin(null); set({ dispatch_pincode: e.target.value.replace(/\D/g, "").slice(0, 6), dispatch_district: "", dispatch_state: "" }); }} />
                </div>
                {pin === "checking" && <p className="st-cap">Checking…</p>}
                {pin === "error" && <p className="st-cap bad">Couldn't verify this pincode. Check it and try again.</p>}
                {!pin && where && <p className="st-cap ok">Dispatching from {where}</p>}
            </div>
            <SaveRow dirty={dirty} saving={saving} error={error} onSave={save} disabled={!valid} />
        </Collapsible>
    );
}

function BankSection({ token }) {
    const { say } = useGrowSeller();
    const [f, setF] = useState({ account_number: "", ifsc_code: "" });
    const [base, setBase] = useState(f);
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const dirty = f.account_number !== base.account_number || f.ifsc_code !== base.ifsc_code;
    const valid = /^\d{9,18}$/.test(f.account_number) && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc_code);

    useEffect(() => {
        let live = true;
        Promise.resolve(fetchSellerBankDetails(token)).then((res) => {
            if (!live) return;
            if (res?.success && res.bank) {
                const b = { account_number: res.bank.account_number || "", ifsc_code: res.bank.ifsc_code || "" };
                setF(b); setBase(b);
            }
            setLoaded(true);
        }).catch(() => live && setLoaded(true));
        return () => { live = false; };
    }, [token]);

    const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setError(null); };

    const save = async () => {
        setError(null);
        if (!valid) return setError("Enter a 9 to 18 digit account number and a valid IFSC code.");
        setSaving(true);
        let res = null;
        try { res = await saveSellerBankDetails(token, { account_number: f.account_number, ifsc_code: f.ifsc_code }); } catch { res = null; }
        setSaving(false);
        if (!res?.success) return setError(res?.message || "Couldn't save bank details.");
        setBase(f);
        say("Bank details saved.");
    };

    return (
        <Collapsible id="bank" title="Bank details" sub="Where your order payouts are sent">
            {!loaded ? <div className="sk line" style={{ marginTop: 6 }} /> : (
                <>
                    <div className="f"><label htmlFor="st-acc">Account number</label>
                        <div className="inp"><input id="st-acc" inputMode="numeric" maxLength={18} autoComplete="off" placeholder="9 to 18 digits"
                            value={f.account_number} onChange={(e) => set("account_number", e.target.value.replace(/\D/g, ""))} /></div></div>
                    <div className="f"><label htmlFor="st-ifsc">IFSC code</label>
                        <div className="inp"><input id="st-ifsc" maxLength={11} autoComplete="off" placeholder="e.g. ABCD0123456"
                            value={f.ifsc_code} onChange={(e) => set("ifsc_code", e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""))} /></div>
                        <p className="st-cap">Used only to send your order payouts.</p></div>
                    <SaveRow dirty={dirty} saving={saving} error={error} onSave={save} label="Save bank details" disabled={!valid} />
                </>
            )}
        </Collapsible>
    );
}

/* ---------- page ---------- */
export default function GrowStorePage() {
    const nav = useNavigate();
    const { token } = useAuth();
    const [dash, setDash] = useState(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetchSellerDashboard(token);
            if (res?.success) { setDash(res); setFailed(false); } else setFailed(true);
        } catch { setFailed(true); }
        setLoading(false);
    }, [token]);

    useEffect(() => { if (token) load(); else setLoading(false); }, [token, load]);

    const back = (
        <div className="back">
            {/* <button className="ib" type="button" aria-label="Back to enquiries" onClick={() => nav("/grow/enquiries")}><Ic n="back" /></button> */}
            <div className="hh">
                <h1>My shop</h1>
                <div className="live"><i />Your details and how buyers reach you</div>
            </div>
        </div>
    );

    if (loading) {
        return (
            <div className="v" aria-busy="true">
                {back}
                <div className="sk tall" style={{ marginTop: 18 }} />
                <div className="sk" style={{ marginTop: 14 }} />
                <div className="sk tall" style={{ marginTop: 14 }} />
            </div>
        );
    }

    if (failed || !dash) {
        return (
            <div className="v">
                {back}
                <div style={{ marginTop: 18 }}>
                    <Empty title="Couldn't load your shop" text="Check your connection and try again.">
                        <br /><button className="bt go" type="button" onClick={() => { setLoading(true); load(); }}>Try again</button>
                    </Empty>
                </div>
            </div>
        );
    }

    // `effective` includes any staged edits, so what the seller just saved is what they see.
    const seller = dash.effective || dash.seller;

    return (
        <div className="v">
            {back}
            <div className="dgrid">
                <div className="dcol">
                    <ShopCard seller={seller} />
                    {dash.seller?.has_pending_changes && (
                        <div className="note warn">Some of your changes are waiting for review and will go live once approved.</div>
                    )}
                    <GstSection business={dash.business} />
                    <ContactSection seller={seller} email={dash.email} token={token} onSaved={load} />
                </div>
                <div className="dcol">
                    <OperationsSection seller={seller} token={token} onSaved={load} />
                    <BankSection token={token} />
                </div>
            </div>
        </div>
    );
}