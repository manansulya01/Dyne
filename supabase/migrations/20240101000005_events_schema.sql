-- Create campus_buildings table
CREATE TABLE campus_buildings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  floor_count INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create clubs table
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  category TEXT,
  is_official BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create events table
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  location_id UUID REFERENCES campus_buildings(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  organizer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_public BOOLEAN DEFAULT TRUE,
  max_attendees INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create event_attendees table
CREATE TABLE event_attendees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'going' CHECK (status IN ('going', 'interested', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

-- Create indexes
CREATE INDEX idx_campus_buildings_name ON campus_buildings(name);
CREATE INDEX idx_clubs_category ON clubs(category);
CREATE INDEX idx_events_organizer_id ON events(organizer_id);
CREATE INDEX idx_events_start_time ON events(start_time);
CREATE INDEX idx_events_location_id ON events(location_id);
CREATE INDEX idx_event_attendees_event_id ON event_attendees(event_id);
CREATE INDEX idx_event_attendees_user_id ON event_attendees(user_id);

-- Enable RLS
ALTER TABLE campus_buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;

-- RLS Policies for campus_buildings
CREATE POLICY "Campus buildings viewable by everyone" ON campus_buildings
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage buildings" ON campus_buildings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND r.name = 'admin'
    )
  );

-- RLS Policies for clubs
CREATE POLICY "Clubs viewable by everyone" ON clubs
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage clubs" ON clubs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND r.name = 'admin'
    )
  );

-- RLS Policies for events
CREATE POLICY "Public events viewable by everyone" ON events
  FOR SELECT USING (is_public = TRUE);

CREATE POLICY "Private events viewable by attendees" ON events
  FOR SELECT USING (
    is_public = FALSE AND EXISTS (
      SELECT 1 FROM event_attendees
      WHERE event_attendees.event_id = events.id
      AND event_attendees.user_id = auth.uid()
    )
  );

CREATE POLICY "Authorized users can create events" ON events
  FOR INSERT WITH CHECK (
    auth.uid() = organizer_id AND (
      EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid() AND r.name IN ('admin', 'teacher', 'staff', 'club')
      )
    )
  );

CREATE POLICY "Organizers can update their events" ON events
  FOR UPDATE USING (auth.uid() = organizer_id);

CREATE POLICY "Organizers can delete their events" ON events
  FOR DELETE USING (auth.uid() = organizer_id);

-- RLS Policies for event_attendees
CREATE POLICY "Event attendees viewable by event participants" ON event_attendees
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_attendees.event_id
      AND (events.is_public = TRUE OR events.organizer_id = auth.uid() OR event_attendees.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can RSVP to events" ON event_attendees
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their RSVP" ON event_attendees
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can cancel RSVP" ON event_attendees
  FOR DELETE USING (auth.uid() = user_id);