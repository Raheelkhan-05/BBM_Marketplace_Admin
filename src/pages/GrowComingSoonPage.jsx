// src/pages/GrowComingSoonPage.jsx
// Shared "coming soon" screen for Grow sections that aren't live yet (Customers, Media).
// Usage in App.jsx:  <GrowComingSoonPage kind="customers" />
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Film } from "lucide-react";

const CONTENT = {
    customers: {
        Icon: Users,
        title: "Customers",
        headline: "Customers is coming soon",
        text: "Soon you'll see every buyer who has ordered from you or enquired about your products, so you can follow up and win repeat orders.",
        points: ["All your buyers in one list", "Order history for each buyer", "Quick follow-up on enquiries"],
        accent: "#0D6E7E",
    },
    media: {
        Icon: Film,
        title: "Media",
        headline: "Media is coming soon",
        text: "Soon you'll be able to add product photos and videos in one place and use them to get more attention from buyers.",
        points: ["Photo and video library", "Reuse media across listings", "Share-ready product content"],
        accent: "#F4511E",
    },
};

export default function GrowComingSoonPage({ kind = "customers" }) {
    const nav = useNavigate();
    const c = CONTENT[kind] || CONTENT.customers;
    const Icon = c.Icon;

    useEffect(() => { window.scrollTo({ top: 0 }); }, [kind]);

    return (
        <div className="v">
            <h2 className="h2" style={{ marginTop: 22 }}>{c.title}</h2>

            <section
                className="card"
                aria-labelledby="gcs-title"
                style={{ marginTop: 14, textAlign: "center", padding: "36px 22px" }}
            >
                <span
                    aria-hidden="true"
                    style={{
                        display: "inline-grid", placeItems: "center", width: 64, height: 64, borderRadius: 20,
                        background: `color-mix(in srgb, ${c.accent} 14%, transparent)`, color: c.accent,
                    }}
                >
                    <Icon size={30} strokeWidth={2.2} />
                </span>

                <div style={{ marginTop: 14 }}>
                    <span
                        style={{
                            display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 11,
                            fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase",
                            background: `color-mix(in srgb, ${c.accent} 14%, transparent)`, color: c.accent,
                        }}
                    >
                        Coming soon
                    </span>
                </div>

                <h3 id="gcs-title" style={{ margin: "12px 0 6px", fontSize: 20, fontWeight: 800 }}>{c.headline}</h3>
                <p style={{ margin: "0 auto", maxWidth: 420, opacity: 0.75, lineHeight: 1.5 }}>{c.text}</p>

                <ul style={{ listStyle: "none", margin: "18px auto 0", padding: 0, maxWidth: 320, textAlign: "left" }}>
                    {c.points.map((p) => (
                        <li key={p} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", fontWeight: 600 }}>
                            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: c.accent, flexShrink: 0 }} />
                            {p}
                        </li>
                    ))}
                </ul>

                <button className="bt go" type="button" style={{ marginTop: 22 }} onClick={() => nav("/grow/dashboard")}>
                    Back to dashboard
                </button>
            </section>
        </div>
    );
}