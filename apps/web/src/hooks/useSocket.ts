import { createContext, useContext } from "react";
import { Socket } from "socket.io-client";

/**
 * Socket context for providing Socket.io instance to React tree
 * Used in SocketProvider to share real-time connection across components
 */
export const SocketContext = createContext<{
  socket: Socket | null;
  isConnected: boolean;
} | null>(null);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within SocketProvider");
  }
  return context;
};
