const express = require("express");
const { requireAuth } = require("../middleware/auth");
const actionProposalService = require("../services/actions/actionProposalService");

const router = express.Router();

router.use(requireAuth);

/**
 * GET /api/actions/proposals
 * List action proposals for authenticated user.
 */
router.get("/proposals", async (req, res, next) => {
  try {
    const proposals = await actionProposalService.listProposals(req.user.sub, req.query);
    res.json({ success: true, data: proposals });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/actions/proposals/:id
 * Retrieve a specific action proposal by ID.
 */
router.get("/proposals/:id", async (req, res, next) => {
  try {
    const proposal = await actionProposalService.getProposal(req.user.sub, req.params.id);
    res.json({ success: true, data: proposal });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/actions/proposals/:id/approve
 * Atomically approve an action proposal (Human-in-the-loop).
 */
router.post("/proposals/:id/approve", async (req, res, next) => {
  try {
    const approved = await actionProposalService.approveProposal(
      req.user.sub,
      req.params.id,
      req.body || {}
    );
    res.json({ success: true, data: approved });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/actions/proposals/:id/reject
 * Atomically reject an action proposal (Human-in-the-loop).
 */
router.post("/proposals/:id/reject", async (req, res, next) => {
  try {
    const rejected = await actionProposalService.rejectProposal(
      req.user.sub,
      req.params.id,
      req.body || {}
    );
    res.json({ success: true, data: rejected });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/actions/proposals/:id/execute
 * Execute an approved action proposal through the controlled dispatcher.
 */
router.post("/proposals/:id/execute", async (req, res, next) => {
  try {
    const result = await actionProposalService.executeApprovedProposal(
      req.user.sub,
      req.params.id
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
