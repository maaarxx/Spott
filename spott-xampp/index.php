<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spott — Event Discovery</title>
<link rel="stylesheet" href="assets/style.css">
<link rel="stylesheet" href="assets/phase3.css">
</head>
<body>
<header class="topbar">
  <div class="brand"><span class="brand-dot"></span>Spott</div>
  <nav><a href="#discover">Discover</a><a href="#how">How it works</a><a href="#my-plan">My plan <span id="savedCount" class="nav-count">0</span></a></nav>
  <button class="btn btn-outline" id="demoLogin">Demo Account</button>
</header>

<main>
<section class="hero">
  <div class="hero-inner">
    <p class="eyebrow">SPOTT • SPOTTING YOUR NEXT SPOT!</p>
    <h1>Find something happening <span>near you.</span></h1>
    <p class="hero-copy">Discover local concerts, food markets, workshops, sports and community events in one place.</p>
    <a class="btn btn-primary" href="#discover">Explore events</a>
  </div>
</section>

<section id="discover" class="section">
  <div class="section-heading"><div><p class="eyebrow">DISCOVERY</p><h2>Upcoming events</h2></div><div class="heading-tools"><span id="resultCount" class="count-pill">Loading…</span><div class="view-toggle" role="group" aria-label="Choose event view"><button type="button" class="view-btn active" id="listViewBtn">List</button><button type="button" class="view-btn" id="mapViewBtn">Map</button></div></div></div>
  <form id="filters" class="filters" novalidate>
    <div class="field wide"><label for="search">Search</label><input id="search" name="q" type="search" placeholder="Event, venue, city…"></div>
    <div class="field"><label for="category">Category</label><select id="category"><option value="">All categories</option></select></div>
    <div class="field"><label for="city">City</label><select id="city"><option value="">All cities</option><option>Dasmariñas</option><option>Imus</option><option>Tagaytay</option><option>Trece Martires</option><option>Bacoor</option></select></div>
    <div class="field"><label for="date">Date</label><input id="date" type="date"></div>
    <div class="field"><label for="maxPrice">Max price (₱)</label><input id="maxPrice" type="number" min="0" step="50" placeholder="Any"></div>
    <button class="btn btn-dark" type="submit">Search</button>
    <button class="btn btn-light" type="button" id="clearFilters">Clear</button>
  </form>
  <div id="apiStatus" class="api-status" role="status"></div>
  <div id="eventsGrid" class="events-grid" aria-live="polite"></div>
  <div id="mapView" class="map-view" aria-live="polite" hidden></div>
</section>

<section id="my-plan" class="section plan-section">
  <div class="section-heading"><div><p class="eyebrow">PERSONALIZATION</p><h2>Your saved plan</h2></div><span id="planCount" class="count-pill">0 saved</span></div>
  <div id="savedEvents" class="saved-events"><p class="empty">Save an event to build your personal plan.</p></div>
</section>

<section id="how" class="section how">
  <div><p class="eyebrow">HOW IT WORKS</p><h2>Less searching. More showing up.</h2></div>
  <div class="feature-grid"><article><b>01 / Discover</b><h3>Find what fits</h3><p>Search and filter local events by category, city, date, and price. Switch to map view to compare locations.</p></article><article><b>02 / Trust</b><h3>Know what is current</h3><p>Verified organizers, confirmation signals, and reporting help keep event information useful.</p></article><article><b>03 / Engage</b><h3>Make a plan</h3><p>Save events, RSVP with one click, and keep your shortlist ready for the weekend.</p></article></div>
</section>


</main>

<div class="modal" id="eventModal" aria-hidden="true"><div class="modal-card"><button class="modal-close" data-close>×</button><div id="modalBody"></div></div></div>
<div class="toast" id="toast" role="status"></div>
<script src="assets/app.js"></script>
</body>
</html>
