// pages/PrivacyPage.jsx
import { ShieldCheck } from "lucide-react";
import LegalDocument from "../components/LegalDocument.jsx";
import PRIVACY_CONTENT from "../data/privacyPolicyData.js";

// Bump this only when the privacy policy content itself changes — this is a
// "last updated" marker, not today's date. Format: "MMMM D, YYYY".
const PRIVACY_LAST_UPDATED = "September 18, 2026";

export default function PrivacyPage() {
    return (
        <LegalDocument
            content={PRIVACY_CONTENT}
            icon={ShieldCheck}
            title="Privacy Policy"
            intro="This Policy explains how BBM collects, uses, discloses and protects your Personal Data in connection with the Platform. By registering for or continuing to use the Platform, you agree to the practices described here."
            lastUpdated={PRIVACY_LAST_UPDATED}
            disclaimer="This page is a plain rendering of our Privacy Policy for reference. In case of any discrepancy between this page and the version filed or executed for regulatory purposes, the latter shall prevail."
            preserveLineBreaks
        />
    );
}