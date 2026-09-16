// src/pages/ShopRoute.jsx
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import ShopPage from "./ShopPage.jsx";
import SellerDashboardPage from "./SellerDashboardPage.jsx";

export default function ShopRoute() {
  const { slug } = useParams();
  const { isLoggedIn, profile } = useAuth();

  const isOwner = isLoggedIn && profile?.seller_status === "approved" && profile?.shop_slug === slug;

  if (isOwner) return <SellerDashboardPage slug={slug} />;
  return <ShopPage slug={slug} />;
}