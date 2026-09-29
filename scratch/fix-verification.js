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

async function fixVerification() {
  console.log('Fixing verification statuses in Supabase...');

  // Set the 3 organizers to 'pending'
  const unverifiedOrgs = ['Hobbyist Haven PH', 'Tech Manila Hub', 'Vanguard Gaming League'];
  for (const name of unverifiedOrgs) {
    const { data, error } = await supabase
      .from('organizers')
      .update({ verification_status: 'pending' })
      .eq('organization_name', name)
      .select();
    console.log(`Updated ${name}:`, data, error);
  }

  // Ensure Metro Creative Group is 'verified'
  await supabase
    .from('organizers')
    .update({ verification_status: 'verified' })
    .ilike('organization_name', '%Metro Creative%');

  console.log('Verification status update complete!');
}

fixVerification().catch(console.error);
