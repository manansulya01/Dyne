-- Create follows table
CREATE TABLE follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

-- Create indexes
CREATE INDEX idx_follows_follower_id ON follows(follower_id);
CREATE INDEX idx_follows_following_id ON follows(following_id);

-- Enable RLS
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- RLS Policies for follows
CREATE POLICY "Follows are viewable by everyone" ON follows
  FOR SELECT USING (true);

CREATE POLICY "Users can follow others" ON follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id AND follower_id != following_id);

CREATE POLICY "Users can unfollow" ON follows
  FOR DELETE USING (auth.uid() = follower_id);

-- Create communities table
CREATE TABLE communities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_private BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create community_members table
CREATE TABLE community_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'moderator', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(community_id, user_id)
);

-- Create community_posts table
CREATE TABLE community_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX idx_communities_slug ON communities(slug);
CREATE INDEX idx_communities_owner_id ON communities(owner_id);
CREATE INDEX idx_community_members_community_id ON community_members(community_id);
CREATE INDEX idx_community_members_user_id ON community_members(user_id);
CREATE INDEX idx_community_posts_community_id ON community_posts(community_id);
CREATE INDEX idx_community_posts_author_id ON community_posts(author_id);
CREATE INDEX idx_community_posts_created_at ON community_posts(created_at DESC);

-- Enable RLS
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for communities
CREATE POLICY "Public communities are viewable by everyone" ON communities
  FOR SELECT USING (is_private = FALSE);

CREATE POLICY "Private communities viewable by members" ON communities
  FOR SELECT USING (
    is_private = TRUE AND EXISTS (
      SELECT 1 FROM community_members
      WHERE community_members.community_id = communities.id
      AND community_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create communities" ON communities
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their communities" ON communities
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their communities" ON communities
  FOR DELETE USING (auth.uid() = owner_id);

-- RLS Policies for community_members
CREATE POLICY "Community members are viewable by members" ON community_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.community_id = community_members.community_id
      AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can join public communities" ON community_members
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM communities
      WHERE communities.id = community_members.community_id
      AND communities.is_private = FALSE
    )
  );

CREATE POLICY "Users can leave communities" ON community_members
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Moderators can remove members" ON community_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.community_id = community_members.community_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'moderator')
    )
    AND community_members.user_id != auth.uid()
  );

-- RLS Policies for community_posts
CREATE POLICY "Community posts viewable by members" ON community_posts
  FOR SELECT USING (
    deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM community_members
      WHERE community_members.community_id = community_posts.community_id
      AND community_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create community posts" ON community_posts
  FOR INSERT WITH CHECK (
    auth.uid() = author_id AND EXISTS (
      SELECT 1 FROM community_members
      WHERE community_members.community_id = community_posts.community_id
      AND community_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Authors can update their community posts" ON community_posts
  FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Authors and moderators can delete community posts" ON community_posts
  FOR DELETE USING (
    auth.uid() = author_id OR EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.community_id = community_posts.community_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'moderator')
    )
  );