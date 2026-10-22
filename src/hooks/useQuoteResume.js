// src/hooks/useQuoteResume.js
// After the seller adds a product from the quote popup (separate page), that page navigates back with
//   state: { resumeQuote: { enquiry, submissionId } }
// A page that hosts RfqQuoteModal calls this hook to re-open the popup with the new product preselected.
//   const [resume, clearResume] = useQuoteResume();
//   resume -> { enquiry, submissionId } | null
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function useQuoteResume() {
    const location = useLocation();
    const nav = useNavigate();
    const resume = location.state?.resumeQuote?.enquiry ? location.state.resumeQuote : null;
    const clear = useCallback(() => {
        nav(`${location.pathname}${location.search}`, { replace: true, state: null });
    }, [nav, location.pathname, location.search]);
    return [resume, clear];
}