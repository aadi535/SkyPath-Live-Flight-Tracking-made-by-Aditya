const map = L.map('map', {preferCanvas: true, worldCopyJump: true}).setView([35, 10], 2);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    minZoom: 2, maxZoom: 16
}).addTo(map);
const markers = L.layerGroup().addTo(map);
const list = document.getElementById('flight-list');
const notice = document.getElementById('data-notice');
const modal = document.getElementById('flight-modal');
const refresh = document.getElementById('refresh-btn');
let flights = [], busy = false, demo = true, previousFocus;
const search = document.getElementById('aircraft-search');
const snapshotKey = 'skypath-observations-v1';
const samples = JSON.parse(document.getElementById('sample-flights').textContent);
const filter = document.createElement('select');
filter.setAttribute('aria-label', 'Filter by aircraft registration country');
filter.className = 'country-select';
filter.add(new Option('All registration countries', ''));
document.querySelector('.flight-list-section').insertBefore(filter, list);
const text = (tag, value) => { const el = document.createElement(tag); el.textContent = value; return el; };
const number = (value, unit) => Number.isFinite(value) ? `${Math.round(value)} ${unit}` : 'Not reported';
function closeModal() { modal.style.display = 'none'; previousFocus?.focus(); }
function selectFlight(flight, marker) {
    previousFocus = document.activeElement;
    map.flyTo([flight.latitude, flight.longitude], 7, {duration: .7});
    marker.openPopup();
    document.getElementById('modal-title').textContent = flight.callsign || flight.icao24;
    const body = document.getElementById('modal-body');
    body.replaceChildren();
    const details = [
        ['Data source', demo ? 'Synthetic sample — invented aircraft' : 'OpenSky Network observation'],
        ['ICAO24', flight.icao24], ['Registration country', flight.origin_country],
        ['Altitude', number(flight.altitude, 'm')], ['Speed', number(flight.velocity === null ? null : flight.velocity * 3.6, 'km/h')],
        ['Heading', number(flight.heading, '°')], ['Last contact (UTC)', flight.last_contact],
        ['Position', `${flight.latitude.toFixed(4)}, ${flight.longitude.toFixed(4)}`]
    ];
    details.forEach(([label, value]) => { const p = text('p', `${label}: ${value}`); body.append(p); });
    modal.style.display = 'block';
    document.getElementById('close-modal').focus();
}
function render() {
    markers.clearLayers(); list.replaceChildren();
    const query = search.value.trim().toLowerCase();
    const visible = flights.filter(f => (!filter.value || f.origin_country === filter.value) &&
        (!query || [f.callsign, f.icao24].some(value => String(value ?? '').toLowerCase().includes(query))));
    document.getElementById('flight-count').textContent = visible.length;
    if (!visible.length) list.append(text('p', 'No aircraft match your filters.'));
    visible.forEach(flight => {
        const marker = L.marker([flight.latitude, flight.longitude], {icon: L.divIcon({
            className: 'aircraft-icon', html: '<span aria-hidden="true">✈</span>', iconSize: [26, 26], iconAnchor: [13, 13]
        })}).addTo(markers);
        marker.bindPopup(text('strong', flight.callsign || flight.icao24));
        marker.on('click', () => selectFlight(flight, marker));
        const item = document.createElement('button'); item.className = 'flight-item';
        item.append(text('strong', flight.callsign || flight.icao24), text('span', flight.origin_country),
            text('small', `${number(flight.altitude, 'm')} · ${number(flight.velocity === null ? null : flight.velocity * 3.6, 'km/h')}`));
        item.addEventListener('click', () => selectFlight(flight, marker)); list.append(item);
    });
}
function showData(data, stale = false) {
    flights = data.flights.filter(f => Number.isFinite(f.latitude) && Number.isFinite(f.longitude)).slice(0, 300);
    demo = data.demo_mode;
    const country = filter.value;
    filter.replaceChildren(new Option('All registration countries', ''));
    [...new Set(flights.map(f => f.origin_country))].sort().forEach(c => filter.add(new Option(c, c)));
    if ([...filter.options].some(o => o.value === country)) filter.value = country;
    document.getElementById('last-updated').textContent = demo ? 'Preview' : 'Updated ' + data.last_updated;
    document.getElementById('connection-text').textContent = demo ? 'Sample flights' : stale ? 'Previous observations' : 'OpenSky observations';
    document.getElementById('connection-status').className = 'status-dot ' + (demo || stale ? 'demo' : 'connected');
    notice.textContent = demo ? 'Sample positions shown while we check for live aircraft.' : stale ? 'Previously loaded positions. Checking for newer observations…' : 'OpenSky Network · Positions may be delayed.';
    notice.classList.toggle('sample', demo || stale);
    render();
}
function showUnavailable() {
    document.getElementById('connection-text').textContent = demo ? 'Sample flights' : 'Previous observations';
    document.getElementById('connection-status').className = 'status-dot demo';
    notice.classList.add('sample');
    notice.textContent = demo ? 'Live data is unavailable. These sample flights are invented.' : 'Live refresh unavailable. Showing the last loaded positions.';
}
async function load() {
    if (busy) return;
    busy = true; refresh.disabled = true; refresh.textContent = 'Checking…';
    try {
        const response = await fetch('/api/flights', {signal: AbortSignal.timeout(40000)});
        if (!response.ok) throw new Error('Feed unavailable');
        const data = await response.json();
        if (!Array.isArray(data.flights) || !data.flights.length) throw new Error('Invalid feed');
        if (data.demo_mode) {
            showUnavailable();
        } else {
            showData(data);
            try { localStorage.setItem(snapshotKey, JSON.stringify({data, savedAt: Date.now()})); } catch {}
        }
    } catch {
        showUnavailable();
    } finally { busy = false; refresh.disabled = false; refresh.textContent = 'Refresh'; }
}
search.addEventListener('input', render);
filter.addEventListener('change', render);
refresh.addEventListener('click', load);
document.getElementById('center-btn').addEventListener('click', () => {
    if (flights.length) map.fitBounds(flights.map(f => [f.latitude, f.longitude]), {padding: [30, 30], maxZoom: 6});
    else map.setView([35, 10], 2);
});
document.getElementById('close-modal').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => {
    if (modal.style.display !== 'block') return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Tab') { e.preventDefault(); document.getElementById('close-modal').focus(); }
});
window.addEventListener('resize', () => map.invalidateSize());
let cached;
try { cached = JSON.parse(localStorage.getItem(snapshotKey)); } catch {}
const recent = cached?.data?.demo_mode === false && Array.isArray(cached.data.flights) &&
    cached.data.flights.length && Date.now() - cached.savedAt < 15 * 60 * 1000;
showData(recent ? cached.data : {flights: samples, demo_mode: true}, Boolean(recent));
load();
setInterval(() => { if (!document.hidden) load(); }, 300000);
