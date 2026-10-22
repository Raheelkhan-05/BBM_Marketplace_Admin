// src/components/Seo.jsx  (REPLACES the existing file; same props, so no page needs to change)
//
// Source of truth = the seo_metadata table (via GET {API_BASE}/seo/ssr-meta).
// If a page has a saved row, that wins. If it doesn't, the props passed by the page are used exactly
// as before (so nothing regresses). The page's own `noindex` (search results, empty stores) always
// wins over the table, because only the browser knows a page is "thin".
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { API_BASE } from "../utils/api"; // already ends in /api

const SITE = "https://www.bbm.business";
const TTL_MS = 5 * 60 * 1000;

const cache = new Map();   // path -> { t, value }   (value is the payload, or null = use props)
const inflight = new Map();

async function loadOverride(path) {
    const hit = cache.get(path);
    if (hit && Date.now() - hit.t < TTL_MS) return hit.value;
    if (inflight.has(path)) return inflight.get(path);

    const p = fetch(`${API_BASE}/seo/ssr-meta?path=${encodeURIComponent(path)}`, {
        headers: { "x-seo-source": "spa" },
    })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => (data && data.source === "database" ? data : null))
        .catch(() => null)
        .then((value) => {
            cache.set(path, { t: Date.now(), value });
            inflight.delete(path);
            return value;
        });
    inflight.set(path, p);
    return p;
}

export default function Seo({ title, description, path, noindex = false, jsonLd }) {
    const [override, setOverride] = useState(() => {
        const hit = path ? cache.get(path) : null;
        return hit && Date.now() - hit.t < TTL_MS ? hit.value : null;
    });

    useEffect(() => {
        if (!path) { setOverride(null); return undefined; }
        let off = false;
        loadOverride(path).then((v) => { if (!off) setOverride(v); });
        return () => { off = true; };
    }, [path]);

    const ld = jsonLd ? <script type="application/ld+json">{JSON.stringify(jsonLd)}</script> : null;

    if (override) {
        const metas = (override.meta || []).map((m) =>
            m.name === "robots" && noindex ? { ...m, content: "noindex,follow" } : m
        );
        return (
            <Helmet>
                <title>{override.title}</title>
                {metas.map((m, i) =>
                    m.name
                        ? <meta key={i} name={m.name} content={m.content} />
                        : <meta key={i} property={m.property} content={m.content} />
                )}
                {(override.link || []).map((l, i) => <link key={i} rel={l.rel} href={l.href} />)}
                {ld}
            </Helmet>
        );
    }

    // No saved row: behave exactly like before.
    const url = path ? SITE + path : undefined;
    return (
        <Helmet>
            <title>{title}</title>
            {description && <meta name="description" content={description} />}
            {url && <link rel="canonical" href={url} />}
            <meta name="robots" content={noindex ? "noindex,follow" : "index,follow"} />
            <meta property="og:title" content={title} />
            {description && <meta property="og:description" content={description} />}
            {url && <meta property="og:url" content={url} />}
            <meta property="og:type" content="website" />
            {ld}
        </Helmet>
    );
}