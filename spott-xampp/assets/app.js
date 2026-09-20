const API = 'api/';
let currentEvents = [];
let savedEventIds = JSON.parse(localStorage.getItem('spott_saved_events') || '[]').map(Number);
const $ = (id) => document.getElementById(id);

async function fetchJSON(url, options={}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(data.message || 'Request failed');
  return data;
}

async function loadCategories() {
  try {
    const data = await fetchJSON(API + 'categories.php');
    data.categories.forEach(c => $('category').insertAdjacentHTML('beforeend', `<option value="${escapeHtml(c.category_name)}">${escapeHtml(c.category_name)}</option>`));
  } catch(e) { console.error(e); }
}

async function loadEvents() {
  $('apiStatus').textContent = 'Loading events from MySQL…';
  const params = new URLSearchParams();
  const q = $('search').value.trim();
  const category = $('category').value;
  const city = $('city').value;
  const date = $('date').value;
  const maxPrice = $('maxPrice').value;
  if(q) params.set('q', q);
  if(category) params.set('category', category);
  if(city) params.set('city', city);
  if(date) params.set('date', date);
  if(maxPrice !== '') params.set('max_price', maxPrice);
  try {
    const data = await fetchJSON(API + 'events.php?' + params.toString());
    currentEvents = data.events;
    renderEvents(currentEvents);
    updateSavedPlan();
    $('resultCount').textContent = `${data.count} event${data.count === 1 ? '' : 's'}`;
    $('apiStatus').textContent = 'Connected: PHP REST endpoint → MySQL';
  } catch (e) {
    $('apiStatus').textContent = e.message;
    $('eventsGrid').innerHTML = `<div class="empty">Unable to load events. Check that Apache and MySQL are running and the database was imported.</div>`;
  }
}

function renderEvents(events) {
  if (!events.length) {
    $('eventsGrid').innerHTML = '<div class="empty">No events match your filters. Try clearing a filter.</div>';
    $('mapView').innerHTML = '<div class="empty">No locations match your filters.</div>';
    return;
  }
  $('eventsGrid').innerHTML = events.map(e => {
    const date = new Date(e.start_datetime.replace(' ', 'T'));
    const dateText = date.toLocaleDateString(undefined, {month:'short', day:'numeric'});
    const timeText = date.toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'});
    const price = Number(e.price) === 0 ? 'Free' : `₱${Number(e.price).toLocaleString()}`;
    const verified = e.verification_status === 'verified' ? '<span class="verified">✓ Verified organizer</span>' : '';
    const confirmed = e.is_still_happening_confirmed_at ? 'Still happening ✓' : 'Status not recently confirmed';
    const saved = savedEventIds.includes(Number(e.event_id));
    return `<article class="event-card">
      <div class="event-top"><div class="event-date">${dateText}<br>${timeText}</div><span class="badge">${price}</span></div>
      <div class="event-body"><div class="tags">${escapeHtml(e.categories || 'Community')}</div><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(e.description || '')}</p><div class="meta">📍 ${escapeHtml(e.venue_name || '')} · ${escapeHtml(e.city || '')}</div><div class="meta">👥 ${e.registrations} registered · ${escapeHtml(confirmed)}</div>${verified}<div class="event-actions"><button class="btn btn-dark" onclick="openEvent(${e.event_id})">View details</button><button class="btn btn-light" onclick="toggleSave(${e.event_id})">${saved ? 'Saved ✓' : 'Save'}</button><button class="btn btn-light" onclick="rsvp(${e.event_id})">RSVP</button></div></div>
    </article>`;
  }).join('');
  renderMap(events);
}

function renderMap(events) {
  if (!events.length) { $('mapView').innerHTML = '<div class="empty">No locations match your filters.</div>'; return; }
  $('mapView').innerHTML = `<div class="map-intro"><b>Map view</b><span>Open a venue in Google Maps for directions.</span></div>` + events.map(e => `<article class="map-pin"><div class="pin">${escapeHtml((e.city || 'SP').slice(0,2).toUpperCase())}</div><div><b>${escapeHtml(e.title)}</b><span>📍 ${escapeHtml(e.venue_name || 'Venue')} · ${escapeHtml(e.city || '')}</span><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((e.address || '') + ' ' + (e.city || ''))}">Open location ↗</a></div></article>`).join('');
}

window.openEvent = function(id) {
  const e = currentEvents.find(x => Number(x.event_id) === Number(id));
  if (!e) return;
  const saved = savedEventIds.includes(Number(e.event_id));
  $('modalBody').innerHTML = `<p class="eyebrow">${escapeHtml(e.categories || 'EVENT')}</p><h2>${escapeHtml(e.title)}</h2><p>${escapeHtml(e.description || '')}</p><p><b>When:</b> ${new Date(e.start_datetime.replace(' ','T')).toLocaleString()}</p><p><b>Where:</b> ${escapeHtml(e.venue_name || '')}, ${escapeHtml(e.address || '')}</p><p><b>Price:</b> ${Number(e.price) === 0 ? 'Free' : '₱'+Number(e.price).toLocaleString()}</p><p>${e.verification_status === 'verified' ? '<span class="verified">✓ Verified organizer</span>' : ''}</p><div class="event-actions"><button class="btn btn-dark" onclick="rsvp(${e.event_id})">RSVP to this event</button><button class="btn btn-light" onclick="toggleSave(${e.event_id})">${saved ? 'Remove saved' : 'Save event'}</button><button class="btn btn-light" onclick="confirmEvent(${e.event_id})">Still happening</button></div><div class="report-box"><b>Report this listing</b><p>If event information looks incorrect, send it to the administrator.</p><textarea id="reportReason" maxlength="500" required placeholder="Reason for report (required)"></textarea><p class="form-hint">Minimum 5 characters. Maximum 500 characters.</p><button class="btn btn-light" style="margin-top:8px" onclick="reportEvent(${e.event_id})">Submit report</button></div>`;
  $('eventModal').classList.add('open'); $('eventModal').setAttribute('aria-hidden','false');
};

window.toggleSave = function(id) {
  id = Number(id);
  savedEventIds = savedEventIds.includes(id) ? savedEventIds.filter(savedId => savedId !== id) : [...savedEventIds, id];
  localStorage.setItem('spott_saved_events', JSON.stringify(savedEventIds));
  updateSavedPlan();
  renderEvents(currentEvents);
  showToast(savedEventIds.includes(id) ? 'Event saved to your plan.' : 'Event removed from your plan.');
};

function updateSavedPlan() {
  $('savedCount').textContent = savedEventIds.length;
  $('planCount').textContent = `${savedEventIds.length} saved`;
  const saved = currentEvents.filter(e => savedEventIds.includes(Number(e.event_id)));
  $('savedEvents').innerHTML = saved.length ? saved.map(e => `<article class="saved-card"><div><b>${escapeHtml(e.title)}</b><span>${escapeHtml(e.venue_name || '')} · ${escapeHtml(e.city || '')}</span></div><button class="btn btn-light" onclick="openEvent(${e.event_id})">View</button></article>`).join('') : '<p class="empty">Save an event to build your personal plan.</p>';
}

window.rsvp = async function(id) {
  try { const data = await fetchJSON(API+'register.php', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_id:id})}); showToast(data.message); await loadEvents(); }
  catch(e){ showToast(e.message); }
};
window.confirmEvent = async function(id) {
  try { const data = await fetchJSON(API+'confirm.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_id:id})}); showToast(data.message); closeModal(); await loadEvents(); }
  catch(e){ showToast(e.message); }
};
window.reportEvent = async function(id) {
  const reason = $('reportReason').value.trim();
  if (reason.length < 5) { $('reportReason').focus(); showToast('Please enter a report reason (at least 5 characters).'); return; }
  try { const data = await fetchJSON(API+'report.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_id:id,reason})}); showToast(data.message); closeModal(); }
  catch(e){ showToast(e.message); }
};

function closeModal(){ $('eventModal').classList.remove('open'); $('eventModal').setAttribute('aria-hidden','true'); }
function showToast(message){ const t=$('toast'); t.textContent=message; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2500); }
function escapeHtml(value){ return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }

$('filters').addEventListener('submit', e => { e.preventDefault(); loadEvents(); });
$('clearFilters').addEventListener('click', () => { $('filters').reset(); loadEvents(); });
$('eventModal').addEventListener('click', e => { if(e.target.id === 'eventModal' || e.target.matches('[data-close]')) closeModal(); });
$('demoLogin').addEventListener('click', () => showToast('Demo attendee: attendee@spott.local'));
$('listViewBtn').addEventListener('click', () => setView('list'));
$('mapViewBtn').addEventListener('click', () => setView('map'));
$('search').addEventListener('input', debounce(loadEvents, 300));
function debounce(fn, delay){ let timer; return (...args)=>{ clearTimeout(timer); timer=setTimeout(()=>fn(...args),delay); }; }

function setView(view) {
  const list = view === 'list';
  $('eventsGrid').hidden = !list;
  $('mapView').hidden = list;
  $('listViewBtn').classList.toggle('active', list);
  $('mapViewBtn').classList.toggle('active', !list);
}

loadCategories();
loadEvents();
updateSavedPlan();
