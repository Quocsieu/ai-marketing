import React from "react";
import { Menu } from "lucide-react";
import { useLocation } from "react-router-dom";

const titles = [
  ["/agent/runs/", "Lượt chạy AI Agent"], ["/agent", "AI Agent"],
  ["/workers/", "Chi tiết Worker"], ["/workers", "Thư viện Workers"],
  ["/context", "Ngữ cảnh marketing"], ["/history", "Lịch sử thực thi"],
  ["/analytics", "Phân tích"], ["/settings", "Cài đặt"], ["/meta-ads", "Meta Ads"], ["/", "Tổng quan"],
];

export default function Header({ user, onMenuClick, menuOpen = false }) {
  const { pathname } = useLocation();
  const title = titles.find(([path]) => path === "/" ? pathname === path : pathname.startsWith(path))?.[1] || "MarketPilotAI";
  return (
    <header className="app-header">
      <button className="mobile-menu" type="button" aria-label={menuOpen ? "Đóng menu" : "Mở menu"} aria-expanded={menuOpen} aria-controls="app-primary-navigation" onClick={onMenuClick}><Menu size={20} /></button>
      <div className="app-breadcrumb"><span>Không gian làm việc</span><span aria-hidden="true">/</span><strong>{title}</strong></div>
      <div className="app-profile">
        <span className="app-profile__avatar">{user?.name?.[0]?.toUpperCase() || "M"}</span>
        <span className="app-profile__text"><strong>{user?.name || "Chào mừng"}</strong><small>Không gian marketing</small></span>
      </div>
    </header>
  );
}
