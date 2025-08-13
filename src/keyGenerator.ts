import type { Request, Response } from 'express';
import { Route } from '.';
import { log } from './log';

export function generateCacheKey(route: Route, req: Request): string | false {
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