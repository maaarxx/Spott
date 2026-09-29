const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function seedNotifications() {
  console.log('Seeding notifications into Supabase...');

  // Fetch events from Supabase
  const { data: events } = await supabase.from('events').select('event_id, title, organizer_id, organizers(organization_name)').limit(30);
  const userId = '11111111-1111-1111-1111-111111111111';

  for (const ev of (events || [])) {
    const org = Array.isArray(ev.organizers) ? ev.organizers[0] : ev.organizers;
    const orgName = org?.organization_name || 'Spott Organizer';

    await supabase.from('notifications').insert([{
      user_id: userId,
      type: 'announcement',
      title: `New Event: "${ev.title}"`,
      message: `${orgName} published a new event: "${ev.title}". RSVP now to reserve your spot!`,
      is_read: false,
      related_event_id: ev.event_id
    }]);
  }

  console.log('Notifications seeded in Supabase successfully!');
}

seedNotifications().catch(console.error);
