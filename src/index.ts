import { createClient, RedisClientOptions } from "redis";
import type { Request, Response, NextFunction } from "express";

export type Route = {
  method: string,
  route: string,
  cache?: { 
    expire?: number,
    type: 'always' | 'per-auth-token' | 'per-request-url',
  } | { 
    expire?: number,
    type: 'per-custom-cookie',
    customCookie?: string,
  },
}

type LogLevel = 'normal' | 'debug' | 'silent';
const DEFAULT_CACHE_TTL = 60;

let redis: ReturnType<typeof createClient> | null = null;
let currentLogLevel: LogLevel = 'normal';


export async function setupCache(redisClientOptions: RedisClientOptions, logLevel: LogLevel): Promise<ReturnType<typeof createClient>> {
  redis = createClient(redisClientOptions)
  currentLogLevel = logLevel;
  redis.on('connect', () => log('Connected to Redis'));
  redis.on('error', (err: Error) => log(`Redis client error:  ${err.message}`, 'error'));
  await redis.connect();
  return redis;
}

export async function stopCache(redis: ReturnType<typeof createClient>): Promise<void> {
  await redis.quit();
  if (currentLogLevel !== 'silent') {
    log('Redis connection closed');
  }
}

export function cache(route: Route): Function {
  if (route.cache) {
    return cacheMiddleware(route);
  } else {
    return (req: Request, res: Response, next: NextFunction) => next();
  }
}

function cacheMiddleware(route: Route): Function {
  if (!redis || !redis.isReady) {
    log('Redis client is not initialized. Please call setupCache first. Cache will not be applied and next function be called.', 'error');
    return (req: Request, res: Response, next: NextFunction) => next();
  }
  
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!redis || !redis.isReady) { return next(); }

    const cacheKey = generateCacheKey(route, req);
    if (!cacheKey) {
      log('Cache key generation failed. Cache will not be applied.', 'warn');
      return next();
    }

    const data = await redis.get(cacheKey);
    if (!data) {
      log(`Cache miss for key: ${cacheKey}`, 'debug');
      res.sendResponse = res.send;
      res.send = async (body: any) => {
        if (!redis || !redis.isReady) { return next(); }

        if (typeof body === 'object') {
          body = JSON.stringify(body);
        }

        await redis.set(cacheKey, body, { EX: route.cache?.expire || DEFAULT_CACHE_TTL });
        log(`Data cached for key: ${cacheKey}`, 'debug');
        res.sendResponse(body);
      };

      const originalJson = res.json.bind(res);
      res.json = async (body) => {
        if (!redis || !redis.isReady) { return next(); }
        await redis.set(cacheKey, JSON.stringify(body), { EX: route.cache?.expire || DEFAULT_CACHE_TTL });
        log(`JSON Data cached for key: ${cacheKey}`, 'debug');
        return originalJson(body);
      };
      next();
    } else {
      log(`Cache hit for key: ${cacheKey}`, 'debug');
      res.setHeader('X-Cache', 'HIT');
      if (data.startsWith('{') || data.startsWith('[')) {
        res.json(JSON.parse(data));
      } else {
        res.send(data);
      }
    }
  }
}

function generateCacheKey(route: Route, req: Request): string | false {
  const { method, route: routePath } = route;
  const url = req.originalUrl || req.url;
  
  switch (route.cache?.type) {
    case 'always':
      return `cache:${method}:${routePath}`;
    case 'per-auth-token':
      const authCookie = getAuthCookie(req);
      if (!authCookie) {
        log('No auth cookie found in request. Cache will not be applied. Please use per-custom-cookie and set your custom cookie name.', 'warn');
        return false
      }
      return `cache:${method}:${routePath}:${authCookie}`;
    case 'per-request-url':
      return `cache:${method}:${req.url}`;
    case 'per-custom-cookie':
      if (route.cache.customCookie) {
        const cookies = req.cookies || {};
        const customCookieValue = cookies[route.cache.customCookie] || '';
        if (!customCookieValue) {
          log(`Custom cookie "${route.cache.customCookie}" not found in request. Cache will not be applied.`, 'warn');
          return false;
        }
        return `cache:${method}:${routePath}:${customCookieValue}`;
      } else {
        log('Custom cookie is not defined for per-custom-cookie cache type.', 'error');
        return false;
      }
  }
  return false;
}

function getAuthCookie(req: Request): string | null {
  const commonAuthCookieNames = [
    'authToken',
    'accessToken',
    'refreshToken',
    'idToken',
    'jwt',
    'token',
    'sessionToken',
    'auth_token',
    'access_token',
    'refresh_token',
    'bearer_token'
  ];

  const commonAuthHeaderNames = [
    'Authorization',
    'X-Auth-Token',
    'X-Access-Token',
    'X-Refresh-Token',
    'X-ID-Token',
    'X-API-key',
    'Token',
    'Auth-Token',
  ];

  let authCookie = commonAuthCookieNames
    .map(name => req.cookies[name])
    .find(value => value !== undefined) || null;

  if (!authCookie) {
    authCookie = commonAuthHeaderNames
      .map(name => req.headers[name.toLowerCase()])
      .find(value => value !== undefined) || null;
  }

  return authCookie;
}

function log(message: string, level: 'log' | 'warn' | 'error' | 'debug' = 'log') {
  if (currentLogLevel === 'silent') return;
  if (level === 'debug' && currentLogLevel !== 'debug') return;

  console[level](`🗄️ [Cache] ${message}`);
}