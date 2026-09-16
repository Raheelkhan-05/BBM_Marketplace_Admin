// bbm-admin/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import { SocketProvider } from "./context/SocketContext.jsx";
import { NotificationsProvider } from "./context/NotificationsContext.jsx";
import AdminLayout from "./components/AdminLayout.jsx";
import AuthPage from "./pages/AuthPage.jsx";

import AdminSellersPage from "./pages/admin/AdminSellersPage.jsx";
import AdminSellerDetailPage from "./pages/admin/AdminSellerDetailPage.jsx";
import AdminManageAdminsPage from "./pages/admin/AdminManageAdminsPage.jsx";
import AdminCatalogReviewPage from "./pages/admin/AdminCatalogReviewPage.jsx";
import AdminCatalogDetailPage from "./pages/admin/AdminCatalogDetailPage.jsx";
import AdminSellerSubmissionsPage from "./pages/admin/AdminSellerSubmissionsPage.jsx";
import PaymentVerificationPage from "./pages/admin/PaymentVerificationPage.jsx";
import AdminFullCatalogUploadPage from "./pages/admin/AdminFullCatalogUploadPage.jsx";
import AdminWalletSellersPage from "./pages/admin/AdminWalletSellersPage.jsx";
import AdminDatabasePanel from "./pages/admin/AdminDatabasePanel.jsx";
import AdminProductCommissionsPage from "./pages/admin/AdminProductCommissionsPage.jsx";
import AdminHelpRequestsPage from "./pages/admin/AdminHelpRequestsPage.jsx";

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <NotificationsProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<AuthPage />} />

              {/* Redirect bare "/" to somewhere useful — the login-gated
                  routes below still all keep their ORIGINAL /admin/...
                  paths unchanged, so every link.link string already
                  sitting in the notifications table (and any that get
                  inserted going forward, unchanged) still resolves. */}
              <Route path="/" element={<Navigate to="/listings" replace />} />

              <Route element={<AdminLayout />}>
                <Route path="/sellers" element={<AdminSellersPage />} />
                <Route path="/sellers/:id" element={<AdminSellerDetailPage />} />
                <Route path="/admins" element={<AdminManageAdminsPage />} />
                <Route path="/catalog" element={<AdminCatalogReviewPage />} />
                <Route path="/catalog/:level/:id" element={<AdminCatalogDetailPage />} />
                <Route path="/listings" element={<AdminSellerSubmissionsPage />} />
                <Route path="/payments" element={<PaymentVerificationPage />} />
                <Route path="/catalog/bulk-upload" element={<AdminFullCatalogUploadPage />} />
                <Route path="/wallets" element={<AdminWalletSellersPage />} />
                <Route path="/database" element={<AdminDatabasePanel />} />
                <Route path="/product-commisions" element={<AdminProductCommissionsPage />} />
                <Route path="/support" element={<AdminHelpRequestsPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </NotificationsProvider>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;