// src/components/LegalDocument.jsx
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { AUTH_THEME_CSS, AuthHeader, useAuthTheme } from "./authTheme.jsx";

// slugify a heading into a stable, unique anchor id
function slugify(text, index) {
    const base = text
        .toLowerCase()
        .replace(/[“”"']/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    return `${base || "section"}-${index}`;
}

// The nav only surfaces top-level ("h1") headings so it stays readable;
// h2 sub-clauses are still rendered in the body with their own anchors.
function useStructure(content) {
    return useMemo(() => {
        const items = content.map((item, i) => ({
            ...item,
            id: item.k !== "body" ? slugify(item.t, i) : undefined,
        }));
        return { items, toc: items.filter((i) => i.k === "h1") };
    }, [content]);
}

function TocList({ items, activeId, onNavigate }) {
    return (
        <nav aria-label="Table of contents">
            <ul className="tl">
                {items.map((item) => (
                    <li key={item.id}>
                        <button
                            type="button"
                            aria-current={item.id === activeId ? "true" : undefined}
                            onClick={() => onNavigate(item.id)}
                        >
                            {item.t}
                        </button>
                    </li>
                ))}
            </ul>
        </nav>
    );
}

// Memoised: the document is very long, so scroll-spy updates (activeId)
// must not re-render every paragraph.
const Body = memo(function Body({ items, sectionRefs, preserveLineBreaks }) {
    return (
        <>
            {items.map((item, i) => {
                if (item.k === "h1") {
                    return (
                        <h2 key={i} id={item.id} ref={(el) => (sectionRefs.current[item.id] = el)}>
                            {item.t}
                        </h2>
                    );
                }
                if (item.k === "h2") {
                    return <h3 key={i} id={item.id}>{item.t}</h3>;
                }
                return <p key={i} className={preserveLineBreaks ? "pre" : undefined}>{item.t}</p>;
            })}
        </>
    );
});

const LEGAL_CSS = `
.ba .lw{max-width:1120px}
.ba .lh{padding:36px 0 28px;border-bottom:1px solid var(--line)}
.ba .lh .pi{width:52px;height:52px;border-radius:17px;background:var(--go);color:#06161C;display:grid;place-items:center;margin-bottom:18px}
.ba .lh h1{font:900 clamp(1.9rem,6vw,3rem)/1.06 var(--f);letter-spacing:-.03em}
.ba .lh .in{color:var(--mute);margin-top:14px;max-width:64ch;font-size:1.05rem}
.ba .lh .lu{margin-top:18px;font-size:.78rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--tt)}

.ba .lbody{display:grid;grid-template-columns:minmax(0,1fr);gap:32px;padding:32px 0 72px}
@media(min-width:1024px){.ba .lbody{grid-template-columns:260px minmax(0,1fr);gap:48px}}
.ba .lside{display:none}
@media(min-width:1024px){.ba .lside{display:block}}
.ba .lside .stk{position:sticky;top:calc(64px + env(safe-area-inset-top,0px) + 20px);max-height:calc(100vh - 64px - 40px);max-height:calc(100dvh - 64px - 40px);overflow-y:auto;padding:0 8px 24px 0}
.ba .tcap{padding:0 12px;margin-bottom:8px;font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--mute)}
.ba .tl{list-style:none;padding:0;display:flex;flex-direction:column;gap:2px}
.ba .tl button{width:100%;text-align:left;border:0;background:none;border-radius:12px;padding:9px 12px;font:700 .86rem/1.35 var(--f);color:var(--mute);transition:background .15s,color .15s}
.ba .tl button:hover{background:var(--s2);color:var(--ink)}
.ba .tl button[aria-current="true"]{background:var(--ink);color:var(--bg)}

.ba .art{min-width:0;max-width:760px}
.ba .art h2{margin-top:44px;font:900 clamp(1.3rem,3.2vw,1.65rem)/1.2 var(--f);letter-spacing:-.02em;scroll-margin-top:calc(88px + env(safe-area-inset-top,0px))}
.ba .art h2:first-child{margin-top:0}
.ba .art h3{margin-top:24px;font:800 1.02rem/1.4 var(--f);scroll-margin-top:calc(88px + env(safe-area-inset-top,0px))}
.ba .art p{margin-top:10px;color:var(--mute);font-size:.98rem;line-height:1.75;overflow-wrap:anywhere}
.ba .art p.pre{white-space:pre-line}
@media(min-width:640px){.ba .art p{text-align:justify}}
.ba .note{margin-top:48px;padding:18px 20px;border:1px solid var(--line);border-radius:20px;background:var(--s);color:var(--mute);font-size:.9rem;line-height:1.65}

.ba .bt.tgl{min-height:42px;padding:0 16px;font-size:.9rem}
@media(min-width:1024px){.ba .bt.tgl{display:none}}
.ba .msh{overflow:hidden;border-top:1px solid var(--line)}
.ba .msh .in2{max-height:60vh;max-height:60dvh;overflow-y:auto;padding:12px 20px 16px}
.ba .msh .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.ba .msh .top .tcap{margin:0;padding:0}
.ba .msh .top button{width:36px;height:36px;border:0;border-radius:50%;background:none;display:grid;place-items:center;color:var(--mute)}
.ba .msh .top button:hover{background:var(--s2);color:var(--ink)}
@media(max-width:560px){.ba .lh{padding:26px 0 22px}.ba .lbody{padding:24px 0 56px}}
`;

export default function LegalDocument({ content, icon: Icon, title, intro, lastUpdated, disclaimer, preserveLineBreaks = false }) {
    const { theme, toggleTheme } = useAuthTheme();
    const { items, toc } = useStructure(content);
    const [activeId, setActiveId] = useState(toc[0]?.id);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const sectionRefs = useRef({});

    // Track which top-level section is in view, so the sidebar / mobile
    // sheet can highlight where the reader currently is.
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (visible[0]) setActiveId(visible[0].target.id);
            },
            { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
        );
        toc.forEach((item) => {
            const el = sectionRefs.current[item.id];
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, [toc]);

    const scrollToSection = useCallback((id) => {
        const go = () => {
            const el = sectionRefs.current[id] || document.getElementById(id);
            el?.scrollIntoView({ behavior: "smooth", block: "start" }); // honours scroll-margin-top
        };
        if (mobileNavOpen) {
            // Let the sheet finish collapsing before measuring the target.
            setMobileNavOpen(false);
            window.setTimeout(go, 320);
        } else {
            go();
        }
    }, [mobileNavOpen]);

    return (
        <div className="ba" data-theme={theme}>
            <style>{AUTH_THEME_CSS + LEGAL_CSS}</style>

            <AuthHeader
                theme={theme} onToggleTheme={toggleTheme}
                backTo="/login" backAlways
                actions={
                    <button
                        type="button" className="bt tgl"
                        aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((v) => !v)}
                    >
                        <Menu className="ic sm" />Sections
                    </button>
                }
            >
                <AnimatePresence initial={false}>
                    {mobileNavOpen && (
                        <motion.div
                            className="msh"
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                        >
                            <div className="w lw">
                                <div className="in2">
                                    <div className="top">
                                        <span className="tcap">Jump to section</span>
                                        <button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close sections">
                                            <X className="ic sm" />
                                        </button>
                                    </div>
                                    <TocList items={toc} activeId={activeId} onNavigate={scrollToSection} />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </AuthHeader>

            <main className="w lw">
                <div className="lh">
                    <span className="pi"><Icon className="ic" style={{ width: 24, height: 24 }} /></span>
                    <h1>{title}</h1>
                    <p className="in">{intro}</p>
                    <p className="lu">Last updated: {lastUpdated}</p>
                </div>

                <div className="lbody">
                    <aside className="lside">
                        <div className="stk">
                            <p className="tcap">Contents</p>
                            <TocList items={toc} activeId={activeId} onNavigate={scrollToSection} />
                        </div>
                    </aside>

                    <article className="art">
                        <Body items={items} sectionRefs={sectionRefs} preserveLineBreaks={preserveLineBreaks} />
                        <div className="note">{disclaimer}</div>
                    </article>
                </div>
            </main>
        </div>
    );
}