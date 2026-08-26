import express, { Router } from "express";
import * as postController from "../controllers/postController";

const router: Router = express.Router();

/**
 * GET /api/communities/:communityId/posts
 * Get posts from a community
 */
router.get("/community/:communityId", postController.getCommunityPosts);

/**
 * POST /api/posts
 * Create new post/discussion thread
 */
router.post("/", postController.createPost);

/**
 * GET /api/posts/:postId
 * Get post by ID with all comments
 */
router.get("/:postId", postController.getPost);

/**
 * POST /api/posts/:postId/comments
 * Create comment on post
 */
router.post("/:postId/comments", postController.createComment);

/**
 * POST /api/posts/:postId/vote
 * Vote on post (upvote/downvote)
 */
router.post("/:postId/vote", postController.voteOnPost);

/**
 * POST /api/posts/comments/:commentId/vote
 * Vote on comment
 */
router.post("/comments/:commentId/vote", postController.voteOnComment);

export default router;
