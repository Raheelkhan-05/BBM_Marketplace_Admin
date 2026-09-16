// src/components/AuthLayout.jsx
import { Outlet } from "react-router-dom";
import BackgroundAmbience from "./landing/BackgroundAmbience.jsx";

export default function AuthLayout() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#ffffff]">
      <BackgroundAmbience />

      {/* TrustPanel is desktop-only, so mobile gets its own compact brand
          strip — a sliver of the same identity, not the full dossier. */}

      <div className="relative z-10 flex min-h-screen items-center justify-center overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}