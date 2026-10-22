import { useState, useEffect } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { startOrderPayment, startGroupPayment, redirectToGateway } from "../../utils/paymentsApi.js";
import { NoticeBox } from "./PriceChangeNotice.jsx";

// expectedTotal: the amount currently shown to the buyer. If the price moved since, the server refuses
// (PRICE_CHANGED) instead of charging an amount the buyer hasn't seen. onPriceChanged: refetch the orders.
export default function ResumePaymentButton({
    orderId, groupId = null, label = "Complete payment", className = "sh-btn go sm",
    expectedTotal = null, onPriceChanged = null,
}) {
    const { token } = useAuth();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);

    useEffect(() => {
        const onShow = (e) => { if (e.persisted) setBusy(false); };
        window.addEventListener("pageshow", onShow);
        return () => window.removeEventListener("pageshow", onShow);
    }, []);

    const pay = async () => {
        if (busy) return;
        setError(null);
        setNotice(null);
        setBusy(true);
        let navigating = false;
        try {
            const res = groupId
                ? await startGroupPayment(token, groupId, expectedTotal)
                : await startOrderPayment(token, orderId, expectedTotal);
            if (!res?.success || !res.redirectUrl) {
                if (res?.code === "PRICE_CHANGED") {
                    const d = res.details || {};
                    setNotice({ up: Number(d.currentTotal) > Number(d.previousTotal), message: res.message });
                    onPriceChanged?.();
                } else if (res?.code === "ORDER_UNAVAILABLE") {
                    setError(res.message);
                    onPriceChanged?.();
                } else {
                    setError(res?.message || "Couldn't start the payment. Please try again.");
                }
                return;
            }
            navigating = redirectToGateway(res.redirectUrl);
            if (!navigating) setError("Couldn't open the payment page. Please try again.");
        } catch {
            setError("Couldn't start the payment. Please try again.");
        } finally {
            if (!navigating) setBusy(false);
        }
    };

    return (
        <div>
            <button type="button" className={className} onClick={pay} disabled={busy}>
                {busy ? <Loader2 size={16} className="sh-spin" /> : <CreditCard size={16} />}
                {busy ? "Opening payment…" : label}
            </button>
            {notice && (
                <NoticeBox tone={notice.up ? "up" : "down"} title="The price changed" onDismiss={() => setNotice(null)}>
                    {notice.message}
                </NoticeBox>
            )}
            {error && <p className="sh-err" role="alert" style={{ marginTop: 8 }}>{error}</p>}
        </div>
    );
}