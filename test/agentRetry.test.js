require("dotenv").config();
const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const prisma = require("../src/config/database");
const workerRegistry = require("../src/workers");
const workerService = require("../src/services/workers/executeWorker");
const evaluator = require("../src/agents/evaluator");
const aiService = require("../src/services/ai/aiService");
const { retryStep } = require("../src/agents/marketingAgent");

describe("Agent Step Retry Suite", () => {
  let testUser;
  let testUser2;
  let m4Package;
  let executedSlugs = [];
  let shouldFailWorkerSlug = null;
  const originalExecuteWorker = workerService.executeWorker;
  const originalEvaluateStep = evaluator.evaluateStep;
  const originalAiGenerate = aiService.generate;

  before(async () => {
    m4Package = await prisma.package.findUnique({ where: { code: "M4" } });
    if (!m4Package) {
      m4Package = await prisma.package.create({
        data: {
          code: "M4",
          name: "Enterprise M4",
          description: "Full access",
          capabilities: {},
        },
      });
    }

    testUser = await prisma.user.create({
      data: {
        email: `test-retry-${Date.now()}@example.com`,
        passwordHash: "dummyhash123",
        name: "Retry Tester",
        subscriptions: {
          create: {
            packageId: m4Package.id,
            status: "ACTIVE",
          },
        },
      },
    });

    testUser2 = await prisma.user.create({
      data: {
        email: `test-other-${Date.now()}@example.com`,
        passwordHash: "dummyhash123",
        name: "Other User",
        subscriptions: {
          create: {
            packageId: m4Package.id,
            status: "ACTIVE",
          },
        },
      },
    });
  });

  after(async () => {
    workerService.executeWorker = originalExecuteWorker;
    evaluator.evaluateStep = originalEvaluateStep;
    aiService.generate = originalAiGenerate;

    if (testUser?.id) {
      await prisma.agentRun.deleteMany({ where: { userId: testUser.id } });
      await prisma.subscription.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    }
    if (testUser2?.id) {
      await prisma.agentRun.deleteMany({ where: { userId: testUser2.id } });
      await prisma.subscription.deleteMany({ where: { userId: testUser2.id } });
      await prisma.user.delete({ where: { id: testUser2.id } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  beforeEach(() => {
    executedSlugs = [];
    shouldFailWorkerSlug = null;

    workerService.executeWorker = async ({ workerSlug }) => {
      executedSlugs.push(workerSlug);
      if (shouldFailWorkerSlug && workerSlug === shouldFailWorkerSlug) {
        throw new Error(`Simulated failure for ${workerSlug}`);
      }
      return {
        output: {
          summary: `Summary for ${workerSlug}`,
          recommendations: [{ title: `Rec for ${workerSlug}`, detail: "Detail" }],
          assumptions: ["Assumption 1"],
        },
      };
    };

    evaluator.evaluateStep = async () => ({
      decision: "CONTINUE",
      reason: "Step evaluated successfully",
      nextWorkerSlug: null,
    });

    aiService.generate = async () => ({
      output: {
        executiveSummary: "Combined marketing brief summary",
        nextActions: ["Action 1", "Action 2"],
        workerOutputs: [],
      },
    });
  });

  async function waitForRun(runId, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const run = await prisma.agentRun.findUnique({
        where: { id: runId },
        include: { steps: { orderBy: { stepOrder: "asc" } } },
      });
      if (run && (run.status === "SUCCEEDED" || run.status === "FAILED")) {
        return run;
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    throw new Error(`Timeout waiting for run ${runId}`);
  }

  // 1. Step không tồn tại -> 404 AGENT_STEP_NOT_FOUND
  test("1. Step không tồn tại -> 404 AGENT_STEP_NOT_FOUND", async () => {
    await assert.rejects(
      async () => {
        await retryStep({ userId: testUser.id, stepId: "non-existent-step-id" });
      },
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.code, "AGENT_STEP_NOT_FOUND");
        return true;
      }
    );
  });

  // 2. Step khác user -> 403 AGENT_STEP_FORBIDDEN
  test("2. Step khác user -> 403 AGENT_STEP_FORBIDDEN", async () => {
    const run = await prisma.agentRun.create({
      data: {
        userId: testUser.id,
        goal: { objective: "Test objective" },
        productInput: { name: "Test product", description: "Desc" },
        selectedWorkers: ["customer-persona"],
        status: "FAILED",
        steps: {
          create: {
            workerSlug: "customer-persona",
            stepOrder: 1,
            status: "FAILED",
            reason: "Reason 1",
            input: { objective: "Obj", audience: "", constraints: "" },
          },
        },
      },
      include: { steps: true },
    });
    const step = run.steps[0];

    await assert.rejects(
      async () => {
        await retryStep({ userId: testUser2.id, stepId: step.id });
      },
      (err) => {
        assert.equal(err.status, 403);
        assert.equal(err.code, "AGENT_STEP_FORBIDDEN");
        return true;
      }
    );
  });

  // 3. Step không FAILED -> 400 AGENT_STEP_NOT_FAILED
  test("3. Step không FAILED (SUCCEEDED) -> 400 AGENT_STEP_NOT_FAILED", async () => {
    const run = await prisma.agentRun.create({
      data: {
        userId: testUser.id,
        goal: { objective: "Test objective" },
        productInput: { name: "Test product", description: "Desc" },
        selectedWorkers: ["customer-persona"],
        status: "SUCCEEDED",
        steps: {
          create: {
            workerSlug: "customer-persona",
            stepOrder: 1,
            status: "SUCCEEDED",
            reason: "Reason 1",
            input: { objective: "Obj", audience: "", constraints: "" },
          },
        },
      },
      include: { steps: true },
    });
    const step = run.steps[0];

    await assert.rejects(
      async () => {
        await retryStep({ userId: testUser.id, stepId: step.id });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "AGENT_STEP_NOT_FAILED");
        return true;
      }
    );
  });

  // 4. Double click / concurrent retry -> 409 STEP_ALREADY_RUNNING
  test("4. Double click / concurrent retry -> 409 STEP_ALREADY_RUNNING or AGENT_RUN_STATE_CONFLICT", async () => {
    const run = await prisma.agentRun.create({
      data: {
        userId: testUser.id,
        goal: { objective: "Test objective" },
        productInput: { name: "Test product", description: "Desc" },
        selectedWorkers: ["customer-persona"],
        status: "FAILED",
        steps: {
          create: {
            workerSlug: "customer-persona",
            stepOrder: 1,
            status: "FAILED",
            reason: "Reason 1",
            input: { objective: "Obj", audience: "", constraints: "" },
          },
        },
      },
      include: { steps: true },
    });
    const step = run.steps[0];

    // Fire two concurrent retries simultaneously
    const [res1, res2] = await Promise.allSettled([
      retryStep({ userId: testUser.id, stepId: step.id }),
      retryStep({ userId: testUser.id, stepId: step.id }),
    ]);

    // Exactly one should succeed, and the other must be rejected with 409
    const succeeded = [res1, res2].filter((r) => r.status === "fulfilled");
    const rejected = [res1, res2].filter((r) => r.status === "rejected");

    assert.equal(succeeded.length, 1, "Exactly one retry request must succeed");
    assert.equal(rejected.length, 1, "The duplicate retry request must be rejected");
    assert.equal(rejected[0].reason.status, 409);
    assert.ok(
      rejected[0].reason.code === "STEP_ALREADY_RUNNING" ||
        rejected[0].reason.code === "AGENT_RUN_STATE_CONFLICT",
      "Must return STEP_ALREADY_RUNNING or AGENT_RUN_STATE_CONFLICT"
    );

    // Wait for the successful retry to finish cleanly
    await waitForRun(run.id);
  });

  // 5. Retry giữa workflow success: Step 1..3 SUCCEEDED, Step 4 FAILED -> Retry 4 succeeds -> Step 5 continues
  test("5. Retry giữa workflow: Step 1..3 SUCCEEDED, retry Step 4 -> tiếp tục Step 5", async () => {
    const workerSlugs = [
      "marketing-planner",
      "customer-persona",
      "competitor-research",
      "usp-offer",
      "facebook-campaign",
    ];

    const planSteps = workerSlugs.map((slug, idx) => ({
      workerSlug: slug,
      reason: `Step ${idx + 1}`,
      order: idx + 1,
      dependsOn: [],
    }));

    const run = await prisma.agentRun.create({
      data: {
        userId: testUser.id,
        goal: { objective: "Scale conversions" },
        productInput: { name: "Smart Lamp", description: "WiFi controlled RGB lamp" },
        selectedWorkers: workerSlugs,
        status: "FAILED",
        plan: {
          goal: "Scale conversions",
          steps: planSteps,
          batches: [{ batchNumber: 1, steps: planSteps }],
          orderChanged: false,
          reorderExplanation: "Standard flow",
        },
      },
    });

    // Create steps 1..3 as SUCCEEDED
    for (let i = 0; i < 3; i++) {
      await prisma.agentStep.create({
        data: {
          agentRunId: run.id,
          workerSlug: workerSlugs[i],
          stepOrder: i + 1,
          status: "SUCCEEDED",
          reason: `Step ${i + 1}`,
          input: { objective: "Obj" },
          output: { summary: `Prior output for ${workerSlugs[i]}` },
        },
      });
    }

    // Create step 4 as FAILED
    const step4 = await prisma.agentStep.create({
      data: {
        agentRunId: run.id,
        workerSlug: workerSlugs[3],
        stepOrder: 4,
        status: "FAILED",
        reason: "Step 4",
        input: { objective: "Obj" },
        errorMessage: "Network timeout on first run",
      },
    });

    // Step 5 not created yet in DB
    const res = await retryStep({ userId: testUser.id, stepId: step4.id });
    assert.equal(res.status, "RUNNING");

    const completedRun = await waitForRun(run.id);
    assert.equal(completedRun.status, "SUCCEEDED");

    // Succeeded steps 1..3 must NOT have been executed again
    assert.ok(!executedSlugs.includes(workerSlugs[0]));
    assert.ok(!executedSlugs.includes(workerSlugs[1]));
    assert.ok(!executedSlugs.includes(workerSlugs[2]));

    // Step 4 and Step 5 must have executed
    assert.ok(executedSlugs.includes(workerSlugs[3]));
    assert.ok(executedSlugs.includes(workerSlugs[4]));

    const allSteps = completedRun.steps;
    assert.equal(allSteps.length, 5);
    assert.ok(allSteps.every((s) => s.status === "SUCCEEDED"));
  });

  // 6. Retry vẫn failed: Step 2 retry fails -> remains FAILED, step 3 does not run
  test("6. Retry vẫn failed -> Step 2 stays FAILED, Step 3 does not run", async () => {
    const workerSlugs = ["customer-persona", "competitor-research", "usp-offer"];
    const planSteps = workerSlugs.map((slug, idx) => ({
      workerSlug: slug,
      reason: `Step ${idx + 1}`,
      order: idx + 1,
      dependsOn: [],
    }));

    const run = await prisma.agentRun.create({
      data: {
        userId: testUser.id,
        goal: { objective: "Goal" },
        productInput: { name: "Product", description: "Desc" },
        selectedWorkers: workerSlugs,
        status: "FAILED",
        plan: { steps: planSteps },
      },
    });

    // Step 1: SUCCEEDED
    await prisma.agentStep.create({
      data: {
        agentRunId: run.id,
        workerSlug: workerSlugs[0],
        stepOrder: 1,
        status: "SUCCEEDED",
        reason: "Step 1",
        input: { objective: "Obj" },
        output: { summary: "Step 1 done" },
      },
    });

    // Step 2: FAILED
    const step2 = await prisma.agentStep.create({
      data: {
        agentRunId: run.id,
        workerSlug: workerSlugs[1],
        stepOrder: 2,
        status: "FAILED",
        reason: "Step 2",
        input: { objective: "Obj" },
        errorMessage: "First fail",
      },
    });

    // Configure worker 2 to fail again
    shouldFailWorkerSlug = workerSlugs[1];

    await retryStep({ userId: testUser.id, stepId: step2.id });
    const finishedRun = await waitForRun(run.id);

    assert.equal(finishedRun.status, "FAILED");
    const updatedStep2 = await prisma.agentStep.findUnique({ where: { id: step2.id } });
    assert.equal(updatedStep2.status, "FAILED");
    assert.ok(updatedStep2.errorMessage.includes("Simulated failure"));

    // Step 3 must NOT have been executed
    assert.ok(!executedSlugs.includes(workerSlugs[2]));
  });

  // 7. Retry lần 2 success -> Step 2 succeeds, Step 3 runs
  test("7. Retry lần 2 success -> Step 2 succeeds, tiếp tục Step 3", async () => {
    const workerSlugs = ["customer-persona", "competitor-research", "usp-offer"];
    const planSteps = workerSlugs.map((slug, idx) => ({
      workerSlug: slug,
      reason: `Step ${idx + 1}`,
      order: idx + 1,
      dependsOn: [],
    }));

    const run = await prisma.agentRun.create({
      data: {
        userId: testUser.id,
        goal: { objective: "Goal" },
        productInput: { name: "Product", description: "Desc" },
        selectedWorkers: workerSlugs,
        status: "FAILED",
        plan: { steps: planSteps },
      },
    });

    // Step 1: SUCCEEDED
    await prisma.agentStep.create({
      data: {
        agentRunId: run.id,
        workerSlug: workerSlugs[0],
        stepOrder: 1,
        status: "SUCCEEDED",
        reason: "Step 1",
        input: { objective: "Obj" },
        output: { summary: "Step 1 done" },
      },
    });

    // Step 2: FAILED (from previous retry failure)
    const step2 = await prisma.agentStep.create({
      data: {
        agentRunId: run.id,
        workerSlug: workerSlugs[1],
        stepOrder: 2,
        status: "FAILED",
        reason: "Step 2",
        input: { objective: "Obj" },
        errorMessage: "Failed attempt 1",
      },
    });

    // Now allow Step 2 to succeed (shouldFailWorkerSlug is null by default)
    shouldFailWorkerSlug = null;

    await retryStep({ userId: testUser.id, stepId: step2.id });
    const completedRun = await waitForRun(run.id);

    assert.equal(completedRun.status, "SUCCEEDED");
    const updatedStep2 = await prisma.agentStep.findUnique({ where: { id: step2.id } });
    assert.equal(updatedStep2.status, "SUCCEEDED");
    assert.ok(executedSlugs.includes(workerSlugs[2])); // Step 3 executed
  });

  // 8. Retry step cuối: Step 1, 2 SUCCEEDED, Step 3 FAILED -> retry 3 -> SUCCEEDED + finalOutput
  test("8. Retry step cuối -> createFinalOutput runs, run SUCCEEDED", async () => {
    const workerSlugs = ["customer-persona", "competitor-research", "usp-offer"];
    const planSteps = workerSlugs.map((slug, idx) => ({
      workerSlug: slug,
      reason: `Step ${idx + 1}`,
      order: idx + 1,
      dependsOn: [],
    }));

    const run = await prisma.agentRun.create({
      data: {
        userId: testUser.id,
        goal: { objective: "Goal" },
        productInput: { name: "Product", description: "Desc" },
        selectedWorkers: workerSlugs,
        status: "FAILED",
        plan: { steps: planSteps },
      },
    });

    // Steps 1 & 2: SUCCEEDED
    for (let i = 0; i < 2; i++) {
      await prisma.agentStep.create({
        data: {
          agentRunId: run.id,
          workerSlug: workerSlugs[i],
          stepOrder: i + 1,
          status: "SUCCEEDED",
          reason: `Step ${i + 1}`,
          input: { objective: "Obj" },
          output: { summary: `Step ${i + 1} done` },
        },
      });
    }

    // Step 3 (last step): FAILED
    const step3 = await prisma.agentStep.create({
      data: {
        agentRunId: run.id,
        workerSlug: workerSlugs[2],
        stepOrder: 3,
        status: "FAILED",
        reason: "Step 3",
        input: { objective: "Obj" },
        errorMessage: "Last step failed",
      },
    });

    await retryStep({ userId: testUser.id, stepId: step3.id });
    const completedRun = await waitForRun(run.id);

    assert.equal(completedRun.status, "SUCCEEDED");
    assert.ok(completedRun.finalOutput);
    assert.equal(completedRun.finalOutput.executiveSummary, "Combined marketing brief summary");
  });

  // 9. 9 workers (8 + 1) batch test
  test("9. 9 workers (8 + 1) batch test -> retry step 4 resumes to step 9", async () => {
    const allWorkers = workerRegistry.slice(0, 9);
    const slugs = allWorkers.map((w) => w.slug);
    const planSteps = slugs.map((slug, idx) => ({
      workerSlug: slug,
      reason: `Step ${idx + 1}`,
      order: idx + 1,
      dependsOn: [],
    }));

    const batches = [
      { batchNumber: 1, steps: planSteps.slice(0, 8) },
      { batchNumber: 2, steps: planSteps.slice(8, 9) },
    ];

    const run = await prisma.agentRun.create({
      data: {
        userId: testUser.id,
        goal: { objective: "9 workers test" },
        productInput: { name: "Product", description: "Desc" },
        selectedWorkers: slugs,
        status: "FAILED",
        plan: { steps: planSteps, batches },
      },
    });

    // Steps 1..3 SUCCEEDED
    for (let i = 0; i < 3; i++) {
      await prisma.agentStep.create({
        data: {
          agentRunId: run.id,
          workerSlug: slugs[i],
          stepOrder: i + 1,
          status: "SUCCEEDED",
          reason: `Step ${i + 1}`,
          input: { objective: "Obj" },
          output: { summary: `Output ${i + 1}` },
        },
      });
    }

    // Step 4 FAILED
    const step4 = await prisma.agentStep.create({
      data: {
        agentRunId: run.id,
        workerSlug: slugs[3],
        stepOrder: 4,
        status: "FAILED",
        reason: "Step 4",
        input: { objective: "Obj" },
        errorMessage: "Error at step 4",
      },
    });

    await retryStep({ userId: testUser.id, stepId: step4.id });
    const completedRun = await waitForRun(run.id);

    assert.equal(completedRun.status, "SUCCEEDED");
    // Steps 1..3 skipped
    assert.ok(!executedSlugs.includes(slugs[0]));
    assert.ok(!executedSlugs.includes(slugs[1]));
    assert.ok(!executedSlugs.includes(slugs[2]));
    // Steps 4..9 executed
    for (let i = 3; i < 9; i++) {
      assert.ok(executedSlugs.includes(slugs[i]), `Step ${i + 1} (${slugs[i]}) must have executed`);
    }
  });

  // 10. 17 workers (8 + 8 + 1) batch test
  test("10. 17 workers (8 + 8 + 1) batch test -> retry step 10 resumes to step 17", async () => {
    const allWorkers = workerRegistry.slice(0, 17);
    const slugs = allWorkers.map((w) => w.slug);
    const planSteps = slugs.map((slug, idx) => ({
      workerSlug: slug,
      reason: `Step ${idx + 1}`,
      order: idx + 1,
      dependsOn: [],
    }));

    const batches = [
      { batchNumber: 1, steps: planSteps.slice(0, 8) },
      { batchNumber: 2, steps: planSteps.slice(8, 16) },
      { batchNumber: 3, steps: planSteps.slice(16, 17) },
    ];

    const run = await prisma.agentRun.create({
      data: {
        userId: testUser.id,
        goal: { objective: "17 workers test" },
        productInput: { name: "Product", description: "Desc" },
        selectedWorkers: slugs,
        status: "FAILED",
        plan: { steps: planSteps, batches },
      },
    });

    // Steps 1..9 SUCCEEDED
    for (let i = 0; i < 9; i++) {
      await prisma.agentStep.create({
        data: {
          agentRunId: run.id,
          workerSlug: slugs[i],
          stepOrder: i + 1,
          status: "SUCCEEDED",
          reason: `Step ${i + 1}`,
          input: { objective: "Obj" },
          output: { summary: `Output ${i + 1}` },
        },
      });
    }

    // Step 10 FAILED
    const step10 = await prisma.agentStep.create({
      data: {
        agentRunId: run.id,
        workerSlug: slugs[9],
        stepOrder: 10,
        status: "FAILED",
        reason: "Step 10",
        input: { objective: "Obj" },
        errorMessage: "Error at step 10",
      },
    });

    await retryStep({ userId: testUser.id, stepId: step10.id });
    const completedRun = await waitForRun(run.id, 30000);

    assert.equal(completedRun.status, "SUCCEEDED");
    // Steps 1..9 skipped
    for (let i = 0; i < 9; i++) {
      assert.ok(!executedSlugs.includes(slugs[i]), `Step ${i + 1} (${slugs[i]}) must be skipped`);
    }
    // Steps 10..17 executed
    for (let i = 9; i < 17; i++) {
      assert.ok(executedSlugs.includes(slugs[i]), `Step ${i + 1} (${slugs[i]}) must have executed`);
    }
  });

  // 11. 71 workers structural test (8*8 + 7)
  test("11. 71 workers structural test (8*8 + 7 = 71) -> batch breakdown & retry preserves order", async () => {
    const allWorkers = workerRegistry.slice(0, 71);
    assert.equal(allWorkers.length, 71, "Registry must contain 71 workers");

    const slugs = allWorkers.map((w) => w.slug);
    const planSteps = slugs.map((slug, idx) => ({
      workerSlug: slug,
      reason: `Step ${idx + 1}`,
      order: idx + 1,
      dependsOn: [],
    }));

    // Verify batch structure: 8 batches of 8 (64) + 1 batch of 7 (7) = 71
    const MAX_BATCH_STEPS = 8;
    const batches = [];
    for (let i = 0; i < planSteps.length; i += MAX_BATCH_STEPS) {
      batches.push({
        batchNumber: Math.floor(i / MAX_BATCH_STEPS) + 1,
        steps: planSteps.slice(i, i + MAX_BATCH_STEPS),
      });
    }

    assert.equal(batches.length, 9);
    for (let b = 0; b < 8; b++) {
      assert.equal(batches[b].steps.length, 8, `Batch ${b + 1} must have 8 steps`);
    }
    assert.equal(batches[8].steps.length, 7, "Batch 9 must have 7 steps");

    const run = await prisma.agentRun.create({
      data: {
        userId: testUser.id,
        goal: { objective: "71 workers structural test" },
        productInput: { name: "Product", description: "Desc" },
        selectedWorkers: slugs,
        status: "FAILED",
        plan: { steps: planSteps, batches },
      },
    });

    // Populate steps 1..69 as SUCCEEDED
    for (let i = 0; i < 69; i++) {
      await prisma.agentStep.create({
        data: {
          agentRunId: run.id,
          workerSlug: slugs[i],
          stepOrder: i + 1,
          status: "SUCCEEDED",
          reason: `Step ${i + 1}`,
          input: { objective: "Obj" },
          output: { summary: `Output ${i + 1}` },
        },
      });
    }

    // Step 70 FAILED
    const step70 = await prisma.agentStep.create({
      data: {
        agentRunId: run.id,
        workerSlug: slugs[69],
        stepOrder: 70,
        status: "FAILED",
        reason: "Step 70",
        input: { objective: "Obj" },
        errorMessage: "Error at step 70",
      },
    });

    await retryStep({ userId: testUser.id, stepId: step70.id });
    const completedRun = await waitForRun(run.id, 30000);

    assert.equal(completedRun.status, "SUCCEEDED");
    // Steps 1..69 were not re-executed
    assert.equal(executedSlugs.length, 2, "Only steps 70 and 71 should have been executed");
    assert.equal(executedSlugs[0], slugs[69]);
    assert.equal(executedSlugs[1], slugs[70]);
  });
});
