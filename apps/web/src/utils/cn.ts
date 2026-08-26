import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function to merge Tailwind CSS classes and clsx classNames
 * Prevents conflicting Tailwind classes from both being applied
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
