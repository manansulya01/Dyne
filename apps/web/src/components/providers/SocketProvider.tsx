"use client";

import { createContext, useEffect, useState, ReactNode } from "react";
import io, { Socket } from "socket.io-client";
import { SocketContext } from "@/hooks/useSocket";

/**
 * SocketProvider component that establishes Socket.io connection
 * Provides socket instance to all child components
 */
export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socketInstance = io(
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
      {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      }
    );

    socketInstance.on("connect", () => {
      setIsConnected(true);
      console.log("Socket connected");
    });

    socketInstance.on("disconnect", () => {
      setIsConnected(false);
      console.log("Socket disconnected");
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};
