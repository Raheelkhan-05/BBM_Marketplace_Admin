import { useEffect, useState } from "react";
import { MapPin, X } from "lucide-react";
import { fetchShopInfo } from "../../utils/api";

const C = { ink: "#0B1116", muted: "#667077", hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)" };

export default function ShopBanner({ shopSlug, onClear, onLoaded }) {
    const [state, setState] = useState({ status: "loading", shop: null });

    useEffect(() => {
        const controller = new AbortController();
        setState({ status: "loading", shop: null });
        onLoaded?.(null);
        fetchShopInfo(shopSlug, controller.signal)
            .then((res) => {
                if (controller.signal.aborted) return;
                if (res?.success && res.shop) {
                    setState({ status: "ok", shop: res.shop });
                    onLoaded?.(res.shop.display_name || null);
                } else {
                    setState({ status: "missing", shop: null });
                }
            })
            .catch((err) => {
                if (err?.name !== "AbortError") setState({ status: "error", shop: null });
            });
        return () => controller.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shopSlug]);

    const { status, shop } = state;
    const place = shop ? [shop.city, shop.state].filter(Boolean).join(", ") : "";
    const initial = (shop?.display_name || "S").trim().charAt(0).toUpperCase();

    return (
        <div
            className="flex min-h-[68px] md:mt-2 mb-2 md:mb-4 items-center gap-3 rounded-2xl md:border px-3 py-2.5 sm:px-4"
            style={{ borderColor: C.hair, background: "#ffffffff" }}
        >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black text-[16px] font-extrabold text-white">
                {status === "ok" && shop.logo_url
                    ? <img src={shop.logo_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    : status === "ok" ? initial : null}
            </span>

            <div className="min-w-0 flex-1">
                {status === "loading" && (
                    <div className="space-y-1.5">
                        <div className="h-2 w-24 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                        <div className="h-3.5 w-40 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                    </div>
                )}
                {status === "ok" && (
                    <>
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>You're viewing store</p>
                        <p className="truncate text-[15px] font-extrabold leading-tight tracking-wide" style={{ color: C.ink }}>{shop.display_name}</p>
                        {place && (
                            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-medium tracking-wide" style={{ color: C.muted }}>
                                <MapPin className="h-3 w-3 shrink-0" /> {place}
                            </p>
                        )}
                    </>
                )}
                {(status === "missing" || status === "error") && (
                    <>
                        <p className="text-[13.5px] font-extrabold" style={{ color: C.ink }}>
                            {status === "missing" ? "This store link isn't valid" : "Couldn't load this store"}
                        </p>
                        <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>
                            {status === "missing" ? "The store may have been removed." : "Please check your connection and try again."}
                        </p>
                    </>
                )}
            </div>

            <button
                type="button"
                onClick={onClear}
                className="flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[11.5px] font-extrabold tracking-wide transition-colors hover:bg-black/[0.04]"
                style={{ borderColor: "rgba(11,17,22,0.22)", color: C.ink, background: "#fff" }}
            >
                <X className="h-3 w-3" strokeWidth={2.6} />
                <span className="hidden sm:inline">Close</span>
                <span className="sm:hidden">Close</span>
            </button>
        </div>
    );
}