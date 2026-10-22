// src/components/authTheme.jsx
// Single source of truth for the AuthPage / Terms / Privacy look:
// design tokens (dark + light), base controls, the sticky header with the
// ORIGINAL logo (/Logo.png + "BBM"), and the persisted theme toggle.
import { useEffect, useState } from "react";
import { ArrowLeft, Moon, Sun } from "lucide-react";
import SmartLink from "./SmartLink.jsx";

const THEME_KEY = "gth";

export function useAuthTheme() {
    const [theme, setTheme] = useState(() => {
        try { return localStorage.getItem(THEME_KEY) === "light" ? "light" : "light"; } catch { return "dark"; }
    });

    const toggleTheme = () => {
        const next = theme === "light" ? "light" : "light";
        // const next = theme === "light" ? "dark" : "light";
        setTheme(next);
        try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode */ }
    };

    // Keep the area behind the page (overscroll / rubber-banding) in the theme colour.
    useEffect(() => {
        const prev = document.documentElement.style.backgroundColor;
        document.documentElement.style.backgroundColor = theme === "light" ? "#F5F9FA" : "#06161C";
        return () => { document.documentElement.style.backgroundColor = prev; };
    }, [theme]);

    return { theme, toggleTheme };
}

/**
 * Sticky header shared by all auth-themed pages.
 * - onBack:   renders a back <button> (AuthPage)
 * - backTo:   renders a back link (legal pages)
 * - backAlways: show the back control on mobile too (AuthPage hides it < 768px)
 * - actions:  extra controls shown before the theme toggle
 * - children: rendered inside <header> under the row (e.g. mobile TOC sheet)
 */
export function AuthHeader({ theme, onToggleTheme, onBack, backTo, backAlways = false, actions, children }) {
    const backClass = `ib${backAlways ? "" : " bk"}`;
    return (
        <header className="hd">
            <div className="w">
                {onBack && (
                    <button type="button" className={backClass} onClick={onBack} aria-label="Go back">
                        <ArrowLeft className="ic" />
                    </button>
                )}
                {backTo && (
                    <SmartLink to={backTo} className={backClass} aria-label="Back">
                        <ArrowLeft className="ic" />
                    </SmartLink>
                )}

                <SmartLink to="/" className="lg" aria-label="BBM home">
                    <span className="lm"><img src="/Logo.png" alt="BBM" /></span>
                    <span className="lt">BBM</span>
                </SmartLink>

                <span className="sp" />
                {actions}
                {/* <button
                    type="button" className="ib" onClick={onToggleTheme}
                    aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
                >
                    {theme === "light" ? <Moon className="ic" /> : <Sun className="ic" />}
                </button> */}
            </div>
            {children}
        </header>
    );
}

export const AUTH_THEME_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Figtree:wght@500;600;700;800;900&family=Bricolage+Grotesque:wght@800&display=swap');
.ba{--bg:#06161C;--s:#0E2A34;--s2:#0A1F27;--line:#1D3E4A;--ink:#EAF4F5;--mute:#8CA8AF;--or:#F4511E;--bl:#1E78D6;--gr:#22A06B;--go:#FFD60A;--ot:#FF8A5C;--bt:#5DAEF7;--gt:#3FD79B;--yt:#FFD60A;--tt:#22C0D2;--ga:rgba(244,81,30,.26);--gb:rgba(30,120,214,.30);--red:#FF6B5B;--f:"Figtree",system-ui,-apple-system,"Segoe UI",sans-serif;--bf:"Bricolage Grotesque","Figtree",system-ui,sans-serif;color-scheme:dark;
position:relative;box-sizing:border-box;min-height:100vh;min-height:100dvh;overflow-x:clip;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);
font:500 17px/1.55 var(--f);color:var(--ink);background-color:var(--bg);background-image:radial-gradient(640px 420px at 0 0,var(--ga),transparent 70%),radial-gradient(640px 420px at 100% 0,var(--gb),transparent 70%);background-repeat:no-repeat;-webkit-font-smoothing:antialiased}
.ba[data-theme="light"]{--bg:#F5F9FA;--s:#FFFFFF;--s2:#EDF3F5;--line:#DCE6E9;--ink:#08222B;--mute:#52686F;--ot:#C23A0B;--bt:#0F63B5;--gt:#12794A;--yt:#8A6500;--tt:#0D6E7E;--ga:rgba(244,81,30,.11);--gb:rgba(30,120,214,.13);--red:#C0341D;color-scheme:light}
.ba *{box-sizing:border-box;margin:0}
.ba [hidden]{display:none!important}
.ba button,.ba input{font-family:var(--f);color:inherit}
.ba button{cursor:pointer}
.ba a{color:inherit}
.ba :focus-visible{outline:3px solid var(--go);outline-offset:3px}
.ba .ic{width:20px;height:20px;flex:none}
.ba .ic.sm{width:16px;height:16px}
.ba .spin{animation:bbm-spin 1s linear infinite}
@keyframes bbm-spin{to{transform:rotate(360deg)}}

.ba .w{max-width:1280px;margin:0 auto;padding:0 20px}
.ba .hd{position:sticky;top:env(safe-area-inset-top,0px);z-index:6;background:#ffffffbb;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.ba .hd .w{display:flex;align-items:center;gap:12px;height:64px}
.ba .lg{display:flex;align-items:center;gap:8px;min-width:0;text-decoration:none;color:var(--ink)}
.ba .lg .lm{display:flex;align-items:center;flex:none}
.ba .lg img{display:block;height:28px;width:auto;object-fit:contain}
.ba[data-theme="dark"] .lg .lm{background:#fff;padding:3px 6px;border-radius:9px}
.ba .lg .lt{font:800 1.125rem/1 var(--bf);letter-spacing:.02em;white-space:nowrap}
.ba .sp{flex:1}
.ba .ib{width:44px;height:44px;border-radius:50%;border:1px solid var(--line);background:var(--s);display:grid;place-items:center;flex:none;color:var(--ink);text-decoration:none;transition:border-color .2s}
.ba .ib:hover{border-color:var(--mute)}
.ba .bk{display:none}
@media(min-width:768px){.ba .bk{display:grid}}
.ba .bt{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 22px;border-radius:999px;border:1px solid var(--line);background:var(--s);font:800 .98rem var(--f);color:var(--ink);text-decoration:none;white-space:nowrap;transition:transform .12s,opacity .2s,filter .2s}
.ba .bt:active:not(:disabled){transform:scale(.985)}
.ba .bt.go{background:var(--go);color:#06161C;border-color:var(--go)}
.ba .bt.go:hover:not(:disabled){filter:brightness(1.05)}
.ba .bt.blk{width:100%;min-height:56px;font-size:1.05rem}
.ba .bt:disabled{opacity:.5;cursor:not-allowed}
@media(max-width:380px){.ba .w{padding:0 16px}}
`;