// components/PendingPaymentGate.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { loadPaymentSession, clearPaymentSession } from "../utils/paymentSession.js";
import { loadOrderFormSession, clearOrderFormSession } from "../utils/orderFormSession.js";
import { fetchPaymentInstructions } from "../utils/api.js";
import PaymentQRModal from "./PaymentQRModal.jsx";
import BuyNowModal from "./BuyNowModal.jsx";

export default function PendingPaymentGate() {
    const { token, initializing } = useAuth();
    const navigate = useNavigate();
    const [resumeOrderId, setResumeOrderId] = useState(null);
    const [checked, setChecked] = useState(false);
    // When the buyer closes the QR modal from here (i.e. after a reload —
    // there's no live BuyNowModal instance to fall back into), we
    // reconstruct one from the saved order-form snapshot instead of just
    // dropping the buyer with nothing.
    const [resumeForm, setResumeForm] = useState(null);

    useEffect(() => {
        if (initializing) return;
        if (!token) { setChecked(true); return; }
        const session = loadPaymentSession();
        if (!session) { setChecked(true); return; }

        let cancelled = false;
        (async () => {
            const res = await fetchPaymentInstructions(token, session.orderId);
            if (cancelled) return;
            if (res?.success) {
                setResumeOrderId(session.orderId);
            } else {
                clearPaymentSession();
            }
            setChecked(true);
        })();
        return () => { cancelled = true; };
    }, [token, initializing]);

    const handleCloseQr = () => {
        const formSession = loadOrderFormSession(resumeOrderId);
        clearPaymentSession();
        if (formSession) {
            // Don't clear orderFormSession here — BuyNowModal's own mount
            // effect reads it again to hydrate quantity/address/notes/etc.
            // It gets cleared once the buyer actually acts (submits again,
            // or backs out via handleBackToEdit/handleCloseToEdit).
            setResumeForm(formSession);
        }
        setResumeOrderId(null);
    };

    if (!checked) return null;

    if (resumeForm) {
        return (
            <BuyNowModal
                seller={resumeForm.seller}
                product={resumeForm.product}
                onClose={() => { clearOrderFormSession(); setResumeForm(null); }}
            />
        );
    }

    if (!resumeOrderId) return null;

    return (
        <PaymentQRModal
            token={token}
            orderId={resumeOrderId}
            onClose={handleCloseQr}
            onDoneViewOrders={() => { setResumeOrderId(null); navigate("/orders"); }}
        />
    );
}