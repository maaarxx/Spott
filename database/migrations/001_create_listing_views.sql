-- ==============================================================================
-- Migration: 001_create_listing_views.sql
-- Description: Creates the listing_views table for deduplicated event impressions
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.listing_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id VARCHAR(255) NOT NULL,
  visitor_id VARCHAR(255) NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index on (listing_id, visitor_id, viewed_at DESC) for fast 24-hour deduplication checks
CREATE INDEX IF NOT EXISTS idx_listing_views_dedupe 
  ON public.listing_views (listing_id, visitor_id, viewed_at DESC);

-- Index on listing_id for fast aggregation across an organizer's listings
CREATE INDEX IF NOT EXISTS idx_listing_views_listing 
  ON public.listing_views (listing_id);

-- Optional Row Level Security (RLS) policies
ALTER TABLE public.listing_views ENABLE ROW LEVEL SECURITY;

-- Allow anon and authenticated clients to insert view records
CREATE POLICY "Allow public insert to listing_views"
  ON public.listing_views FOR INSERT
  WITH CHECK (true);

-- Allow public read access to view counts
CREATE POLICY "Allow public select from listing_views"
  ON public.listing_views FOR SELECT
  USING (true);
