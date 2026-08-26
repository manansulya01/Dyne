import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const httpServer = createServer(app);

const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Dyne API server is running",
    timestamp: new Date().toISOString(),
  });
});

// API Routes (to be implemented)
app.use("/api/auth", require("./routes/auth").default);
app.use("/api/users", require("./routes/users").default);
app.use("/api/communities", require("./routes/communities").default);
app.use("/api/posts", require("./routes/posts").default);
app.use("/api/messages", require("./routes/messages").default);
app.use("/api/events", require("./routes/events").default);

// Socket.io event handlers
io.on("connection", (socket) => {
  console.log("New socket connection:", socket.id);

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });

  // Message events
  socket.on("message:send", (data) => {
    io.emit("message:receive", data);
  });

  // Presence events
  socket.on("user:online", (userId) => {
    socket.broadcast.emit("user:status", { userId, status: "online" });
  });

  socket.on("user:offline", (userId) => {
    socket.broadcast.emit("user:status", { userId, status: "offline" });
  });

  // Typing indicators
  socket.on("user:typing", (data) => {
    socket.broadcast.emit("user:typing", data);
  });

  socket.on("user:stop-typing", (data) => {
    socket.broadcast.emit("user:stop-typing", data);
  });
});

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
