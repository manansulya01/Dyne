import { Socket, Server as SocketServer } from "socket.io";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface SocketUser {
  userId: string;
  socketId: string;
  channelId?: string;
}

const activeUsers: Map<string, SocketUser> = new Map();

/**
 * Initialize Socket.io event handlers for real-time communication
 * Handles messaging, typing indicators, presence, and notifications
 */
export const initializeSocketHandlers = (io: SocketServer) => {
  io.on("connection", (socket: Socket) => {
    const userId = socket.handshake.auth.userId;

    if (userId) {
      activeUsers.set(socket.id, { userId, socketId: socket.id });
      console.log(`User $\{userId\} connected with socket $\{socket.id\}`);
    }

    // Typing indicator
    socket.on("typing:start", ({ channelId, userName }: any) => {
      socket.broadcast.emit("typing:indicator", {
        channelId,
        userName,
        isTyping: true,
      });
    });

    socket.on("typing:stop", ({ channelId, userName }: any) => {
      socket.broadcast.emit("typing:indicator", {
        channelId,
        userName,
        isTyping: false,
      });
    });

    // Join channel/room
    socket.on("channel:join", ({ channelId }: any) => {
      const userSocket = activeUsers.get(socket.id);
      if (userSocket) {
        userSocket.channelId = channelId;
        socket.join(`channel:$\{channelId\}`);
        
        io.to(`channel:$\{channelId\}`).emit("channel:user-joined", {
          userId: userSocket.userId,
          channelId,
        });
      }
    });

    socket.on("channel:leave", ({ channelId }: any) => {
      socket.leave(`channel:$\{channelId\}`);
      const userSocket = activeUsers.get(socket.id);
      if (userSocket) {
        io.to(`channel:$\{channelId\}`).emit("channel:user-left", {
          userId: userSocket.userId,
          channelId,
        });
      }
    });

    // Direct message notification
    socket.on("message:send-direct", async ({ recipientId, message }: any) => {
      const userSocket = activeUsers.get(socket.id);
      if (!userSocket) return;

      // Find recipient's socket
      const recipientSocket = Array.from(activeUsers.values()).find(
        (u) => u.userId === recipientId
      );

      if (recipientSocket) {
        io.to(recipientSocket.socketId).emit("message:new", {
          ...message,
          authorId: userSocket.userId,
        });
      }
    });

    // Message reaction (emoji)
    socket.on("message:reaction", ({ messageId, emoji, channelId }: any) => {
      socket.broadcast.emit("message:reaction-added", {
        messageId,
        emoji,
        channelId,
      });
    });

    // Presence tracking
    socket.on("presence:update", (status: string) => {
      const userSocket = activeUsers.get(socket.id);
      if (userSocket) {
        socket.broadcast.emit("user:presence-change", {
          userId: userSocket.userId,
          status, // online, away, offline, do-not-disturb
        });
      }
    });

    // Call events
    socket.on("call:initiate", ({ recipientId, callData }: any) => {
      const recipientSocket = Array.from(activeUsers.values()).find(
        (u) => u.userId === recipientId
      );

      if (recipientSocket) {
        io.to(recipientSocket.socketId).emit("call:incoming", {
          callData,
          callerId: Array.from(activeUsers.entries()).find(
            ([id]) => id === socket.id
          )?.[1].userId,
        });
      }
    });

    socket.on("call:accept", ({ callerId }: any) => {
      const callerSocket = Array.from(activeUsers.values()).find(
        (u) => u.userId === callerId
      );

      if (callerSocket) {
        io.to(callerSocket.socketId).emit("call:accepted");
      }
    });

    socket.on("call:reject", ({ callerId }: any) => {
      const callerSocket = Array.from(activeUsers.values()).find(
        (u) => u.userId === callerId
      );

      if (callerSocket) {
        io.to(callerSocket.socketId).emit("call:rejected");
      }
    });

    socket.on("call:end", ({ recipientId }: any) => {
      const recipientSocket = Array.from(activeUsers.values()).find(
        (u) => u.userId === recipientId
      );

      if (recipientSocket) {
        io.to(recipientSocket.socketId).emit("call:ended");
      }
    });

    // Notification events
    socket.on("notification:read", ({ notificationId }: any) => {
      socket.broadcast.emit("notification:marked-read", { notificationId });
    });

    // Disconnect
    socket.on("disconnect", () => {
      const userSocket = activeUsers.get(socket.id);
      if (userSocket) {
        console.log(`User $\{userSocket.userId\} disconnected`);
        activeUsers.delete(socket.id);
        
        socket.broadcast.emit("user:offline", {
          userId: userSocket.userId,
        });
      }
    });

    // Error handling
    socket.on("error", (error: any) => {
      console.error(`Socket error: $\{error\}`);
    });
  });
};

export { activeUsers };
