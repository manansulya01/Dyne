import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

// Validation schemas
const createCommunitySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().optional(),
  isPublic: z.boolean().default(true),
});

const updateCommunitySchema = createCommunitySchema.partial();

/**
 * Get all communities for the authenticated user
 */
export const getCommunities = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId;

    const communities = await prisma.community.findMany({
      where: {
        members: {
          some: {
            id: userId,
          },
        },
      },
      include: {
        channels: true,
        members: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    res.status(200).json({
      status: "success",
      data: { communities },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a specific community by ID
 */
export const getCommunity = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { communityId } = req.params;

    const community = await prisma.community.findUnique({
      where: { id: communityId },
      include: {
        channels: {
          include: {
            messages: {
              take: 10,
              orderBy: { createdAt: "desc" },
            },
          },
        },
        members: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    if (!community) {
      return res.status(404).json({
        status: "error",
        message: "Community not found",
      });
    }

    res.status(200).json({
      status: "success",
      data: { community },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new community
 */
export const createCommunity = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId;
    const validatedData = createCommunitySchema.parse(req.body);

    const community = await prisma.community.create({
      data: {
        ...validatedData,
        ownerId: userId,
        members: {
          connect: {
            id: userId,
          },
        },
      },
      include: {
        members: true,
      },
    });

    res.status(201).json({
      status: "success",
      data: { community },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update community settings
 */
export const updateCommunity = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { communityId } = req.params;
    const userId = (req as any).userId;
    const validatedData = updateCommunitySchema.parse(req.body);

    // Check if user is owner
    const community = await prisma.community.findUnique({
      where: { id: communityId },
    });

    if (!community || community.ownerId !== userId) {
      return res.status(403).json({
        status: "error",
        message: "Not authorized to update this community",
      });
    }

    const updated = await prisma.community.update({
      where: { id: communityId },
      data: validatedData,
      include: {
        members: true,
      },
    });

    res.status(200).json({
      status: "success",
      data: { community: updated },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a community
 */
export const deleteCommunity = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { communityId } = req.params;
    const userId = (req as any).userId;

    const community = await prisma.community.findUnique({
      where: { id: communityId },
    });

    if (!community || community.ownerId !== userId) {
      return res.status(403).json({
        status: "error",
        message: "Not authorized to delete this community",
      });
    }

    await prisma.community.delete({
      where: { id: communityId },
    });

    res.status(200).json({
      status: "success",
      message: "Community deleted",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add member to community
 */
export const addMember = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { communityId } = req.params;
    const { memberId } = req.body;

    const community = await prisma.community.update({
      where: { id: communityId },
      data: {
        members: {
          connect: {
            id: memberId,
          },
        },
      },
      include: {
        members: true,
      },
    });

    res.status(200).json({
      status: "success",
      data: { community },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove member from community
 */
export const removeMember = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { communityId } = req.params;
    const { memberId } = req.body;

    const community = await prisma.community.update({
      where: { id: communityId },
      data: {
        members: {
          disconnect: {
            id: memberId,
          },
        },
      },
      include: {
        members: true,
      },
    });

    res.status(200).json({
      status: "success",
      data: { community },
    });
  } catch (error) {
    next(error);
  }
};
