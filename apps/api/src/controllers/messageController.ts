import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

// Validation schemas
const sendMessageSchema = z.object({
  content: z.string().min(1).optional(),
  mediaUrl: z.string().optional(),
  mediaType: z.enum(["image", "video", "audio", "file"]).optional(),
  channelId: z.string().optional(),
  recipientId: z.string().optional(),
});

const updateMessageSchema = z.object({
  content: z.string().min(1),
});

/**
 * Send a message to a channel or direct message
 */
export const sendMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId;
    const validatedData = sendMessageSchema.parse(req.body);
    const { channelId, recipientId, content, mediaUrl, mediaType } =
      validatedData;

    if (!channelId && !recipientId) {
      return res.status(400).json({
        status: "error",
        message: "Either channelId or recipientId is required",
      });
    }

    if (!content && !mediaUrl) {
      return res.status(400).json({
        status: "error",
        message: "Message must have content or media",
      });
    }

    const message = await prisma.message.create({
      data: {
        content: content || undefined,
        mediaUrl: mediaUrl || undefined,
        mediaType: (mediaType as any) || undefined,
        authorId: userId,
        channelId: channelId || undefined,
        recipientId: recipientId || undefined,
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
        reactions: true,
      },
    });

    // Emit socket event for real-time updates
    req.app.get("io").emit("message:new", message);

    res.status(201).json({
      status: "success",
      data: { message },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get messages for a channel with pagination
 */
export const getChannelMessages = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { channelId } = req.params;
    const { skip = 0, take = 50 } = req.query;

    const messages = await prisma.message.findMany({
      where: {
        channelId: channelId as string,
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
        reactions: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: parseInt(skip as string),
      take: parseInt(take as string),
    });

    const total = await prisma.message.count({
      where: {
        channelId: channelId as string,
      },
    });

    res.status(200).json({
      status: "success",
      data: { messages, total, hasMore: total > parseInt(skip as string) + parseInt(take as string) },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get direct messages with another user
 */
export const getDirectMessages = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId;
    const { recipientId } = req.params;
    const { skip = 0, take = 50 } = req.query;

    const messages = await prisma.message.findMany({
      where: {
        AND: [
          {
            OR: [
              {
                authorId: userId,
                recipientId: recipientId as string,
              },
              {
                authorId: recipientId as string,
                recipientId: userId,
              },
            ],
          },
          {
            channelId: null,
          },
        ],
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
        reactions: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: parseInt(skip as string),
      take: parseInt(take as string),
    });

    const total = await prisma.message.count({
      where: {
        AND: [
          {
            OR: [
              {
                authorId: userId,
                recipientId: recipientId as string,
              },
              {
                authorId: recipientId as string,
                recipientId: userId,
              },
            ],
          },
          {
            channelId: null,
          },
        ],
      },
    });

    res.status(200).json({
      status: "success",
      data: {
        messages,
        total,
        hasMore: total > parseInt(skip as string) + parseInt(take as string),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a message (only content for now)
 */
export const updateMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId;
    const { messageId } = req.params;
    const validatedData = updateMessageSchema.parse(req.body);

    // Check if user is message author
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.authorId !== userId) {
      return res.status(403).json({
        status: "error",
        message: "Not authorized to edit this message",
      });
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: validatedData,
      include: {
        author: true,
        reactions: true,
      },
    });

    // Emit socket event
    req.app.get("io").emit("message:update", updated);

    res.status(200).json({
      status: "success",
      data: { message: updated },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a message
 */
export const deleteMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId;
    const { messageId } = req.params;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.authorId !== userId) {
      return res.status(403).json({
        status: "error",
        message: "Not authorized to delete this message",
      });
    }

    await prisma.message.delete({
      where: { id: messageId },
    });

    // Emit socket event
    req.app.get("io").emit("message:delete", messageId);

    res.status(200).json({
      status: "success",
      message: "Message deleted",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add reaction to a message
 */
export const addReaction = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId;
    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({
        status: "error",
        message: "Emoji is required",
      });
    }

    const reaction = await prisma.reaction.create({
      data: {
        emoji,
        userId,
        messageId,
      },
    });

    // Emit socket event
    req.app.get("io").emit("message:reaction", reaction);

    res.status(201).json({
      status: "success",
      data: { reaction },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove reaction from a message
 */
export const removeReaction = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId;
    const { reactionId } = req.params;

    const reaction = await prisma.reaction.findUnique({
      where: { id: reactionId },
    });

    if (!reaction || reaction.userId !== userId) {
      return res.status(403).json({
        status: "error",
        message: "Not authorized to remove this reaction",
      });
    }

    await prisma.reaction.delete({
      where: { id: reactionId },
    });

    // Emit socket event
    req.app.get("io").emit("message:reaction-remove", reactionId);

    res.status(200).json({
      status: "success",
      message: "Reaction removed",
    });
  } catch (error) {
    next(error);
  }
};
