"use client";

import { useState } from "react";
import { cn } from "@/utils/cn";
import UserAvatar from "./ui/UserAvatar";
import { Button } from "./ui/button";

interface Community {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  memberCount: number;
  isJoined: boolean;
}

interface CommunitySidebarProps {
  communities: Community[];
  activeCommunityId?: string;
  onCommunitySelect: (communityId: string) => void;
  onCreateCommunity?: () => void;
  onJoinCommunity?: (communityId: string) => void;
}

/**
 * CommunitySidebar for navigating between communities
 * Shows joined communities and provides creation/discovery
 */
export const CommunitySidebar = ({
  communities,
  activeCommunityId,
  onCommunitySelect,
  onCreateCommunity,
  onJoinCommunity,
}: CommunitySidebarProps) => {
  const [showBrowse, setShowBrowse] = useState(false);

  const joinedCommunities = communities.filter((c) => c.isJoined);
  const discoveryCommunities = communities.filter((c) => !c.isJoined);

  return (
    <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <h2 className="text-lg font-bold text-gray-900">Dyne</h2>
        <p className="text-xs text-gray-600">Student Life OS</p>
      </div>

      {/* Create button */}
      {onCreateCommunity && (
        <div className="p-3 border-b border-gray-200">
          <Button
            onClick={onCreateCommunity}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700"
          >
            + Create Community
          </Button>
        </div>
      )}

      {/* Communities list */}
      <div className="flex-1 overflow-y-auto p-3">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-gray-600">
            Your Communities
          </h3>
          <div className="space-y-1">
            {joinedCommunities.map((community) => (
              <button
                key={community.id}
                onClick={() => onCommunitySelect(community.id)}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors flex items-center gap-2",
                  activeCommunityId === community.id
                    ? "bg-purple-100 text-purple-900"
                    : "text-gray-700 hover:bg-gray-100"
                )}
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                  {community.icon || community.name.substring(0, 1).toUpperCase()}
                </div>
                <span className="truncate">{community.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Discovery section */}
        {discoveryCommunities.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowBrowse(!showBrowse)}
              className="mb-2 text-xs font-semibold uppercase text-gray-600 hover:text-gray-900 w-full text-left"
            >
              {showBrowse ? "Hide" : "Discover"} Communities
            </button>
            {showBrowse && (
              <div className="space-y-2">
                {discoveryCommunities.map((community) => (
                  <div
                    key={community.id}
                    className="rounded-lg border border-gray-200 bg-white p-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {community.name}
                        </p>
                        <p className="text-xs text-gray-600 truncate">
                          {community.memberCount} members
                        </p>
                      </div>
                      {onJoinCommunity && (
                        <Button
                          onClick={() => onJoinCommunity(community.id)}
                          size="sm"
                          className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                          Join
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
