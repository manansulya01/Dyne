import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

// Validation schemas
const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  communityId: z.string(),
  tags: z.array(z.string()).optional(),
});

const createCommentSchema = z.object({
  content: z.string().min(1),
  postId: z.string(),
  parentCommentId: z.string().optional(),
});

const voteSchema = z.object({
  type: z.enum(["upvote", "downvote"]),
});

/**
 * Create a new post/discussion thread
 */
export const createPost = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId;
    const validatedData = createPostSchema.parse(req.body);

    const post = await prisma.post.create({
      data: {
        ...validatedData,
        authorId: userId,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
        votes: true,
      },
    });

    res.status(201).json({
      status: "success",
      data: { post },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get posts from a community with pagination
 */
export const getCommunityPosts = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { communityId } = req.params;
    const { skip = 0, take = 20, sortBy = "recent" } = req.query;

    let orderBy: any = { createdAt: "desc" };
    if (sortBy === "trending") {
      orderBy = { votes: { _count: "desc" } };
    } else if (sortBy === "mostCommented") {
      orderBy = { comments: { _count: "desc" } };
    }

    const posts = await prisma.post.findMany({
      where: {
        communityId: communityId as string,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        _count: {
          select: {
            comments: true,
            votes: true,
          },
        },
      },
      orderBy,
      skip: parseInt(skip as string),
      take: parseInt(take as string),
    });

    const total = await prisma.post.count({
      where: {
        communityId: communityId as string,
      },
    });

    res.status(200).json({
      status: "success",
      data: {
        posts,
        total,
        hasMore: total > parseInt(skip as string) + parseInt(take as string),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a specific post with all comments
 */
export const getPost = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { postId } = req.params;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
            votes: true,
            replies: {
              include: {
                author: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    avatar: true,
                  },
                },
              },
            },
          },
        },
        votes: true,
      },
    });

    if (!post) {
      return res.status(404).json({
        status: "error",
        message: "Post not found",
      });
    }

    res.status(200).json({
      status: "success",
      data: { post },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a comment on a post
 */
export const createComment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId;
    const validatedData = createCommentSchema.parse(req.body);

    const comment = await prisma.comment.create({
      data: {
        ...validatedData,
        authorId: userId,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        votes: true,
      },
    });

    // Emit socket event for real-time updates
    req.app.get("io").emit("comment:new", comment);

    res.status(201).json({
      status: "success",
      data: { comment },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Vote on a post (upvote/downvote)
 */
export const voteOnPost = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId;
    const { postId } = req.params;
    const validatedData = voteSchema.parse(req.body);

    // Check if user already voted
    const existingVote = await prisma.vote.findFirst({
      where: {
        userId,
        postId,
      },
    });

    if (existingVote && existingVote.type === validatedData.type) {
      // Remove vote if same type
      await prisma.vote.delete({
        where: { id: existingVote.id },
      });

      return res.status(200).json({
        status: "success",
        message: "Vote removed",
      });
    }

    if (existingVote) {
      // Update vote type
      const updatedVote = await prisma.vote.update({
        where: { id: existingVote.id },
        data: { type: validatedData.type },
      });

      req.app.get("io").emit("post:vote", updatedVote);

      return res.status(200).json({
        status: "success",
        data: { vote: updatedVote },
      });
    }

    // Create new vote
    const vote = await prisma.vote.create({
      data: {
        type: validatedData.type,
        userId,
        postId,
      },
    });

    req.app.get("io").emit("post:vote", vote);

    res.status(201).json({
      status: "success",
      data: { vote },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Vote on a comment
 */
export const voteOnComment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId;
    const { commentId } = req.params;
    const validatedData = voteSchema.parse(req.body);

    // Check if user already voted
    const existingVote = await prisma.vote.findFirst({
      where: {
        userId,
        commentId,
      },
    });

    if (existingVote && existingVote.type === validatedData.type) {
      // Remove vote
      await prisma.vote.delete({
        where: { id: existingVote.id },
      });

      return res.status(200).json({
        status: "success",
        message: "Vote removed",
      });
    }

    if (existingVote) {
      // Update vote
      const updatedVote = await prisma.vote.update({
        where: { id: existingVote.id },
        data: { type: validatedData.type },
      });

      req.app.get("io").emit("comment:vote", updatedVote);

      return res.status(200).json({
        status: "success",
        data: { vote: updatedVote },
      });
    }

    // Create new vote
    const vote = await prisma.vote.create({
      data: {
        type: validatedData.type,
        userId,
        commentId,
      },
    });

    req.app.get("io").emit("comment:vote", vote);

    res.status(201).json({
      status: "success",
      data: { vote },
    });
  } catch (error) {
    next(error);
  }
};
