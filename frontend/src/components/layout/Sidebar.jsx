import React from "react";
import { NavLink } from "react-router-dom";
import { Bot, BriefcaseBusiness, ChartNoAxesCombined, History, LayoutDashboard, LogOut, Megaphone, Settings, Sparkles, Users, X } from "lucide-react";

const links = [
  { to: "/", label: "Tổng quan", icon: LayoutDashboard, end: true },
  { to: "/agent", label: "AI Agent", icon: Bot },
  { to: "/workers", label: "Workers", icon: BriefcaseBusiness },
  { to: "/context", label: "Ngữ cảnh", icon: Users },
  { to: "/history", label: "Lịch sử", icon: History },
  { to: "/analytics", label: "Phân tích", icon: ChartNoAxesCombined },
  { to: "/meta-ads", label: "Meta Ads", icon: Megaphone },
  { to: "/settings", label: "Cài đặt", icon: Settings },
];

export default function Sidebar({ open, onClose, onLogout }) {
  return (
    <>
      {open && <button className="layout-scrim" type="button" aria-label="Đóng menu" onClick={onClose} />}
      <aside id="app-primary-navigation" className={`app-sidebar${open ? " is-open" : ""}`} aria-label="Điều hướng chính">
        <div className="app-brand">
          <span className="app-brand__mark"><Sparkles size={19} /></span>
          <span>MarketPilot<span className="app-brand__ai">AI</span></span>
          <button className="mobile-close" type="button" aria-label="Đóng menu" onClick={onClose}><X size={19} /></button>
        </div>
        <p className="app-sidebar__label">KHÔNG GIAN LÀM VIỆC</p>
        <nav className="app-nav">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={onClose} className={({ isActive }) => `app-nav__link${isActive ? " is-active" : ""}`}>
              <Icon size={18} aria-hidden="true" /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="app-sidebar__bottom">
          <p className="app-plan"><span /> Không gian marketing</p>
          <button className="app-logout" type="button" onClick={onLogout}><LogOut size={17} />Đăng xuất</button>
        </div>
      </aside>
    </>
  );
}
