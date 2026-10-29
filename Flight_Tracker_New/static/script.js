const map = L.map('map', {preferCanvas: true}).setView([35, 10], 2);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    minZoom: 2, maxZoom: 16
}).addTo(map);
const markers = L.layerGroup().addTo(map);
const list = document.getElementById('flight-list');
const notice = document.getElementById('data-notice');
const modal = document.getElementById('flight-modal');
const refresh = document.getElementById('refresh-btn');
let flights = [], busy = false, demo = true, selected = null, previousFocus;
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
    selected = flight.icao24;
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
    const visible = flights.filter(f => !filter.value || f.origin_country === filter.value);
    document.getElementById('flight-count').textContent = visible.length;
    if (!visible.length) list.append(text('p', 'No observations for this country. Try another filter.'));
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
async function load() {
    if (busy) return;
    busy = true; refresh.disabled = true; refresh.textContent = 'Loading…';
    try {
        const response = await fetch('/api/flights', {signal: AbortSignal.timeout(25000)});
        if (!response.ok) throw new Error('Feed unavailable');
        const data = await response.json();
        if (!Array.isArray(data.flights)) throw new Error('Invalid feed');
        flights = data.flights.filter(f => Number.isFinite(f.latitude) && Number.isFinite(f.longitude));
        demo = data.demo_mode;
        const country = filter.value;
        filter.replaceChildren(new Option('All registration countries', ''));
        [...new Set(flights.map(f => f.origin_country))].sort().forEach(c => filter.add(new Option(c, c)));
        if ([...filter.options].some(o => o.value === country)) filter.value = country;
        document.getElementById('last-updated').textContent = data.last_updated;
        document.getElementById('connection-text').textContent = demo ? 'Synthetic demo' : 'OpenSky observations';
        document.getElementById('connection-status').className = `status-dot ${demo ? 'demo' : 'connected'}`;
        notice.textContent = demo ? 'Demo mode · These aircraft are synthetic samples, not real positions. The live feed is currently unavailable.' : 'OpenSky observations · Coverage and delays vary. Refreshes every two minutes; up to 500 aircraft shown.';
        notice.classList.toggle('sample', demo);
        render();
    } catch (error) {
        document.getElementById('connection-text').textContent = 'Unable to refresh';
        document.getElementById('connection-status').className = 'status-dot';
        notice.textContent = flights.length ? 'Refresh failed. Previously loaded observations remain visible; they may be out of date. Use Refresh to retry.' : 'Could not load aircraft data. Check your connection and select Refresh to try again.';
        if (!flights.length) list.replaceChildren(text('p', 'Aircraft data is unavailable. Use Refresh to retry.'));
    } finally { busy = false; refresh.disabled = false; refresh.textContent = '↻ Refresh'; }
}
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
load();
setInterval(() => { if (!document.hidden) load(); }, 120000);
