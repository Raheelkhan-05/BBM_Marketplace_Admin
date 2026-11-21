// src/pages/admin/AdminSellerDetailRoute.jsx
import { useParams } from "react-router-dom";
import { UserCog } from "lucide-react";
import ActAsUserButton from "../../components/ActAsUserButton.jsx";
import AdminSellerDetailPage from "./AdminSellerDetailPage.jsx";

export default function AdminSellerDetailRoute() {
    const { id } = useParams();
    return (
        <>
            <div className="mx-auto max-w-3xl px-4 pt-5 sm:px-6">
                <div className="flex flex-col gap-3 rounded-xl border border-[#047084]/20 bg-[#047084]/[0.04] p-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-2.5">
                        <UserCog className="mt-0.5 h-4 w-4 shrink-0 text-[#047084]" />
                        <div>
                            <p className="text-[13px] font-extrabold text-slate-800">Manage this account as the seller</p>
                            <p className="text-[12px] font-medium text-slate-500">Opens the marketplace in a new tab, signed in as this seller. Every action is logged.</p>
                        </div>
                    </div>
                    <ActAsUserButton sellerId={id} label="Act as this seller" />
                </div>
            </div>
            <AdminSellerDetailPage />
        </>
    );
}