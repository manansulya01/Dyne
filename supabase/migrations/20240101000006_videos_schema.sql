-- Create videos table
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  duration INT,
  view_count INT DEFAULT 0,
  category TEXT,
  is_processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create video_views table
CREATE TABLE video_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  watched_duration INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_videos_creator_id ON videos(creator_id);
CREATE INDEX idx_videos_category ON videos(category);
CREATE INDEX idx_videos_created_at ON videos(created_at DESC);
CREATE INDEX idx_videos_view_count ON videos(view_count DESC);
CREATE INDEX idx_video_views_video_id ON video_views(video_id);
CREATE INDEX idx_video_views_user_id ON video_views(user_id);

-- Enable RLS
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_views ENABLE ROW LEVEL SECURITY;

-- RLS Policies for videos
CREATE POLICY "Videos viewable by everyone" ON videos
  FOR SELECT USING (is_processed = TRUE);

CREATE POLICY "Creators can view their own videos" ON videos
  FOR SELECT USING (auth.uid() = creator_id);

CREATE POLICY "Users can upload videos" ON videos
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Creators can update their videos" ON videos
  FOR UPDATE USING (auth.uid() = creator_id);

CREATE POLICY "Creators and admins can delete videos" ON videos
  FOR DELETE USING (
    auth.uid() = creator_id OR EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND r.name = 'admin'
    )
  );

-- RLS Policies for video_views
CREATE POLICY "Video views viewable by creator" ON video_views
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM videos
      WHERE videos.id = video_views.video_id
      AND videos.creator_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can record a view" ON video_views
  FOR INSERT WITH CHECK (true);