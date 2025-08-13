import { setupCache, cache } from './index';

// A simple in-memory fake Redis client
const fakeRedis = {
  isReady: true,
  connect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  get: jest.fn(),
  set: jest.fn()
};

// Mock the redis module so that your middleware uses the fake client
jest.mock('redis', () => {
  return {
    createClient: jest.fn(() => fakeRedis)
  };
});

describe('express-redis-simple-cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('caches the response on a cache miss (type = "always")', async () => {
    // initialise the cache
    await setupCache({}, 'debug');

    // create middleware for a GET /users route with caching enabled
    const middleware = cache({
      method: 'GET',
      route: '/users',
      cache: { type: 'always', expire: 120 }
    }) as any;

    // simulate a cache miss
    fakeRedis.get.mockResolvedValueOnce(null);

    const req: any = {
      originalUrl: '/users',
      url: '/users',
      cookies: {},
      headers: {}
    };
    const res: any = {
      send: jest.fn(function (body) { return body; }),
      json: jest.fn(function (body) { return body; }),
      setHeader: jest.fn()
    };
    const next = jest.fn();

    // first call should hit Redis and then call next()
    await middleware(req, res, next);

    // simulate sending a response body, which should trigger caching
    await res.send('hello');

    // your middleware should call redis.set with the computed cache key and value
    expect(fakeRedis.set).toHaveBeenCalledWith(
      'cache:GET:/users',
      'hello',
      { EX: 120 }
    );

    // the next() callback should have been invoked once on cache miss
    expect(next).toHaveBeenCalled();
  });

  it('serves a cached response on a cache hit', async () => {
    await setupCache({}, 'debug');

    const middleware = cache({
      method: 'GET',
      route: '/users',
      cache: { type: 'always', expire: 60 }
    }) as any;

    // simulate a cache hit
    fakeRedis.get.mockResolvedValueOnce('cached-body');

    const req: any = {
      originalUrl: '/users',
      url: '/users',
      cookies: {},
      headers: {}
    };
    const res: any = {
      send: jest.fn(),
      json: jest.fn(),
      setHeader: jest.fn()
    };
    const next = jest.fn();

    await middleware(req, res, next);

    // should set the X‑Cache header
    expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'HIT');
    // should send the cached string
    expect(res.send).toHaveBeenCalledWith('cached-body');
    // next() should *not* be called on a cache hit
    expect(next).not.toHaveBeenCalled();
  });
});
