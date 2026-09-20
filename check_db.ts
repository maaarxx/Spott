import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  console.log("Checking tables in Supabase...");
  
  // Test Events
  const { data: events, error: eventsError } = await supabase.from('events').select('*').limit(1);
  if (eventsError) console.error("Error fetching events:", eventsError.message);
  else console.log("Events table looks good. Row count:", events.length);
  
  // Test Users
  const { data: users, error: usersError } = await supabase.from('users').select('*').limit(1);
  if (usersError) console.error("Error fetching users:", usersError.message);
  else console.log("Users table looks good. Row count:", users.length);
  
  // Test Organizers
  const { data: organizers, error: orgError } = await supabase.from('organizers').select('*').limit(1);
  if (orgError) console.error("Error fetching organizers:", orgError.message);
  else console.log("Organizers table looks good. Row count:", organizers.length);
  
  // Test Event Category
  const { data: ec, error: ecError } = await supabase.from('event_category').select('*').limit(1);
  if (ecError) console.error("Error fetching event_category:", ecError.message);
  else console.log("Event_category table looks good. Row count:", ec.length);

  console.log("Database connection test complete!");
}

checkTables();
