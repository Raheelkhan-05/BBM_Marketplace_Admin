// pages/legal/PrivacyPolicy.jsx
//
// Public page — deliberately has NO dependency on AuthContext or
// BottomNav, so it renders correctly for logged-out visitors and for
// Meta's crawler when verifying your WhatsApp Business app's privacy
// policy URL. Mount this on a route that is NOT behind your auth guard.
//
// See the "Publish checklist" comment at the bottom of this file before
// submitting the URL to Meta.

import { cls, DRow } from "./ui/primitives";
import { Ic } from "./icons";

const EFFECTIVE_DATE = "03 Aug 2026";

const TONE_CLS = {
    rose: "text-rose-600 bg-rose-50 ring-rose-200",
    amber: "text-amber-600 bg-amber-50 ring-amber-200",
    sky: "text-sky-600 bg-sky-50 ring-sky-200",
    slate: "text-slate-500 bg-slate-100 ring-slate-200",
    emerald: "text-emerald-600 bg-emerald-50 ring-emerald-200",
};

function Fill({ children }) {
    return (
        <span className="rounded px-1.5 py-0.5 text-[11px] font-bold text-rose-600 bg-rose-50 ring-1 ring-inset ring-rose-200">
            {children}
        </span>
    );
}

function SectionCard({ id, num, title, children }) {
    return (
        <section id={id} className="scroll-mt-20 mb-4">
            <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex items-center gap-2.5 mb-2.5">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-50 text-[11px] font-extrabold text-indigo-600 ring-1 ring-inset ring-indigo-200">
                        {num}
                    </span>
                    <h2 className="text-[14px] font-extrabold text-slate-900">{title}</h2>
                </div>
                <div className="space-y-2.5 text-[12.5px] leading-relaxed text-slate-600">
                    {children}
                </div>
            </div>
        </section>
    );
}

function SubCard({ tone = "slate", icon: IconEl, title, children }) {
    return (
        <div className={cls("rounded-xl border px-3.5 py-3",
            tone === "sky" ? "border-sky-100 bg-sky-50/50" : "border-slate-100 bg-slate-50")}>
            <div className="flex items-center gap-1.5 mb-1">
                {IconEl && <IconEl className="h-3.5 w-3.5 text-slate-400" />}
                <p className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">{title}</p>
            </div>
            <div className="text-[12.5px] leading-relaxed text-slate-600">{children}</div>
        </div>
    );
}

const TOC = [
    ["who-we-are", "Who we are"],
    ["scope", "Scope of this policy"],
    ["collect", "Information we collect"],
    ["use", "How we use it"],
    ["whatsapp", "WhatsApp communications"],
    ["legal-basis", "Legal basis"],
    ["sharing", "Who we share data with"],
    ["retention", "Data retention"],
    ["security", "Data security"],
    ["rights", "Your rights"],
    ["children", "Children's privacy"],
    ["cookies", "Cookies"],
    ["transfers", "International transfers"],
    ["changes", "Changes to this policy"],
    ["contact", "Contact & grievance officer"],
];

export default function PrivacyPolicy() {
    return (
        <div className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">

                {/* Intro */}
                <div className="mb-5 rounded-2xl border border-slate-100 bg-white px-4 py-5 sm:px-5">
                    <span className="mb-2.5 inline-block rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-indigo-600 ring-1 ring-inset ring-indigo-200">
                        Privacy Policy
                    </span>
                    <h1 className="text-[20px] font-extrabold leading-snug text-slate-900 sm:text-[22px]">
                        Your privacy, and how we handle it
                    </h1>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">
                        This page explains what information Brand Brigade Marketing Pvt Ltd ("we," "us," "our")
                        collects, why we collect it, and how we use it — including when we contact you on WhatsApp
                        for order updates, customer support, and marketing.
                    </p>
                </div>

                {/* Table of contents — same pill pattern as the app's filter chips */}
                <div className="mb-6 rounded-2xl border border-slate-100 bg-white px-4 py-4 sm:px-5">
                    <p className="mb-2.5 text-[9.5px] font-bold uppercase tracking-wide text-slate-400">On this page</p>
                    <div className="flex flex-wrap gap-1.5">
                        {TOC.map(([id, label], i) => (
                            <a key={id} href={`#${id}`}
                                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
                                {i + 1}. {label}
                            </a>
                        ))}
                    </div>
                </div>

                <SectionCard id="who-we-are" num="1" title="Who we are">
                    <p>
                        This Privacy Policy applies to <b>Brand Brigade Marketing Pvt Ltd</b>, a company incorporated
                        in India (CIN: U74999WB2023PTC266462), registered office at{" "}
                        Greenland circle, Rajkot - 360003 and to our website at{" "}
                        www.bbm.business and any WhatsApp number we use to communicate with you
                        (together, the "Services").
                    </p>
                    <p>
                        By using our Services or sharing your phone number/contact details with us — including
                        through WhatsApp — you agree to the collection and use of information as described here.
                    </p>
                </SectionCard>

                <SectionCard id="scope" num="2" title="Scope of this policy">
                    <p>This policy covers information we collect through:</p>
                    <ul className="list-disc space-y-1 pl-4">
                        <li>Our website and any forms on it</li>
                        <li>Phone calls, email, and WhatsApp conversations with our sales/support team</li>
                        <li>Business transactions — purchase orders, invoices, and repeat-order communications</li>
                        <li>Marketing messages sent over WhatsApp, SMS, or email, where you've consented</li>
                    </ul>
                </SectionCard>

                <SectionCard id="collect" num="3" title="Information we collect">
                    <div className="grid gap-2.5 sm:grid-cols-3">
                        <SubCard icon={Ic.Box} title="You give us directly">
                            <ul className="list-disc space-y-0.5 pl-3.5 text-[11.5px]">
                                <li>Name & company name</li>
                                <li>Phone / WhatsApp number</li>
                                <li>Email address</li>
                                <li>Business address, GSTIN</li>
                                <li>Order details</li>
                            </ul>
                        </SubCard>
                        <SubCard icon={Ic.Search} title="Collected automatically">
                            <ul className="list-disc space-y-0.5 pl-3.5 text-[11.5px]">
                                <li>Website usage (pages, device, browser)</li>
                                <li>Approximate location via IP</li>
                                <li>Cookies (see §12)</li>
                            </ul>
                        </SubCard>
                        <SubCard icon={Ic.Check} title="From WhatsApp">
                            <ul className="list-disc space-y-0.5 pl-3.5 text-[11.5px]">
                                <li>WhatsApp number & profile name</li>
                                <li>Message content & timestamps</li>
                                <li>Opt-in/opt-out status</li>
                            </ul>
                        </SubCard>
                    </div>
                </SectionCard>

                <SectionCard id="use" num="4" title="How we use your information">
                    <ul className="list-disc space-y-1 pl-4">
                        <li>Process and fulfil orders, including purchase orders and repeat orders</li>
                        <li>Communicate about orders, deliveries, pricing, and support</li>
                        <li>Send marketing/promotional messages where you've agreed to receive them</li>
                        <li>Respond to enquiries and provide customer support</li>
                        <li>Improve our products, services, and website</li>
                        <li>Maintain business records for accounting, tax, and legal compliance</li>
                        <li>Prevent fraud and misuse of our Services</li>
                    </ul>
                </SectionCard>

                <SectionCard id="whatsapp" num="5" title="WhatsApp communications">
                    <p>We use the WhatsApp Business Platform (provided by Meta) to talk to customers:</p>
                    <div className="space-y-2.5">
                        <SubCard tone="sky" icon={Ic.Check} title="What we send">
                            <b>Transactional</b> — order confirmations, delivery updates, invoices, support replies.{" "}
                            <b>Marketing</b> — offers and repeat-order reminders, sent only to opted-in numbers.
                        </SubCard>
                        <SubCard tone="sky" icon={Ic.Zap} title="How we get your consent">
                            We only send marketing messages to numbers that have opted in — e.g. by providing your
                            number to our sales team or agreeing to updates when placing an order.{" "}

                        </SubCard>
                        <SubCard tone="sky" icon={Ic.Trash} title="How to opt out">
                            Reply <b>"STOP"</b> or <b>"UNSUBSCRIBE"</b> to any message, or email{" "}
                            communication@bbmpvtltd.com. We'll still send transactional messages tied to an
                            active order.
                        </SubCard>
                        <SubCard tone="sky" icon={Ic.Lock} title="Meta's role">
                            Messages are processed using Meta's infrastructure under{" "}
                            <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-600 underline">
                                WhatsApp's Privacy Policy
                            </a>{" "}
                            and{" "}
                            <a href="https://www.whatsapp.com/legal/business-data-processing-terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-600 underline">
                                Business Data Processing Terms
                            </a>. We do not sell your WhatsApp number or message content.
                        </SubCard>
                    </div>
                </SectionCard>

                <SectionCard id="legal-basis" num="6" title="Our legal basis for processing">
                    <ul className="list-disc space-y-1 pl-4">
                        <li><b>Consent</b> — e.g. to receive marketing messages on WhatsApp</li>
                        <li><b>Contract performance</b> — e.g. processing an order you've placed</li>
                        <li><b>Legitimate interest</b> — e.g. maintaining sales records, preventing fraud</li>
                        <li><b>Legal obligation</b> — e.g. retaining invoices for tax purposes</li>
                    </ul>
                    <p>Where consent is our basis, you can withdraw it any time — see §10.</p>
                </SectionCard>

                <SectionCard id="sharing" num="7" title="Who we share information with">
                    <p>We do not sell your personal information. We share it only with:</p>
                    <div className="space-y-0.5">
                        <DRow label="Meta / WhatsApp Business Platform" value="To deliver messages you receive from us" />
                        <DRow label="Hosting & database providers" value="To securely store business records (e.g. Supabase)" />
                        <DRow label="Payment / accounting providers" value="To process invoices and payments" />
                        <DRow label="Regulators / authorities" value="Where required by law or valid legal process" />
                        <DRow label="A successor entity" value="In a merger, acquisition, or asset sale" />
                    </div>
                </SectionCard>

                <SectionCard id="retention" num="8" title="How long we keep your data">
                    <p>
                        We keep customer and order information as long as needed to provide our Services, meet
                        accounting/tax requirements (typically 8 years for financial records under
                        Indian law), and resolve disputes. WhatsApp conversation history is kept while our
                        relationship is active, or until you request deletion.
                    </p>
                </SectionCard>

                <SectionCard id="security" num="9" title="How we protect your data">
                    <p>
                        We use reasonable technical and organizational safeguards — access controls, encrypted
                        connections (HTTPS), and role-based access within our team. No method of transmission or
                        storage is 100% secure, but we work to industry standards.
                    </p>
                </SectionCard>

                <SectionCard id="rights" num="10" title="Your rights and choices">
                    <p>You can ask us to:</p>
                    <ul className="list-disc space-y-1 pl-4">
                        <li><b>Access</b> the personal information we hold about you</li>
                        <li><b>Correct</b> inaccurate or outdated information</li>
                        <li><b>Delete</b> your information, subject to legal record-keeping obligations</li>
                        <li><b>Withdraw consent</b> for marketing messages any time (see §5)</li>
                        <li><b>Know</b> who we've shared your information with</li>
                    </ul>
                    <p>Contact us using the details in §15 — we'll respond within a reasonable time as required by applicable Indian data protection law.</p>
                </SectionCard>

                <SectionCard id="children" num="11" title="Children's privacy">
                    <p>
                        Our Services are intended for businesses and individuals aged 18+. We do not knowingly
                        collect information from children. If you believe a child has provided us information,
                        contact us and we'll delete it.
                    </p>
                </SectionCard>

                <SectionCard id="cookies" num="12" title="Cookies on our website">
                    <p>
                        Our website may use cookies to remember preferences and understand visitor usage. You can
                        control cookies via your browser settings.{" "}
                    </p>
                </SectionCard>

                <SectionCard id="transfers" num="13" title="International data transfers">
                    <p>
                        Some providers (Meta/WhatsApp, our hosting infrastructure) may process data outside India.
                        Where this happens, we rely on their compliance and contractual safeguards.
                    </p>
                </SectionCard>

                <SectionCard id="changes" num="14" title="Changes to this policy">
                    <p>
                        We may update this policy from time to time; we'll update the "Effective" date above when we
                        do. Continued use of our Services after changes means you accept the update.
                    </p>
                </SectionCard>

                <SectionCard id="contact" num="15" title="Contact & grievance officer">
                    <p>Questions, rights requests, or complaints — reach out to our Grievance Officer, as required under the IT Act, 2000:</p>
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3.5 py-3">
                        <div className="space-y-0.5">
                            <DRow label="Email" value={'communication@bbmpvtltd.com'} />
                        </div>
                    </div>
                </SectionCard>

                <p className="mt-6 text-center text-[10.5px] text-slate-400">
                    © 2026 Brand Brigade Marketing Pvt Ltd. All rights reserved. Last updated {EFFECTIVE_DATE}.
                </p>
            </div>
        </div>
    );
}
