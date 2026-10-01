-- Fresh-database reference schema only. For an existing Supabase project,
-- use additive files in supabase/migrations/; never apply this file to an
-- existing database because its CREATE TABLE statements assume a clean DB.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. users
CREATE TABLE public.users (
  user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  first_name VARCHAR(100),
  middle_initial VARCHAR(10),
  last_name VARCHAR(150),
  display_name VARCHAR(120),
  phone VARCHAR(30),
  address TEXT,
  bio VARCHAR(300),
  email VARCHAR(150) UNIQUE NOT NULL,
  auth_provider VARCHAR(30) NOT NULL DEFAULT 'local',
  role VARCHAR(20) DEFAULT 'user',
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- 2. organizers
CREATE TABLE public.organizers (
  organizer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  organization_name VARCHAR(150) NOT NULL,
  description TEXT,
  verification_status VARCHAR(20) DEFAULT 'unverified',
  expedite_note TEXT,
  expedited_at TIMESTAMP WITH TIME ZONE,
  decided_at TIMESTAMP WITH TIME ZONE,
  decision_reason TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  avatar_url TEXT,
  address TEXT,
  public_email VARCHAR(254),
  website TEXT,
  category VARCHAR(100)
);

CREATE TABLE public.organizer_verification_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizer_id UUID NOT NULL REFERENCES public.organizers(organizer_id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  file_path TEXT NOT NULL UNIQUE,
  file_name VARCHAR(255) NOT NULL,
  document_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  content_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  archived_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX organizer_verification_documents_org_idx
  ON public.organizer_verification_documents (organizer_id, uploaded_at DESC)
  WHERE archived_at IS NULL;

-- 3. locations
CREATE TABLE public.locations (
  location_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_name VARCHAR(150),
  address TEXT NOT NULL,
  city VARCHAR(100),
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6)
);

-- 4. categories
CREATE TABLE public.categories (
  category_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT
);

-- 5. events
CREATE TABLE public.events (
  event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizer_id UUID NOT NULL REFERENCES public.organizers(organizer_id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(location_id),
  title VARCHAR(150) NOT NULL,
  description TEXT,
  start_datetime TIMESTAMP NOT NULL,
  end_datetime TIMESTAMP,
  price DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  capacity INTEGER DEFAULT NULL,
  require_approval BOOLEAN DEFAULT FALSE,
  is_still_happening_confirmed_at TIMESTAMP,
  cancelled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  cancel_reason TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- 6. event_category (junction)
CREATE TABLE public.event_category (
  event_id UUID REFERENCES public.events(event_id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(category_id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, category_id)
);

-- 7. registrations
CREATE TABLE public.registrations (
  registration_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
  registration_date TIMESTAMP DEFAULT now(),
  status VARCHAR(20) DEFAULT 'registered',
  checked_in_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, event_id)
);

-- 8. saved_events
CREATE TABLE public.saved_events (
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
  saved_at TIMESTAMP DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

-- 9. user_interests (junction)
CREATE TABLE public.user_interests (
  user_id UUID REFERENCES public.users(user_id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(category_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, category_id)
);

-- 10. reports
CREATE TABLE public.reports (
  report_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  reason TEXT,
  details TEXT,
  status VARCHAR(20) DEFAULT 'open',
  created_at TIMESTAMP DEFAULT now(),
  resolution_note TEXT,
  decided_at TIMESTAMP WITH TIME ZONE
);

-- 11. notifications
CREATE TABLE public.notifications (
  notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL DEFAULT 'update',
  title VARCHAR(255) NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  related_event_id UUID REFERENCES public.events(event_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- 12. listing_views (deduplicated impressions)
CREATE TABLE public.listing_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id VARCHAR(255) NOT NULL,
  visitor_id VARCHAR(255) NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_listing_views_lookup ON public.listing_views (listing_id, visitor_id, viewed_at DESC);
CREATE INDEX idx_listing_views_listing ON public.listing_views (listing_id);

-- 13. event_reminders
CREATE TABLE public.event_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(255) NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  event_title TEXT,
  remind_at TIMESTAMP WITH TIME ZONE NOT NULL,
  offset_label VARCHAR(50) NOT NULL,
  offset_minutes INTEGER NOT NULL DEFAULT 0,
  sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT unq_user_event_reminder UNIQUE (user_id, event_id, offset_label)
);

CREATE INDEX idx_event_reminders_pending ON public.event_reminders (sent, remind_at);
CREATE INDEX idx_event_reminders_user_event ON public.event_reminders (user_id, event_id);

CREATE TABLE public.moderation_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  capacity_threshold INTEGER NOT NULL DEFAULT 200 CHECK (capacity_threshold >= 10),
  sensitivity VARCHAR(20) NOT NULL DEFAULT 'Strict' CHECK (sensitivity IN ('Strict', 'Standard')),
  auto_flag_large_events BOOLEAN NOT NULL DEFAULT true,
  legacy_imported BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

INSERT INTO public.moderation_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.moderation_keywords (
  keyword VARCHAR(100) PRIMARY KEY,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

INSERT INTO public.moderation_keywords (keyword) VALUES
  ('unofficial party'), ('off-campus alcohol'), ('unauthorized vendor'),
  ('scalping'), ('pyrotechnics'), ('hazing')
ON CONFLICT (keyword) DO NOTHING;

ALTER TABLE public.moderation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_keywords ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.moderation_settings, public.moderation_keywords FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.moderation_settings, public.moderation_keywords TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-avatars', 'profile-avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;



-- ============================================================
-- SEED DATA
-- ============================================================

-- Users
INSERT INTO public.users (user_id, name, email, role) VALUES
('11111111-1111-1111-1111-111111111111', 'John Doe', 'john.doe@example.com', 'user'),
('22222222-2222-2222-2222-222222222222', 'Metro Creative Group', 'org@example.com', 'organizer'),
('33333333-3333-3333-3333-333333333333', 'Admin User', 'admin@spott.com', 'admin'),
('44444444-0000-0000-0000-000000000001', 'City Arts Society', 'arts@example.com', 'organizer'),
('44444444-0000-0000-0000-000000000002', 'PH Sports League', 'sports@example.com', 'organizer'),
('44444444-0000-0000-0000-000000000003', 'Indie Festivals PH', 'indie@example.com', 'organizer'),
('44444444-0000-0000-0000-000000000004', 'Pop & Indie Festivals', 'pop@example.com', 'organizer');

-- Organizers
INSERT INTO public.organizers (organizer_id, user_id, organization_name, description, verification_status) VALUES
('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'Metro Creative Group', 'Premier event organizer in Metro Manila.', 'verified'),
('55555555-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', 'City Arts Society', 'Community arts and culture collective.', 'verified'),
('55555555-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'PH Sports League', 'Amateur sports and community fitness.', 'verified'),
('55555555-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000003', 'Indie Festivals PH', 'Independent music and arts festivals.', 'unverified'),
('55555555-0000-0000-0000-000000000004', '44444444-0000-0000-0000-000000000004', 'Pop & Indie Festivals', 'Pop culture and indie music events.', 'verified');

-- Locations (with lat/lng for Google Maps)
INSERT INTO public.locations (location_id, venue_name, address, city, latitude, longitude) VALUES
('55555555-5555-5555-5555-555555555555', 'Rizal Park', 'Rizal Park, Ermita', 'Manila', 14.5831, 120.9794),
('66666666-6666-6666-6666-666666666666', 'UP Diliman Sunken Garden', 'UP Diliman, Quezon City', 'Quezon City', 14.6538, 121.0685),
('77777777-0000-0000-0000-000000000001', 'Route 196', 'Katipunan Ave, Quezon City', 'Katipunan', 14.6312, 121.0745),
('77777777-0000-0000-0000-000000000002', 'Quezon Memorial Circle', 'Elliptical Road, Quezon City', 'Quezon City', 14.6517, 121.0490),
('77777777-0000-0000-0000-000000000003', 'SM City North EDSA', 'North Avenue, Quezon City', 'Quezon City', 14.6567, 121.0302),
('77777777-0000-0000-0000-000000000004', 'BGC Activity Center', '5th Ave, Taguig', 'Taguig', 14.5515, 121.0497),
('77777777-0000-0000-0000-000000000005', 'Makati Circuit', 'Circuit Lane, Makati', 'Makati', 14.5533, 121.0195),
('77777777-0000-0000-0000-000000000006', 'Intramuros Plaza', 'General Luna St, Intramuros', 'Manila', 14.5896, 120.9750);

-- Categories
INSERT INTO public.categories (category_id, category_name, description) VALUES
('88888888-0000-0000-0000-000000000001', 'Music', 'Concerts and live performances'),
('88888888-0000-0000-0000-000000000002', 'Sports', 'Sports and fitness events'),
('88888888-0000-0000-0000-000000000003', 'Food', 'Food fairs and markets'),
('88888888-0000-0000-0000-000000000004', 'Art', 'Art exhibits and galleries'),
('88888888-0000-0000-0000-000000000005', 'Tech', 'Tech meetups and conferences'),
('88888888-0000-0000-0000-000000000006', 'Comedy', 'Comedy shows and standup'),
('88888888-0000-0000-0000-000000000007', 'Outdoor', 'Outdoor and nature events'),
('88888888-0000-0000-0000-000000000008', 'Networking', 'Professional networking events'),
('77777777-7777-7777-7777-777777777777', 'Night Markets', 'Night food and goods markets'),
('88888888-8888-8888-8888-888888888888', 'School Events', 'University and school events'),
('99999999-9999-9999-9999-999999999999', 'Concerts', 'Major concerts and gigs'),
('00000000-0000-0000-0000-000000000000', 'Workshops', 'Learning and skill-building'),
('88888888-0000-0000-0000-000000000009', 'Community', 'Community meetups and gatherings'),
('88888888-0000-0000-0000-000000000010', 'Food & Drink', 'Food festivals and tastings');

-- Events (with varied dates, prices, and locations)
INSERT INTO public.events (event_id, organizer_id, location_id, title, description, start_datetime, end_datetime, price, status, is_still_happening_confirmed_at) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555',
 'Rizal Park Night Market & Food Bazaar',
 'Experience the best of Filipino street food and artisan goods at the iconic Rizal Park. Over 50 vendors, live acoustic music, and family-friendly activities.',
 '2026-09-14 17:00:00', '2026-09-14 23:00:00', 0, 'active', now()),

('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', '66666666-6666-6666-6666-666666666666',
 'UP College Fair 2026: Dawn',
 'Annual university fair featuring student organizations, academic booths, cultural performances, and campus tours. Open to all prospective students.',
 '2026-09-20 08:00:00', '2026-09-20 17:00:00', 0, 'active', now()),

('cccccccc-cccc-cccc-cccc-cccccccccccc', '55555555-0000-0000-0000-000000000003', '77777777-0000-0000-0000-000000000001',
 'Indie Folk Sessions: Escolta',
 'An intimate evening of indie folk music featuring up-and-coming Filipino artists. Limited seating for an exclusive acoustic experience.',
 '2026-09-15 19:00:00', '2026-09-15 22:30:00', 200, 'active', null),

('dddddddd-dddd-dddd-dddd-dddddddddddd', '55555555-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000004',
 'UI/UX Design Workshop',
 'Hands-on workshop covering modern UI/UX principles, Figma prototyping, and user research methods. Perfect for beginners and intermediate designers.',
 '2026-09-17 13:00:00', '2026-09-17 17:00:00', 500, 'active', null),

('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '55555555-0000-0000-0000-000000000002', '77777777-0000-0000-0000-000000000002',
 'Barangay Sports Fest',
 'Community sports day featuring basketball, volleyball, fun runs, and family relay races. Free entry, open to all ages. Medals and prizes for winners.',
 '2026-09-21 06:00:00', '2026-09-21 18:00:00', 0, 'active', now()),

('ffffffff-ffff-ffff-ffff-ffffffffffff', '44444444-4444-4444-4444-444444444444', '77777777-0000-0000-0000-000000000005',
 'Street Food Bazaar',
 'Weekend food crawl featuring the best street food vendors from across Metro Manila. From sisig to halo-halo, discover your new favorite flavors.',
 '2026-09-19 16:00:00', '2026-09-19 22:00:00', 0, 'active', null),

('11111111-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000004', '77777777-0000-0000-0000-000000000003',
 'Lakeside Farmers Market',
 'Fresh produce, organic goods, artisan crafts, and farm-to-table delights. Support local farmers and sustainable agriculture.',
 '2026-10-04 08:00:00', '2026-10-04 14:00:00', 0, 'active', now()),

('11111111-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000004', '77777777-0000-0000-0000-000000000001',
 'Riverside Open Mic Night',
 'Bring your guitar, your poems, or just your ears. Open mic night for musicians, poets, and storytellers. Sign up on the night.',
 '2026-10-07 19:00:00', '2026-10-07 23:00:00', 15, 'active', null),

('11111111-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000006',
 'Urban Sketching Fundamentals',
 'Learn the basics of urban sketching with professional artists. All materials provided. Suitable for complete beginners.',
 '2026-10-20 10:00:00', '2026-10-20 14:00:00', 0, 'active', null);

-- Event-Category links
INSERT INTO public.event_category (event_id, category_id) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '77777777-7777-7777-7777-777777777777'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '88888888-0000-0000-0000-000000000003'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '88888888-8888-8888-8888-888888888888'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', '99999999-9999-9999-9999-999999999999'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', '88888888-0000-0000-0000-000000000001'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-000000000000'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', '88888888-0000-0000-0000-000000000005'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '88888888-0000-0000-0000-000000000002'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '88888888-0000-0000-0000-000000000009'),
('ffffffff-ffff-ffff-ffff-ffffffffffff', '88888888-0000-0000-0000-000000000010'),
('11111111-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000003'),
('11111111-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000007'),
('11111111-0000-0000-0000-000000000002', '88888888-0000-0000-0000-000000000001'),
('11111111-0000-0000-0000-000000000002', '99999999-9999-9999-9999-999999999999'),
('11111111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000'),
('11111111-0000-0000-0000-000000000003', '88888888-0000-0000-0000-000000000004');

-- Registrations
INSERT INTO public.registrations (user_id, event_id) VALUES
('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Saved Events
INSERT INTO public.saved_events (user_id, event_id) VALUES
('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Notifications
INSERT INTO public.notifications (user_id, type, title, message, is_read, related_event_id) VALUES
('11111111-1111-1111-1111-111111111111', 'update', 'Your event Jazz Night has been updated', 'The organizer changed the venue for Jazz Night. Check the new details.', false, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
('11111111-1111-1111-1111-111111111111', 'reminder', 'Reminder: Yoga in the Park starts in 1 hour', 'Don''t forget your mat! Yoga in the Park begins at 6:00 AM.', false, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
('11111111-1111-1111-1111-111111111111', 'cancellation', 'Art Walk has been cancelled', 'Unfortunately, the Art Walk event has been cancelled due to weather conditions.', true, null),
('11111111-1111-1111-1111-111111111111', 'update', 'New attendee registered for Metro Tech Summit', '4 new attendees registered for your event.', true, 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
('11111111-1111-1111-1111-111111111111', 'announcement', 'Weekly update from Spott team: System maintenance scheduled', 'We will perform scheduled maintenance on Oct 1, 2026 from 2-4 AM.', true, null);
