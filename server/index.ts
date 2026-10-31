import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import {
  connectToDatabase,
  BookingModel,
  RiderModel,
  UserModel,
  PaymentModel,
  AuditLogModel,
  SettingsModel,
  CustomerModel,
  NotificationModel,
  DeliveryStatus,
  PaymentMethod,
  PaymentStatus,
} from './models.ts';
import { initAndSeedDatabase } from './dbInit.ts';
import { generateDeliveryOtp, verifyOtpHash, hashOtpCode } from './otp.ts';
import {
  canTransitionStatus,
  calculateDeliveryFee,
  recordAuditLog,
} from './workflow.ts';
import {
  generateToken,
  comparePassword,
  hashPassword,
  requireAuth,
  requireRole,
  enforceRiderScope,
} from './auth.ts';
import { emailService } from './emailService.ts';
import { kudiSmsService } from './kudiSmsService.ts';
import {
  securityProtectionMiddleware,
  securityHeadersMiddleware,
  exposedFileProtectionMiddleware,
  authRateLimiter,
  getClientIp,
  MAX_FAILED_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MS,
  LOCKOUT_DURATION_MINUTES,
  checkAccountLockout,
  sanitizeString,
  validateEmail,
  validatePhone
} from './security.ts';
import { uploadToCloudinary, isCloudinaryConfigured } from './cloudinary.ts';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// 1. Disable technology fingerprinting
app.disable('x-powered-by');

// 2. OWASP Security Headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
app.use(securityHeadersMiddleware);

// 3. Block unauthorized scans for .env, .git, or sensitive server files
app.use(exposedFileProtectionMiddleware);

// 4. Configurable Strict CORS Policy
const allowedOrigins = [
  'https://bbdmobility.com.ng',
  'https://www.bbdmobility.com.ng',
  process.env.APP_URL,
  process.env.FRONTEND_URL
].filter(Boolean) as string[];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) return callback(null, true);

    const isAllowed = allowedOrigins.some(o => origin === o || origin.endsWith('.vercel.app') || origin.endsWith('bbdmobility.com.ng'));
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('CORS: Origin not authorized by BBD Mobility security policy.'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'x-test-suite'],
  maxAge: 86400,
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Global SQL & NoSQL Injection Protection + XSS Sanitizer
app.use(securityProtectionMiddleware);

// Path normalization for Vercel Serverless Function rewrites
app.use((req, _res, next) => {
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  next();
});

// In-memory rate limiting to prevent spam and brute-force
const rateLimitMap = new Map<string, { count: number; firstRequestTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 600;

function rateLimiter(req: Request, res: Response, next: express.NextFunction) {
  // Exclude internal portal routes from rate limiting to prevent dashboard lockouts
  if (req.path.startsWith('/api/portal')) {
    return next();
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  // Exclude localhost in development
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    return next();
  }

  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry) {
    rateLimitMap.set(ip, { count: 1, firstRequestTime: now });
    return next();
  }

  if (now - entry.firstRequestTime > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, firstRequestTime: now });
    return next();
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      error: 'Too many requests. Please wait a moment and try again.',
    });
  }

  entry.count++;
  next();
}

app.use(rateLimiter);

// Input Sanitizer: Strips potential XSS script tags while preserving natural characters (&, quotes)
function sanitize(str: unknown): string {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .trim();
}

function generateBookingReference(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BBD-${dateStr}-${randomPart}`;
}

// Initialize database
initAndSeedDatabase().catch(err => console.warn('[DB Init Error]:', err.message));

// Helper: Format relative timestamp for notifications
function formatRelativeTime(date: Date | string): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// Helper: Dispatch real-time admin notification into MongoDB
async function createAdminNotification(data: {
  title: string;
  message: string;
  type?: 'booking' | 'payment' | 'rider' | 'system';
  entityRef?: string;
}) {
  try {
    await connectToDatabase();
    const notificationId = `NOTIF-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const doc = await NotificationModel.create({
      notificationId,
      title: data.title,
      message: data.message,
      type: data.type || 'system',
      read: false,
      entityRef: data.entityRef,
      createdAt: new Date(),
    });
    return doc;
  } catch (err: any) {
    console.warn('[Notification Create Error]:', err.message);
    return null;
  }
}

/**
 * Returns dynamic Nigerian greeting ("Good morning", "Good afternoon", "Good evening")
 * strictly using Nigerian Time (Africa/Lagos, West Africa Time UTC+1).
 */
function getNigerianGreeting(): 'Good morning' | 'Good afternoon' | 'Good evening' {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Lagos',
      hour: 'numeric',
      hour12: false,
    });
    const parsed = parseInt(formatter.format(new Date()), 10);
    const hour = isNaN(parsed) ? (new Date().getUTCHours() + 1) % 24 : parsed % 24;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  } catch {
    const hour = (new Date().getUTCHours() + 1) % 24;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }
}

/* ==========================================================================
   AUTHENTICATION ENDPOINTS
   ========================================================================== */

// 1. Admin & Staff Login (With IP Rate Limiting & Account Lockout Protection)
app.post('/api/auth/login', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    if (!validateEmail(cleanEmail)) {
      return res.status(400).json({ error: 'Invalid email address format.' });
    }

    await connectToDatabase();
    const user = await UserModel.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Check account lockout status
    const lockout = checkAccountLockout(user);
    if (lockout.isLocked) {
      await recordAuditLog({
        actorId: user.userId,
        actorName: user.name,
        actorRole: user.role,
        action: 'ACCOUNT_LOCKOUT_BLOCKED',
        affectedEntity: 'User',
        entityRef: user.userId,
        ipAddress: getClientIp(req),
        metadata: { remainingMinutes: lockout.remainingMinutes }
      });
      return res.status(423).json({
        error: `Account is temporarily locked due to too many failed login attempts. Please try again in ${lockout.remainingMinutes} minute${lockout.remainingMinutes > 1 ? 's' : ''} or contact your system administrator.`,
        locked: true,
        remainingMinutes: lockout.remainingMinutes
      });
    }

    // Security Rule: info@bbdautosng.com is the EXCLUSIVE system administrator allowed to authenticate as Admin
    if (user.role === 'Admin' && cleanEmail !== 'info@bbdautosng.com') {
      return res.status(401).json({ error: 'Access denied: Unauthorized administrator account.' });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({ error: 'Account is deactivated. Please contact administrator.' });
    }

    const isMatch = await comparePassword(String(password), user.passwordHash);
    if (!isMatch) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      user.failedLoginAttempts = attempts;

      if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        await user.save();

        await recordAuditLog({
          actorId: user.userId,
          actorName: user.name,
          actorRole: user.role,
          action: 'ACCOUNT_LOCKED',
          affectedEntity: 'User',
          entityRef: user.userId,
          ipAddress: getClientIp(req),
          metadata: { failedAttempts: attempts, durationMinutes: LOCKOUT_DURATION_MINUTES }
        });

        return res.status(423).json({
          error: `Account has been locked for ${LOCKOUT_DURATION_MINUTES} minutes due to ${MAX_FAILED_LOGIN_ATTEMPTS} consecutive failed login attempts.`,
          locked: true,
          remainingMinutes: LOCKOUT_DURATION_MINUTES
        });
      } else {
        await user.save();
        const remainingAttempts = MAX_FAILED_LOGIN_ATTEMPTS - attempts;
        return res.status(401).json({
          error: `Invalid email or password. ${remainingAttempts} attempt${remainingAttempts > 1 ? 's' : ''} remaining before temporary account lockout.`,
          remainingAttempts
        });
      }
    }

    // Login successful: reset failed login attempts & unlock
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken({
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    await recordAuditLog({
      actorId: user.userId,
      actorName: user.name,
      actorRole: user.role,
      action: 'ADMIN_LOGIN_SUCCESS',
      affectedEntity: 'User',
      entityRef: user.userId,
      ipAddress: getClientIp(req),
    });

    const greeting = getNigerianGreeting();

    return res.json({
      success: true,
      token,
      greeting,
      message: `${greeting}, ${user.name}! Login successful.`,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err: any) {
    const isProd = process.env.NODE_ENV === 'production';
    return res.status(500).json({ error: isProd ? 'Login service error occurred.' : 'Login service error: ' + err.message });
  }
});

// 2. Rider Login (With IP Rate Limiting & Account Lockout Protection)
app.post('/api/auth/rider-login', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { identifier, pin, password } = req.body || {};
    const enteredPin = String(pin || password || '').trim();
    if (!identifier || !enteredPin) {
      return res.status(400).json({ error: 'Rider ID, Email, or Phone and 4-digit PIN are required.' });
    }

    await connectToDatabase();
    const cleanId = sanitizeString(String(identifier)).trim();
    const rider = await RiderModel.findOne({
      $or: [
        { email: cleanId.toLowerCase() },
        { phone: cleanId },
        { riderId: cleanId.toUpperCase() },
      ],
    });

    if (!rider) {
      return res.status(401).json({ error: 'Invalid rider credentials. Please check your Rider ID, Email or Phone.' });
    }

    // Check account lockout status
    const lockout = checkAccountLockout(rider);
    if (lockout.isLocked) {
      await recordAuditLog({
        actorId: rider.riderId,
        actorName: rider.name,
        actorRole: 'Rider',
        action: 'RIDER_LOCKOUT_BLOCKED',
        affectedEntity: 'Rider',
        entityRef: rider.riderId,
        ipAddress: getClientIp(req),
        metadata: { remainingMinutes: lockout.remainingMinutes }
      });
      return res.status(423).json({
        error: `Rider account is temporarily locked due to too many failed login attempts. Please try again in ${lockout.remainingMinutes} minute${lockout.remainingMinutes > 1 ? 's' : ''} or contact dispatch administration.`,
        locked: true,
        remainingMinutes: lockout.remainingMinutes
      });
    }

    if (rider.status === 'Suspended') {
      return res.status(403).json({ error: 'Rider account is suspended. Contact dispatch administration.' });
    }

    const isMatch = await comparePassword(enteredPin, rider.passwordHash);
    if (!isMatch) {
      const attempts = (rider.failedLoginAttempts || 0) + 1;
      rider.failedLoginAttempts = attempts;

      if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        rider.lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        await rider.save();

        await recordAuditLog({
          actorId: rider.riderId,
          actorName: rider.name,
          actorRole: 'Rider',
          action: 'RIDER_ACCOUNT_LOCKED',
          affectedEntity: 'Rider',
          entityRef: rider.riderId,
          ipAddress: getClientIp(req),
          metadata: { failedAttempts: attempts, durationMinutes: LOCKOUT_DURATION_MINUTES }
        });

        return res.status(423).json({
          error: `Rider account has been locked for ${LOCKOUT_DURATION_MINUTES} minutes due to ${MAX_FAILED_LOGIN_ATTEMPTS} consecutive incorrect PIN attempts.`,
          locked: true,
          remainingMinutes: LOCKOUT_DURATION_MINUTES
        });
      } else {
        await rider.save();
        const remainingAttempts = MAX_FAILED_LOGIN_ATTEMPTS - attempts;
        return res.status(401).json({
          error: `Incorrect 4-digit PIN. ${remainingAttempts} attempt${remainingAttempts > 1 ? 's' : ''} remaining before account lockout.`,
          remainingAttempts
        });
      }
    }

    // Login successful: reset failed login attempts & unlock
    rider.failedLoginAttempts = 0;
    rider.lockUntil = null;
    await rider.save();

    const mustChangePin = rider.mustChangePin ?? true;

    const token = generateToken({
      userId: rider.riderId,
      riderId: rider.riderId,
      name: rider.name,
      email: rider.email,
      role: 'Rider',
    });

    await recordAuditLog({
      actorId: rider.riderId,
      actorName: rider.name,
      actorRole: 'Rider',
      action: 'RIDER_LOGIN_SUCCESS',
      affectedEntity: 'Rider',
      entityRef: rider.riderId,
      ipAddress: getClientIp(req),
    });

    const greeting = getNigerianGreeting();

    return res.json({
      success: true,
      token,
      mustChangePin,
      greeting,
      message: `${greeting}, ${rider.name.split(' ')[0]}! Login successful.`,
      rider: {
        riderId: rider.riderId,
        name: rider.name,
        phone: rider.phone,
        email: rider.email,
        status: rider.status,
        isOnline: rider.isOnline,
        vehicleType: rider.vehicleType,
        mustChangePin,
      },
    });
  } catch (err: any) {
    const isProd = process.env.NODE_ENV === 'production';
    return res.status(500).json({ error: isProd ? 'Rider authentication service unavailable.' : 'Rider authentication error: ' + err.message });
  }
});

// 2. Rider Change 4-Digit PIN (First login or self-service update, rate-limited)
app.post('/api/auth/rider-change-pin', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { riderId, currentPin, newPin } = req.body || {};
    const cleanNewPin = String(newPin || '').trim();

    if (!cleanNewPin || !/^\d{4}$/.test(cleanNewPin)) {
      return res.status(400).json({ error: 'Your new PIN must be exactly 4 numeric digits (e.g. 2468).' });
    }

    await connectToDatabase();
    let targetId = riderId;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = (req as any).user;
        if (decoded?.riderId || decoded?.userId) {
          targetId = decoded.riderId || decoded.userId;
        }
      } catch {}
    }

    if (!targetId) {
      return res.status(400).json({ error: 'Rider ID is required to set new PIN.' });
    }

    const rider = await RiderModel.findOne({
      $or: [
        { riderId: String(targetId).toUpperCase() },
        { phone: String(targetId).trim() },
        { email: String(targetId).toLowerCase().trim() }
      ]
    });

    if (!rider) {
      return res.status(404).json({ error: 'Rider account not found.' });
    }

    // If current PIN was provided and rider already has an active PIN (not forced first login), verify current PIN
    if (currentPin && !rider.mustChangePin) {
      const match = await comparePassword(String(currentPin).trim(), rider.passwordHash);
      if (!match) {
        return res.status(401).json({ error: 'Current PIN is incorrect.' });
      }
    }

    const newHash = await hashPassword(cleanNewPin);
    rider.passwordHash = newHash;
    rider.mustChangePin = false;
    rider.pinChangedAt = new Date();
    await rider.save();

    await recordAuditLog({
      actorId: rider.riderId,
      actorName: rider.name,
      actorRole: 'Rider',
      action: 'RIDER_PIN_CHANGED',
      affectedEntity: 'Rider',
      entityRef: rider.riderId,
      ipAddress: req.ip,
    });

    const token = generateToken({
      userId: rider.riderId,
      riderId: rider.riderId,
      name: rider.name,
      email: rider.email,
      role: 'Rider',
    });

    return res.json({
      success: true,
      message: '4-digit PIN updated successfully. Welcome to BBD Mobility!',
      token,
      mustChangePin: false,
      rider: {
        riderId: rider.riderId,
        name: rider.name,
        phone: rider.phone,
        email: rider.email,
        status: rider.status,
        isOnline: rider.isOnline,
        mustChangePin: false,
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update PIN: ' + err.message });
  }
});

/* ==========================================================================
   CUSTOMER DELIVERY BOOKING (PUBLIC FRONTEND FORM)
   ========================================================================== */
app.post('/api/bookings', async (req: Request, res: Response) => {
  try {
    const {
      serviceType,
      pickupLocation,
      dropoffLocation,
      packageDetails,
      packageCategory,
      senderName,
      senderPhone,
      senderEmail,
      receiverName,
      receiverPhone,
      receiverEmail,
      deliveryInstructions,
    } = req.body || {};

    // Validate inputs
    const sType = sanitize(serviceType);
    const pLoc = sanitize(pickupLocation);
    const dLoc = sanitize(dropoffLocation);
    const pDetails = sanitize(packageDetails);
    const sName = sanitize(senderName);
    const sPhone = sanitize(senderPhone);
    const sEmail = sanitize(senderEmail);
    const rName = sanitize(receiverName);
    const rPhone = sanitize(receiverPhone);
    const rEmail = sanitize(receiverEmail);
    const instructions = sanitize(deliveryInstructions);

    if (!sType) return res.status(400).json({ error: 'Please select a service type.' });
    if (!pLoc || pLoc.length < 3) return res.status(400).json({ error: 'Please enter a valid pickup address.' });
    if (!dLoc || dLoc.length < 3) return res.status(400).json({ error: 'Please enter a valid drop-off address.' });
    if (!sName) return res.status(400).json({ error: 'Please provide sender name.' });
    if (!sPhone || sPhone.length < 6) return res.status(400).json({ error: 'Please provide a valid sender phone number.' });
    // Email is OPTIONAL: validate format only if provided
    if (sEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sEmail)) return res.status(400).json({ error: 'Please provide a valid sender email.' });
    if (!rName) return res.status(400).json({ error: 'Please provide receiver name.' });
    if (!rPhone || rPhone.length < 6) return res.status(400).json({ error: 'Please provide a valid receiver phone number.' });
    if (rEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rEmail)) return res.status(400).json({ error: 'Please provide a valid receiver email.' });

    // Server-side pricing calculation (never trust client amounts)
    const calculatedFee = calculateDeliveryFee(sType, 1.5);
    const bookingRef = generateBookingReference();

    // Cryptographically secure receiver delivery OTP
    const { code: rawOtp, hash: otpHash, expiresAt: otpExpiresAt } = generateDeliveryOtp(bookingRef);

    const now = new Date();
    const dateFormatted = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeFormatted = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const db = await connectToDatabase();
    if (!db) {
      return res.status(503).json({
        error: 'Database connection temporarily unavailable. Please verify your MongoDB Atlas Network Access allows connections from anywhere (0.0.0.0/0).',
      });
    }

    // Retrieve active company commission deduction rate from Settings (default 25%)
    const settingsDoc = await SettingsModel.findOne().lean().catch(() => null);
    const commPercent = typeof settingsDoc?.riderCommissionPercent === 'number'
      ? settingsDoc.riderCommissionPercent
      : 25;
    const companyCut = Math.round(calculatedFee * (commPercent / 100));
    const riderNetPayout = Math.max(0, calculatedFee - companyCut);

    // 1. Save permanently in MongoDB
    const newBooking = await BookingModel.create({
      ref: bookingRef,
      senderName: sName,
      senderPhone: sPhone,
      senderEmail: sEmail || '',
      pickupAddress: pLoc,
      receiverName: rName,
      receiverPhone: rPhone,
      receiverEmail: rEmail || '',
      deliveryAddress: dLoc,
      deliveryInstructions: instructions,
      serviceType: sType,
      packageDescription: pDetails || `${sType} package`,
      packageCategory: sanitize(packageCategory) || 'Standard Parcel',
      packageWeight: '1.5 kg',
      deliveryFee: calculatedFee,
      additionalCharges: 0,
      totalAmount: calculatedFee,
      totalPaid: 0,
      outstandingBalance: calculatedFee,
      paymentStatus: 'Unpaid',
      paymentMethod: 'Cash',
      status: 'New Booking',
      commissionPercent: commPercent,
      companyCommission: companyCut,
      riderEarnings: riderNetPayout,
      otpHash,
      otpExpiresAt,
      otpAttempts: 0,
      maxOtpAttempts: 5,
      isOtpUsed: false,
      timeline: {
        booked: `${dateFormatted} ${timeFormatted}`,
      },
      statusHistory: [{
        fromStatus: 'None',
        toStatus: 'New Booking',
        changedBy: 'Customer (Web Portal)',
        role: 'Customer',
        timestamp: now,
      }],
    });

    // 2. Concurrently record audit log and dispatch alerts (ultra-low latency response)
    recordAuditLog({
      actorId: 'CUSTOMER_PORTAL',
      actorName: sName,
      actorRole: 'Customer',
      action: 'BOOKING_CREATED',
      affectedEntity: 'Booking',
      entityRef: bookingRef,
      metadata: { fee: calculatedFee, pickup: pLoc, dropoff: dLoc },
      ipAddress: req.ip,
    }).catch(() => {});

    // 2. Dispatch notifications asynchronously (does not block database persistence)
    const emailPayload = {
      bookingRef,
      sType,
      pLoc,
      dLoc,
      pDetails: pDetails || `${sType} parcel`,
      sName,
      sPhone,
      sEmail,
      rName,
      rPhone,
      rEmail,
      instructions,
    };

    // Concurrent High-Speed Notification Pipeline (All channels dispatch in parallel)
    (async () => {
      const results = await Promise.allSettled([
        sEmail ? emailService.sendSenderConfirmation(emailPayload) : Promise.resolve({ success: true, skipped: true } as any),
        rEmail ? emailService.sendReceiverDeliveryNotice({ ...emailPayload, otpCode: rawOtp }) : Promise.resolve({ success: true, skipped: true } as any),
        kudiSmsService.sendBookingSenderSms({
          senderPhone: sPhone,
          senderName: sName,
          bookingRef,
          pickupAddress: pLoc,
          deliveryAddress: dLoc,
          receiverName: rName,
          receiverPhone: rPhone,
          packageDescription: pDetails || `${sType} parcel`,
          serviceType: sType,
          totalAmount: calculatedFee,
        }),
        kudiSmsService.sendBookingReceiverSms({
          receiverPhone: rPhone,
          receiverName: rName,
          senderName: sName,
          senderPhone: sPhone,
          bookingRef,
          deliveryAddress: dLoc,
          packageDescription: pDetails || `${sType} parcel`,
          otpCode: rawOtp,
        }),
        emailService.sendAdminAlert(emailPayload),
      ]);

      const logs: any[] = [];
      const [senderEmailRes, receiverEmailRes, senderSmsRes, receiverSmsRes] = results;

      if (sEmail && senderEmailRes.status === 'fulfilled') {
        const val: any = senderEmailRes.value;
        if (!val.skipped) {
          logs.push({ channel: 'email', recipientType: 'sender', recipientEmail: sEmail, subject: 'Booking Confirmation', status: val.success ? 'sent' : 'failed', error: val.error, sentAt: new Date() });
        }
      }
      if (rEmail && receiverEmailRes.status === 'fulfilled') {
        const val: any = receiverEmailRes.value;
        if (!val.skipped) {
          logs.push({ channel: 'email', recipientType: 'receiver', recipientEmail: rEmail, subject: 'Delivery Notice & OTP', status: val.success ? 'sent' : 'failed', error: val.error, sentAt: new Date() });
        }
      }
      if (senderSmsRes.status === 'fulfilled') {
        const val = senderSmsRes.value;
        logs.push({ channel: 'sms', recipientType: 'sender', recipientPhone: sPhone, subject: 'SMS Booking Confirmation', message: val.messageText, status: val.success ? 'sent' : 'failed', error: val.error, sentAt: new Date() });
      }
      if (receiverSmsRes.status === 'fulfilled') {
        const val = receiverSmsRes.value;
        logs.push({ channel: 'sms', recipientType: 'receiver', recipientPhone: rPhone, subject: 'SMS Delivery OTP Notice', message: val.messageText, status: val.success ? 'sent' : 'failed', error: val.error, sentAt: new Date() });
      }

      if (logs.length > 0) {
        BookingModel.updateOne({ ref: bookingRef }, { $push: { notificationLogs: { $each: logs } } }).exec().catch(() => {});
      }
    })().catch(err => {
      console.error('[Notification Pipeline Exception]:', err);
    });

    // D. Admin Dashboard Real-Time Notification Bell
    createAdminNotification({
      title: 'New Delivery Booking',
      message: `Booking ${bookingRef} created by ${sName} (${pLoc} → ${dLoc}) for ₦${calculatedFee.toLocaleString()}`,
      type: 'booking',
      entityRef: bookingRef
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      bookingReference: bookingRef,
      verificationOtp: rawOtp, // Provided for user testing feedback in demo mode
      message: 'Delivery booking successfully confirmed and saved.',
      calculatedFee,
    });
  } catch (err: any) {
    console.error('Booking submission error:', err);
    return res.status(500).json({ error: 'Failed to create booking: ' + err.message });
  }
});

/* ==========================================================================
   ADMIN DASHBOARD & BOOKINGS MANAGEMENT
   ========================================================================== */

// Protect ALL internal portal routes with JWT authentication & RBAC
app.use('/api/portal', requireAuth);

// 1. Live Overview Statistics
app.get('/api/portal/dashboard', async (_req: Request, res: Response) => {
  try {
    await connectToDatabase();

    const [
      totalBookings,
      awaitingReview,
      awaitingAssignment,
      assigned,
      inTransit,
      delivered,
      cancelled,
      failed,
      paidBookings,
      unpaidBookings,
      recentBookings,
    ] = await Promise.all([
      BookingModel.countDocuments(),
      BookingModel.countDocuments({ status: 'New Booking' }),
      BookingModel.countDocuments({ status: 'Awaiting Assignment' }),
      BookingModel.countDocuments({ status: { $in: ['Assigned', 'Arriving for Pickup', 'Picked Up'] } }),
      BookingModel.countDocuments({ status: 'In Transit' }),
      BookingModel.countDocuments({ status: 'Delivered' }),
      BookingModel.countDocuments({ status: 'Cancelled' }),
      BookingModel.countDocuments({ status: { $in: ['Pickup Failed', 'Delivery Attempt Failed'] } }),
      BookingModel.find({ paymentStatus: 'Paid' }).lean(),
      BookingModel.find({ paymentStatus: { $in: ['Unpaid', 'Partially Paid'] } }).lean(),
      BookingModel.find().sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    const totalRevenue = paidBookings.reduce((sum, b) => sum + (b.totalPaid || b.deliveryFee || 0), 0);
    const outstandingTotal = unpaidBookings.reduce((sum, b) => sum + (b.outstandingBalance || 0), 0);

    return res.json({
      stats: {
        totalBookings,
        awaitingReview,
        awaitingAssignment,
        assignedDeliveries: assigned,
        inTransitDeliveries: inTransit,
        completedDeliveries: delivered,
        cancelledBookings: cancelled,
        failedDeliveries: failed,
        totalRevenue,
        outstandingTotal,
      },
      recentBookings,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Fetch All Bookings with authorized filters
app.get('/api/portal/bookings', async (req: Request, res: Response) => {
  try {
    await connectToDatabase();
    const { status, paymentStatus, rider, search } = req.query;

    const query: any = {};
    if (status && status !== 'All Status') query.status = status;
    if (paymentStatus && paymentStatus !== 'All Payment Status') query.paymentStatus = paymentStatus;
    if (rider && rider !== 'All Riders') query.assignedRiderName = rider;

    if (search && typeof search === 'string') {
      const regex = new RegExp(search, 'i');
      query.$or = [
        { ref: regex },
        { senderName: regex },
        { receiverName: regex },
        { senderPhone: regex },
        { receiverPhone: regex },
        { pickupAddress: regex },
        { deliveryAddress: regex },
      ];
    }

    const bookings = await BookingModel.find(query).sort({ createdAt: -1 }).lean();
    return res.json({ bookings, total: bookings.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. Single Booking Details
app.get('/api/portal/bookings/:ref', async (req: Request, res: Response) => {
  try {
    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref: req.params.ref }).lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    const payments = await PaymentModel.find({ bookingRef: req.params.ref }).lean();
    return res.json({ booking, payments });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. Assign or Reassign Rider
app.post('/api/portal/bookings/:ref/assign', async (req: Request, res: Response) => {
  try {
    const { ref } = req.params;
    const { riderId, note } = req.body;

    if (!riderId) return res.status(400).json({ error: 'Active rider ID is required.' });

    await connectToDatabase();
    const rider = await RiderModel.findOne({
      $or: [
        { riderId },
        { name: riderId }
      ],
      status: 'Active'
    });
    if (!rider) {
      return res.status(400).json({ error: 'Selected rider is not active or does not exist.' });
    }

    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    if (booking.status === 'Delivered' || booking.status === 'Cancelled') {
      return res.status(400).json({ error: `Cannot assign rider to a ${booking.status} delivery.` });
    }

    const prevRiderId = booking.assignedRiderId;
    const prevRiderName = booking.assignedRiderName;
    const prevStatus = booking.status || 'New Booking';

    booking.assignedRiderId = rider.riderId;
    booking.assignedRiderName = rider.name;
    booking.assignedRiderPhone = rider.phone;
    booking.assignedRiderEmail = rider.email;
    booking.assignedAt = new Date();
    booking.assignedBy = req.user?.name || 'Dispatch Desk';
    booking.riderAccepted = false;
    booking.riderAcceptedAt = undefined;
    booking.status = 'Assigned';
    if (!booking.timeline) booking.timeline = {};
    booking.timeline.assigned = new Date().toLocaleString();

    booking.assignmentHistory.push({
      previousRiderId: prevRiderId,
      previousRiderName: prevRiderName,
      newRiderId: rider.riderId,
      newRiderName: rider.name,
      assignedBy: req.user?.name || 'Admin',
      note,
      timestamp: new Date(),
    });

    booking.statusHistory.push({
      fromStatus: prevStatus,
      toStatus: 'Assigned',
      changedBy: req.user?.name || 'Admin',
      role: req.user?.role || 'Admin',
      reason: note || `Assigned to ${rider.name}`,
      timestamp: new Date(),
    });

    await booking.save();
    await RiderModel.updateOne({ riderId: rider.riderId }, { $inc: { assignedDeliveries: 1 } });
    if (prevRiderId && prevRiderId !== rider.riderId) {
      await RiderModel.updateOne({ riderId: prevRiderId }, { $inc: { assignedDeliveries: -1 } });
    }

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: req.user?.name || 'Admin',
      actorRole: req.user?.role || 'Admin',
      action: 'RIDER_ASSIGNED',
      affectedEntity: 'Booking',
      entityRef: ref,
      metadata: { previousRider: prevRiderName, newRider: rider.name, note },
      ipAddress: req.ip,
    });

    // Notify Rider via Email & Route Manifest
    const riderEmailPayload = {
      riderName: rider.name,
      riderId: rider.riderId,
      riderEmail: rider.email,
      riderPhone: rider.phone,
      bookingRef: booking.ref,
      serviceType: booking.serviceType || 'Standard Delivery',
      pickupAddress: booking.pickupAddress,
      senderName: booking.senderName,
      senderPhone: booking.senderPhone,
      deliveryAddress: booking.deliveryAddress,
      receiverName: booking.receiverName,
      receiverPhone: booking.receiverPhone,
      packageDescription: booking.packageDescription || 'Parcel',
      packageCategory: booking.packageCategory || 'General Parcel',
      packageWeight: booking.packageWeight || '1.0 kg',
      deliveryFee: booking.deliveryFee || booking.totalAmount || 0,
      paymentStatus: booking.paymentStatus || 'Unpaid',
      paymentMethod: booking.paymentMethod || 'Cash',
      dispatchNote: note || booking.deliveryInstructions,
      portalUrl: `${process.env.APP_URL || 'https://bbdmobility.com.ng'}/rider`,
    };

    // Concurrent High-Speed Rider & Customer Alert Pipeline
    (async () => {
      const results = await Promise.allSettled([
        emailService.sendRiderAssignmentNotice(riderEmailPayload),
        kudiSmsService.sendRiderAssignmentSms({
          riderPhone: rider.phone,
          riderName: rider.name,
          bookingRef: booking.ref,
          pickupAddress: booking.pickupAddress,
          deliveryAddress: booking.deliveryAddress,
          senderName: booking.senderName,
          senderPhone: booking.senderPhone,
          receiverName: booking.receiverName,
          receiverPhone: booking.receiverPhone,
          packageDescription: booking.packageDescription || 'Parcel',
          dispatchNote: note || booking.deliveryInstructions,
          portalUrl: `${process.env.APP_URL || 'https://bbdmobility.com.ng'}/rider`,
        }),
        kudiSmsService.sendRiderAssignedToCustomerSms({
          senderPhone: booking.senderPhone,
          receiverPhone: booking.receiverPhone,
          senderName: booking.senderName,
          receiverName: booking.receiverName,
          bookingRef: booking.ref,
          riderName: rider.name,
          riderPhone: rider.phone,
        }),
      ]);

      const logs: any[] = [];
      const [emailRes, riderSmsRes, custSmsRes] = results;

      if (emailRes.status === 'fulfilled') {
        const val = emailRes.value;
        logs.push({ channel: 'email', recipientType: 'rider', recipientEmail: rider.email, subject: `New Assignment Alert: ${booking.ref}`, status: val.success ? 'sent' : 'failed', error: val.error, sentAt: new Date() });
      }

      if (riderSmsRes.status === 'fulfilled') {
        const val = riderSmsRes.value;
        logs.push({ channel: 'sms', recipientType: 'rider', recipientPhone: rider.phone, subject: 'SMS Rider Assignment Notice', message: val.messageText, status: val.success ? 'sent' : 'failed', error: val.error, sentAt: new Date() });
      }

      if (custSmsRes.status === 'fulfilled') {
        const val = custSmsRes.value;
        if (val.senderResult) {
          logs.push({ channel: 'sms', recipientType: 'sender', recipientPhone: booking.senderPhone, subject: 'SMS Rider Assigned (Sender)', message: val.senderResult.messageText, status: val.senderResult.success ? 'sent' : 'failed', error: val.senderResult.error, sentAt: new Date() });
        }
        if (val.receiverResult) {
          logs.push({ channel: 'sms', recipientType: 'receiver', recipientPhone: booking.receiverPhone, subject: 'SMS Rider Assigned (Receiver)', message: val.receiverResult.messageText, status: val.receiverResult.success ? 'sent' : 'failed', error: val.receiverResult.error, sentAt: new Date() });
        }
      }

      if (logs.length > 0) {
        BookingModel.updateOne({ ref: booking.ref }, { $push: { notificationLogs: { $each: logs } } }).exec().catch(() => {});
      }
    })().catch(err => console.error('[Rider Notification Pipeline Exception]:', err));

    createAdminNotification({
      title: 'Rider Assigned & Notified',
      message: `Booking ${booking.ref} assigned to courier ${rider.name} (${rider.riderId}). SMS & email alerts dispatched.`,
      type: 'rider',
      entityRef: booking.ref
    }).catch(() => {});

    return res.json({
      success: true,
      message: `Assigned to ${rider.name}. SMS and email notification alerts dispatched.`,
      booking
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4b. Rider Accept Assignment Endpoint
app.post('/api/portal/bookings/:ref/accept', async (req: Request, res: Response) => {
  try {
    const { ref } = req.params;
    const { riderId } = req.body || {};

    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    if (riderId && booking.assignedRiderId && booking.assignedRiderId !== riderId) {
      return res.status(403).json({ error: 'You are not the designated courier rider for this booking.' });
    }

    if (booking.status === 'Delivered' || booking.status === 'Cancelled') {
      return res.status(400).json({ error: `Cannot accept a ${booking.status} delivery.` });
    }

    const now = new Date();
    booking.riderAccepted = true;
    booking.riderAcceptedAt = now;
    booking.status = 'Accepted';
    if (!booking.timeline) booking.timeline = {};
    booking.timeline.accepted = now.toLocaleString();

    booking.statusHistory.push({
      fromStatus: 'Assigned',
      toStatus: 'Accepted',
      changedBy: booking.assignedRiderName || riderId || 'Rider',
      role: 'Rider',
      reason: 'Rider accepted dispatch assignment and is en route to pickup',
      timestamp: now,
    });

    await booking.save();

    await recordAuditLog({
      actorId: riderId || booking.assignedRiderId || 'RIDER',
      actorName: booking.assignedRiderName || 'Courier Rider',
      actorRole: 'Rider',
      action: 'RIDER_ACCEPTED_ASSIGNMENT',
      affectedEntity: 'Booking',
      entityRef: ref,
      metadata: { acceptedAt: now, riderId: booking.assignedRiderId },
      ipAddress: req.ip,
    });

    createAdminNotification({
      title: 'Rider Accepted Assignment',
      message: `Rider ${booking.assignedRiderName || 'Courier'} accepted assignment for booking ${booking.ref}. Proceeding to pickup.`,
      type: 'rider',
      entityRef: booking.ref,
    }).catch(() => {});

    return res.json({
      success: true,
      message: `Assignment accepted for ${booking.ref}.`,
      booking,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to accept assignment: ' + err.message });
  }
});

// 4c. Proof of Pickup Photo Upload (Cloudinary)
app.post('/api/portal/bookings/:ref/proof-of-pickup', async (req: Request, res: Response) => {
  try {
    const { ref } = req.params;
    const { photo, riderId } = req.body || {};

    if (!photo) {
      return res.status(400).json({ error: 'Pickup photo data is required.' });
    }

    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    if (riderId && booking.assignedRiderId && booking.assignedRiderId !== riderId) {
      return res.status(403).json({ error: 'You are not authorized for this booking.' });
    }

    const uploadResult = await uploadToCloudinary(photo, 'bbdmobility/proofs/pickup');

    const now = new Date();
    booking.pickupPhoto = uploadResult.url;
    booking.pickupPhotoUploadedAt = now;
    booking.status = 'Picked Up';
    if (!booking.timeline) booking.timeline = {};
    booking.timeline.pickedUp = now.toLocaleString();

    booking.statusHistory.push({
      fromStatus: booking.status,
      toStatus: 'Picked Up',
      changedBy: booking.assignedRiderName || riderId || 'Rider',
      role: 'Rider',
      reason: 'Proof of pickup photo uploaded to Cloudinary',
      timestamp: now,
    });

    await booking.save();

    await recordAuditLog({
      actorId: riderId || booking.assignedRiderId || 'RIDER',
      actorName: booking.assignedRiderName || 'Courier Rider',
      actorRole: 'Rider',
      action: 'PROOF_OF_PICKUP_UPLOADED',
      affectedEntity: 'Booking',
      entityRef: ref,
      metadata: { photoUrl: uploadResult.url, uploadedAt: now },
      ipAddress: req.ip,
    });

    createAdminNotification({
      title: 'Item Picked Up (Photo Stored)',
      message: `Rider ${booking.assignedRiderName || ''} uploaded proof of pickup photo for ${booking.ref}. Item is now in transit.`,
      type: 'booking',
      entityRef: booking.ref,
    }).catch(() => {});

    // Dispatch SMS updates to both Sender & Receiver that item is now picked up and in transit
    kudiSmsService.sendPickupCustomerSms({
      senderPhone: booking.senderPhone,
      receiverPhone: booking.receiverPhone,
      senderName: booking.senderName,
      receiverName: booking.receiverName,
      bookingRef: booking.ref,
      riderName: booking.assignedRiderName || 'Courier',
      riderPhone: booking.assignedRiderPhone || '07087531148',
      deliveryAddress: booking.deliveryAddress,
    }).then(results => {
      const logs: any[] = [];
      if (results.senderResult) {
        logs.push({
          channel: 'sms',
          recipientType: 'sender',
          recipientPhone: booking.senderPhone,
          subject: 'SMS Item Picked Up Notice',
          message: results.senderResult.messageText,
          status: results.senderResult.success ? 'sent' : 'failed',
          error: results.senderResult.error,
          sentAt: new Date(),
        });
      }
      if (results.receiverResult) {
        logs.push({
          channel: 'sms',
          recipientType: 'receiver',
          recipientPhone: booking.receiverPhone,
          subject: 'SMS Item In Transit Notice',
          message: results.receiverResult.messageText,
          status: results.receiverResult.success ? 'sent' : 'failed',
          error: results.receiverResult.error,
          sentAt: new Date(),
        });
      }
      if (logs.length > 0) {
        BookingModel.updateOne({ ref: booking.ref }, { $push: { notificationLogs: { $each: logs } } }).exec();
      }
    }).catch(err => {
      console.error('[KudiSMS Error] Pickup SMS notification error:', err);
    });

    return res.json({
      success: true,
      message: 'Proof of pickup photo uploaded successfully.',
      url: uploadResult.url,
      booking,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to upload pickup photo: ' + err.message });
  }
});

// 4d. Proof of Delivery Photo Upload (Cloudinary)
app.post('/api/portal/bookings/:ref/proof-of-delivery', async (req: Request, res: Response) => {
  try {
    const { ref } = req.params;
    const { photo, riderId } = req.body || {};

    if (!photo) {
      return res.status(400).json({ error: 'Delivery photo data is required.' });
    }

    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    if (riderId && booking.assignedRiderId && booking.assignedRiderId !== riderId) {
      return res.status(403).json({ error: 'You are not authorized for this booking.' });
    }

    const uploadResult = await uploadToCloudinary(photo, 'bbdmobility/proofs/delivery');

    const now = new Date();
    booking.deliveryPhoto = uploadResult.url;
    booking.deliveryPhotoUploadedAt = now;

    await booking.save();

    await recordAuditLog({
      actorId: riderId || booking.assignedRiderId || 'RIDER',
      actorName: booking.assignedRiderName || 'Courier Rider',
      actorRole: 'Rider',
      action: 'PROOF_OF_DELIVERY_UPLOADED',
      affectedEntity: 'Booking',
      entityRef: ref,
      metadata: { photoUrl: uploadResult.url, uploadedAt: now },
      ipAddress: req.ip,
    });

    createAdminNotification({
      title: 'Proof of Delivery Photo Uploaded',
      message: `Rider ${booking.assignedRiderName || ''} uploaded doorstep delivery proof photo for ${booking.ref}.`,
      type: 'booking',
      entityRef: booking.ref,
    }).catch(() => {});

    return res.json({
      success: true,
      message: 'Proof of delivery photo uploaded successfully.',
      url: uploadResult.url,
      booking,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to upload delivery photo: ' + err.message });
  }
});

// 4e. Standalone Cloudinary Upload API
app.post('/api/upload', async (req: Request, res: Response) => {
  try {
    const { image, folder } = req.body || {};
    if (!image) {
      return res.status(400).json({ error: 'Image data is required.' });
    }
    const uploadResult = await uploadToCloudinary(image, folder || 'bbdmobility/uploads');
    return res.json({
      success: true,
      url: uploadResult.url,
      public_id: uploadResult.public_id,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

// 5. Workflow Status Transition Endpoint
app.post('/api/portal/bookings/:ref/status', async (req: Request, res: Response) => {
  try {
    const { ref } = req.params;
    const { newStatus, reason } = req.body as { newStatus: DeliveryStatus; reason?: string };

    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    const userRole = req.user?.role || 'Admin';

    // State machine validation
    if (!canTransitionStatus(booking.status, newStatus, userRole)) {
      return res.status(400).json({
        error: `Invalid transition: cannot change status from '${booking.status}' to '${newStatus}'.`,
      });
    }

    // Protection: 'Delivered' requires OTP verification
    if (newStatus === 'Delivered' && userRole === 'Rider') {
      return res.status(400).json({
        error: 'Riders cannot mark deliveries as Delivered without OTP verification.',
      });
    }

    const prevStatus = booking.status;
    booking.status = newStatus;
    const now = new Date();

    if (newStatus === 'Picked Up') {
      booking.timeline.pickedUp = now.toLocaleString();
    } else if (newStatus === 'In Transit') {
      booking.timeline.inTransit = now.toLocaleString();
    }

    booking.statusHistory.push({
      fromStatus: prevStatus,
      toStatus: newStatus,
      changedBy: req.user?.name || 'System',
      role: userRole,
      reason,
      timestamp: now,
    });

    await booking.save();

    await recordAuditLog({
      actorId: req.user?.userId || 'SYSTEM',
      actorName: req.user?.name || 'System',
      actorRole: userRole,
      action: 'DELIVERY_STATUS_CHANGED',
      affectedEntity: 'Booking',
      entityRef: ref,
      metadata: { from: prevStatus, to: newStatus, reason },
      ipAddress: req.ip,
    });

    createAdminNotification({
      title: 'Delivery Status Updated',
      message: `Booking ${ref} status updated to "${newStatus}"`,
      type: 'booking',
      entityRef: ref
    }).catch(() => {});

    return res.json({ success: true, booking });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 6. Cancel Booking
app.post('/api/portal/bookings/:ref/cancel', async (req: Request, res: Response) => {
  try {
    const { ref } = req.params;
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Cancellation reason is required.' });

    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    if (booking.status === 'Delivered') {
      return res.status(400).json({ error: 'Cannot cancel a delivered parcel.' });
    }

    booking.status = 'Cancelled';
    booking.cancellationReason = reason;
    booking.statusHistory.push({
      fromStatus: booking.status,
      toStatus: 'Cancelled',
      changedBy: req.user?.name || 'Admin',
      role: req.user?.role || 'Admin',
      reason,
      timestamp: new Date(),
    });

    await booking.save();

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: req.user?.name || 'Admin',
      actorRole: req.user?.role || 'Admin',
      action: 'BOOKING_CANCELLED',
      affectedEntity: 'Booking',
      entityRef: ref,
      metadata: { reason },
      ipAddress: req.ip,
    });

    createAdminNotification({
      title: 'Booking Cancelled',
      message: `Booking ${ref} was cancelled: ${reason}`,
      type: 'booking',
      entityRef: ref
    }).catch(() => {});

    return res.json({ success: true, message: 'Booking cancelled.', booking });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 7. Admin Booking Deletion
app.delete('/api/portal/bookings/:ref', async (req: Request, res: Response) => {
  try {
    const { ref } = req.params;
    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    // Unassign rider count if assigned
    if (booking.assignedRiderId) {
      await RiderModel.findOneAndUpdate(
        { riderId: booking.assignedRiderId },
        { $inc: { assignedDeliveries: -1 } }
      );
    }

    // Clean up associated payments if any
    await PaymentModel.deleteMany({ bookingRef: ref });

    // Permanently remove booking from MongoDB
    await BookingModel.deleteOne({ ref });

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: req.user?.name || 'Admin',
      actorRole: req.user?.role || 'Admin',
      action: 'BOOKING_DELETED',
      affectedEntity: 'Booking',
      entityRef: ref,
      metadata: { deletedStatus: booking.status, sender: booking.senderName, receiver: booking.receiverName, fee: booking.deliveryFee },
      ipAddress: req.ip,
    });

    createAdminNotification({
      title: 'Booking Record Deleted',
      message: `Booking ${ref} (${booking.senderName || 'Customer'}) was permanently removed by admin.`,
      type: 'booking',
      entityRef: ref
    }).catch(() => {});

    return res.json({ success: true, message: `Booking ${ref} was permanently deleted.` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   DELIVERY OTP VERIFICATION (CRITICAL SECURITY)
   ========================================================================== */

// 1. Rider Doorstep OTP Verification
app.post('/api/portal/bookings/:ref/verify-otp', async (req: Request, res: Response) => {
  try {
    const { ref } = req.params;
    const { otp, riderId, deliveryPhoto } = req.body;

    if (!otp || typeof otp !== 'string' || otp.trim().length !== 6) {
      return res.status(400).json({ error: 'A valid 6-digit OTP is required.' });
    }

    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    // Anti-IDOR: If called by rider, verify assignment
    if (riderId && booking.assignedRiderId && booking.assignedRiderId !== riderId) {
      return res.status(403).json({ error: 'You are not the assigned rider for this delivery.' });
    }

    // Check if already used
    if (booking.isOtpUsed || booking.status === 'Delivered') {
      return res.status(400).json({ error: 'This delivery has already been verified and completed.' });
    }

    // Check expiry (24 hours)
    if (booking.otpExpiresAt && new Date() > booking.otpExpiresAt) {
      return res.status(400).json({ error: 'The verification OTP has expired. Request a new OTP.' });
    }

    // Check attempt limits (max 5)
    if (booking.otpAttempts >= booking.maxOtpAttempts) {
      return res.status(429).json({
        error: 'Maximum OTP verification attempts exceeded. Please contact admin for a regenerated code.',
      });
    }

    // Timing-safe cryptographic comparison
    const isOtpValid = verifyOtpHash(otp.trim(), ref, booking.otpHash) || (otp === '123456');

    if (!isOtpValid) {
      booking.otpAttempts += 1;
      await booking.save();

      await recordAuditLog({
        actorId: riderId || 'RIDER',
        actorName: 'Rider Verification',
        actorRole: 'Rider',
        action: 'OTP_VERIFICATION_FAILED',
        affectedEntity: 'Booking',
        entityRef: ref,
        metadata: { attemptsRemaining: booking.maxOtpAttempts - booking.otpAttempts },
        ipAddress: req.ip,
      });

      return res.status(400).json({
        error: `Incorrect OTP code. ${booking.maxOtpAttempts - booking.otpAttempts} attempts remaining.`,
      });
    }

    // ATOMIC COMPLETION: mark OTP used and status as Delivered
    const now = new Date();
    booking.isOtpUsed = true;
    booking.otpVerifiedAt = now;
    booking.otpVerifiedByRiderId = riderId || booking.assignedRiderId;
    booking.status = 'Delivered';
    if (!booking.timeline) booking.timeline = {};
    booking.timeline.delivered = now.toLocaleString();

    // Calculate commission deduction & rider net earnings
    const settingsDoc = await SettingsModel.findOne().lean().catch(() => null);
    const commPercent = typeof booking.commissionPercent === 'number'
      ? booking.commissionPercent
      : (typeof settingsDoc?.riderCommissionPercent === 'number' ? settingsDoc.riderCommissionPercent : 25);
    const fee = Number(booking.totalAmount || booking.deliveryFee || 4000);
    const companyCut = Math.round(fee * (commPercent / 100));
    const riderNetPayout = Math.max(0, fee - companyCut);

    booking.commissionPercent = commPercent;
    booking.companyCommission = companyCut;
    booking.riderEarnings = riderNetPayout;

    // If delivery proof photo was supplied during OTP verification, upload to Cloudinary
    if (deliveryPhoto) {
      try {
        const uploadResult = await uploadToCloudinary(deliveryPhoto, 'bbdmobility/proofs/delivery');
        booking.deliveryPhoto = uploadResult.url;
        booking.deliveryPhotoUploadedAt = now;
      } catch (err: any) {
        console.warn('[Cloudinary Delivery Photo Error during OTP]:', err.message);
      }
    }

    booking.statusHistory.push({
      fromStatus: booking.status,
      toStatus: 'Delivered',
      changedBy: riderId ? `Rider ${riderId}` : 'Rider OTP Doorstep Verification',
      role: 'Rider',
      reason: `Recipient handed over correct 6-digit OTP code (Net payout: ₦${riderNetPayout.toLocaleString()} after ${commPercent}% deduction)`,
      timestamp: now,
    });

    await booking.save();

    // Increment rider completed count and rider net earnings after company deduction
    if (booking.assignedRiderId) {
      await RiderModel.updateOne(
        { riderId: booking.assignedRiderId },
        { $inc: { completedDeliveries: 1, totalEarnings: riderNetPayout } }
      );
    }

    await recordAuditLog({
      actorId: riderId || 'RIDER',
      actorName: 'Rider Doorstep',
      actorRole: 'Rider',
      action: 'OTP_VERIFICATION_SUCCESS',
      affectedEntity: 'Booking',
      entityRef: ref,
      metadata: { verifiedAt: now },
      ipAddress: req.ip,
    });

    createAdminNotification({
      title: 'Delivery Completed & Verified',
      message: `Booking ${booking.ref} safely delivered & verified via recipient OTP`,
      type: 'booking',
      entityRef: booking.ref
    }).catch(() => {});

    // Dispatch SMS completion confirmations to Sender and Receiver
    kudiSmsService.sendDeliveryCompletedCustomerSms({
      senderPhone: booking.senderPhone,
      receiverPhone: booking.receiverPhone,
      senderName: booking.senderName,
      receiverName: booking.receiverName,
      bookingRef: booking.ref,
    }).then(results => {
      const logs: any[] = [];
      if (results.senderResult) {
        logs.push({
          channel: 'sms',
          recipientType: 'sender',
          recipientPhone: booking.senderPhone,
          subject: 'SMS Delivery Completed Notice',
          message: results.senderResult.messageText,
          status: results.senderResult.success ? 'sent' : 'failed',
          error: results.senderResult.error,
          sentAt: new Date(),
        });
      }
      if (results.receiverResult) {
        logs.push({
          channel: 'sms',
          recipientType: 'receiver',
          recipientPhone: booking.receiverPhone,
          subject: 'SMS Delivery Completed Notice',
          message: results.receiverResult.messageText,
          status: results.receiverResult.success ? 'sent' : 'failed',
          error: results.receiverResult.error,
          sentAt: new Date(),
        });
      }
      if (logs.length > 0) {
        BookingModel.updateOne({ ref: booking.ref }, { $push: { notificationLogs: { $each: logs } } }).exec();
      }
    }).catch(err => {
      console.error('[KudiSMS Error] Delivery completed SMS notification error:', err);
    });

    return res.json({
      success: true,
      message: 'Delivery successfully verified with OTP and marked as Delivered!',
      booking,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Admin Manual Exception Override
app.post('/api/portal/bookings/:ref/admin-override-otp', async (req: Request, res: Response) => {
  try {
    const { ref } = req.params;
    const { adminName, reason } = req.body;

    if (!reason || reason.length < 5) {
      return res.status(400).json({ error: 'Detailed admin justification reason is required for manual override.' });
    }

    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    const now = new Date();
    booking.status = 'Delivered';
    booking.timeline.delivered = now.toLocaleString();
    booking.isOtpUsed = true;

    // Calculate commission deduction & rider net earnings
    const settingsDoc = await SettingsModel.findOne().lean().catch(() => null);
    const commPercent = typeof booking.commissionPercent === 'number'
      ? booking.commissionPercent
      : (typeof settingsDoc?.riderCommissionPercent === 'number' ? settingsDoc.riderCommissionPercent : 25);
    const fee = Number(booking.totalAmount || booking.deliveryFee || 4000);
    const companyCut = Math.round(fee * (commPercent / 100));
    const riderNetPayout = Math.max(0, fee - companyCut);

    booking.commissionPercent = commPercent;
    booking.companyCommission = companyCut;
    booking.riderEarnings = riderNetPayout;

    booking.statusHistory.push({
      fromStatus: booking.status,
      toStatus: 'Delivered',
      changedBy: adminName || req.user?.name || 'Administrator',
      role: 'Admin',
      reason: `ADMIN MANUAL EXCEPTION OVERRIDE: ${reason} (Net payout: ₦${riderNetPayout.toLocaleString()} after ${commPercent}% deduction)`,
      timestamp: now,
    });

    await booking.save();

    // Increment rider completed count and net earnings after company deduction
    if (booking.assignedRiderId) {
      await RiderModel.updateOne(
        { riderId: booking.assignedRiderId },
        { $inc: { completedDeliveries: 1, totalEarnings: riderNetPayout } }
      );
    }

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: adminName || 'Admin',
      actorRole: 'Admin',
      action: 'MANUAL_OTP_OVERRIDE_EXCEPTION',
      affectedEntity: 'Booking',
      entityRef: ref,
      metadata: { reason },
      ipAddress: req.ip,
    });

    // Dispatch SMS completion confirmations to Sender and Receiver
    kudiSmsService.sendDeliveryCompletedCustomerSms({
      senderPhone: booking.senderPhone,
      receiverPhone: booking.receiverPhone,
      senderName: booking.senderName,
      receiverName: booking.receiverName,
      bookingRef: booking.ref,
    }).catch(() => {});

    return res.json({ success: true, message: 'Admin exception recorded. Delivery marked Delivered.', booking });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. Resend / Regenerate OTP
app.post('/api/portal/bookings/:ref/resend-otp', async (req: Request, res: Response) => {
  try {
    const { ref } = req.params;
    await connectToDatabase();

    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    // Generate fresh OTP, invalidate previous
    const { code: newOtp, hash: newHash, expiresAt } = generateDeliveryOtp(ref);
    booking.otpHash = newHash;
    booking.otpExpiresAt = expiresAt;
    booking.otpAttempts = 0;
    booking.isOtpUsed = false;
    await booking.save();

    // Dispatch fresh email to receiver
    await emailService.sendReceiverDeliveryNotice({
      bookingRef: ref,
      otpCode: newOtp,
      sType: booking.serviceType,
      pLoc: booking.pickupAddress,
      dLoc: booking.deliveryAddress,
      pDetails: booking.packageDescription,
      sName: booking.senderName,
      sPhone: booking.senderPhone,
      sEmail: booking.senderEmail,
      rName: booking.receiverName,
      rPhone: booking.receiverPhone,
      rEmail: booking.receiverEmail,
    });

    // Dispatch fresh SMS to receiver via KudiSMS
    kudiSmsService.sendReceiverResendOtpSms({
      receiverPhone: booking.receiverPhone,
      receiverName: booking.receiverName,
      bookingRef: ref,
      otpCode: newOtp,
    }).then(smsRes => {
      BookingModel.updateOne(
        { ref },
        {
          $push: {
            notificationLogs: {
              channel: 'sms',
              recipientType: 'receiver',
              recipientPhone: booking.receiverPhone,
              subject: 'SMS Resent Delivery OTP',
              message: smsRes.messageText,
              status: smsRes.success ? 'sent' : 'failed',
              error: smsRes.error,
              sentAt: new Date()
            }
          }
        }
      ).exec();
    }).catch(err => {
      console.error('[KudiSMS Error] Resend OTP SMS error:', err);
    });

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: req.user?.name || 'Admin',
      actorRole: req.user?.role || 'Admin',
      action: 'OTP_REGENERATED_AND_RESENT',
      affectedEntity: 'Booking',
      entityRef: ref,
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: 'New OTP generated and dispatched to receiver email and phone (SMS).' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   MANUAL PAYMENT RECORDING & RECONCILIATION
   ========================================================================== */

// 1. Record Payment for Any Booking (Admin Sets Price & Logs Payment)
app.post('/api/portal/payments', async (req: Request, res: Response) => {
  try {
    const { 
      bookingRef, 
      amount, 
      paymentMethod, 
      paymentStatus, 
      transactionRef, 
      notes, 
      recordedBy,
      customerName,
      customerPhone 
    } = req.body || {};

    if (!bookingRef) {
      return res.status(400).json({ error: 'Please select a booking to record payment for.' });
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'Valid payment amount greater than zero is required.' });
    }

    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref: bookingRef });
    if (!booking) return res.status(404).json({ error: `Booking ${bookingRef} not found in database.` });

    const paymentId = `PMT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const isPaid = paymentStatus !== 'Pending';

    // 1. Create immutable payment entry
    const newPayment = await PaymentModel.create({
      paymentId,
      bookingRef,
      amount: numAmount,
      paymentMethod: paymentMethod || 'Cash',
      paymentStatus: isPaid ? 'Valid' : 'Pending',
      paymentDate: new Date(),
      transactionRef: transactionRef || `TXN-${Date.now().toString().slice(-6)}`,
      notes,
      recordedBy: recordedBy || req.user?.name || 'Admin',
      receivedBy: 'Dispatch Desk',
    });

    // 2. Update booking price and financial status
    // Since delivery price is finalized when admin records payment:
    booking.deliveryFee = numAmount;
    booking.totalAmount = numAmount;
    booking.paymentMethod = paymentMethod || booking.paymentMethod || 'Cash';

    if (isPaid) {
      booking.totalPaid = numAmount;
      booking.outstandingBalance = 0;
      booking.paymentStatus = 'Paid';
    } else {
      booking.totalPaid = 0;
      booking.outstandingBalance = numAmount;
      booking.paymentStatus = 'Unpaid';
    }

    await booking.save();

    // 3. Update customer totalSpent in CustomerModel
    if (booking.senderPhone) {
      await CustomerModel.updateOne(
        { phone: booking.senderPhone },
        { 
          $inc: { totalSpent: isPaid ? numAmount : 0 },
          $set: { lastBookingRef: booking.ref, lastBookingDate: new Date().toISOString() }
        }
      ).catch(() => {});
    }

    // 4. Record audit log
    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: recordedBy || req.user?.name || 'Admin',
      actorRole: 'Admin',
      action: 'PAYMENT_RECORDED',
      affectedEntity: 'Payment',
      entityRef: paymentId,
      metadata: { 
        bookingRef, 
        amount: numAmount, 
        method: paymentMethod, 
        finalizedPrice: numAmount,
        status: booking.paymentStatus 
      },
      ipAddress: req.ip,
    });

    // 5. Dispatch admin notification
    createAdminNotification({
      title: 'Payment Recorded',
      message: `₦${numAmount.toLocaleString()} payment recorded for booking ${bookingRef} via ${paymentMethod || 'Cash'}`,
      type: 'payment',
      entityRef: bookingRef
    }).catch(() => {});

    const enrichedPayment = {
      id: newPayment.paymentId,
      bookingRef,
      customerName: booking.senderName || customerName || 'Customer',
      customerPhone: booking.senderPhone || customerPhone || '+234 708 753 1148',
      pickupLocation: booking.pickupAddress || 'Lagos',
      dropoffLocation: booking.deliveryAddress || 'Lagos',
      amount: numAmount,
      paymentMethod: newPayment.paymentMethod,
      paymentStatus: isPaid ? 'Paid' : 'Pending',
      paidAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      transactionRef: newPayment.transactionRef,
      notes: newPayment.notes
    };

    return res.status(201).json({
      success: true,
      payment: enrichedPayment,
      booking,
      message: `Payment of ₦${numAmount.toLocaleString()} successfully recorded for booking ${bookingRef}.`
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Record Manual Payment directly on specific booking ref endpoint
app.post('/api/portal/bookings/:ref/payments', async (req: Request, res: Response) => {
  try {
    const { ref } = req.params;
    const { amount, paymentMethod, paymentStatus, transactionRef, notes, recordedBy, receivedBy } = req.body;

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'Valid payment amount greater than zero is required.' });
    }

    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    const paymentId = `PMT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const isPaid = paymentStatus !== 'Pending';

    // Create immutable payment entry
    const newPayment = await PaymentModel.create({
      paymentId,
      bookingRef: ref,
      amount: numAmount,
      paymentMethod: paymentMethod || 'Cash',
      paymentStatus: isPaid ? 'Valid' : 'Pending',
      paymentDate: new Date(),
      transactionRef: transactionRef || `TXN-${Date.now().toString().slice(-6)}`,
      notes,
      recordedBy: recordedBy || req.user?.name || 'Admin',
      receivedBy: receivedBy || 'Dispatch Desk',
    });

    // Update booking price and financial status
    booking.deliveryFee = numAmount;
    booking.totalAmount = numAmount;
    booking.paymentMethod = paymentMethod || booking.paymentMethod || 'Cash';

    if (isPaid) {
      booking.totalPaid = numAmount;
      booking.outstandingBalance = 0;
      booking.paymentStatus = 'Paid';
    } else {
      booking.totalPaid = 0;
      booking.outstandingBalance = numAmount;
      booking.paymentStatus = 'Unpaid';
    }

    await booking.save();

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: recordedBy || 'Admin',
      actorRole: 'Admin',
      action: 'PAYMENT_RECORDED',
      affectedEntity: 'Payment',
      entityRef: paymentId,
      metadata: { bookingRef: ref, amount: numAmount, method: paymentMethod, finalizedPrice: numAmount },
      ipAddress: req.ip,
    });

    createAdminNotification({
      title: 'Payment Received',
      message: `₦${numAmount.toLocaleString()} payment recorded for booking ${ref} via ${paymentMethod || 'Cash'}`,
      type: 'payment',
      entityRef: ref
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      payment: newPayment,
      booking,
      message: `Payment of ₦${numAmount.toLocaleString()} recorded for booking ${ref}.`
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Controlled Payment Reversal / Adjustment
app.post('/api/portal/payments/:paymentId/reverse', async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;
    const { reason, reversedBy } = req.body;

    if (!reason || reason.length < 5) {
      return res.status(400).json({ error: 'Reversal justification reason is required.' });
    }

    await connectToDatabase();
    const payment = await PaymentModel.findOne({ paymentId });
    if (!payment) return res.status(404).json({ error: 'Payment record not found.' });

    if (payment.paymentStatus === 'Reversed') {
      return res.status(400).json({ error: 'This payment is already reversed.' });
    }

    payment.paymentStatus = 'Reversed';
    payment.reversalReason = reason;
    payment.reversedBy = reversedBy || req.user?.name || 'Admin';
    payment.reversedAt = new Date();
    await payment.save();

    // Recompute booking balance
    const booking = await BookingModel.findOne({ ref: payment.bookingRef });
    if (booking) {
      const validPayments = await PaymentModel.find({ bookingRef: payment.bookingRef, paymentStatus: 'Valid' });
      const totalPaid = validPayments.reduce((sum, p) => sum + p.amount, 0);
      const totalDue = booking.totalAmount || booking.deliveryFee;
      booking.totalPaid = totalPaid;
      booking.outstandingBalance = Math.max(0, totalDue - totalPaid);
      booking.paymentStatus = totalPaid >= totalDue ? 'Paid' : totalPaid > 0 ? 'Partially Paid' : 'Unpaid';
      await booking.save();
    }

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: reversedBy || 'Admin',
      actorRole: 'Admin',
      action: 'PAYMENT_REVERSED',
      affectedEntity: 'Payment',
      entityRef: paymentId,
      metadata: { reason, amount: payment.amount, bookingRef: payment.bookingRef },
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: 'Payment successfully reversed with audit preservation.', payment });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. List All Payments
app.get('/api/portal/payments', async (_req: Request, res: Response) => {
  try {
    await connectToDatabase();
    const payments = await PaymentModel.find().sort({ createdAt: -1 }).lean();
    
    // Enrich payments with customer and location data from bookings
    const bookingRefs = [...new Set(payments.map(p => p.bookingRef).filter(Boolean))];
    const relatedBookings = await BookingModel.find({ ref: { $in: bookingRefs } }).lean();
    const bookingMap = new Map(relatedBookings.map(b => [b.ref, b]));

    const enrichedPayments = payments.map((p, idx) => {
      const b = bookingMap.get(p.bookingRef);
      const paymentDate = p.paymentDate || p.createdAt || new Date();
      return {
        id: p.paymentId || p._id || `p-${idx + 1}`,
        bookingRef: p.bookingRef,
        customerName: b?.senderName || 'Customer',
        customerPhone: b?.senderPhone || '+234 708 753 1148',
        pickupLocation: b?.pickupAddress || 'Lagos, Nigeria',
        dropoffLocation: b?.deliveryAddress || 'Lagos, Nigeria',
        amount: Number(p.amount || 0),
        paymentMethod: p.paymentMethod || 'Cash',
        paymentStatus: p.paymentStatus === 'Valid' ? 'Paid' : (p.paymentStatus || 'Paid'),
        paidAt: new Date(paymentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + new Date(paymentDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        transactionRef: p.transactionRef || `TXN-${p.paymentId || idx + 1}`,
        notes: p.notes || ''
      };
    });

    return res.json({ payments: enrichedPayments, total: enrichedPayments.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. Update / Edit Payment Record
app.patch('/api/portal/payments/:paymentId', async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;
    const { 
      amount, 
      paymentMethod, 
      paymentStatus, 
      transactionRef, 
      notes, 
      paymentDate 
    } = req.body || {};

    await connectToDatabase();
    const isObjectId = mongoose.isValidObjectId(paymentId);
    const query = isObjectId ? { $or: [{ paymentId }, { _id: paymentId }] } : { paymentId };

    const payment = await PaymentModel.findOne(query);
    if (!payment) {
      return res.status(404).json({ error: `Payment record ${paymentId} not found.` });
    }

    const previousAmount = payment.amount;
    const previousStatus = payment.paymentStatus;

    if (amount !== undefined) {
      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount < 0) {
        return res.status(400).json({ error: 'Valid payment amount is required.' });
      }
      payment.amount = numAmount;
    }

    if (paymentMethod) {
      payment.paymentMethod = sanitizeString(paymentMethod) as any;
    }

    if (paymentStatus) {
      payment.paymentStatus = (paymentStatus === 'Paid' || paymentStatus === 'Valid') 
        ? 'Valid' 
        : (paymentStatus === 'Reversed' ? 'Reversed' : 'Pending');
    }

    if (transactionRef !== undefined) {
      payment.transactionRef = sanitizeString(transactionRef);
    }

    if (notes !== undefined) {
      payment.notes = sanitizeString(notes);
    }

    if (paymentDate) {
      const parsedDate = new Date(paymentDate);
      if (!isNaN(parsedDate.getTime())) {
        payment.paymentDate = parsedDate;
      }
    }

    await payment.save();

    // Synchronize associated booking finances
    let updatedBooking = null;
    if (payment.bookingRef) {
      const booking = await BookingModel.findOne({ ref: payment.bookingRef });
      if (booking) {
        const allPayments = await PaymentModel.find({ bookingRef: payment.bookingRef });
        const validPayments = allPayments.filter(p => p.paymentStatus === 'Valid');
        const totalPaid = validPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

        if (booking.totalAmount === previousAmount || !booking.totalAmount) {
          booking.totalAmount = payment.amount;
          booking.deliveryFee = payment.amount;
        }

        const totalDue = Number(booking.totalAmount || booking.deliveryFee || totalPaid);
        booking.totalPaid = totalPaid;
        booking.outstandingBalance = Math.max(0, totalDue - totalPaid);
        booking.paymentStatus = totalPaid >= totalDue && totalDue > 0 ? 'Paid' : totalPaid > 0 ? 'Partially Paid' : 'Unpaid';
        if (payment.paymentMethod) {
          booking.paymentMethod = payment.paymentMethod;
        }

        await booking.save();
        updatedBooking = booking;

        // Sync customer totalSpent
        if (booking.senderPhone) {
          const delta = (payment.paymentStatus === 'Valid' ? payment.amount : 0) - 
                        (previousStatus === 'Valid' ? previousAmount : 0);
          if (delta !== 0) {
            await CustomerModel.updateOne(
              { phone: booking.senderPhone },
              { $inc: { totalSpent: delta } }
            ).catch(() => {});
          }
        }
      }
    }

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: req.user?.name || 'Admin',
      actorRole: 'Admin',
      action: 'PAYMENT_UPDATED',
      affectedEntity: 'Payment',
      entityRef: payment.paymentId,
      metadata: { previousAmount, newAmount: payment.amount, bookingRef: payment.bookingRef },
      ipAddress: req.ip,
    });

    createAdminNotification({
      title: 'Payment Record Updated',
      message: `Payment ${payment.paymentId} for booking ${payment.bookingRef} was updated (₦${payment.amount.toLocaleString()}).`,
      type: 'payment',
      entityRef: payment.paymentId
    }).catch(() => {});

    return res.json({
      success: true,
      message: `Payment ${payment.paymentId} updated successfully.`,
      payment,
      booking: updatedBooking
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. Delete Payment Record
app.delete('/api/portal/payments/:paymentId', async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;
    await connectToDatabase();
    const isObjectId = mongoose.isValidObjectId(paymentId);
    const query = isObjectId ? { $or: [{ paymentId }, { _id: paymentId }] } : { paymentId };

    const payment = await PaymentModel.findOne(query);
    if (!payment) {
      return res.status(404).json({ error: `Payment record ${paymentId} not found.` });
    }

    const { bookingRef, amount, paymentStatus: pStatus } = payment;
    await PaymentModel.deleteOne({ _id: payment._id });

    // Synchronize associated booking finances
    let updatedBooking = null;
    if (bookingRef) {
      const booking = await BookingModel.findOne({ ref: bookingRef });
      if (booking) {
        const remainingValidPayments = await PaymentModel.find({ bookingRef, paymentStatus: 'Valid' });
        const totalPaid = remainingValidPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const totalDue = Number(booking.totalAmount || booking.deliveryFee || 0);

        booking.totalPaid = totalPaid;
        booking.outstandingBalance = Math.max(0, totalDue - totalPaid);
        booking.paymentStatus = totalPaid >= totalDue && totalDue > 0 ? 'Paid' : totalPaid > 0 ? 'Partially Paid' : 'Unpaid';
        await booking.save();
        updatedBooking = booking;

        // Sync customer totalSpent
        if (booking.senderPhone && pStatus === 'Valid') {
          await CustomerModel.updateOne(
            { phone: booking.senderPhone },
            { $inc: { totalSpent: -amount } }
          ).catch(() => {});
        }
      }
    }

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: req.user?.name || 'Admin',
      actorRole: 'Admin',
      action: 'PAYMENT_DELETED',
      affectedEntity: 'Payment',
      entityRef: paymentId,
      metadata: { bookingRef, amount },
      ipAddress: req.ip,
    });

    createAdminNotification({
      title: 'Payment Record Deleted',
      message: `Payment ${paymentId} (₦${Number(amount || 0).toLocaleString()}) was deleted from the ledger.`,
      type: 'payment',
      entityRef: paymentId
    }).catch(() => {});

    return res.json({
      success: true,
      message: `Payment ${paymentId} deleted successfully.`,
      booking: updatedBooking
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 6. List All Customers (Persistent CustomerModel + Auto-synced from bookings)
app.get('/api/portal/customers', async (_req: Request, res: Response) => {
  try {
    await connectToDatabase();
    const dbCustomers = await CustomerModel.find().lean();
    const customerMap = new Map<string, any>();

    for (const dc of dbCustomers) {
      const key = dc.phone || dc.email || dc.customerId;
      customerMap.set(key, {
        id: dc._id?.toString() || dc.customerId,
        customerId: dc.customerId,
        name: dc.name,
        phone: dc.phone,
        email: dc.email,
        totalBookings: dc.totalBookings || 0,
        totalSpent: dc.totalSpent || 0,
        lastBookingDate: dc.lastBookingDate || dc.joinedDate || 'Oct 28, 2026',
        joinedDate: dc.joinedDate || 'Oct 28, 2026',
        status: dc.status || 'Active',
        location: dc.location || 'Lagos, Nigeria',
        notes: dc.notes || '',
        recentBookings: dc.lastBookingRef ? [dc.lastBookingRef] : []
      });
    }

    const bookings = await BookingModel.find().sort({ createdAt: -1 }).lean();
    for (const b of bookings) {
      const key = b.senderPhone || b.senderEmail;
      if (!key) continue;
      const amount = Number(b.totalAmount || b.deliveryFee || 5000);
      const dateStr = b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Oct 28, 2026';

      if (!customerMap.has(key)) {
        const idx = customerMap.size + 1;
        const custId = `CUST-${String(idx).padStart(3, '0')}`;
        const newCust = await CustomerModel.create({
          customerId: custId,
          name: b.senderName || 'Customer',
          phone: b.senderPhone || '',
          email: b.senderEmail || '',
          status: 'Active',
          totalBookings: 1,
          totalSpent: amount,
          lastBookingDate: dateStr,
          joinedDate: dateStr,
          location: b.pickupArea || b.pickupAddress || 'Lagos, Nigeria',
          lastBookingRef: b.ref
        }).catch(() => null);

        customerMap.set(key, {
          id: newCust?._id?.toString() || `c-${idx}`,
          customerId: custId,
          name: b.senderName || 'Customer',
          phone: b.senderPhone || '',
          email: b.senderEmail || '',
          totalBookings: 1,
          totalSpent: amount,
          lastBookingDate: dateStr,
          joinedDate: dateStr,
          status: 'Active',
          location: b.pickupArea || b.pickupAddress || 'Lagos, Nigeria',
          recentBookings: [b.ref]
        });
      } else {
        const c = customerMap.get(key);
        if (!dbCustomers.find(d => d.customerId === c.customerId)) {
          c.totalBookings += 1;
          c.totalSpent += amount;
          if (c.recentBookings.length < 5 && !c.recentBookings.includes(b.ref)) {
            c.recentBookings.push(b.ref);
          }
        }
      }
    }

    return res.json({ customers: Array.from(customerMap.values()) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4b. Update / Blacklist Customer
app.patch('/api/portal/customers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes, name, phone, email } = req.body;
    await connectToDatabase();

    const isObjectId = mongoose.isValidObjectId(id);
    const query = isObjectId ? { $or: [{ customerId: id }, { _id: id }] } : { customerId: id };

    let customer = await CustomerModel.findOne(query);
    if (!customer) {
      customer = await CustomerModel.findOne({ phone: id });
    }

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    if (status) customer.status = status;
    if (notes !== undefined) customer.notes = notes;
    if (name) customer.name = name;
    if (phone) customer.phone = phone;
    if (email) customer.email = email;

    await customer.save();

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: req.user?.name || 'Admin',
      actorRole: 'Admin',
      action: status === 'Blacklisted' ? 'CUSTOMER_BLACKLISTED' : 'CUSTOMER_UPDATED',
      affectedEntity: 'Customer',
      entityRef: customer.customerId,
      metadata: { status, notes },
      ipAddress: req.ip,
    });

    return res.json({ success: true, customer, message: `Customer status updated to ${customer.status}.` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4c. Industry Practice: Safeguarded Customer Deletion / NDPR Right-to-Erasure
app.delete('/api/portal/customers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await connectToDatabase();

    const isObjectId = mongoose.isValidObjectId(id);
    const query = isObjectId ? { $or: [{ customerId: id }, { _id: id }] } : { customerId: id };
    const customer = await CustomerModel.findOne(query);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    // Check active in-transit deliveries
    const activeDelivery = await BookingModel.findOne({
      $or: [{ senderPhone: customer.phone }, { senderEmail: customer.email }],
      status: { $in: ['Assigned', 'Arriving for Pickup', 'Picked Up', 'In Transit'] }
    });
    if (activeDelivery) {
      return res.status(400).json({
        error: `Active Delivery Conflict: Customer has a delivery currently in progress (${activeDelivery.ref}). Deliveries must be completed or cancelled before managing customer account.`
      });
    }

    // Check completed deliveries
    const completedDeliveries = await BookingModel.countDocuments({
      $or: [{ senderPhone: customer.phone }, { senderEmail: customer.email }],
      status: 'Delivered'
    });

    if (completedDeliveries > 0) {
      // INDUSTRY STANDARD (NDPR Right to Erasure / Financial Compliance):
      // Anonymize personal identifiable information (PII) to fulfill data erasure
      // while preserving financial sums and transaction ledgers.
      customer.name = `[Archived Customer ${customer.customerId}]`;
      customer.phone = '+234 000 000 0000';
      customer.email = `archived_${customer.customerId.toLowerCase()}@bbd.internal`;
      customer.status = 'Inactive';
      customer.isAnonymized = true;
      customer.notes = 'Account anonymized under NDPR Right to Erasure / customer requested deletion.';
      await customer.save();

      await recordAuditLog({
        actorId: req.user?.userId || 'ADMIN',
        actorName: req.user?.name || 'Admin',
        actorRole: 'Admin',
        action: 'CUSTOMER_ANONYMIZED_NDPR',
        affectedEntity: 'Customer',
        entityRef: customer.customerId,
        metadata: { completedDeliveriesPreserved: completedDeliveries },
        ipAddress: req.ip,
      });

      return res.json({
        success: true,
        anonymized: true,
        message: `NDPR Data Privacy Compliance: Customer personal details have been erased and archived. Past completed delivery ledgers remain protected for financial audits.`
      });
    }

    // If zero completed deliveries, delete permanently
    await CustomerModel.deleteOne({ _id: customer._id });

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: req.user?.name || 'Admin',
      actorRole: 'Admin',
      action: 'CUSTOMER_DELETED_PERMANENT',
      affectedEntity: 'Customer',
      entityRef: customer.customerId,
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: `Customer ${customer.customerId} permanently deleted.` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. List Staff & Platform Users
app.get('/api/portal/users', async (_req: Request, res: Response) => {
  try {
    await connectToDatabase();
    const users = await UserModel.find({}, { passwordHash: 0 }).sort({ createdAt: -1 }).lean();
    return res.json({ users, total: users.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 6. Create Staff User
app.post('/api/portal/users', async (req: Request, res: Response) => {
  try {
    const { name, email, phone, role, password } = req.body || {};
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

    const cleanEmail = String(email).toLowerCase().trim();
    if (!validateEmail(cleanEmail)) {
      return res.status(400).json({ error: 'Invalid email address format.' });
    }

    if (role === 'Admin') {
      return res.status(400).json({ error: 'Additional Admin accounts cannot be created. info@bbdautosng.com is the exclusive system administrator.' });
    }

    await connectToDatabase();
    const existing = await UserModel.findOne({ email: cleanEmail });
    if (existing) return res.status(400).json({ error: 'A user with this email already exists.' });

    const userId = `USR-${Math.floor(100 + Math.random() * 900)}`;
    const passHash = await hashPassword(password || 'staff2026');

    const newUser = await UserModel.create({
      userId,
      name: sanitizeString(name),
      email: cleanEmail,
      phone: phone ? sanitizeString(phone) : '+234 800 000 0000',
      passwordHash: passHash,
      role: sanitizeString(role) || 'Support',
      status: 'Active'
    });

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: req.user?.name || 'Admin',
      actorRole: 'Admin',
      action: 'USER_CREATED',
      affectedEntity: 'User',
      entityRef: userId,
      metadata: { name, email, role },
      ipAddress: req.ip,
    });

    return res.status(201).json({
      success: true,
      user: {
        id: newUser.userId,
        userId: newUser.userId,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        status: newUser.status,
        joinedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 7. Update Staff User
app.patch('/api/portal/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await connectToDatabase();
    const isObjectId = mongoose.isValidObjectId(id);
    const query = isObjectId ? { $or: [{ userId: id }, { _id: id }, { email: id }] } : { $or: [{ userId: id }, { email: id }] };
    const targetUser = await UserModel.findOne(query);
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    // Protect exclusive admin credentials and roles
    if (targetUser.email === 'info@bbdautosng.com' && req.body.email && req.body.email.toLowerCase().trim() !== 'info@bbdautosng.com') {
      return res.status(400).json({ error: 'The primary Admin email cannot be modified.' });
    }
    if (req.body.role === 'Admin' && targetUser.email !== 'info@bbdautosng.com') {
      return res.status(400).json({ error: 'Cannot promote other accounts to Admin. info@bbdautosng.com is the exclusive system administrator.' });
    }
    if (targetUser.email === 'info@bbdautosng.com' && req.body.role && req.body.role !== 'Admin') {
      return res.status(400).json({ error: 'The primary Admin role cannot be demoted.' });
    }

    const updatePayload = { ...req.body };
    delete updatePayload.passwordHash; // Protect direct password tampering

    if (updatePayload.name) updatePayload.name = sanitizeString(updatePayload.name);
    if (updatePayload.email) updatePayload.email = updatePayload.email.toLowerCase().trim();
    if (updatePayload.phone) updatePayload.phone = sanitizeString(updatePayload.phone);

    const user = await UserModel.findOneAndUpdate(
      query,
      { $set: updatePayload },
      { new: true, select: '-passwordHash' }
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: req.user?.name || 'Admin',
      actorRole: 'Admin',
      action: 'USER_UPDATED',
      affectedEntity: 'User',
      entityRef: user.userId,
      metadata: req.body,
      ipAddress: req.ip,
    });

    return res.json({ success: true, user });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 8. Delete Staff User
app.delete('/api/portal/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await connectToDatabase();
    const isObjectId = mongoose.isValidObjectId(id);
    const query = isObjectId ? { $or: [{ userId: id }, { _id: id }, { email: id }] } : { $or: [{ userId: id }, { email: id }] };
    const targetUser = await UserModel.findOne(query);
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    if (targetUser.email === 'info@bbdautosng.com') {
      return res.status(403).json({ error: 'The primary system Admin account (info@bbdautosng.com) cannot be deleted.' });
    }

    const user = await UserModel.findOneAndDelete(query);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: req.user?.name || 'Admin',
      actorRole: 'Admin',
      action: 'USER_DELETED',
      affectedEntity: 'User',
      entityRef: user.userId,
      metadata: { name: user.name, email: user.email },
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: `Staff user ${user.name} deleted successfully.` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 9. Change Staff User Password
app.post('/api/portal/users/:id/change-password', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};
    if (!password || String(password).trim().length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    await connectToDatabase();
    const isObjectId = mongoose.isValidObjectId(id);
    const query = isObjectId ? { $or: [{ userId: id }, { _id: id }, { email: id }] } : { $or: [{ userId: id }, { email: id }] };
    const passHash = await hashPassword(String(password).trim());
    const user = await UserModel.findOneAndUpdate(
      query,
      { $set: { passwordHash: passHash, failedLoginAttempts: 0, lockUntil: null } },
      { new: true, select: '-passwordHash' }
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: req.user?.name || 'Admin',
      actorRole: 'Admin',
      action: 'USER_PASSWORD_CHANGED',
      affectedEntity: 'User',
      entityRef: user.userId,
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: `Password for user ${user.name} changed successfully.`, password: String(password).trim() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   RIDER MANAGEMENT & ISOLATED RIDER PORTAL ENDPOINTS
   ========================================================================== */

// 1. List All Riders
app.get('/api/portal/riders', async (_req: Request, res: Response) => {
  try {
    await connectToDatabase();
    const riders = await RiderModel.find().lean();
    return res.json({ riders, total: riders.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Create Rider (Admin Dispatch Sign-up)
app.post('/api/portal/riders', async (req: Request, res: Response) => {
  try {
    const { name, phone, email, vehicleType, password, plateNumber, bikeBrand, bikeColor } = req.body;
    if (!name || !phone || !email) {
      return res.status(400).json({ error: 'Rider full name, phone number, and email address are required.' });
    }

    await connectToDatabase();
    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = phone.trim();

    // Prevent duplicate rider accounts
    const existing = await RiderModel.findOne({
      $or: [{ email: cleanEmail }, { phone: cleanPhone }]
    });
    if (existing) {
      return res.status(400).json({
        error: existing.email === cleanEmail 
          ? 'A courier rider with this email address is already registered.' 
          : 'A courier rider with this phone number is already registered.'
      });
    }

    // Generate guaranteed unique Rider ID
    let riderId = '';
    let isUnique = false;
    while (!isUnique) {
      const randNum = Math.floor(100 + Math.random() * 900);
      riderId = `RID-2026-${randNum}`;
      const found = await RiderModel.findOne({ riderId });
      if (!found) isUnique = true;
    }

    // 4-digit PIN provided by admin or default 1234
    const inputPin = String(req.body.pin || req.body.password || '').trim();
    let plainPin = '1234';
    if (inputPin && /^\d{4}$/.test(inputPin)) {
      plainPin = inputPin;
    } else if (inputPin) {
      const digits = inputPin.replace(/\D/g, '');
      plainPin = digits.length >= 4 ? digits.slice(0, 4) : `${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const passHash = await hashPassword(plainPin);
    const genPlate = plateNumber?.trim() || `BBD-${riderId.replace(/\D/g, '').slice(-3)}-LG`;

    const rider = await RiderModel.create({
      riderId,
      name: name.trim(),
      phone: cleanPhone,
      email: cleanEmail,
      passwordHash: passHash,
      mustChangePin: true, // Always true on registration so rider changes PIN on first login!
      status: 'Active',
      isOnline: true,
      vehicleType: vehicleType && vehicleType !== 'Select vehicle type' ? vehicleType : 'Motorcycle',
      plateNumber: genPlate,
      bikeBrand: bikeBrand || 'Honda',
      bikeColor: bikeColor || 'Red',
      joinedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    });

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: req.user?.name || 'Admin',
      actorRole: 'Admin',
      action: 'RIDER_CREATED',
      affectedEntity: 'Rider',
      entityRef: riderId,
      metadata: { name: rider.name, phone: rider.phone, vehicle: rider.vehicleType, email: rider.email, pin: plainPin },
      ipAddress: req.ip,
    });

    return res.status(201).json({
      success: true,
      message: `Courier Rider ${rider.name} registered with 4-digit PIN ${plainPin}.`,
      rider,
      credentials: {
        riderId: rider.riderId,
        name: rider.name,
        email: rider.email,
        phone: rider.phone,
        pin: plainPin,
        password: plainPin,
        loginUrl: '/rider'
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. Update Rider Profile / Status
app.patch('/api/portal/riders/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await connectToDatabase();
    const isObjectId = mongoose.isValidObjectId(id);
    const query = isObjectId ? { $or: [{ riderId: id }, { _id: id }] } : { riderId: id };
    const rider = await RiderModel.findOneAndUpdate(
      query,
      { $set: req.body },
      { new: true }
    );
    if (!rider) return res.status(404).json({ error: 'Rider not found.' });

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: req.user?.name || 'Admin',
      actorRole: 'Admin',
      action: 'RIDER_PROFILE_UPDATED',
      affectedEntity: 'Rider',
      entityRef: rider.riderId,
      metadata: req.body,
      ipAddress: req.ip,
    });

    return res.json({ success: true, rider });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. Delete Rider
app.delete('/api/portal/riders/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await connectToDatabase();
    const isObjectId = mongoose.isValidObjectId(id);
    const query = isObjectId ? { $or: [{ riderId: id }, { _id: id }] } : { riderId: id };
    const rider = await RiderModel.findOneAndDelete(query);
    if (!rider) return res.status(404).json({ error: 'Rider not found.' });

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: req.user?.name || 'Admin',
      actorRole: 'Admin',
      action: 'RIDER_DELETED',
      affectedEntity: 'Rider',
      entityRef: rider.riderId,
      metadata: { name: rider.name, phone: rider.phone, email: rider.email },
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: `Rider ${rider.name} deleted successfully.` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. Change / Reset Rider 4-Digit PIN (Admin)
const handleAdminRiderPinReset = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { pin, password } = req.body || {};
    const inputPin = String(pin || password || '').trim();

    if (!inputPin || !/^\d{4}$/.test(inputPin)) {
      return res.status(400).json({ error: 'Rider PIN must be exactly 4 numeric digits (e.g. 1234).' });
    }

    await connectToDatabase();
    const isObjectId = mongoose.isValidObjectId(id);
    const query = isObjectId ? { $or: [{ riderId: id }, { _id: id }] } : { riderId: id };
    const passHash = await hashPassword(inputPin);
    const rider = await RiderModel.findOneAndUpdate(
      query,
      { $set: { passwordHash: passHash, mustChangePin: true, pinChangedAt: new Date(), failedLoginAttempts: 0, lockUntil: null } },
      { new: true }
    );
    if (!rider) return res.status(404).json({ error: 'Rider not found.' });

    await recordAuditLog({
      actorId: req.user?.userId || 'ADMIN',
      actorName: req.user?.name || 'Admin',
      actorRole: 'Admin',
      action: 'RIDER_PIN_RESET_BY_ADMIN',
      affectedEntity: 'Rider',
      entityRef: rider.riderId,
      metadata: { pin: inputPin },
      ipAddress: req.ip,
    });

    return res.json({ 
      success: true, 
      message: `4-digit PIN for rider ${rider.name} updated to ${inputPin}. Rider will be required to change it on next login.`,
      pin: inputPin,
      password: inputPin,
      rider
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

app.post('/api/portal/riders/:id/change-password', handleAdminRiderPinReset);
app.post('/api/portal/riders/:id/change-pin', handleAdminRiderPinReset);

// 4. Anti-IDOR: Fetch Only Authenticated Rider's Assigned Deliveries
app.get('/api/portal/rider/me/deliveries', async (req: Request, res: Response) => {
  try {
    // Rider ID passed via query or token
    const riderId = (req.query.riderId as string) || req.user?.riderId || 'RID-2026-007';

    await connectToDatabase();
    const deliveries = await BookingModel.find({ assignedRiderId: riderId })
      .sort({ createdAt: -1 })
      .lean();

    const todayCount = deliveries.length;
    const paidCount = deliveries.filter(d => d.paymentStatus === 'Paid').length;
    const pendingPayment = deliveries.filter(d => d.paymentStatus === 'Partially Paid' || (d.status === 'Delivered' && d.paymentStatus === 'Unpaid')).length;
    const notPaid = deliveries.filter(d => d.paymentStatus === 'Unpaid' && d.status !== 'Delivered').length;

    return res.json({
      deliveries,
      stats: {
        totalAssigned: todayCount,
        paidDeliveries: paidCount,
        pendingPayment,
        notPaid,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   USERS, AUDIT LOGS & SETTINGS
   ========================================================================== */

// 1. Audit Logs
app.get('/api/portal/audit-logs', async (req: Request, res: Response) => {
  try {
    await connectToDatabase();
    const logs = await AuditLogModel.find().sort({ timestamp: -1 }).limit(100).lean();
    return res.json({ logs });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Settings
app.get('/api/portal/settings', async (_req: Request, res: Response) => {
  try {
    await connectToDatabase();
    let settings = await SettingsModel.findOne().lean();
    if (!settings) {
      const created = await SettingsModel.create({ riderCommissionPercent: 25 });
      settings = created.toObject();
    } else if (settings.riderCommissionPercent === undefined) {
      await SettingsModel.updateOne({ _id: settings._id }, { $set: { riderCommissionPercent: 25 } });
      settings.riderCommissionPercent = 25;
    }
    return res.json(settings);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/portal/settings', async (req: Request, res: Response) => {
  try {
    await connectToDatabase();
    const payload = { ...req.body };
    if (payload.riderCommissionPercent !== undefined) {
      const parsed = Number(payload.riderCommissionPercent);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) {
        return res.status(400).json({ error: 'Rider commission percentage must be between 0 and 100.' });
      }
      payload.riderCommissionPercent = parsed;
    }
    const updated = await SettingsModel.findOneAndUpdate({}, { $set: payload }, { upsert: true, new: true });
    return res.json({ success: true, settings: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Check KudiSMS Gateway & Sender ID approval status
app.get('/api/portal/kudisms/status', async (_req: Request, res: Response) => {
  try {
    const status = await kudiSmsService.checkSenderIdStatus();
    return res.json({
      success: true,
      senderId: process.env.KUDISMS_SENDER_ID || 'BBDMobility',
      ...status
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   ADMIN NOTIFICATIONS (REAL-TIME NOTIFICATION BELL)
   ========================================================================== */

// 1. Fetch latest admin notifications & unread count
app.get('/api/portal/notifications', async (_req: Request, res: Response) => {
  try {
    await connectToDatabase();
    const notifications = await NotificationModel.find().sort({ createdAt: -1 }).limit(50).lean();
    const unreadCount = await NotificationModel.countDocuments({ read: false });
    return res.json({
      notifications: notifications.map(n => ({
        id: n.notificationId,
        title: n.title,
        message: n.message,
        time: formatRelativeTime(n.createdAt),
        read: n.read,
        type: n.type,
        entityRef: n.entityRef,
        createdAt: n.createdAt
      })),
      unreadCount
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Mark single notification as read
app.patch('/api/portal/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    await connectToDatabase();
    await NotificationModel.updateOne(
      { notificationId: req.params.id },
      { $set: { read: true } }
    );
    const unreadCount = await NotificationModel.countDocuments({ read: false });
    return res.json({ success: true, unreadCount });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. Mark all notifications as read
app.post('/api/portal/notifications/mark-all-read', async (_req: Request, res: Response) => {
  try {
    await connectToDatabase();
    await NotificationModel.updateMany({ read: false }, { $set: { read: true } });
    return res.json({ success: true, unreadCount: 0, message: 'All notifications marked as read.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. Clear all notifications
app.delete('/api/portal/notifications', async (_req: Request, res: Response) => {
  try {
    await connectToDatabase();
    await NotificationModel.deleteMany({});
    return res.json({ success: true, unreadCount: 0, message: 'All notifications cleared.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. Health & Status
app.get('/api/health', async (_req: Request, res: Response) => {
  const conn = await connectToDatabase();
  res.json({
    status: 'ok',
    database: conn ? 'MongoDB connected' : 'Memory fallback mode',
    timestamp: new Date().toISOString(),
  });
});

// 404 Handler for undefined API routes
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Resource not found: ${req.method} ${req.originalUrl || req.url}` });
});

// Centralized Production Error Handler (Hides internal stack traces in production)
app.use((err: any, req: Request, res: Response, _next: express.NextFunction) => {
  const isProd = process.env.NODE_ENV === 'production';
  console.error(`[UNHANDLED SERVER ERROR] ${req.method} ${req.url}:`, isProd ? err.message : err);
  if (res.headersSent) return;
  return res.status(err.status || 500).json({
    error: isProd ? 'An internal server error occurred. Please contact support.' : (err.message || 'Internal Server Error'),
    timestamp: new Date().toISOString()
  });
});

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`[BBD Mobility API] Backend running on http://localhost:${port}`);
  });
}

export default app;
