import { useCallback, useEffect, useRef } from "react";

/**
 * Hook for auto-scrolling chat to latest message
 * Handles pagination and dynamic content loading
 */
export const useChatScroll = ({
  chatRef,
  bottomRef,
  shouldLoad,
  loadMore,
  count,
}: {
  chatRef: React.RefObject<HTMLDivElement>;
  bottomRef: React.RefObject<HTMLDivElement>;
  shouldLoad: boolean;
  loadMore: () => void;
  count: number;
}) => {
  const hasInitialized = useRef(false);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [count, bottomRef]);

  // Load more when scrolling to top
  const handleScroll = useCallback(() => {
    const div = chatRef?.current;

    if (!div) return;

    const scrollTop = div.scrollTop;

    // When user scrolls near top, load more messages
    if (scrollTop === 0 && shouldLoad) {
      loadMore();
    }
  }, [chatRef, shouldLoad, loadMore]);

  useEffect(() => {
    const div = chatRef?.current;
    div?.addEventListener("scroll", handleScroll);
    return () => {
      div?.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll, chatRef]);
};
