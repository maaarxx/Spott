# Spott

Spott is a local event discovery app for finding concerts, workshops, markets, school events, and other community activities. Visitors can browse events, while attendees, organizers, and administrators have tools for saved events, RSVPs, event management, and moderation.

## Features

- Search and filter events by category, date, organizer, price, and location; browse events in list or map views.
- View event details, organizer verification, RSVP counts, and cancellation updates.
- Save events, register for events, and manage reminders and notifications.
- Create and manage event listings as an organizer; organizer verification is managed through the admin area.
- Review reports, users, and organizer verification in the admin dashboard.
- Automatically archive ended events and remove archived records after 30 days.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Home and event discovery |
| `/discover` | Event discovery view |
| `/events/[id]` | Event details |
| `/organizers` and `/organizers/[name]` | Organizer directory and profiles |
| `/login` | Sign-in and registration |
| `/my-events` | Attendee event list |
| `/notifications` | Notifications |
| `/profile` | User profile |
| `/organizer` | Organizer dashboard |
| `/organizer/create` | Create an event |
| `/organizer/rsvp` | Manage event RSVPs |
| `/admin` | Admin dashboard |

## API

| Endpoint | Methods | Purpose |
| --- | --- | --- |
| `/api/events` | `GET`, `POST` | List/filter events or create an event. GET supports `search` (or `q`), `category`, `city`, and `scope` (`public`, `organizer`, or `admin`). Creating events requires an organizer or admin; organizers must be verified. |
| `/api/events/[id]` | `GET`, `PATCH`, `DELETE` | Read, update, cancel, or delete an event. Updates require organizer or admin access and organizers may only manage their own events. |
| `/api/events/[id]/register` | `POST` | Register for an event. |
| `/api/events/[id]/save` | `POST` | Save or unsave an event. |
| `/api/events/[id]/report` | `POST` | Report an event. |
| `/api/events/[id]/confirm` | `POST` | Confirm that an event is still happening. |
| `/api/categories` | `GET` | List event categories. |
| `/api/notifications` | `GET` | Read notifications. |
| `/api/reminders` | `GET`, `POST`, `DELETE` | List, create, or remove event reminders. |
| `/api/users` | `GET`, `POST` | Read or create user records. |
| `/api/views` | `GET`, `POST` | Record and query event listing views. |
| `/api/admin/clear-data` | `POST` | Admin-only data maintenance endpoint. |

## Technology

- Next.js App Router, React, and TypeScript
- Tailwind CSS 4
- Supabase PostgreSQL and Supabase Auth integration
- Leaflet and Google Maps integrations
- React Hook Form and Zod are available for form handling and validation

## Shared API rate limits

Rate limiting for signup availability checks, RSVPs, RSVP cancellation, event reports, and event comments uses Upstash Redis so limits are shared across Vercel serverless instances. Install/configure the Upstash Redis integration, copy the values from `.env.example` to `.env.local`, and add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to the Vercel project environment for each deployment environment. Redeploy after changing Vercel environment variables.

Current limits are 30 signup checks per IP per 15 minutes; 30 RSVP submissions/cancellations per IP and 10 per account per hour; 10 reports per IP and 5 per account per hour; and 30 comments per IP and 10 per account per 10 minutes. Rejected requests return HTTP 429 and a `Retry-After` header. If the Upstash credentials are absent or the service fails, requests are allowed and a server-side warning is logged; configure the credentials before relying on these limits in production.

Sign-in and sign-up themselves call Supabase Auth directly from the browser, so these API limits do not wrap those Auth requests. Keep Supabase Auth's provider-side rate limits enabled and configure them in the Supabase project settings.

Some demo UI preferences (like themes, dismissed notifications, or draft events) are stored in browser `localStorage`. Real app data, including authenticated sessions, events, registrations, and user profiles, is stored exclusively in Supabase. Server API operations that access protected Supabase data require Supabase credentials and an authenticated role.

**Privacy & Data Retention:** High-volume analytics data (like page views and navigation clicks) are stored in the `activity_events` table for admin auditing and traffic analysis. To comply with data minimalism, IP addresses and User-Agent strings are NOT stored. A cleanup script (`docs/cleanup_activity_events.sql`) is provided to permanently delete activity data older than 90 days.

## Local Development

Requirements: Node.js and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app can serve local demo content without Supabase configuration. Supabase-backed data and protected API operations require credentials configured in the runtime environment.

### Database

For a new database, `database/schema.sql` defines the tables and includes sample data. **It drops and recreates existing application tables**, so do not run it against a database with data you need to keep. The incremental SQL files under `database/migrations/` and `supabase/migrations/` are for updating an existing schema; review and apply only the migrations your database still needs. Event archiving uses the `archive_expired_events` database function and optionally Supabase `pg_cron`.

## Scripts

```bash
npm run dev      # Start the development server
npm run build    # Create a production build
npm start        # Run the production server
npm run lint     # Run ESLint
npm test         # Run Node.js tests
```
