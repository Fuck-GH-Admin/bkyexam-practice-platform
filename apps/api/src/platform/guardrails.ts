import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApiErrorResponseV1Schema } from '@bkyexam-practice/shared';

declare module 'fastify' {
  interface FastifyRequest {
    bkyRequestId: string;
  }
}

export interface RateLimitOptions {
  enabled: boolean;
  windowMs: number;
  max: number;
}

export interface CsrfOriginCheckOptions {
  enabled: boolean;
  allowedOrigins: readonly string[];
}

export interface BackendGuardrailOptions {
  requestIdHeader?: string;
  secureHeaders?: boolean;
  rateLimit?: RateLimitOptions;
  csrfOriginCheck?: CsrfOriginCheckOptions;
}

const defaultRequestIdHeader = 'x-request-id';
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export function registerBackendGuardrails(app: FastifyInstance, options: BackendGuardrailOptions = {}) {
  const requestIdHeader = (options.requestIdHeader ?? defaultRequestIdHeader).toLowerCase();
  const secureHeaders = options.secureHeaders ?? true;
  const buckets = new Map<string, RateLimitBucket>();

  app.addHook('onRequest', async (request, reply) => {
    const requestId = normalizeRequestId(request.headers[requestIdHeader]) ?? request.id;
    request.bkyRequestId = requestId;
    reply.header(requestIdHeader, requestId);

    if (secureHeaders) {
      setSecureHeaders(reply);
    }

    const csrfBlocked = checkCsrfOrigin(request, options.csrfOriginCheck);
    if (csrfBlocked) {
      return reply.status(403).send(ApiErrorResponseV1Schema.parse({
        error: 'CSRF origin check failed',
        requestId,
      }));
    }

    const rateLimit = options.rateLimit;
    if (rateLimit?.enabled) {
      const rateLimitResult = checkRateLimit(request, buckets, rateLimit);
      reply.header('x-ratelimit-limit', String(rateLimit.max));
      reply.header('x-ratelimit-remaining', String(rateLimitResult.remaining));
      reply.header('x-ratelimit-reset', String(Math.ceil(rateLimitResult.resetAt / 1000)));
      if (!rateLimitResult.allowed) {
        return reply.status(429).send(ApiErrorResponseV1Schema.parse({
          error: 'Rate limit exceeded',
          requestId,
        }));
      }
    }

    return undefined;
  });

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.bkyRequestId || request.id;
    const statusCode = normalizeErrorStatusCode(getErrorStatusCode(error));
    const message = statusCode >= 500 ? 'Internal Server Error' : getErrorMessage(error);
    if (statusCode >= 500) {
      request.log.error({ err: error, requestId }, 'request failed');
    }

    return reply.status(statusCode).send(ApiErrorResponseV1Schema.parse({
      error: message,
      requestId,
    }));
  });
}

function setSecureHeaders(reply: FastifyReply) {
  reply.header('x-content-type-options', 'nosniff');
  reply.header('x-frame-options', 'DENY');
  reply.header('referrer-policy', 'no-referrer');
  reply.header('cross-origin-resource-policy', 'same-site');
}

function normalizeRequestId(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(trimmed)) return null;
  return trimmed;
}

function checkRateLimit(
  request: FastifyRequest,
  buckets: Map<string, RateLimitBucket>,
  options: RateLimitOptions,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = `${request.ip}:${request.method}:${request.routeOptions?.url ?? request.url}`;
  const existing = buckets.get(key);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + options.windowMs }
    : existing;
  bucket.count += 1;
  buckets.set(key, bucket);

  return {
    allowed: bucket.count <= options.max,
    remaining: Math.max(options.max - bucket.count, 0),
    resetAt: bucket.resetAt,
  };
}

function checkCsrfOrigin(request: FastifyRequest, options: CsrfOriginCheckOptions | undefined): boolean {
  if (!options?.enabled) return false;
  if (!unsafeMethods.has(request.method)) return false;
  if (!hasSessionCookie(request)) return false;

  const origin = parseOriginHeader(request.headers.origin) ?? parseRefererOrigin(request.headers.referer);
  if (!origin) return true;
  return !options.allowedOrigins.includes(origin);
}

function hasSessionCookie(request: FastifyRequest): boolean {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return false;
  return /\b(?:bky_session|bky_admin_session)=/.test(cookieHeader);
}

function parseOriginHeader(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return normalizeOrigin(candidate);
}

function parseRefererOrigin(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return null;
  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

function normalizeOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function normalizeErrorStatusCode(statusCode: number | undefined): number {
  if (!statusCode || statusCode < 400 || statusCode > 599) return 500;
  return statusCode;
}

function getErrorStatusCode(error: unknown): number | undefined {
  return typeof error === 'object'
    && error !== null
    && 'statusCode' in error
    && typeof error.statusCode === 'number'
    ? error.statusCode
    : undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}
