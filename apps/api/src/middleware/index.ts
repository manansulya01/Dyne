import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Middleware to verify Clerk JWT token and attach user to request
 * Should be applied before protected routes
 */
export const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        status: "error",
        message: "No authorization token provided",
      });
    }

    // In production, verify token with Clerk
    // For now, extract user ID from token header (should be from Clerk)
    const userId = req.headers["x-user-id"] as string;

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Invalid authorization token",
      });
    }

    // Verify user exists in database
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(401).json({
        status: "error",
        message: "User not found",
      });
    }

    // Attach user to request
    (req as any).userId = userId;
    (req as any).user = user;

    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({
      status: "error",
      message: "Authentication failed",
    });
  }
};

/**
 * Middleware for error handling
 */
export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error("Error:", error);

  // Handle Zod validation errors
  if (error.issues) {
    return res.status(400).json({
      status: "error",
      message: "Validation error",
      errors: error.issues,
    });
  }

  // Handle Prisma errors
  if (error.code) {
    if (error.code === "P2025") {
      return res.status(404).json({
        status: "error",
        message: "Resource not found",
      });
    }
    if (error.code === "P2002") {
      return res.status(409).json({
        status: "error",
        message: "Unique constraint violation",
      });
    }
  }

  res.status(500).json({
    status: "error",
    message: error.message || "Internal server error",
  });
};

/**
 * Middleware for request logging
 */
export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[${req.method}] ${req.path} - ${res.statusCode} (${duration}ms)`
    );
  });

  next();
};
