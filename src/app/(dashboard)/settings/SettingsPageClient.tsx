"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/browser";

interface SettingsProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  class_grade: string | null;
  house: string | null;
  interests: string[];
}

export function SettingsPageClient({ profile, email }: {
  profile: SettingsProfile | null;
  email: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [classGrade, setClassGrade] = useState(profile?.class_grade ?? "");
  const [house, setHouse] = useState(profile?.house ?? "");
  const [interests, setInterests] = useState((profile?.interests ?? []).join(", "));
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim() || undefined,
          bio: bio.trim() || undefined,
          classGrade: classGrade.trim() || undefined,
          house: house.trim() || undefined,
          interests: interests.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to save profile");
        return;
      }
      setMessage("Profile saved");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    setIsUploadingAvatar(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bucket", "avatars");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Avatar upload failed");
      setAvatarUrl(data.media.url as string);
      // Persist avatar URL via dedicated endpoint.
      const save = await fetch("/api/profile/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: data.media.url }),
      });
      if (!save.ok) throw new Error("Could not save avatar");
      setMessage("Avatar updated");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Avatar upload failed");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    setIsUpdatingPassword(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordError(error.message);
        return;
      }
      setPasswordMessage("Password updated");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardContent className="pt-4">
          <form onSubmit={saveProfile} className="space-y-4">
            <h2 className="font-semibold">Profile</h2>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={avatarUrl || ""} alt="Your avatar" />
                <AvatarFallback name={displayName || profile?.username} />
              </Avatar>
              <div>
                <label htmlFor="avatar-file" className="text-sm font-medium">Avatar</label>
                <input
                  id="avatar-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="block text-sm mt-1 min-h-[44px]"
                  disabled={isUploadingAvatar}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadAvatar(f);
                  }}
                />
                {isUploadingAvatar && <p className="text-xs text-muted-foreground">Uploading…</p>}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Signed in as {email} · @{profile?.username}</p>
            <div>
              <label htmlFor="display-name" className="text-sm font-medium">Display name</label>
              <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} className="min-h-[44px]" />
            </div>
            <div>
              <label htmlFor="bio" className="text-sm font-medium">Bio</label>
              <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={3} placeholder="Tell campus about yourself…" />
              <p className="text-xs text-muted-foreground">{bio.length}/500</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="class-grade" className="text-sm font-medium">Class / Grade</label>
                <Input id="class-grade" value={classGrade} onChange={(e) => setClassGrade(e.target.value)} maxLength={50} className="min-h-[44px]" />
              </div>
              <div>
                <label htmlFor="house" className="text-sm font-medium">House</label>
                <Input id="house" value={house} onChange={(e) => setHouse(e.target.value)} maxLength={50} className="min-h-[44px]" />
              </div>
            </div>
            <div>
              <label htmlFor="interests" className="text-sm font-medium">Interests (comma-separated, max 10)</label>
              <Input id="interests" value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="football, robotics, music" className="min-h-[44px]" />
            </div>
            {message && <p role="status" className="text-sm text-green-600">{message}</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={isSaving} className="min-h-[44px]">
              {isSaving ? "Saving…" : "Save profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <form onSubmit={updatePassword} className="space-y-3">
            <h2 className="font-semibold">Password</h2>
            <div>
              <label htmlFor="new-password" className="text-sm font-medium">New password</label>
              <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" className="min-h-[44px]" />
            </div>
            <div>
              <label htmlFor="confirm-password" className="text-sm font-medium">Confirm new password</label>
              <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" className="min-h-[44px]" />
            </div>
            {passwordMessage && <p role="status" className="text-sm text-green-600">{passwordMessage}</p>}
            {passwordError && <p role="alert" className="text-sm text-destructive">{passwordError}</p>}
            <Button type="submit" variant="outline" disabled={isUpdatingPassword} className="min-h-[44px]">
              {isUpdatingPassword ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-2">
          <h2 className="font-semibold">About Dyne</h2>
          <p className="text-sm text-muted-foreground">
            Dyne is the private campus social network for Macro Vision Academy — your campus, your community, your network.
            Video uploads play back directly with no external transcoding.
          </p>
          <Button variant="outline" asChild className="min-h-[44px]">
            <a href="/api/auth/logout" onClick={(e) => e.preventDefault()}>Use the avatar menu to log out</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
