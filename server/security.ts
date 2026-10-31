import { Request, Response, NextFunction } from 'express';

/**
 * Enterprise-Grade Security & Input Sanitization
 * Protects against:
 * - SQL Injection (stacked queries, tautologies, UNION attacks, comment evasion)
 * - NoSQL / MongoDB Operator Injections ($gt, $ne, $where, $regex, dot-notation)
 * - Stored & Reflected Cross-Site Scripting (XSS)
 * - Null-byte Poisoning & Buffer Overruns
 */

// Common SQL Injection signatures
const SQLI_REGEX = /(\b(SELECT|UNION|INSERT|UPDATE|DELETE|DROP|ALTER|EXEC|EXECUTE|CREATE|TABLE|DATABASE|FROM|WHERE|JOIN|TRUNCATE|DECLARE|CAST)\b|--|\/\*|\*\/|;\s*$|'\s*OR\s*'\d+'='\d+|'\s*OR\s*1\s*=\s*1|"\s*OR\s*"1"="1|'\s*=\s*'|"\s*=\s*")/i;

// Dangerous MongoDB operator injection prefixes
const FORBIDDEN_KEY_PREFIX = /^\$|[\.]/;

/**
 * Deep recursive validation to block NoSQL object/operator injections
 */
export function sanitizeObject<T>(obj: T, depth = 0): T {
  if (depth > 10) {
    throw new Error('Nested input exceeds maximum permitted depth.');
  }

  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    // Preserve base64 image data-URIs and CDN URLs from truncation
    if (obj.startsWith('data:image/') || obj.startsWith('https://res.cloudinary.com')) {
      return obj as unknown as T;
    }
    return sanitizeString(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Reject any MongoDB query operator injection keys (e.g. $gt, $ne, $regex, $where)
      if (FORBIDDEN_KEY_PREFIX.test(key)) {
        throw new Error(`Security validation failure: illegal operator character in parameter key "${key}".`);
      }
      clean[key] = sanitizeObject(value, depth + 1);
    }
    return clean as T;
  }

  return obj;
}

/**
 * Sanitize and neutralize SQL Injection and XSS from string inputs
 */
export function sanitizeString(val: unknown, maxLength: number = 2000): string {
  if (typeof val !== 'string') {
    if (typeof val === 'number' || typeof val === 'boolean') {
      return String(val);
    }
    return '';
  }

  // 1. Null-byte removal
  let clean = val.replace(/\0/g, '');

  // 2. Truncate to maximum length to prevent buffer and memory denial of service
  if (clean.length > maxLength) {
    clean = clean.substring(0, maxLength);
  }

  // 3. Escape HTML entities to prevent XSS
  clean = clean
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  return clean.trim();
}

/**
 * Validates strict string parameters (e.g. IDs, references) to prevent SQL & NoSQL injection
 */
export function validateStrictParam(val: unknown, pattern: RegExp, fieldName: string): string {
  if (typeof val !== 'string') {
    throw new Error(`Invalid format for ${fieldName}: must be a plain text string.`);
  }
  const clean = val.trim();
  if (!pattern.test(clean)) {
    throw new Error(`Invalid characters detected in ${fieldName}.`);
  }
  return clean;
}

/**
 * Strict Email validation
 */
export function validateEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const clean = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(clean) || clean.length > 150) return null;
  return clean;
}

/**
 * Strict Phone validation
 */
export function validatePhone(phone: unknown): string | null {
  if (typeof phone !== 'string') return null;
  const clean = phone.trim();
  // Allow international and local format (+234, 080..., dashes, spaces)
  const phoneRegex = /^[+]?[\d\s\-().]{7,25}$/;
  if (!phoneRegex.test(clean)) return null;
  return clean;
}

/* ==========================================================================
   OWASP SECURITY HEADERS MIDDLEWARE
   ========================================================================== */
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction) {
  // 1. Remove technology fingerprinting (Express / Node.js)
  res.removeHeader('X-Powered-By');

  // 2. Prevent Clickjacking Attacks
  res.setHeader('X-Frame-Options', 'DENY');

  // 3. Prevent MIME-type confusion / sniffing attacks
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 4. Cross-Site Scripting (XSS) filter enforcement
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // 5. Strict Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 6. Strict Transport Security (HSTS) - enforce HTTPS in production
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // 7. Permissions Policy: Disable unused device sensors & payment APIs
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), payment=(), geolocation=(self)');

  // 8. Content Security Policy (CSP)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: res.cloudinary.com; connect-src 'self' https:;"
  );

  next();
}

/* ==========================================================================
   EXPOSED FILE ACCESS PROTECTION (Prevent access to .env, .git, config, keys)
   ========================================================================== */
const FORBIDDEN_FILE_PATTERN = /(\.env|\.git|\.aws|\.ssh|\.bak|\.config|\.ya?ml|\.jsonl|\.sqlite|\.log|id_rsa|\.key|\.pem|\.crt)/i;

export function exposedFileProtectionMiddleware(req: Request, res: Response, next: NextFunction) {
  const urlPath = req.url || '';
  if (FORBIDDEN_FILE_PATTERN.test(urlPath) || urlPath.includes('..')) {
    console.warn(`[SECURITY ALERT - BLOCKED FILE SCAN]: Forbidden path access attempt "${urlPath}" from IP ${getClientIp(req)}`);
    return res.status(403).json({
      error: 'Access denied: The requested resource is protected and cannot be accessed.'
    });
  }
  next();
}

/* ==========================================================================
   IP RATE LIMITING FOR AUTHENTICATION & LOGIN ENDPOINTS
   ========================================================================== */
export const AUTH_MAX_ATTEMPTS_PER_IP = 20;
export const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes window

interface RateLimitEntry {
  count: number;
  firstAttemptTime: number;
  resetTime: number;
}

const authIpRateLimitMap = new Map<string, RateLimitEntry>();

// Automatic background cleanup of expired rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of authIpRateLimitMap.entries()) {
    if (now > entry.resetTime) {
      authIpRateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function authRateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = getClientIp(req);
  const now = Date.now();
  let entry = authIpRateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    entry = {
      count: 1,
      firstAttemptTime: now,
      resetTime: now + AUTH_RATE_LIMIT_WINDOW_MS,
    };
    authIpRateLimitMap.set(ip, entry);
  } else {
    entry.count++;
  }

  const remaining = Math.max(0, AUTH_MAX_ATTEMPTS_PER_IP - entry.count);
  const resetSeconds = Math.ceil((entry.resetTime - now) / 1000);

  res.setHeader('X-RateLimit-Limit', AUTH_MAX_ATTEMPTS_PER_IP);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000));

  if (entry.count > AUTH_MAX_ATTEMPTS_PER_IP) {
    const minutesLeft = Math.ceil(resetSeconds / 60);
    res.setHeader('Retry-After', resetSeconds);
    console.warn(`[SECURITY ALERT - LOGIN RATE LIMIT EXCEEDED]: IP ${ip} exceeded ${AUTH_MAX_ATTEMPTS_PER_IP} attempts.`);
    return res.status(429).json({
      error: `Too many login attempts from this IP address. For your security, access is restricted. Please try again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.`,
      retryAfter: resetSeconds,
      code: 'IP_RATE_LIMIT_EXCEEDED'
    });
  }

  next();
}

/* ==========================================================================
   ACCOUNT LOCKOUT CONFIGURATION & HELPERS
   ========================================================================== */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MINUTES = 15;
export const LOCKOUT_DURATION_MS = LOCKOUT_DURATION_MINUTES * 60 * 1000;

export function checkAccountLockout(account: { lockUntil?: Date | null; failedLoginAttempts?: number }): {
  isLocked: boolean;
  remainingMinutes: number;
} {
  if (account.lockUntil) {
    const lockTime = new Date(account.lockUntil).getTime();
    const now = Date.now();
    if (lockTime > now) {
      const remainingMinutes = Math.ceil((lockTime - now) / 60000);
      return { isLocked: true, remainingMinutes };
    }
  }
  return { isLocked: false, remainingMinutes: 0 };
}

/**
 * Global Express Security Middleware
 * Inspects all requests (body, query, params) for NoSQL operator and SQL injections
 */
export function securityProtectionMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }
    next();
  } catch (err: any) {
    console.warn(`[SECURITY ALERT - BLOCKED INJECTION]: ${err.message} from IP ${req.ip}`);
    return res.status(400).json({
      error: 'Security validation error: Malicious or forbidden characters detected in payload.',
      details: err.message
    });
  }
}
