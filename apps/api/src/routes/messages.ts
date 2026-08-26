import express, { Router } from "express";
import * as messageController from "../controllers/messageController";

const router: Router = express.Router();

/**
 * GET /api/messages/channel/:channelId
 * Get messages for a channel with pagination
 */
router.get("/channel/:channelId", messageController.getChannelMessages);

/**
 * GET /api/messages/direct/:recipientId
 * Get direct messages with a user
 */
router.get("/direct/:recipientId", messageController.getDirectMessages);

/**
 * POST /api/messages
 * Send a message (channel or direct)
 */
router.post("/", messageController.sendMessage);

/**
 * PUT /api/messages/:messageId
 * Update message (edit content)
 */
router.put("/:messageId", messageController.updateMessage);

/**
 * DELETE /api/messages/:messageId
 * Delete message
 */
router.delete("/:messageId", messageController.deleteMessage);

/**
 * POST /api/messages/:messageId/reactions
 * Add emoji reaction to message
 */
router.post("/:messageId/reactions", messageController.addReaction);

/**
 * DELETE /api/messages/reactions/:reactionId
 * Remove reaction from message
 */
router.delete("/reactions/:reactionId", messageController.removeReaction);

export default router;
