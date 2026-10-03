import React, { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function AppLayout({ user, onLogout, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);
  return (
    <div className="app-layout">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} onLogout={onLogout} />
      <div className="app-layout__main">
        <Header user={user} menuOpen={menuOpen} onMenuClick={() => setMenuOpen((open) => !open)} />
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
