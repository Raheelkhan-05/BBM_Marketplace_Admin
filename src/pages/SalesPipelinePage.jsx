import { useNavigate } from "react-router-dom";
import { TrendingUp, ArrowLeft } from "lucide-react";

export default function SalesPipelinePage() {
    const nav = useNavigate();

    return (
        <div className="gd">
            <div className="gk-ph">
                <div><h1>Pipeline</h1><p>Track your deals from first contact to order.</p></div>
            </div>

            <div className="gk-empty gk-rise" style={{ marginTop: 18, "--i": 0, padding: "56px 20px" }}>
                <span className="gk-ico" style={{ "--a": "var(--k-gr)", width: 56, height: 56, borderRadius: 10 }}>
                    <TrendingUp style={{ width: 26, height: 26 }} aria-hidden="true" />
                </span>
                <b>Coming soon</b>
                We're building your sales pipeline. You'll be able to follow each customer's deal stage by stage right here.
                <button type="button" className="gk-btn" onClick={() => nav("/sales/dashboard")}>
                    <ArrowLeft size={16} aria-hidden="true" />Back to dashboard
                </button>
            </div>
        </div>
    );
}