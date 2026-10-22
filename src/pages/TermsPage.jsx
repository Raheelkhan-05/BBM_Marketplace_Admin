// pages/TermsPage.jsx
import { FileText } from "lucide-react";
import LegalDocument from "../components/LegalDocument.jsx";
import TERMS_CONTENT from "../data/termsData.js";

// Bump this only when the terms content itself changes — this is a
// "last updated" marker, not today's date. Format: "MMMM D, YYYY".
const TERMS_LAST_UPDATED = "September 18, 2026";

export default function TermsPage() {
    return (
        <LegalDocument
            content={TERMS_CONTENT}
            icon={FileText}
            title="B2B Marketplace Participant Agreement"
            intro="These Terms govern registration and use of the BBM Platform, and the purchase and sale of Products through it. By creating an account or using the Platform, you agree to be bound by this Agreement."
            lastUpdated={TERMS_LAST_UPDATED}
            disclaimer="This page is a plain rendering of the executed Agreement for reference. In case of any discrepancy between this page and the signed Agreement, the signed Agreement shall prevail."
        />
    );
}