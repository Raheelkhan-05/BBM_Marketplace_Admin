// components/TransportResolutionBanner.jsx
//
// Mounted once, at the top of the tree (in Layout, alongside the other
// global toasts). Unlike the transient socket-toast pattern used
// elsewhere, this is a MODAL that stays on screen until the buyer
// explicitly clicks Close — it must never auto-dismiss, because the
// whole point is the buyer needs time to actually read the seller's
// reason, which can be arbitrarily long.
import { AnimatePresence, motion } from "framer-motion";
import { X, XCircle, Truck } from "lucide-react";
import { useOrderResume } from "../context/OrderResumeContext.jsx";

const C = { ink: "#0B1116", muted: "#667077" };

export default function TransportResolutionBanner() {
    const { rejectedIntent, acknowledgeRejection, resumableIntent, resumeNow, dismissResumable } = useOrderResume();

    return (
        <AnimatePresence>
            {rejectedIntent && (
                <motion.div
                    key="rejected"
                    className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                    <motion.div
                        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
                        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <h3 className="mt-1 text-[15px] font-bold" style={{ color: C.ink }}>
                                Transport option declined
                            </h3>
                            <button onClick={acknowledgeRejection} className="rounded-full p-1 hover:bg-black/[0.05]">
                                <X className="h-4 w-4" style={{ color: C.muted }} />
                            </button>
                        </div>

                        <p className="mt-1.5 text-[13px] font-medium leading-relaxed" style={{ color: C.muted }}>
                            {rejectedIntent.sellerName || "The seller"} couldn't accept your proposed transport option
                            {rejectedIntent.destCity ? ` for ${rejectedIntent.destCity}` : ""}.
                        </p>
                        {rejectedIntent.reason && (
                            <div className="mt-3 rounded-xl px-3.5 py-3" style={{ background: "#FDECEC" }}>
                                <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#B3261E" }}>Seller's reason</p>
                                <p className="mt-1 text-[13px] font-semibold leading-snug" style={{ color: "#B3261E" }}>{rejectedIntent.reason}</p>
                            </div>
                        )}
                        <button
                            onClick={acknowledgeRejection}
                            className="mt-4 w-full rounded-xl py-3 text-[13.5px] font-bold text-white"
                            style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}
                        >
                            Close and pick another option
                        </button>
                    </motion.div>
                </motion.div>
            )}

            {!rejectedIntent && resumableIntent && (
                <motion.div
                    key="resumable"
                    className="fixed inset-x-0 bottom-5 md:bottom-6 z-[9999] flex justify-center px-4"
                    initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                >
                    <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-2xl" style={{ borderColor: "rgba(11,17,22,0.09)" }}>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "#006F8312" }}>
                            <Truck className="h-4.5 w-4.5" style={{ color: "#006F83" }} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-bold" style={{ color: C.ink }}>Transport approved!</p>
                            <p className="truncate text-[11.5px] font-medium" style={{ color: C.muted }}>
                                {resumableIntent.productName || "Your order"} is ready to complete.
                            </p>
                        </div>
                        <button onClick={dismissResumable} className="shrink-0 rounded-full p-1.5 hover:bg-black/[0.05]">
                            <X className="h-3.5 w-3.5" style={{ color: C.muted }} />
                        </button>
                        <button onClick={resumeNow} className="shrink-0 rounded-xl px-3.5 py-2 text-[12.5px] font-bold text-white" style={{ background: "#006F83" }}>
                            Resume
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}