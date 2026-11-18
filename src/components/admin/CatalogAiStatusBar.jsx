// components/admin/CatalogAiStatusBar.jsx
// One strip that tells the admin what the AI image queue is doing right now.
import { Loader2, Sparkles, AlertTriangle, RefreshCw } from "lucide-react";
import { C } from "../catalog/tokens";

const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

export default function CatalogAiStatusBar({ active, failed, stats, onStop, onRetryFailed, onDismissFailed }) {
    if (!active && !failed) return null;
    const total = Math.max(stats.total, stats.finished + active);
    const pct = total ? Math.min(100, Math.round((stats.finished / total) * 100)) : 0;

    return (
        <div className="mb-3 space-y-2" role="status" aria-live="polite">
            {active > 0 && (
                <div className="rounded-xl border px-4 py-3" style={{ borderColor: C.hair, background: "#f0f9ff" }}>
                    <div className="flex items-center gap-3">
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: C.primary }} />
                        <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 text-[13px] font-extrabold" style={{ color: C.ink }}>
                                <Sparkles className="h-3.5 w-3.5" style={{ color: C.primary }} />
                                Creating product images · {stats.finished} of {total} done
                            </p>
                            <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>
                                {plural(active, "image is", "images are")} still being made on our server. You can keep working, or close this page and come back. Nothing is lost.
                            </p>
                        </div>
                        <button type="button" onClick={onStop} className="shrink-0 text-[12px] font-bold underline underline-offset-2" style={{ color: C.muted }}>Stop</button>
                    </div>
                    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#dbeafe" }}>
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, 4)}%`, background: C.primary }} />
                    </div>
                </div>
            )}
            {failed > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor: "#fecaca", background: "#fef2f2" }}>
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-700" />
                    <p className="min-w-0 flex-1 text-[12.5px] font-bold text-red-800">
                        {plural(failed, "image could not be created", "images could not be created")}. You can try again, or add photos by hand.
                    </p>
                    <button type="button" onClick={onRetryFailed} className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-[12px] font-bold text-red-800" style={{ borderColor: "#fecaca" }}>
                        <RefreshCw className="h-3.5 w-3.5" />Try again
                    </button>
                    <button type="button" onClick={onDismissFailed} className="text-[12px] font-bold text-red-800 underline underline-offset-2">Dismiss</button>
                </div>
            )}
        </div>
    );
}