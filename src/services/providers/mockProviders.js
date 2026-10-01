const AIProvider = require("./aiProvider");
class MockProvider extends AIProvider {
  async generate({ prompt, model, task, taskInput }) {
    if (task === "agent-plan") {
      const dependencyOrder = [
        "customer-persona", "competitor-research", "usp-offer",
        "facebook-campaign", "ad-copy-headline", "content-planner",
      ];
      const selected = taskInput.selectedWorkers;
      const ordered = [...selected].sort((a, b) => {
        const ai = dependencyOrder.indexOf(a.slug);
        const bi = dependencyOrder.indexOf(b.slug);
        return (ai < 0 ? dependencyOrder.length : ai) - (bi < 0 ? dependencyOrder.length : bi);
      });
      const steps = ordered.map((worker, index) => ({
        workerSlug: worker.slug,
        reason: index === 0 ? "Bắt đầu bằng kết quả nền tảng này để các bước sau có thể sử dụng thông tin thu được." : `Sử dụng ${index} kết quả trước đó để làm cho phần ${worker.name} cụ thể và phù hợp hơn.`,
        order: index + 1,
        dependsOn: index ? [ordered[index - 1].slug] : [],
      }));
      const changed = ordered.some((worker, index) => worker.slug !== selected[index].slug);
      return { model, output: { goal: taskInput.goal, steps, orderChanged: changed, reorderExplanation: changed ? "Thứ tự được điều chỉnh để nghiên cứu khách hàng và đối thủ làm cơ sở cho ưu đãi và nội dung chiến dịch." : "Thứ tự đã chọn phù hợp với công việc được yêu cầu." } };
    }
    if (task === "agent-evaluate") {
      const finish = taskInput.remainingWorkers.length === 0;
      return { model, output: { decision: finish ? "FINISH" : "CONTINUE", reason: finish ? "Tất cả Worker đã duyệt đã hoàn thành." : "Kết quả có cấu trúc hợp lệ; tiếp tục với Worker tiếp theo trong kế hoạch.", nextWorkerSlug: finish ? null : taskInput.remainingWorkers[0] } };
    }
    if (task === "agent-final") {
      const names = taskInput.workerOutputs.map((item) => item.workerName).join(", ");
      const actions = taskInput.workerOutputs.flatMap((item) =>
        (item.output.recommendations || []).slice(0, 2).map((recommendation) => recommendation.title || recommendation.detail || "Xem lại đề xuất của Worker"),
      ).slice(0, 8);
      const assumptions = [...new Set(taskInput.workerOutputs.flatMap((item) => item.output.assumptions || []))].slice(0, 12);
      return { model, output: {
        executiveSummary: `Đã hoàn thành nội dung marketing cho ${taskInput.product.name} với mục tiêu “${taskInput.goal.objective}”. Kết quả gồm ${names}. Hãy đối chiếu từng đề xuất với dữ liệu kinh doanh hiện tại trước khi áp dụng.`,
        workerOutputs: taskInput.workerOutputs,
        nextActions: actions,
        assumptions,
      } };
    }
    const objective =
      prompt.match(/OBJECTIVE:\s*(.+)/)?.[1] || "cải thiện hiệu quả marketing";
    return {
      model: model || "mock-model",
      output: {
        summary: `Gợi ý marketing cho ${objective}. Đây là kết quả minh họa từ chế độ mô phỏng.`,
        recommendations: [
          {
            title: "Làm rõ ưu đãi",
            detail:
              "Nêu rõ đối tượng khách hàng, lợi ích chính, bằng chứng và hành động tiếp theo. Kiểm chứng đề xuất bằng nghiên cứu khách hàng thực tế.",
            priority: "high",
          },
          {
            title: "Thử nghiệm theo từng vòng nhỏ",
            detail:
              "Mỗi lần thử nghiệm một nhóm khách hàng và một thông điệp; xem kết quả chiến dịch thực tế trước khi điều chỉnh ngân sách.",
            priority: "medium",
          },
        ],
        assumptions: [
          "Chưa kết nối dữ liệu quảng cáo hoặc phân tích bên ngoài.",
          "Các đề xuất chỉ mang tính minh họa và cần được đối chiếu với dữ liệu kinh doanh.",
        ],
      },
    };
  }
}
module.exports = MockProvider;
