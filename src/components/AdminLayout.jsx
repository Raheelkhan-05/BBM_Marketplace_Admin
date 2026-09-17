import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AdminHeader from "./AdminHeader.jsx";
import BottomNavStrip from "./BottomNavStrip.jsx";

export default function AdminLayout() {
    const { isLoggedIn, profile, initializing } = useAuth();

    if (initializing) return null;
    if (!isLoggedIn) return <Navigate to="/login" replace />;
    if (!profile) return <Navigate to="/login" replace />;   // <-- added: don't assume unauthorized
    if (profile.role !== "admin") return <div className="p-8 text-center text-slate-500">Not authorized.</div>;

    return (
        <div>
            <AdminHeader />
            <main className="mx-auto max-w-7xl">
                <Outlet />
            </main>
            <BottomNavStrip />
        </div>
    );
}