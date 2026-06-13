# Shule AI v149.7 — Final CORS, Cache, Timetable and Realtime Lock

This build supersedes v149.4/v149.6 for live school demo use.

Locked fixes:
- Force frontend runtime assets to `?v=1497`.
- Force service worker cache name to `shule-ai-1497-final-cors-cache-timetable-realtime-lock`.
- Stop the service worker from intercepting cross-origin Render API/socket calls.
- Add immediate CORS headers in request context and final error handler so `/api/alerts`, `/api/timetable/generate`, and `/api/timetable/:id` return CORS headers even on handled errors/preflights.
- Wrap timetable generate in the same transient DB retry path as save/publish.
- Keep login session valid after timetable 500; retryable DB errors return clear messages without token wipe.
- Keep realtime message event contract from v149.6.

Mandatory deploy check:
- Browser console must show `api.js?v=1497`, `timetable.js?v=1497`, `notifications.js?v=1497`, and `service-worker.js?v=1497`.
- If any `v=1494` appears, the frontend deploy or old service worker is still active.
