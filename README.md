# SkyPath — Flight Explorer

**Live demo:** https://skypath-flight-explorer.vercel.app

An interactive aircraft map by Aditya Suryavanshi, built with Python, Flask, JavaScript, Leaflet and the OpenSky Network API. Select aircraft, inspect reported measurements, filter by registration country, and pan or zoom around the map.

## Data and limitations

The app requests the latest available OpenSky observations. Coverage and delays vary; it is not guaranteed real-time tracking. At most 500 airborne aircraft with valid coordinates and contact within the last five minutes are shown. Registration country is not the departure country. This feed does not establish aircraft ownership, military/private classification, destinations or flown routes.

When OpenSky times out, rejects a request, returns no usable observations or rate limits access, the app shows **25 deterministic synthetic sample aircraft** with a visible demo notice. These are invented examples, not delayed live flights. The interface remains usable without credentials. This educational project is not a navigation tool.

## Run locally

Use Python 3.12 or newer from the repository root:

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
python -m flask --app app run
```

Open http://127.0.0.1:5000. No frontend build step is required.

Optional environment variables: `OPENSKY_CLIENT_ID` and `OPENSKY_CLIENT_SECRET`. Create API client credentials in your OpenSky account and set both in your shell or hosting dashboard. Authentication uses OAuth2 client credentials, not your account password. Never commit credentials or paste them into browser code. Without credentials, anonymous access is attempted and synthetic fallback is available.

## Deploy to Vercel

Import this GitHub repository into Vercel. Set the **Root Directory to the repository root** (leave it blank), use the Flask framework preset, and leave build/output overrides empty. `app.py` exports the Flask WSGI app; `vercel.json` selects Flask. Add optional OpenSky variables in Vercel Settings → Environment Variables and redeploy if you add or change them.

Alternatively, from the repository root:

```sh
vercel login
vercel --prod
```

Flask serves the template and static assets using paths rooted in `Flight_Tracker_New`. Data is fetched synchronously on demand with bounded timeouts. There is no background worker, persistent filesystem requirement or dependency on a long-running server. A lock and two-minute in-process cache reduce repeat requests on warm instances; the cache is not shared or guaranteed between serverless instances. Higher traffic may exhaust provider credits and fall back to synthetic data. A durable shared cache would be the next scaling improvement.

A separate Render backend is unnecessary for this request-based demo. For conventional hosting, install the root requirements plus Gunicorn and start `gunicorn app:app` from the repository root. The nested Procfile is for hosting with `Flight_Tracker_New` as root.

## Routes

- `/` — explorer and About section
- `/static/script.js` and `/static/style.css` — interface assets
- `/api/flights` — observations, source notice, UTC fetch time and demo flag
- `/api/flight/<icao24>` — individual observation (404 if unavailable)
- `/api/status` — current instance cache status (does not fetch data)

The browser fetches every two minutes while visible; Refresh requests the feed immediately but may receive a cached snapshot. Map tiles and Leaflet require an internet connection.

## Validation

```sh
python -m unittest discover -s tests -v
node --check Flight_Tracker_New/static/script.js
```

Tests mock OpenSky responses to check live parsing, zero coordinates, missing values, cache reuse, invalid responses, rate limits, timeouts, fallback labelling and HTTP routes. After deployment, check `/`, assets and `/api/flights`, then select a map marker and test filtering on desktop and mobile.

Data provider: https://opensky-network.org/ · Map: https://www.openstreetmap.org/ · Leaflet: https://leafletjs.com/
