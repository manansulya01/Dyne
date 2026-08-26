import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/utils/cn";

interface UserAvatarProps {
  src?: string;
  className?: string;
  isOnline?: boolean;
  fallback?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * User avatar component with online status indicator
 * Matches Dyne color scheme and design system
 */
const UserAvatar = ({
  className,
  src,
  isOnline,
  fallback = "US",
  size = "md",
}: UserAvatarProps) => {
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };

  const indicatorSizeClasses = {
    sm: "w-2 h-2",
    md: "w-3 h-3",
    lg: "w-4 h-4",
  };

  return (
    <div className="relative">
      <Avatar className={cn("relative", sizeClasses[size], className)}>
        <AvatarImage src={src} alt="User avatar" />
        <AvatarFallback className="bg-gradient-to-br from-purple-600 to-blue-600 text-white">
          {fallback}
        </AvatarFallback>
      </Avatar>
      <span
        className={cn(
          "absolute bottom-0 right-0 rounded-full border-2 border-white",
          indicatorSizeClasses[size],
          {
            "bg-green-500": isOnline,
            "bg-gray-400": !isOnline,
          }
        )}
      />
    </div>
  );
};

export default UserAvatar;
