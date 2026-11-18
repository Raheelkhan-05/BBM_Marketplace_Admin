// utils/useCatalogImageJobs.js
// Keeps the screen in step with the server-side AI image queue.
//  - polls fast while something is running, and stops when nothing is
//  - attaches finished images to their drafts (onReady), then tells the server it did (ack)
//  - a job that finished while the page was closed is picked up on the next visit
//  - every running job gets `startedMs` (a browser-clock start time that never moves forward), so the
//    "Creating your image… 12s" timer counts up smoothly and never resets between refreshes
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCatalogImageJobs, enqueueCatalogImages, ackCatalogImages, cancelCatalogImages } from "./api.adminCatalogBulk.js";

export const AI_IMAGE_MARK = "/catalog-ai/"; // the server stores generated images under this folder
export const isAiImageUrl = (u) => typeof u === "string" && u.includes(AI_IMAGE_MARK);
export const isActiveJob = (j) => !!j && (j.status === "queued" || j.status === "running");

const FAST = 2500;
const SLOW = 7000;
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

// onReady([{ draftId, url }]) -> Promise<{ ok, added }>: attach the images to the drafts and save them.
export default function useCatalogImageJobs({ token, enabled, onReady, say }) {
    const [jobs, setJobs] = useState(() => new Map()); // draft_id -> job (finished-and-attached jobs are not kept)
    const [stats, setStats] = useState({ total: 0, finished: 0 });
    const [fetchedAt, setFetchedAt] = useState(() => Date.now());

    const alive = useRef(true);
    const busy = useRef(false);
    const timer = useRef(null);
    const activeRef = useRef(false);
    const retryApply = useRef(false);
    const anchors = useRef(new Map()); // draft_id -> start time (ms, browser clock) of the running job
    const sess = useRef({ ids: new Set(), total: 0, finished: 0 });
    const readyRef = useRef(onReady); readyRef.current = onReady;
    const sayRef = useRef(say); sayRef.current = say;

    const refresh = useCallback(async () => {
        if (busy.current) return null;
        busy.current = true;
        try {
            const r = await fetchCatalogImageJobs(token);
            if (!alive.current || !r?.success) return null;
            const list = r.jobs || [];
            const now = Date.now();

            // Start time of each running job. The server's "elapsed" can be off when the API server and the
            // database clocks differ, so it is only used to find the earliest start. The anchor never moves later.
            const seen = new Set();
            list.forEach((j) => {
                if (j.status !== "running") return;
                seen.add(j.draft_id);
                const guess = now - Math.max(0, Number(j.elapsed) || 0) * 1000;
                const prev = anchors.current.get(j.draft_id);
                anchors.current.set(j.draft_id, prev === undefined ? guess : Math.min(prev, guess));
            });
            [...anchors.current.keys()].forEach((id) => { if (!seen.has(id)) anchors.current.delete(id); });

            // progress for this visit: how many were started, how many have left the queue
            const s = sess.current;
            const activeIds = new Set(list.filter(isActiveJob).map((j) => j.draft_id));
            activeIds.forEach((id) => { if (!s.ids.has(id)) { s.ids.add(id); s.total += 1; } });
            [...s.ids].forEach((id) => { if (!activeIds.has(id)) { s.ids.delete(id); s.finished += 1; } });
            setStats({ total: s.total, finished: s.finished });
            if (!activeIds.size) { s.total = 0; s.finished = 0; }

            // finished images -> drafts
            retryApply.current = false;
            const ready = list.filter((j) => j.status === "done" && j.result_url);
            if (ready.length) {
                const out = await readyRef.current(ready.map((j) => ({ draftId: j.draft_id, url: j.result_url })));
                if (out?.added) sayRef.current(`${plural(out.added, "AI image", "AI images")} added. Please check ${out.added === 1 ? "it" : "them"} against the real product.`);
                if (out?.ok) {
                    const ack = await ackCatalogImages(token, ready.map((j) => j.draft_id));
                    if (!ack?.success) retryApply.current = true;
                } else retryApply.current = true;
            }

            if (!alive.current) return null;
            setJobs(new Map(list.filter((j) => j.status !== "done").map((j) => [
                j.draft_id,
                { ...j, startedMs: anchors.current.get(j.draft_id) ?? now },
            ])));
            setFetchedAt(Date.now());
            return list;
        } finally { busy.current = false; }
    }, [token]);

    const run = useCallback(async () => {
        clearTimeout(timer.current);
        if (!alive.current) return;
        const list = await refresh();
        if (!alive.current) return;
        const active = list ? list.some(isActiveJob) || retryApply.current : activeRef.current;
        activeRef.current = active;
        if (active) timer.current = setTimeout(run, list ? FAST : SLOW);
    }, [refresh]);

    useEffect(() => {
        if (!enabled) return undefined;
        alive.current = true;
        run();
        const onVisible = () => { if (document.visibilityState === "visible") run(); };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            alive.current = false;
            clearTimeout(timer.current);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [enabled, run]);

    const enqueue = useCallback(async (ids, opts = {}) => {
        const r = await enqueueCatalogImages(token, ids, opts);
        if (!r?.success) { sayRef.current(r?.message || "Could not start image generation."); if (r?.queued) run(); return r; }
        if (r.queued) sayRef.current(`Started ${plural(r.queued, "image", "images")}${r.skipped ? `, ${r.skipped} skipped` : ""}. They keep running even if you close this page.`);
        else sayRef.current("Nothing to generate. Check that each product has a name and brand.");
        await run();
        return r;
    }, [token, run]);

    const cancel = useCallback(async (ids) => {
        const r = await cancelCatalogImages(token, { ids, failed: true });
        if (!r?.success) sayRef.current(r?.message || "Could not stop it.");
        await run();
        return r;
    }, [token, run]);

    const stopAll = useCallback(async () => {
        const r = await cancelCatalogImages(token, { all: true });
        if (!r?.success) sayRef.current(r?.message || "Could not stop image generation.");
        else sayRef.current("Stopped. Images already being drawn may still finish.");
        await run();
    }, [token, run]);

    const dismissFailed = useCallback(async () => {
        await cancelCatalogImages(token, { all: true, failed: true, active: false });
        await run();
    }, [token, run]);

    const retryFailed = useCallback(async () => {
        const failed = [...jobs.values()].filter((j) => j.status === "failed");
        const withRef = failed.filter((j) => j.use_reference).map((j) => j.draft_id);
        const noRef = failed.filter((j) => !j.use_reference).map((j) => j.draft_id);
        if (withRef.length) await enqueue(withRef, { useReference: true });
        if (noRef.length) await enqueue(noRef, { useReference: false });
    }, [jobs, enqueue]);

    const { active, failedCount } = useMemo(() => {
        let a = 0, f = 0;
        jobs.forEach((j) => { if (isActiveJob(j)) a += 1; else if (j.status === "failed") f += 1; });
        return { active: a, failedCount: f };
    }, [jobs]);

    return { jobs, stats, active, failedCount, fetchedAt, enqueue, cancel, stopAll, dismissFailed, retryFailed, refresh: run };
}