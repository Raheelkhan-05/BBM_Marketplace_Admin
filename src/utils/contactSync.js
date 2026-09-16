import { Contacts } from '@capacitor-community/contacts';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { API_BASE } from './api.js';
import { getDeviceId } from './deviceId.js';

const DEVICE_CACHE_KEY = 'device_contacts_cache';
const DEVICE_SNAPSHOT_KEY = 'device_contacts_last_synced'; // what we've already pushed to pending-sync
const LAST_ASKED_KEY = 'contacts_perm_last_asked_device';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeAndDedupeContacts(rawContacts, defaultCountry = 'IN') {
    const result = new Map();
    for (const contact of rawContacts) {
        const name = contact.name?.display?.trim();
        if (!name) continue;
        const phones = contact.phones ?? [];
        if (phones.length === 0) continue;
        const seenInContact = new Set();
        for (const p of phones) {
            const raw = p.number?.trim();
            if (!raw) continue;
            const parsed = parsePhoneNumberFromString(raw, defaultCountry);
            if (!parsed || !parsed.isValid()) continue;
            const normalized = parsed.number;
            if (seenInContact.has(normalized)) continue;
            seenInContact.add(normalized);
            result.set(normalized, name);
        }
    }
    return result;
}

// Runs on EVERY app open, logged in or not. Fetches device contacts
// (respecting the 7-day re-ask cooldown), caches them locally, then
// pushes the diff to the backend's public pending-sync endpoint —
// no login required at all.
export async function ensureDeviceContactsFetchedAndPushed() {
    // The @capacitor-community/contacts plugin has no web implementation —
    // calling ANY of its methods (even checkPermissions) throws
    // "Not implemented on web." Contact sync is a native-only feature by
    // design, so on web we bail out early instead of letting that throw
    // go uncaught (which is what was happening before this check existed).
    if (Capacitor.getPlatform() === 'web') {
        return { fetched: false, reason: 'Not supported on web' };
    }

    const status = await Contacts.checkPermissions();

    if (status.contacts !== 'granted') {
        const { value } = await Preferences.get({ key: LAST_ASKED_KEY });
        const lastAsked = value ? Number(value) : 0;
        const now = Date.now();
        const neverAsked = lastAsked === 0;
        const sevenDaysPassed = now - lastAsked > SEVEN_DAYS_MS;

        if (!neverAsked && !sevenDaysPassed) {
            return { fetched: false, reason: 'Recently denied, waiting before re-asking' };
        }

        await Preferences.set({ key: LAST_ASKED_KEY, value: String(now) });
        const result = await Contacts.requestPermissions();
        if (result.contacts !== 'granted') {
            return { fetched: false, reason: 'Permission denied' };
        }
    }

    const { contacts } = await Contacts.getContacts({ projection: { name: true, phones: true } });
    const current = normalizeAndDedupeContacts(contacts);

    await Preferences.set({ key: DEVICE_CACHE_KEY, value: JSON.stringify([...current]) });

    // Diff against what we've already pushed from this device
    const { value: snapValue } = await Preferences.get({ key: DEVICE_SNAPSHOT_KEY });
    const previous = new Map(snapValue ? JSON.parse(snapValue) : []);

    const changed = [];
    for (const [number, name] of current) {
        if (previous.get(number) !== name) changed.push([number, name]);
    }

    if (changed.length === 0) {
        return { fetched: true, pushed: 0, total: current.size, message: 'Already up to date' };
    }

    const deviceId = await getDeviceId();

    try {
        const res = await fetch(`${API_BASE}/contacts/pending-sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId, contacts: changed }),
        });
        const data = await res.json();

        if (!data.success) {
            return { fetched: true, pushed: 0, error: data.message };
        }

        await Preferences.set({ key: DEVICE_SNAPSHOT_KEY, value: JSON.stringify([...current]) });

        return { fetched: true, pushed: data.synced, total: current.size };
    } catch (err) {
        return { fetched: true, pushed: 0, error: 'Network error: ' + err.message };
    }
}

// Runs ONCE per (device, user) pair — claims whatever's pending on this
// device into the logged-in user's account. Cheap to call repeatedly
// (backend upsert is idempotent) but we guard it anyway to avoid a
// redundant network call on every single app open.
export async function claimPendingContactsForUser(userId, token) {
    if (!userId || !token) return { claimed: 0, error: 'Not authenticated' };

    const deviceId = await getDeviceId();
    const guardKey = `claimed_device_${deviceId}_user_${userId}`;

    const { value: alreadyClaimed } = await Preferences.get({ key: guardKey });
    if (alreadyClaimed === 'true') {
        return { claimed: 0, message: 'Already claimed for this user on this device' };
    }

    try {
        const res = await fetch(`${API_BASE}/contacts/claim`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ deviceId }),
        });
        const data = await res.json();

        if (!data.success) {
            return { claimed: 0, error: data.message };
        }

        await Preferences.set({ key: guardKey, value: 'true' });
        return { claimed: data.claimed };
    } catch (err) {
        return { claimed: 0, error: 'Network error: ' + err.message };
    }
}