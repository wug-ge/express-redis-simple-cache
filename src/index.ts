import { createClient, RedisClientOptions } from "redis";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { setLogLevel, log, LogLevel } from "./log";
import { generateCacheKey } from "./keyGenerator";

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

const DEFAULT_CACHE_TTL = 60;

let redis: ReturnType<typeof createClient> | null = null;

export async function setupCache(redisClientOptions: RedisClientOptions, logLevel: LogLevel): Promise<ReturnType<typeof createClient>> {
  redis = createClient(redisClientOptions)
  setLogLevel(logLevel);
  redis.on('connect', () => log('Connected to Redis'));
  redis.on('error', (err: Error) => log(`Redis client error:  ${err.message}`, 'error'));
  await redis.connect();
  return redis;
}

export async function stopCache(redis: ReturnType<typeof createClient>): Promise<void> {
  await redis.quit();
  log('Redis connection closed');
}

export function cache(route: Route): RequestHandler {
  if (route.cache) {
    return cacheMiddleware(route);
  } else {
    return (req: Request, res: Response, next: NextFunction) => next();
  }
}

function cacheMiddleware(route: Route): RequestHandler {
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
      const dataStr = data.toString();
      if (dataStr.startsWith('{') || dataStr.startsWith('[')) {
        res.json(JSON.parse(dataStr));
      } else {
        res.send(data);
      }
    }
  }
}
