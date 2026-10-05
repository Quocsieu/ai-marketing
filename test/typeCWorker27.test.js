const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");

const actionProposalService = require("../src/services/actions/actionProposalService");
const actionAuditService = require("../src/services/actions/actionAuditService");
const { isTypeCWorker } = require("../src/workers/typeCWorkerWiring");
const workers = require("../src/workers");
const aiService = require("../src/services/ai/aiService");
const adsService = require("../src/services/ads/adsService");
const { MetaAdsProvider } = require("../src/services/meta/metaAdsProvider");
const prisma = require("../src/config/database");

describe("Type C MVP: Worker #27 Full Ads Copilot & Safe Action System", () => {
  const testUserId = "user-typec-test-001";
  const otherUserId = "user-typec-test-002";
  const testCampaignId = "1202100000000001";

  let metaMutationCallCount = 0;

  beforeEach(() => {
    metaMutationCallCount = 0;
  });

  // 1. Classification & Routing
  it("Worker classification: identifies Worker #27 as Type C worker", () => {
    assert.strictEqual(isTypeCWorker("full-ads-copilot"), true);
    assert.strictEqual(isTypeCWorker("analytics-ceo-dashboard"), false);
    assert.strictEqual(isTypeCWorker("marketing-alert"), false);
    assert.strictEqual(isTypeCWorker("marketing-planner"), false);
  });

  // 2. Proposal Validation & Whitelist
  it("Validation: targetObjectType other than CAMPAIGN is rejected", () => {
    assert.throws(
      () => {
        actionProposalService.validateProposalInput({
          channel: "meta",
          actionType: "PAUSE_CAMPAIGN",
          targetExternalId: testCampaignId,
          targetObjectType: "ADSET",
          payload: { campaignId: testCampaignId, status: "PAUSED" },
          reason: "Performance drop in campaign adset.",
        });
      },
      { code: "INVALID_TARGET_OBJECT_TYPE" }
    );
  });

  it("Validation: actionType other than PAUSE_CAMPAIGN is rejected", () => {
    assert.throws(
      () => {
        actionProposalService.validateProposalInput({
          channel: "meta",
          actionType: "DELETE_CAMPAIGN",
          targetExternalId: testCampaignId,
          targetObjectType: "CAMPAIGN",
          payload: { campaignId: testCampaignId, status: "PAUSED" },
          reason: "Underperforming campaign.",
        });
      },
      { code: "INVALID_ACTION_TYPE" }
    );
  });

  it("Validation: accessToken, secret, or arbitrary URL in payload is rejected", () => {
    assert.throws(
      () => {
        actionProposalService.validateProposalInput({
          channel: "meta",
          actionType: "PAUSE_CAMPAIGN",
          targetExternalId: testCampaignId,
          targetObjectType: "CAMPAIGN",
          payload: {
            campaignId: testCampaignId,
            status: "PAUSED",
            accessToken: "EAABxxxxxxx",
          },
          reason: "Underperforming campaign with leaked token.",
        });
      },
      { code: "SECURITY_VIOLATION" }
    );
  });

  // 3. Worker Execution Flow & Zero Direct Mutation
  it("TEST 1 & 2: Worker #27 creates PENDING proposal and NEVER calls Meta mutation directly", async () => {
    const origList = adsService.listCampaigns;
    const origCreateProposal = actionProposalService.createProposal;
    const origGenerate = aiService.generate;
    const origPause = MetaAdsProvider.prototype.pauseCampaign;

    let proposalCreated = null;

    adsService.listCampaigns = async () => [
      { externalCampaignId: testCampaignId, name: "Summer Campaign", status: "ACTIVE" },
    ];

    actionProposalService.createProposal = async (userId, data) => {
      proposalCreated = { id: "prop-101", userId, ...data, status: "PENDING" };
      return { created: true, proposal: proposalCreated };
    };

    MetaAdsProvider.prototype.pauseCampaign = async () => {
      metaMutationCallCount++;
      return { success: true };
    };

    aiService.generate = async () => ({
      summary: "Chiến dịch Summer Campaign đang có CPA tăng vọt.",
      recommendations: [{ title: "Tạm dừng chiến dịch", detail: "CPA tăng 60%", priority: "high" }],
      assumptions: ["Dữ liệu 14 ngày qua."],
      proposedActions: [
        {
          actionType: "PAUSE_CAMPAIGN",
          targetExternalId: testCampaignId,
          targetObjectType: "CAMPAIGN",
          payload: { campaignId: testCampaignId, status: "PAUSED" },
          reason: "CPA tăng 60% vượt quá ngưỡng cho phép.",
        },
      ],
    });

    const worker = workers.find((w) => w.slug === "full-ads-copilot");
    assert(worker, "Worker #27 must be present in catalog");

    const result = await worker.execute({
      context: { businessName: "MatBao Corp" },
      input: { objective: "Audit and optimize underperforming campaigns" },
      userId: testUserId,
    });

    // Restore
    adsService.listCampaigns = origList;
    actionProposalService.createProposal = origCreateProposal;
    aiService.generate = origGenerate;
    MetaAdsProvider.prototype.pauseCampaign = origPause;

    // Zero Direct Mutation Check
    assert.strictEqual(metaMutationCallCount, 0, "Worker #27 must NEVER call Meta mutation directly!");

    // Proposal was created with PENDING
    assert(proposalCreated !== null, "ActionProposal must be created");
    assert.strictEqual(proposalCreated.status, "PENDING");
    assert.strictEqual(proposalCreated.targetExternalId, testCampaignId);
    assert.strictEqual(proposalCreated.actionType, "PAUSE_CAMPAIGN");

    // Output schema compatibility
    assert.strictEqual(typeof result.output.summary, "string");
    assert(Array.isArray(result.output.recommendations));
    assert(Array.isArray(result.output.assumptions));
    assert(Array.isArray(result.output.proposedActions));
    assert.strictEqual(result.output.proposedActions.length, 1);
  });

  // 4. Hallucination Protection
  it("TEST 16: AI targetExternalId not in verified campaign list is rejected", async () => {
    const origList = adsService.listCampaigns;
    const origCreateProposal = actionProposalService.createProposal;
    const origGenerate = aiService.generate;

    let proposalCreated = false;

    // Backend only has campaign 1202100000000001
    adsService.listCampaigns = async () => [
      { externalCampaignId: testCampaignId, name: "Summer Campaign", status: "ACTIVE" },
    ];

    actionProposalService.createProposal = async () => {
      proposalCreated = true;
      return { created: true };
    };

    // AI hallucinates a non-existent campaign ID "999999999999"
    aiService.generate = async () => ({
      summary: "Audit result",
      recommendations: [],
      assumptions: [],
      proposedActions: [
        {
          actionType: "PAUSE_CAMPAIGN",
          targetExternalId: "999999999999", // Hallucinated ID
          targetObjectType: "CAMPAIGN",
          payload: { campaignId: "999999999999", status: "PAUSED" },
          reason: "Fake campaign drop.",
        },
      ],
    });

    const worker = workers.find((w) => w.slug === "full-ads-copilot");
    const result = await worker.execute({
      context: { businessName: "MatBao Corp" },
      input: { objective: "Audit" },
      userId: testUserId,
    });

    adsService.listCampaigns = origList;
    actionProposalService.createProposal = origCreateProposal;
    aiService.generate = origGenerate;

    assert.strictEqual(proposalCreated, false, "Must not create proposal for hallucinated campaign ID");
    assert.strictEqual(result.output.proposedActions.length, 0);
  });

  // 5. State Machine & Execution Safety Gates
  it("TEST 3: PENDING proposal cannot be executed", async () => {
    const origFind = prisma.actionProposal.findFirst;
    prisma.actionProposal.findFirst = async () => ({
      id: "prop-1",
      userId: testUserId,
      status: "PENDING",
      targetExternalId: testCampaignId,
      channel: "meta",
      actionType: "PAUSE_CAMPAIGN",
      targetObjectType: "CAMPAIGN",
      payload: { campaignId: testCampaignId, status: "PAUSED" },
    });

    await assert.rejects(
      async () => {
        await actionProposalService.executeApprovedProposal(testUserId, "prop-1");
      },
      { code: "PROPOSAL_NOT_APPROVED" }
    );

    prisma.actionProposal.findFirst = origFind;
  });

  it("TEST 4: REJECTED proposal cannot be executed", async () => {
    const origFind = prisma.actionProposal.findFirst;
    prisma.actionProposal.findFirst = async () => ({
      id: "prop-1",
      userId: testUserId,
      status: "REJECTED",
      targetExternalId: testCampaignId,
      channel: "meta",
      actionType: "PAUSE_CAMPAIGN",
      targetObjectType: "CAMPAIGN",
      payload: { campaignId: testCampaignId, status: "PAUSED" },
    });

    await assert.rejects(
      async () => {
        await actionProposalService.executeApprovedProposal(testUserId, "prop-1");
      },
      { code: "PROPOSAL_REJECTED" }
    );

    prisma.actionProposal.findFirst = origFind;
  });

  // 6. User Isolation
  it("TEST 6 & 7: Wrong user cannot approve or execute proposal", async () => {
    const origFind = prisma.actionProposal.findFirst;
    prisma.actionProposal.findFirst = async ({ where }) => {
      // Only returns if where.userId === testUserId
      if (where.userId === testUserId && where.id === "prop-1") {
        return {
          id: "prop-1",
          userId: testUserId,
          status: "PENDING",
          targetExternalId: testCampaignId,
          channel: "meta",
          actionType: "PAUSE_CAMPAIGN",
          targetObjectType: "CAMPAIGN",
        };
      }
      return null;
    };

    // User otherUserId attempts to get / approve / execute User testUserId's proposal
    await assert.rejects(
      async () => {
        await actionProposalService.getProposal(otherUserId, "prop-1");
      },
      { code: "ACTION_PROPOSAL_NOT_FOUND" }
    );

    await assert.rejects(
      async () => {
        await actionProposalService.approveProposal(otherUserId, "prop-1");
      },
      { code: "ACTION_PROPOSAL_NOT_FOUND" }
    );

    await assert.rejects(
      async () => {
        await actionProposalService.executeApprovedProposal(otherUserId, "prop-1");
      },
      { code: "ACTION_PROPOSAL_NOT_FOUND" }
    );

    prisma.actionProposal.findFirst = origFind;
  });

  // 7. Race Conditions & Double Operations
  it("TEST 8: Double approve is blocked with 409 conflict", async () => {
    const origFind = prisma.actionProposal.findFirst;
    const origUpdateMany = prisma.actionProposal.updateMany;

    let calls = 0;
    prisma.actionProposal.findFirst = async () => {
      calls++;
      return {
        id: "prop-1",
        userId: testUserId,
        status: calls === 1 ? "PENDING" : "APPROVED",
        targetExternalId: testCampaignId,
      };
    };

    // First call succeeds (count = 1), second call fails (count = 0)
    prisma.actionProposal.updateMany = async ({ where }) => {
      if (where.status === "PENDING" && calls === 1) {
        return { count: 1 };
      }
      return { count: 0 };
    };

    // 1st approve: Success
    const res1 = await actionProposalService.approveProposal(testUserId, "prop-1");
    assert(res1);

    // 2nd approve: Conflict
    await assert.rejects(
      async () => {
        await actionProposalService.approveProposal(testUserId, "prop-1");
      },
      { code: "PROPOSAL_STATE_CONFLICT" }
    );

    prisma.actionProposal.findFirst = origFind;
    prisma.actionProposal.updateMany = origUpdateMany;
  });

  it("TEST 9 & 18: Double execute lock prevents concurrent execution", async () => {
    const origFind = prisma.actionProposal.findFirst;
    const origUpdateMany = prisma.actionProposal.updateMany;

    // Simulate proposal already claimed into EXECUTING
    prisma.actionProposal.findFirst = async () => ({
      id: "prop-1",
      userId: testUserId,
      status: "EXECUTING",
      targetExternalId: testCampaignId,
      channel: "meta",
      actionType: "PAUSE_CAMPAIGN",
      targetObjectType: "CAMPAIGN",
      payload: { campaignId: testCampaignId, status: "PAUSED" },
    });

    await assert.rejects(
      async () => {
        await actionProposalService.executeApprovedProposal(testUserId, "prop-1");
      },
      { code: "PROPOSAL_ALREADY_EXECUTING" }
    );

    // Simulate proposal already EXECUTED
    prisma.actionProposal.findFirst = async () => ({
      id: "prop-1",
      userId: testUserId,
      status: "EXECUTED",
      targetExternalId: testCampaignId,
      channel: "meta",
      actionType: "PAUSE_CAMPAIGN",
      targetObjectType: "CAMPAIGN",
      payload: { campaignId: testCampaignId, status: "PAUSED" },
    });

    await assert.rejects(
      async () => {
        await actionProposalService.executeApprovedProposal(testUserId, "prop-1");
      },
      { code: "PROPOSAL_ALREADY_EXECUTED" }
    );

    prisma.actionProposal.findFirst = origFind;
    prisma.actionProposal.updateMany = origUpdateMany;
  });

  // 8. Execution & Audit Trail
  it("TEST 5, 10, 12: Approved execution calls Meta, updates EXECUTED, and logs SUCCESS audit trail", async () => {
    const origFind = prisma.actionProposal.findFirst;
    const origUpdateMany = prisma.actionProposal.updateMany;
    const origUpdate = prisma.actionProposal.update;
    const origConn = prisma.metaConnection.findUnique;
    const origGetCamp = MetaAdsProvider.prototype.getCampaign;
    const origPause = MetaAdsProvider.prototype.pauseCampaign;
    const origAuditCreate = prisma.actionAuditLog.create;

    let auditLogRecorded = null;
    let finalProposalStatus = null;

    prisma.actionProposal.findFirst = async () => ({
      id: "prop-1",
      userId: testUserId,
      status: "APPROVED",
      targetExternalId: testCampaignId,
      channel: "meta",
      actionType: "PAUSE_CAMPAIGN",
      targetObjectType: "CAMPAIGN",
      payload: { campaignId: testCampaignId, status: "PAUSED" },
    });

    prisma.actionProposal.updateMany = async () => ({ count: 1 });
    prisma.actionProposal.update = async ({ data }) => {
      finalProposalStatus = data.status;
      return { id: "prop-1", status: data.status };
    };

    prisma.metaConnection.findUnique = async () => ({
      id: "conn-1",
      userId: testUserId,
      adAccountId: "act_12345",
      accessToken: "mock-encrypted-token",
      expiresAt: new Date(Date.now() + 3600000),
    });

    let getCampCalls = 0;
    MetaAdsProvider.prototype.getCampaign = async () => {
      getCampCalls++;
      if (getCampCalls === 1) {
        return { id: testCampaignId, name: "Camp 1", status: "ACTIVE", account_id: "12345" };
      }
      return { id: testCampaignId, name: "Camp 1", status: "PAUSED", account_id: "12345" };
    };

    MetaAdsProvider.prototype.pauseCampaign = async () => {
      return { success: true };
    };

    prisma.actionAuditLog.create = async ({ data }) => {
      auditLogRecorded = data;
      return { id: "audit-1", ...data };
    };

    const tokenEncryption = require("../src/services/meta/tokenEncryption");
    const origDecrypt = tokenEncryption.decryptToken;
    tokenEncryption.decryptToken = () => "mock-decrypted-token";

    const execResult = await actionProposalService.executeApprovedProposal(testUserId, "prop-1");

    // Restore
    tokenEncryption.decryptToken = origDecrypt;
    prisma.actionProposal.findFirst = origFind;
    prisma.actionProposal.updateMany = origUpdateMany;
    prisma.actionProposal.update = origUpdate;
    prisma.metaConnection.findUnique = origConn;
    MetaAdsProvider.prototype.getCampaign = origGetCamp;
    MetaAdsProvider.prototype.pauseCampaign = origPause;
    prisma.actionAuditLog.create = origAuditCreate;

    assert.strictEqual(execResult.success, true);
    assert.strictEqual(finalProposalStatus, "EXECUTED");
    assert(auditLogRecorded !== null, "ActionAuditLog must be recorded on success");
    assert.strictEqual(auditLogRecorded.status, "SUCCESS");
    assert.strictEqual(auditLogRecorded.previousState.status, "ACTIVE");
    assert.strictEqual(auditLogRecorded.newState.status, "PAUSED");
    assert.strictEqual(auditLogRecorded.apiResponse.success, true);
  });

  it("TEST 11: Meta failure marks proposal FAILED and logs FAILED audit log", async () => {
    const origFind = prisma.actionProposal.findFirst;
    const origUpdateMany = prisma.actionProposal.updateMany;
    const origUpdate = prisma.actionProposal.update;
    const origConn = prisma.metaConnection.findUnique;
    const origGetCamp = MetaAdsProvider.prototype.getCampaign;
    const origPause = MetaAdsProvider.prototype.pauseCampaign;
    const origAuditCreate = prisma.actionAuditLog.create;

    let auditFailureRecorded = null;
    let finalProposalStatus = null;

    prisma.actionProposal.findFirst = async () => ({
      id: "prop-1",
      userId: testUserId,
      status: "APPROVED",
      targetExternalId: testCampaignId,
      channel: "meta",
      actionType: "PAUSE_CAMPAIGN",
      targetObjectType: "CAMPAIGN",
      payload: { campaignId: testCampaignId, status: "PAUSED" },
    });

    prisma.actionProposal.updateMany = async () => ({ count: 1 });
    prisma.actionProposal.update = async ({ data }) => {
      finalProposalStatus = data.status;
      return { id: "prop-1", status: data.status };
    };

    prisma.metaConnection.findUnique = async () => ({
      id: "conn-1",
      userId: testUserId,
      adAccountId: "act_12345",
      accessToken: "mock-encrypted-token",
      expiresAt: new Date(Date.now() + 3600000),
    });

    MetaAdsProvider.prototype.getCampaign = async () => ({
      id: testCampaignId,
      name: "Camp 1",
      status: "ACTIVE",
      account_id: "12345",
    });

    // Simulate Meta API error
    MetaAdsProvider.prototype.pauseCampaign = async () => {
      throw new Error("Meta Graph API Rate Limit Exceeded");
    };

    prisma.actionAuditLog.create = async ({ data }) => {
      auditFailureRecorded = data;
      return { id: "audit-fail-1", ...data };
    };

    const tokenEncryption = require("../src/services/meta/tokenEncryption");
    const origDecrypt = tokenEncryption.decryptToken;
    tokenEncryption.decryptToken = () => "mock-decrypted-token";

    await assert.rejects(
      async () => {
        await actionProposalService.executeApprovedProposal(testUserId, "prop-1");
      },
      { message: "Meta Graph API Rate Limit Exceeded" }
    );

    tokenEncryption.decryptToken = origDecrypt;
    prisma.actionProposal.findFirst = origFind;
    prisma.actionProposal.updateMany = origUpdateMany;
    prisma.actionProposal.update = origUpdate;
    prisma.metaConnection.findUnique = origConn;
    MetaAdsProvider.prototype.getCampaign = origGetCamp;
    MetaAdsProvider.prototype.pauseCampaign = origPause;
    prisma.actionAuditLog.create = origAuditCreate;

    assert.strictEqual(finalProposalStatus, "FAILED");
    assert(auditFailureRecorded !== null, "ActionAuditLog must be recorded on failure");
    assert.strictEqual(auditFailureRecorded.status, "FAILED");
    assert(auditFailureRecorded.errorMessage.includes("Rate Limit"));
  });

  // 9. Regression & Compatibility with Type A, B1, B2
  it("TEST 19, 20, 21: Worker #27 does not alter Type A, B1, or B2 workers", () => {
    const { isTypeBWorker } = require("../src/workers/typeBWorkerWiring");

    // B1 workers remain Type B
    assert.strictEqual(isTypeBWorker("analytics-ceo-dashboard"), true);
    assert.strictEqual(isTypeBWorker("cac-roas-funnel-analytics"), true);
    assert.strictEqual(isTypeBWorker("monthly-ceo-strategy-report"), true);

    // B2 workers remain Type B
    assert.strictEqual(isTypeBWorker("marketing-alert"), true);
    assert.strictEqual(isTypeBWorker("smart-budget-allocation"), true);
    assert.strictEqual(isTypeBWorker("advanced-budget-planner"), true);

    // Worker #27 is Type C, not Type B
    assert.strictEqual(isTypeBWorker("full-ads-copilot"), false);
    assert.strictEqual(isTypeCWorker("full-ads-copilot"), true);

    // Type A worker remains neither Type B nor Type C
    assert.strictEqual(isTypeBWorker("marketing-planner"), false);
    assert.strictEqual(isTypeCWorker("marketing-planner"), false);
  });
});
