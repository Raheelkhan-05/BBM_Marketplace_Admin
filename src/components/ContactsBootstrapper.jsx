import { useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { ensureDeviceContactsFetchedAndPushed, claimPendingContactsForUser } from "../utils/contactSync.js";

export default function ContactsBootstrapper() {
    const { profile, token } = useAuth();

    // Runs on every app open, logged in or not
    useEffect(() => {
        ensureDeviceContactsFetchedAndPushed().then((result) => {
            console.log("Device contacts push:", JSON.stringify(result));
        });
    }, []);

    // Runs once login state becomes available (or changes)
    useEffect(() => {
        if (profile?.id && token) {
            claimPendingContactsForUser(profile.id, token).then((result) => {
                console.log("Claim pending contacts:", JSON.stringify(result));
            });
        }
    }, [profile?.id, token]);

    return null;
}