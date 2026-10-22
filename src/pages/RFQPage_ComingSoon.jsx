// src/pages/RfqComingSoonPage.jsx
// Placeholder for /rfq until the real RFQ flow ships.

import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, FileText, ClipboardList, Store, BadgeCheck } from "lucide-react";

const FONT_BODY = "'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Public Sans', Roboto, sans-serif";
const TEAL = "#000000ff";
const TEAL_DARK = "#000000ff";
const TEAL_TINT = "#E3F3F5";
const TEAL_BORDER = "#bfc7e8ff";
const INK = "#0B1116";
const MUTED = "#667077";
const EASE = [0.16, 1, 0.3, 1];

const STEPS = [
    { Icon: ClipboardList, title: "Post your requirement", text: "Tell us what you need, the quantity and your delivery location." },
    { Icon: Store, title: "Receive multiple quotes", text: "Verified sellers respond with their best price and delivery time." },
    { Icon: BadgeCheck, title: "Compare and buy", text: "Pick the offer that suits you and place the order in one place." },
];

export default function RFQPage() {
    const reduce = useReducedMotion();

    return (
        <div className="min-h-screen bg-white text-slate-900 antialiased" style={{ fontFamily: FONT_BODY }}>
            <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 pb-10 pt-4">
                <Link
                    to="/home"
                    className="inline-flex w-fit items-center gap-1.5 rounded-full py-1.5 pr-3 text-[12.5px] font-bold tracking-wide hover:bg-black/[0.04]"
                    style={{ color: INK }}
                >
                    <ArrowLeft className="h-4 w-4" strokeWidth={2.4} />
                    Back to products
                </Link>

                <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
                    <motion.div
                        initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.35, ease: EASE }}
                        className="relative flex h-20 w-20 items-center justify-center rounded-full"
                        style={{ background: TEAL }}
                    >
                        {!reduce && (
                            <motion.span
                                aria-hidden
                                className="absolute inset-0 rounded-full"
                                style={{ background: TEAL }}
                                initial={{ opacity: 0.35, scale: 1 }}
                                animate={{ opacity: 0, scale: 1.6 }}
                                transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                            />
                        )}
                        <FileText className="relative h-9 w-9 text-white" strokeWidth={1.8} />
                    </motion.div>

                    <span
                        className="mt-5 rounded-full border px-3 py-1 text-[10.5px] font-extrabold uppercase tracking-wider"
                        style={{ background: TEAL_TINT, borderColor: TEAL_BORDER, color: TEAL_DARK }}
                    >
                        Coming soon
                    </span>

                    <h1 className="mt-3 text-[26px] font-extrabold leading-tight tracking-wide" style={{ color: INK }}>
                        Request for Quotation
                    </h1>
                    <p className="mt-2 max-w-sm text-[13.5px] font-medium leading-relaxed tracking-wide" style={{ color: MUTED }}>
                        Soon you will be able to send one request and get quotes from multiple sellers. We are putting the finishing touches on it.
                    </p>

                    <div className="mt-8 grid w-full gap-2.5 text-left">
                        {STEPS.map(({ Icon, title, text }, i) => (
                            <motion.div
                                key={title}
                                initial={reduce ? false : { opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3, ease: EASE, delay: 0.1 + i * 0.06 }}
                                className="flex items-start gap-3 rounded-md border px-3 py-3"
                                style={{ background: TEAL_TINT, borderColor: TEAL_BORDER }}
                            >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: TEAL }}>
                                    <Icon className="h-4 w-4 text-white" strokeWidth={2} />
                                </span>
                                <span className="min-w-0 leading-tight">
                                    <span className="block text-[13px] font-extrabold tracking-wide" style={{ color: TEAL_DARK }}>{title}</span>
                                    <span className="mt-0.5 block text-[11.5px] font-medium leading-snug tracking-wide" style={{ color: MUTED }}>{text}</span>
                                </span>
                            </motion.div>
                        ))}
                    </div>

                    <Link
                        to="/home"
                        className="mt-8 rounded-xl px-6 py-3 text-[13px] font-extrabold tracking-wide text-white transition-transform active:scale-[0.97]"
                        style={{ background: TEAL }}
                    >
                        Continue browsing
                    </Link>
                </div>
            </main>
        </div>
    );
}