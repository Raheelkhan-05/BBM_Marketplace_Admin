// src/pages/SaveEntry.jsx
// Gate for /save: visitors see the brochure, logged-in buyers see their Dashboard (inside SaveLayout).
// The RFQ / price list now lives at /save/rfq (SaveHomePage).
import { useAuth } from "../context/AuthContext.jsx";
import SavePage from "./SavePage.jsx";
import SaveDashboardPage from "./SaveDashboardPage.jsx";
import "../components/save/save-home.css";
import "../components/save/save.css";

export default function SaveEntry() {
    const { isLoggedIn, initializing } = useAuth();
    if (initializing) {
        return (
            <div className="sh-w" aria-busy="true">
                <div className="sh-sk line" style={{ marginTop: 32, width: "50%" }} />
                <div className="sh-sk" style={{ marginTop: 18 }} />
                <div className="sh-sk" style={{ marginTop: 14 }} />
            </div>
        );
    }
    return isLoggedIn ? <SaveDashboardPage /> : <SavePage />;
}