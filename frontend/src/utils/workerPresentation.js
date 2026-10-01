const commonWorkerNames = {
  "marketing-planner": "Lập kế hoạch marketing",
  "customer-persona": "Chân dung khách hàng",
  "competitor-research": "Nghiên cứu đối thủ",
  "usp-offer": "Điểm khác biệt & ưu đãi",
  "facebook-campaign": "Chiến dịch Facebook",
  "ad-copy-headline": "Nội dung quảng cáo & tiêu đề",
  "content-planner": "Lập kế hoạch nội dung",
  "seo-audit-ceo-summary": "Kiểm tra SEO & báo cáo điều hành",
  "creative-brief": "Định hướng sáng tạo",
  "marketing-context-setup": "Thiết lập ngữ cảnh marketing",
};

const categoryDescriptions = {
  Strategy: "Nghiên cứu và lập kế hoạch marketing dựa trên thông tin doanh nghiệp.",
  Creation: "Xây dựng ý tưởng, thông điệp và nội dung cho chiến dịch marketing.",
  Growth: "Tìm cơ hội tăng trưởng và đề xuất cách cải thiện hiệu quả marketing.",
  Advanced: "Phân tích chuyên sâu và đề xuất hướng tối ưu hoạt động marketing.",
  Enterprise: "Hỗ trợ quy trình marketing và nhu cầu vận hành của doanh nghiệp.",
};

export function workerName(worker) {
  return commonWorkerNames[worker.slug] || worker.name;
}

export function workerDescription(worker) {
  return categoryDescriptions[worker.category] || "Hỗ trợ công việc marketing dựa trên thông tin bạn cung cấp.";
}
