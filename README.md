# express-redis-simple-cache

[![npm version](https://img.shields.io/npm/v/express-redis-simple-cache.svg)](https://www.npmjs.com/package/express-redis-simple-cache)

A simple and effective Redis-based caching middleware for Express.js APIs.

This package provides a drop-in caching layer for your Express applications. It uses a Redis client under the hood to store and serve HTTP responses, helping you improve performance and reduce load on upstream APIs or databases. The design is intentionally minimal: you can enable caching on a per-route basis, decide when cached content expires, and choose how cache keys are generated.

## Features

- **Simple integration** – Wrap your Express routes with a single `cache()` middleware to enable caching on that route.
- **Customizable TTL** – Specify how many seconds a response should remain cached; defaults to 60 seconds if omitted.
- **Flexible key generation** – Cache keys can be constant (`always`), depend on the authenticated user (`per-auth-token`), depend on the full request URL (`per-request-url`), or depend on a custom cookie (`per-custom-cookie`). This makes it easy to cache shared resources or personalized content correctly.
- **Works with JSON and text responses** – Responses are cached transparently. When there is a cache hit, the middleware adds an `X-Cache: HIT` header and returns the cached body.
- **Logging control** – Choose between normal, debug, or silent logging to suit your environment.

## Installation

Install the package and its peer dependency `redis` from npm. You’ll also need to have a Redis server running (local or remote).

```bash
npm install express-redis-simple-cache redis
```

## Getting Started

The middleware exposes three functions:

| Function                        | Purpose                                                                                                                                                                                                 |
|---------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `setupCache(redisClientOptions, logLevel)` | Initializes a Redis client using the provided options (host, port, password, etc.) and sets the log level. It must be called once at application startup before using the cache middleware.       |
| `cache(route: Route)`           | Returns an Express middleware that applies caching based on the Route configuration. If no cache configuration is provided, it acts as a pass-through and simply calls `next()`.                        |
| `stopCache(redisClient)`        | Closes the Redis connection. Call this when shutting down your server gracefully to free resources.                                                                 |

### Route Configuration

A `Route` object declares the HTTP method, the route path, and an optional cache configuration:

```typescript
type Route = {
  method: string;
  route: string;
  cache?: {
    expire?: number; // TTL in seconds (defaults to 60)
    type: 'always' | 'per-auth-token' | 'per-request-url';
  } | {
    expire?: number;
    type: 'per-custom-cookie';
    customCookie?: string; // name of your custom cookie
  };
};
```

- **`expire`** – Optional number of seconds before the cached value is evicted. Defaults to 60 seconds if omitted.
- **`type`** – Controls how the cache key is created:
  - `always` – Uses the method and route only (e.g., `cache:GET:/users`), so all clients share the same cached content.
  - `per-auth-token` – Includes a cookie or authorization header value in the key; if no auth token is found, the cache is bypassed.
  - `per-request-url` – Uses the full request URL; useful when query parameters affect the response.
  - `per-custom-cookie` – Includes the value of a specific cookie in the key. If the cookie is missing, caching is skipped.

## Example Usage in Express

Below is a complete example illustrating how to use `express-redis-simple-cache` in a basic Express server:

```javascript
import express from 'express';
import { setupCache, cache, stopCache } from 'express-redis-simple-cache';

async function startServer() {
  const redisClient = await setupCache({
    url: 'redis://localhost:6379',
  }, 'normal');

  const app = express();

  app.get('/users', cache({
    method: 'GET',
    route: '/users',
    cache: { expire: 300, type: 'always' },
  }), async (req, res) => {
    const users = await fetchUsersFromDatabase();
    res.json(users);
  });

  app.get('/profile', cache({
    method: 'GET',
    route: '/profile',
    cache: { expire: 120, type: 'per-auth-token' },
  }), async (req, res) => {
    const profile = await getCurrentUserProfile(req);
    res.json(profile);
  });

  app.get('/search', cache({
    method: 'GET',
    route: '/search',
    cache: { expire: 60, type: 'per-request-url' },
  }), async (req, res) => {
    const results = await searchProducts(req.query.q);
    res.json(results);
  });

  app.get('/cart', cache({
    method: 'GET',
    route: '/cart',
    cache: { expire: 600, type: 'per-custom-cookie', customCookie: 'cartId' },
  }), async (req, res) => {
    const cart = await fetchCart(req.cookies.cartId);
    res.json(cart);
  });

  const server = app.listen(3000, () => {
    console.log('Server listening on port 3000');
  });

  process.on('SIGINT', async () => {
    await stopCache(redisClient);
    server.close(() => process.exit(0));
  });
}

startServer().catch((err) => {
  console.error(err);
});

async function fetchUsersFromDatabase() {
  return [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ];
}

async function getCurrentUserProfile(req) {
  return { id: 1, name: 'Alice', email: 'alice@example.com' };
}

async function searchProducts(q) {
  return [];
}

async function fetchCart(cartId) {
  return { items: [] };
}
```

## Tips and Best Practices

- Call `setupCache` once at application start and reuse the returned client. If `setupCache` isn’t called or if the Redis client isn’t ready, the middleware logs an error and bypasses caching.
- To clear the cache manually (e.g., after data changes), use the `redisClient` returned by `setupCache()` to call `del` on specific keys or `flushall()` to clear everything.
- Use `type: 'per-request-url'` for endpoints where query parameters affect the response (e.g., search endpoints) so that each unique URL is cached separately.
- Choose an appropriate `expire` time. Shorter TTLs keep data fresh but may increase load on your backend; longer TTLs provide better performance but may return slightly stale data.
- Use the `debug` log level during development to trace cache hits and misses.

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
