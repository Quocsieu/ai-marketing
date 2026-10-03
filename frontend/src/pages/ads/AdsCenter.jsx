import React, { useState } from "react";
import { Megaphone } from "lucide-react";
import MetaAdsSettings from "../../components/MetaAdsSettings";
import { EmptyState, Tabs } from "../../components/ui";

const tabs = [
  { value: "meta", label: "Meta Ads" },
  { value: "google", label: "Google Ads" },
  { value: "tiktok", label: "TikTok Ads" },
];

export default function AdsCenter({ request }) {
  const [active, setActive] = useState("meta");
  return (
    <section className="ads-center">
      <div className="heading">
        <div>
          <p className="eyebrow">QUẢN LÝ QUẢNG CÁO</p>
          <h1>Trung tâm quảng cáo</h1>
          <p className="muted">Quản lý các nền tảng quảng cáo trong một không gian.</p>
        </div>
      </div>
      <Tabs items={tabs} value={active} onChange={setActive} aria-label="Nền tảng quảng cáo" />
      <div className="ads-center__panel">
        {active === "meta" ? <MetaAdsSettings request={request} /> : (
          <EmptyState
            icon={<Megaphone size={20} />}
            title={`${active === "google" ? "Google" : "TikTok"} Ads chưa được kết nối`}
            description="Kết nối nền tảng sẽ khả dụng khi tích hợp tương ứng được triển khai. Hiện chưa có dữ liệu chiến dịch để hiển thị."
          />
        )}
      </div>
    </section>
  );
}
