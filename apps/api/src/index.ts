import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { initializeSocketHandlers } from "./socket/handlers";
import {
  authenticateUser,
  errorHandler,
  requestLogger,
} from "./middleware/index";

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const httpServer = createServer(app);

const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

// Make io accessible to route handlers
app.set("io", io);

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(requestLogger);

// Health check (public)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Dyne API server is running",
    timestamp: new Date().toISOString(),
  });
});

// Public routes (auth doesn't require authentication yet for registration)
app.use("/api/auth", require("./routes/auth").default);

// Protected routes (require authentication)
app.use("/api/users", authenticateUser, require("./routes/users").default);
app.use(
  "/api/communities",
  authenticateUser,
  require("./routes/communities").default
);
app.use("/api/posts", authenticateUser, require("./routes/posts").default);
app.use(
  "/api/messages",
  authenticateUser,
  require("./routes/messages").default
);
app.use("/api/events", authenticateUser, require("./routes/events").default);

// Initialize Socket.io handlers
initializeSocketHandlers(io);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Endpoint not found",
  });
});

// Error handler (should be last)
app.use(errorHandler);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Dyne API server running on port ${PORT}`);
  console.log(`Socket.io ready on ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});
