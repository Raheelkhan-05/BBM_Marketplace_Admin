import { Preferences } from '@capacitor/preferences';
import { v4 as uuidv4 } from 'uuid';

const DEVICE_ID_KEY = 'device_id';

// Generates a random ID once per install, and reuses it forever after —
// this is NOT tied to any user account. It just identifies "this phone."
export async function getDeviceId() {
    const { value } = await Preferences.get({ key: DEVICE_ID_KEY });
    if (value) return value;

    const newId = uuidv4();
    await Preferences.set({ key: DEVICE_ID_KEY, value: newId });
    return newId;
}