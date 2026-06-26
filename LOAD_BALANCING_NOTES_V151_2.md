# ShuleAI v151.2 Load Balancing Patch Notes

This patch prepares the backend to run behind a platform load balancer such as Render, Nginx, Cloudflare, or a multi-instance Node deployment.

## What changed

### 1. Instance-aware health checks
Added fast liveness and readiness endpoints:

- `GET /health/live`
- `GET /api/health/live`
- `GET /health/ready`
- `GET /api/health/ready`

Readiness checks the database with `SELECT 1` and returns `503` while the process is shutting down or the database is unavailable. This lets a load balancer stop sending traffic to a bad instance.

### 2. Reverse-proxy support
Added `TRUST_PROXY=true` support. In production it defaults to enabled.

This protects rate limiting and client IP detection behind Render/Cloudflare/Nginx.

### 3. Instance identity
Each running process gets an `instanceId`. Health responses include it so you can confirm traffic is moving across multiple instances.

Optional debug header:

```env
EXPOSE_INSTANCE_HEADER=true
```

When enabled, responses include `X-ShuleAI-Instance`.

### 4. Safer HTTP server timeouts
Added environment-controlled server timeout settings:

```env
HTTP_REQUEST_TIMEOUT_MS=120000
HTTP_HEADERS_TIMEOUT_MS=65000
HTTP_KEEP_ALIVE_TIMEOUT_MS=61000
HTTP_MAX_REQUESTS_PER_SOCKET=0
GRACEFUL_SHUTDOWN_MS=25000
```

### 5. Graceful shutdown
Added `SIGTERM` / `SIGINT` draining so deploys and scaling events stop accepting new traffic, close WebSocket/HTTP connections, and close Sequelize cleanly.

### 6. WebSocket scaling warning
The backend already had `@socket.io/redis-adapter`. The server now warns in production when `REDIS_URL` is missing, because multi-instance WebSocket broadcasts require Redis.

### 7. Scheduled job switch
Added safe env switches for horizontal scaling:

```env
RUN_SCHEDULED_JOBS=true
DISABLE_SCHEDULED_JOBS=false
```

Default behavior remains unchanged: scheduled jobs still run. For multiple web instances, set scheduled jobs to run on only one service/instance, or move them to a separate worker.

## Recommended Render environment for multiple instances

Web service:

```env
NODE_ENV=production
TRUST_PROXY=true
REDIS_URL=<your Redis URL>
DB_POOL_MAX=5
RUN_SCHEDULED_JOBS=false
EXPOSE_INSTANCE_HEADER=false
```

Separate worker or one chosen scheduler service:

```env
NODE_ENV=production
RUN_SCHEDULED_JOBS=true
DB_POOL_MAX=3
```

## Important notes

- No analytics, dashboard, auth, student, teacher, parent, or payment routes were changed.
- This patch does not create a new external load balancer. It makes the app safe to run behind one.
- On Render, horizontal scaling is mostly handled by Render; the app only needs readiness, graceful shutdown, proxy awareness, Redis-backed Socket.IO, and safe DB pool settings.
