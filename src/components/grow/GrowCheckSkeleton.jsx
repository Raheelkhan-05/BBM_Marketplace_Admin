// components/grow/GrowCheckSkeleton.jsx
// The "checking your account" placeholder. Identical markup everywhere so hand-offs between
// GrowEntry -> GrowStartPage -> destination page never flash a different layout.
export default function GrowCheckSkeleton() {
    return (
        <section className="scr" aria-busy="true" aria-label="Loading">
            <div className="gx-skel w40" /><div className="gx-skel h30 w80" /><div className="gx-skel w60" />
            <div className="gx-skel h56" /><div className="gx-skel h56" /><div className="gx-skel h56" />
        </section>
    );
}