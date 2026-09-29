const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log('--- Starting Database Seeding ---');

  // 1. Categories
  const categoriesToAdd = [
    { category_id: '88888888-0000-0000-0000-000000000011', category_name: 'Gaming', description: 'Esports, competitive LAN, and console gaming' },
    { category_id: '88888888-0000-0000-0000-000000000012', category_name: 'Hobbies & Collectibles', description: 'TCG, cards, anime collectibles, and gacha' },
    { category_id: '88888888-0000-0000-0000-000000000013', category_name: 'Tech & Innovation', description: 'Gadgets, mobile OS, programming, and hardware' }
  ];

  for (const cat of categoriesToAdd) {
    const { error } = await supabase.from('categories').upsert([cat], { onConflict: 'category_name' });
    if (error) console.log('Cat insert error (or already exists):', error.message);
  }

  // Fetch all categories for lookup
  const { data: dbCategories } = await supabase.from('categories').select('*');
  const catMap = new Map();
  dbCategories?.forEach(c => catMap.set(c.category_name.toLowerCase(), c.category_id));

  // 2. Users & Organizers
  const organizerUsers = [
    {
      userId: '44444444-0000-0000-0000-000000000010',
      orgId: '55555555-0000-0000-0000-000000000010',
      name: 'Hobbyist Haven PH',
      email: 'hobby@spott.ph',
      description: "Philippines' premier community hub for Pokemon TCG, One Piece Card Game, anime figures, gacha collectors, and pop-culture swap meets."
    },
    {
      userId: '44444444-0000-0000-0000-000000000020',
      orgId: '55555555-0000-0000-0000-000000000020',
      name: 'Tech Manila Hub',
      email: 'tech@spott.ph',
      description: "Premier Philippine community for Apple iOS & Android developers, smartphone power users, gadget modders, and emerging mobile tech innovators."
    },
    {
      userId: '44444444-0000-0000-0000-000000000030',
      orgId: '55555555-0000-0000-0000-000000000030',
      name: 'Vanguard Gaming League',
      email: 'gamer@spott.ph',
      description: "National grassroots and collegiate esports tournament circuit hosting premier LAN battles for Mobile Legends: Bang Bang, Honor of Kings, and Valorant."
    }
  ];

  for (const org of organizerUsers) {
    await supabase.from('users').upsert([{
      user_id: org.userId,
      name: org.name,
      email: org.email,
      role: 'organizer'
    }], { onConflict: 'email' });

    await supabase.from('organizers').upsert([{
      organizer_id: org.orgId,
      user_id: org.userId,
      organization_name: org.name,
      description: org.description,
      verification_status: 'verified'
    }], { onConflict: 'organizer_id' });
  }

  const metroOrgId = '44444444-4444-4444-4444-444444444444';
  const hobbyOrgId = '55555555-0000-0000-0000-000000000010';
  const techOrgId = '55555555-0000-0000-0000-000000000020';
  const gamerOrgId = '55555555-0000-0000-0000-000000000030';

  // 3. Locations
  const locationsList = [
    // Baguio
    { id: '77777777-1000-0000-0000-000000000001', venue_name: 'Burnham Park Grandstand', address: 'Jose Abad Santos Dr, Burnham Park', city: 'Baguio City', latitude: 16.4124, longitude: 120.5937 },
    { id: '77777777-1000-0000-0000-000000000002', venue_name: 'Camp John Hay Activity Field', address: 'Loakan Rd, Camp John Hay', city: 'Baguio City', latitude: 16.4025, longitude: 120.6174 },
    { id: '77777777-1000-0000-0000-000000000003', venue_name: 'University of the Cordilleras Arena', address: 'Gov. Pack Rd', city: 'Baguio City', latitude: 16.4140, longitude: 120.5960 },

    // La Union
    { id: '77777777-2000-0000-0000-000000000001', venue_name: 'San Juan Surf Beach Hub', address: 'MacArthur Hwy, Urbiztondo', city: 'San Juan, La Union', latitude: 16.6575, longitude: 120.3204 },
    { id: '77777777-2000-0000-0000-000000000002', venue_name: 'Flotsam and Jetsam Courtyard', address: 'Urbiztondo Beachfront', city: 'San Juan, La Union', latitude: 16.6534, longitude: 120.3188 },
    { id: '77777777-2000-0000-0000-000000000003', venue_name: 'San Fernando Cultural Center', address: 'Quezon Ave', city: 'San Fernando, La Union', latitude: 16.6158, longitude: 120.3175 },

    // Cavite
    { id: '77777777-3000-0000-0000-000000000001', venue_name: 'Tagaytay Highlands Amphitheater', address: 'Tagaytay-Calamba Rd', city: 'Tagaytay, Cavite', latitude: 14.1352, longitude: 121.0366 },
    { id: '77777777-3000-0000-0000-000000000002', venue_name: 'The District Dasmariñas Event Hall', address: 'Palapala, Dasmariñas', city: 'Dasmariñas, Cavite', latitude: 14.3294, longitude: 120.9367 },
    { id: '77777777-3000-0000-0000-000000000003', venue_name: 'Vermosa Sports & Innovation Hub', address: 'Daang Hari Road', city: 'Imus, Cavite', latitude: 14.3872, longitude: 120.9758 },

    // Metro Manila
    { id: '77777777-4000-0000-0000-000000000001', venue_name: 'Benilde Design + Arts (DAC) Campus', address: '950 Pablo Ocampo St, Malate', city: 'Manila', latitude: 14.5638, longitude: 120.9965 },
    { id: '77777777-4000-0000-0000-000000000002', venue_name: 'Bonifacio High Street Amphitheater', address: '5th Ave, Bonifacio Global City', city: 'Taguig', latitude: 14.5517, longitude: 121.0504 },
    { id: '77777777-4000-0000-0000-000000000003', venue_name: 'Circuit Makati Events Ground', address: 'Hippodromo St, Carmona', city: 'Makati', latitude: 14.5764, longitude: 121.0189 },
    { id: '77777777-4000-0000-0000-000000000004', venue_name: 'SM Mall of Asia Music Hall', address: 'Seaside Blvd', city: 'Pasay', latitude: 14.5352, longitude: 120.9822 },
    { id: '77777777-4000-0000-0000-000000000005', venue_name: 'Taft Cyber Arena & LAN Hub', address: 'Taft Ave near Quirino', city: 'Manila', latitude: 14.5645, longitude: 120.9940 },
    { id: '77777777-4000-0000-0000-000000000006', venue_name: 'UP Sunken Garden', address: 'Academic Oval, UP Diliman', city: 'Quezon City', latitude: 14.6538, longitude: 121.0685 },
  ];

  for (const loc of locationsList) {
    await supabase.from('locations').upsert([{
      location_id: loc.id,
      venue_name: loc.venue_name,
      address: loc.address,
      city: loc.city,
      latitude: loc.latitude,
      longitude: loc.longitude
    }], { onConflict: 'location_id' });
  }

  // 4. The 21 Events
  const events = [
    // -------------------------------------------------------------
    // METRO CREATIVE GROUP (6 Events across Baguio, LU, Cavite, Manila)
    // -------------------------------------------------------------
    {
      id: 'aaaa1111-0000-0000-0000-000000000001',
      orgId: metroOrgId,
      locId: '77777777-1000-0000-0000-000000000001', // Baguio Burnham
      title: 'Baguio Pine Echoes: Indie Arts & Acoustic Summit',
      category: 'Music',
      price: 250,
      capacity: 350,
      start: '2026-10-10 16:00:00',
      cover: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=1200&auto=format&fit=crop&q=80',
      description: 'Join Metro Creative Group amid the cool pine breeze of Burnham Park for an evening of live Filipino acoustic performances, local Cordilleran craft displays, and cozy open-air coffee booths.'
    },
    {
      id: 'aaaa1111-0000-0000-0000-000000000002',
      orgId: metroOrgId,
      locId: '77777777-2000-0000-0000-000000000001', // La Union Surf Hub
      title: 'La Union Sunset Creative Jam & Beach Bazaar',
      category: 'Community',
      price: 0,
      capacity: 250,
      start: '2026-10-17 15:30:00',
      cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200&auto=format&fit=crop&q=80',
      description: 'An open beachfront creative gathering featuring live indie musicians, surf photography exhibits, handmade artisan stalls, and sunset drum circles right along the Urbiztondo shore.'
    },
    {
      id: 'aaaa1111-0000-0000-0000-000000000003',
      orgId: metroOrgId,
      locId: '77777777-3000-0000-0000-000000000001', // Tagaytay Cavite
      title: 'Tagaytay Highlands Short Film & Visual Showcase',
      category: 'Art',
      price: 350,
      capacity: 200,
      start: '2026-10-24 17:00:00',
      cover: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&auto=format&fit=crop&q=80',
      description: 'Overlooking Taal Lake under the evening mist, experience curated short films, digital visual installations, and an exclusive Q&A with independent young Filipino directors.'
    },
    {
      id: 'aaaa1111-0000-0000-0000-000000000004',
      orgId: metroOrgId,
      locId: '77777777-4000-0000-0000-000000000001', // CSB DAC Manila
      title: 'Benilde D+A Creative Graduate Portfolio Expo',
      category: 'School Events',
      price: 0,
      capacity: 300,
      start: '2026-10-29 10:00:00',
      cover: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=1200&auto=format&fit=crop&q=80',
      description: 'The annual showcase of multimedia arts, animation, fashion, and industrial design graduates from De La Salle-College of Saint Benilde. Network with future creative directors and studio leads.'
    },
    {
      id: 'aaaa1111-0000-0000-0000-000000000005',
      orgId: metroOrgId,
      locId: '77777777-4000-0000-0000-000000000002', // BGC High Street
      title: 'BGC Urban Typography & Street Art Jam',
      category: 'Art',
      price: 150,
      capacity: 180,
      start: '2026-11-06 14:00:00',
      cover: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=1200&auto=format&fit=crop&q=80',
      description: 'Live mural painting, custom lettering workshops, and a celebration of modern Filipino streetwear and graphic design aesthetics along the vibrant Bonifacio High Street walkway.'
    },
    {
      id: 'aaaa1111-0000-0000-0000-000000000006',
      orgId: metroOrgId,
      locId: '77777777-4000-0000-0000-000000000003', // Circuit Makati
      title: 'Circuit Makati Neon Night Market & Art Fair',
      category: 'Night Markets',
      price: 0,
      capacity: 500,
      start: '2026-11-13 18:00:00',
      cover: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&auto=format&fit=crop&q=80',
      description: 'An electrifying weekend of illuminated food tents, artisanal crafts, thrift apparel, and live DJ sets under the Makati city lights. Free admission for everyone.'
    },

    // -------------------------------------------------------------
    // HOBBYIST (Hobbyist Haven PH) - Pokemon, Gacha, Anime, Cards (5 Events)
    // -------------------------------------------------------------
    {
      id: 'bbbb2222-0000-0000-0000-000000000001',
      orgId: hobbyOrgId,
      locId: '77777777-3000-0000-0000-000000000002', // Cavite Dasmariñas
      title: 'Pokemon TCG & One Piece Card Masters: Cavite Cup',
      category: 'Hobbies & Collectibles',
      price: 350,
      capacity: 160,
      start: '2026-10-11 11:00:00',
      cover: 'https://images.unsplash.com/photo-1613771404784-3a5686aa2be3?w=1200&auto=format&fit=crop&q=80',
      description: 'Official Swiss-format tournament for Pokemon Trading Card Game and One Piece Card Game collectors in South Luzon! Win graded booster boxes, rare promo cards, and exclusive playmats.'
    },
    {
      id: 'bbbb2222-0000-0000-0000-000000000002',
      orgId: hobbyOrgId,
      locId: '77777777-1000-0000-0000-000000000002', // Baguio Camp John Hay
      title: 'Pine Pop: Baguio Anime Figures & Gacha Swap Meet',
      category: 'Hobbies & Collectibles',
      price: 150,
      capacity: 220,
      start: '2026-10-18 10:00:00',
      cover: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1200&auto=format&fit=crop&q=80',
      description: 'Bring your trade binders, scale anime figures, and gacha pulls! Featuring dedicated trading tables, blind box unboxing challenges, cosplay photo zones, and rare Japanese hobby imports.'
    },
    {
      id: 'bbbb2222-0000-0000-0000-000000000003',
      orgId: hobbyOrgId,
      locId: '77777777-4000-0000-0000-000000000004', // SM MOA Music Hall
      title: 'Grand Gacha Fiesta 2026: Genshin, HSR & Fate Gathering',
      category: 'Hobbies & Collectibles',
      price: 200,
      capacity: 450,
      start: '2026-10-25 12:00:00',
      cover: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1200&auto=format&fit=crop&q=80',
      description: 'The premier national gathering for gacha mobile game fans! Live summon stages on the big screen, fan art marketplace, official merchandise stalls, and character cosplay runway competitions.'
    },
    {
      id: 'bbbb2222-0000-0000-0000-000000000004',
      orgId: hobbyOrgId,
      locId: '77777777-2000-0000-0000-000000000002', // La Union Flotsam
      title: 'Elyu TCG Beachside Draft & Casual Card Battle',
      category: 'Hobbies & Collectibles',
      price: 0,
      capacity: 120,
      start: '2026-11-01 14:00:00',
      cover: 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=1200&auto=format&fit=crop&q=80',
      description: 'Relaxed booster draft tournaments and casual card play under the coastal cabanas. Free promo pack upon entry, open for both beginners looking to learn and seasoned collectors.'
    },
    {
      id: 'bbbb2222-0000-0000-0000-000000000005',
      orgId: hobbyOrgId,
      locId: '77777777-4000-0000-0000-000000000006', // UP Diliman QC
      title: 'Gunpla & Die-Cast Modelers Workshop: Metro Build Day',
      category: 'Workshops',
      price: 180,
      capacity: 100,
      start: '2026-11-08 13:00:00',
      cover: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=1200&auto=format&fit=crop&q=80',
      description: 'Hands-on Gundam model kit assembly, panel lining, airbrushing techniques, and Hot Wheels custom detailing clinic hosted by veteran master builders.'
    },

    // -------------------------------------------------------------
    // TECHTIST (Tech Manila Hub) - Apple iOS, Samsung, Drones, Hardware (5 Events)
    // -------------------------------------------------------------
    {
      id: 'cccc3333-0000-0000-0000-000000000001',
      orgId: techOrgId,
      locId: '77777777-4000-0000-0000-000000000002', // BGC Taguig
      title: 'Apple Ecosystem & Swift iOS 20 Dev Conference',
      category: 'Tech & Innovation',
      price: 450,
      capacity: 250,
      start: '2026-10-14 09:00:00',
      cover: 'https://images.unsplash.com/photo-1512499617640-c74ae3a79d37?w=1200&auto=format&fit=crop&q=80',
      description: 'Deep dive into next-generation iOS architecture, VisionOS spatial computing, SwiftUI benchmarks, and Apple Silicon optimization with lead engineers from Silicon Valley and Manila.'
    },
    {
      id: 'cccc3333-0000-0000-0000-000000000002',
      orgId: techOrgId,
      locId: '77777777-3000-0000-0000-000000000003', // Cavite Vermosa
      title: 'Cavite Drone & Robotics Innovation Expo 2026',
      category: 'Tech & Innovation',
      price: 0,
      capacity: 300,
      start: '2026-10-21 13:00:00',
      cover: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=1200&auto=format&fit=crop&q=80',
      description: 'High-speed FPV drone obstacle racing, agricultural autonomous robotics demos, and 3D printing maker labs at the Vermosa open-air technology grounds.'
    },
    {
      id: 'cccc3333-0000-0000-0000-000000000003',
      orgId: techOrgId,
      locId: '77777777-1000-0000-0000-000000000003', // Baguio UC
      title: 'Baguio Cloud & AI Dev Hackathon: Highlands Tech Fest',
      category: 'Tech & Innovation',
      price: 0,
      capacity: 180,
      start: '2026-10-28 08:30:00',
      cover: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&auto=format&fit=crop&q=80',
      description: 'A 24-hour sprint building real-world AI agents and cloud applications for regional Philippine commerce and sustainability. Mentored by top tech architects with ₱100,000 in prizes.'
    },
    {
      id: 'cccc3333-0000-0000-0000-000000000004',
      orgId: techOrgId,
      locId: '77777777-2000-0000-0000-000000000002', // La Union Flotsam
      title: 'La Union Remote Tech Nomads & AI Workation Meetup',
      category: 'Community',
      price: 200,
      capacity: 90,
      start: '2026-11-04 16:00:00',
      cover: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200&auto=format&fit=crop&q=80',
      description: 'Connect with tech leads, remote software engineers, and digital founders living along the surfing coast. Discuss async team culture, AI tools, and remote work lifestyle over artisanal brews.'
    },
    {
      id: 'cccc3333-0000-0000-0000-000000000005',
      orgId: techOrgId,
      locId: '77777777-4000-0000-0000-000000000003', // Circuit Makati
      title: 'Samsung Galaxy & Android Power Users Hardware Lab',
      category: 'Workshops',
      price: 300,
      capacity: 150,
      start: '2026-11-11 14:00:00',
      cover: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&auto=format&fit=crop&q=80',
      description: 'Hands-on session exploring Galaxy AI, custom One UI tweaks, foldable phone app design, smartphone camera sensor calibration, and Android kernel optimization.'
    },

    // -------------------------------------------------------------
    // GAMER (Vanguard Gaming League) - MLBB, Honor of Kings, Valorant (5 Events)
    // -------------------------------------------------------------
    {
      id: 'dddd4444-0000-0000-0000-000000000001',
      orgId: gamerOrgId,
      locId: '77777777-3000-0000-0000-000000000002', // Cavite Dasmariñas
      title: 'MLBB South Luzon Collegiate Masters: Season 4 Finals',
      category: 'Gaming',
      price: 150,
      capacity: 400,
      start: '2026-10-12 13:00:00',
      cover: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&auto=format&fit=crop&q=80',
      description: 'The grand offline finals for university MLBB teams across Cavite, Laguna, and Batangas! Live shoutcasters, huge LED stage, diamond giveaways, and national tournament qualifiers.'
    },
    {
      id: 'dddd4444-0000-0000-0000-000000000002',
      orgId: gamerOrgId,
      locId: '77777777-1000-0000-0000-000000000003', // Baguio UC Arena
      title: 'Valorant Clutch LAN: Highlands Invitational',
      category: 'Gaming',
      price: 200,
      capacity: 320,
      start: '2026-10-19 11:00:00',
      cover: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1200&auto=format&fit=crop&q=80',
      description: '16 top competitive 5v5 teams battle on 240Hz tournament rigs in Baguio City. Double elimination format with full stream broadcast, caster desk, and official gaming peripheral prizes.'
    },
    {
      id: 'dddd4444-0000-0000-0000-000000000003',
      orgId: gamerOrgId,
      locId: '77777777-4000-0000-0000-000000000004', // SM MOA Music Hall
      title: 'Honor of Kings Philippine Open Championship 2026',
      category: 'Gaming',
      price: 0,
      capacity: 600,
      start: '2026-10-26 12:00:00',
      cover: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=1200&auto=format&fit=crop&q=80',
      description: 'Official Honor of Kings nationwide major! Witness the country’s best mobile MOBA squads compete for the ₱500,000 championship purse and a ticket to the Global Finals in Shanghai.'
    },
    {
      id: 'dddd4444-0000-0000-0000-000000000004',
      orgId: gamerOrgId,
      locId: '77777777-2000-0000-0000-000000000001', // La Union Beachfront
      title: 'La Union Coastal Clash: MLBB Beachside 1v1 & 5v5',
      category: 'Gaming',
      price: 0,
      capacity: 180,
      start: '2026-11-02 17:00:00',
      cover: 'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=1200&auto=format&fit=crop&q=80',
      description: 'Sunset esports on the beach! Casual 1v1 mid lane brawls, crowd showmatches, high-speed gaming WiFi on the sand, and exclusive in-game skin giveaways for attendees.'
    },
    {
      id: 'dddd4444-0000-0000-0000-000000000005',
      orgId: gamerOrgId,
      locId: '77777777-4000-0000-0000-000000000005', // Taft Cyber Arena Manila
      title: 'Midnight Valorant & FPS Showdown: Taft Night Brawl',
      category: 'Gaming',
      price: 100,
      capacity: 140,
      start: '2026-11-09 20:00:00',
      cover: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&auto=format&fit=crop&q=80',
      description: 'Overnight collegiate LAN tournament near the university belt. Free energy drinks, high-octane 5v5 customs, community raffle draws, and nonstop competitive action until dawn.'
    }
  ];

  console.log(`Inserting ${events.length} events into Supabase...`);

  for (const ev of events) {
    const metaTag = `<!--spott:{"coverImage":"${ev.cover}","capacity":${ev.capacity}}-->`;
    const fullDescription = `${ev.description}\n\n${metaTag}`;

    const { error: evErr } = await supabase.from('events').upsert([{
      event_id: ev.id,
      organizer_id: ev.orgId,
      location_id: ev.locId,
      title: ev.title,
      description: fullDescription,
      start_datetime: ev.start,
      price: ev.price,
      status: 'active',
      is_still_happening_confirmed_at: new Date().toISOString()
    }], { onConflict: 'event_id' });

    if (evErr) {
      console.error(`Error inserting event "${ev.title}":`, evErr.message);
    } else {
      console.log(`✓ Inserted: ${ev.title}`);
    }

    // Link category
    const catId = catMap.get(ev.category.toLowerCase()) || catMap.get('community') || '88888888-0000-0000-0000-000000000009';
    await supabase.from('event_category').upsert([{
      event_id: ev.id,
      category_id: catId
    }], { onConflict: 'event_id,category_id' });
  }

  console.log('--- Database Seeding Complete! ---');
}

seed().catch(console.error);
