# Spott – Spotting your next spot!

## Description
Spott is a low-friction local event discovery platform where users can discover events such as concerts, workshops, night markets, school events, and community activities. It allows users to browse seamlessly without logging in, while providing Organizers and Admins powerful dashboards to manage and verify events.

## Features
- **Event Discovery**: Browse, search, and filter events by category with a responsive map/list toggle UI.
- **Dynamic Event Details**: Detailed pages for events displaying organizer verification status, live RSVP counts, and dynamic pricing.
- **RSVP & Saving**: Authenticated users can register for events and save them for later.
- **Organizer Dashboard**: Verified organizers can create and manage their events.
- **Admin Dashboard**: For moderating reports and verifying organizers.
- **Responsive Design**: Works perfectly across mobile, tablet, and desktop viewports.

## Technology Stack
- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (Serverless)
- **Database**: PostgreSQL hosted on Supabase (accessed via `@supabase/supabase-js`)
- **Validation**: Zod + React Hook Form

## API Documentation

### 1. Events API (GET)
**Endpoint**: `GET /api/events`
**Purpose**: Retrieve available events for the discovery feed.
**Query Parameters**: 
- `categoryId` (optional): Filter by category ID.
- `search` (optional): Filter by title substring.
**Returns**: Array of event objects populated with organizer, location, and category data.

### 2. Single Event API (GET)
**Endpoint**: `GET /api/events/[id]`
**Purpose**: Retrieve full details for a specific event.
**Returns**: Event details object including description, pricing, and live activity metrics.

### 3. Create Event API (POST)
**Endpoint**: `POST /api/events`
**Purpose**: Allows organizers to create new event listings.
**Body**: JSON containing title, description, category_id, location_id, start_datetime, price.
**Returns**: The newly created event object.

## Installation

To run this project locally:

1. Clone the repository and navigate into it.
2. Install dependencies:
```bash
npm install
```
3. Create a `.env.local` file with your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```
4. Start the development server:
```bash
npm run dev
```
5. Open [http://localhost:3000](http://localhost:3000) in your browser.
