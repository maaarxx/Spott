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

Some demo account and app state flows are stored in browser `localStorage`. Server API operations that access protected Supabase data require Supabase credentials and an authenticated role.

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
