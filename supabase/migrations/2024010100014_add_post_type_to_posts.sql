-- Add post_type to posts table
ALTER TABLE posts ADD COLUMN post_type TEXT NOT NULL DEFAULT 'post' CHECK (post_type IN ('post', 'blog', 'story', 'announcement', 'assignment', 'exam'));

-- Add index for post_type
CREATE INDEX idx_posts_post_type ON posts(post_type);