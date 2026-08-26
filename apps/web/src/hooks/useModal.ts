import { create } from "zustand";
import { Channel, ChannelType, Server } from "@prisma/client";

export type ModalType =
  | "createCommunity"
  | "joinCommunity"
  | "customizeCommunity"
  | "invite"
  | "editCommunity"
  | "members"
  | "createChannel"
  | "leaveCommunity"
  | "deleteCommunity"
  | "deleteChannel"
  | "editChannel"
  | "messageFile"
  | "deleteMessage"
  | "incomingCall"
  | "outgoingCall"
  | "createEvent"
  | "editEvent";

interface ModalStore {
  type: ModalType | null;
  isOpen: boolean;
  data: ModalData;
  onOpen: (modal: ModalType, data?: ModalData) => void;
  onClose: () => void;
}

interface ModalData {
  server?: Server;
  channel?: Channel;
  channelType?: ChannelType;
  apiUrl?: string;
  query?: Record<string, any>;
  callData?: any;
  callee?: any;
  eventId?: string;
}

/**
 * Global modal store for managing modals across the Dyne application
 * Handles modals for community creation, settings, calls, events, etc.
 */
export const useModal = create<ModalStore>((set) => ({
  type: null,
  isOpen: false,
  data: {},
  onOpen: (type: ModalType, data = {}) =>
    set({ type, isOpen: true, data }),
  onClose: () => set({ type: null, isOpen: false }),
}));
