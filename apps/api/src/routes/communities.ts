import express, { Router } from "express";
import * as communityController from "../controllers/communityController";

const router: Router = express.Router();

/**
 * GET /api/communities
 * Get all communities for authenticated user
 */
router.get("/", communityController.getCommunities);

/**
 * POST /api/communities
 * Create new community
 */
router.post("/", communityController.createCommunity);

/**
 * GET /api/communities/:communityId
 * Get community by ID
 */
router.get("/:communityId", communityController.getCommunity);

/**
 * PUT /api/communities/:communityId
 * Update community
 */
router.put("/:communityId", communityController.updateCommunity);

/**
 * DELETE /api/communities/:communityId
 * Delete community
 */
router.delete("/:communityId", communityController.deleteCommunity);

/**
 * POST /api/communities/:communityId/members
 * Add member to community
 */
router.post("/:communityId/members", communityController.addMember);

/**
 * DELETE /api/communities/:communityId/members
 * Remove member from community
 */
router.delete("/:communityId/members", communityController.removeMember);

export default router;
