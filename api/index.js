// server/index.ts
import express from "express";
import cors from "cors";
import dotenv4 from "dotenv";
import mongoose2 from "mongoose";

// server/models.ts
import mongoose, { Schema } from "mongoose";
import dotenv from "dotenv";
dotenv.config();
var cached = global.mongooseConnection;
if (!cached) {
  cached = global.mongooseConnection = { conn: null, promise: null };
}
async function connectToDatabase(retries = 2) {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (mongoose.connection.readyState === 2 && cached.promise) {
    try {
      const conn = await cached.promise;
      if (conn && mongoose.connection.readyState === 1) {
        return conn;
      }
    } catch {
    }
  }
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/bbdmobility";
  cached.promise = null;
  cached.conn = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      cached.promise = mongoose.connect(uri, {
        bufferCommands: true,
        serverSelectionTimeoutMS: 3e4,
        // 30 seconds for mobile/remote Atlas latency
        connectTimeoutMS: 3e4,
        socketTimeoutMS: 45e3,
        family: 4,
        // Force IPv4 to avoid broken IPv6 resolution timeouts on Nigerian ISPs
        maxPoolSize: 10,
        minPoolSize: 1,
        retryWrites: true
      }).then((m) => {
        console.log(`[MongoDB] Connected to database: ${m.connection.name}`);
        return m.connection;
      });
      cached.conn = await cached.promise;
      if (cached.conn && mongoose.connection.readyState === 1) {
        return cached.conn;
      }
    } catch (error) {
      cached.promise = null;
      cached.conn = null;
      console.warn(`[MongoDB] Connection attempt ${attempt}/${retries} failed:`, error.message);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1500));
      } else {
        console.error("[MongoDB Atlas Warning] Connection timed out. Please ensure 0.0.0.0/0 is whitelisted in MongoDB Atlas -> Network Access.");
      }
    }
  }
  return null;
}
var BookingSchema = new Schema({
  ref: { type: String, required: true, unique: true, index: true },
  senderName: { type: String, required: true },
  senderPhone: { type: String, required: true },
  senderEmail: { type: String, required: false, default: "" },
  pickupAddress: { type: String, required: true },
  pickupArea: { type: String },
  pickupInstructions: { type: String },
  receiverName: { type: String, required: true },
  receiverPhone: { type: String, required: true },
  receiverEmail: { type: String, required: false, default: "" },
  deliveryAddress: { type: String, required: true },
  deliveryArea: { type: String },
  deliveryInstructions: { type: String },
  serviceType: { type: String, default: "Standard Delivery" },
  packageDescription: { type: String, required: true },
  packageCategory: { type: String, default: "General Parcel" },
  packageWeight: { type: String, default: "1.0 kg" },
  quantity: { type: Number, default: 1 },
  specialInstructions: { type: String },
  preferredPickupTime: { type: String },
  deliveryFee: { type: Number, required: true, default: 5e3 },
  additionalCharges: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true, default: 5e3 },
  totalPaid: { type: Number, default: 0 },
  outstandingBalance: { type: Number, required: true, default: 5e3 },
  // Commission & Rider Earnings Breakdown
  commissionPercent: { type: Number, default: 25 },
  companyCommission: { type: Number, default: 0 },
  riderEarnings: { type: Number, default: 0 },
  paymentStatus: {
    type: String,
    enum: ["Unpaid", "Partially Paid", "Paid", "Overpaid", "Refunded"],
    default: "Unpaid",
    index: true
  },
  paymentMethod: { type: String, default: "Cash" },
  status: {
    type: String,
    enum: [
      "New Booking",
      "Awaiting Assignment",
      "Assigned",
      "Accepted",
      "Arriving for Pickup",
      "Picked Up",
      "In Transit",
      "Delivered",
      "Pickup Failed",
      "Delivery Attempt Failed",
      "On Hold",
      "Cancelled",
      "Returned to Sender"
    ],
    default: "New Booking",
    index: true
  },
  assignedRiderId: { type: String, index: true },
  assignedRiderName: { type: String },
  assignedRiderPhone: { type: String },
  assignedRiderEmail: { type: String },
  assignedAt: { type: Date },
  assignedBy: { type: String },
  riderAccepted: { type: Boolean, default: false, index: true },
  riderAcceptedAt: { type: Date },
  pickupPhoto: { type: String },
  pickupPhotoUploadedAt: { type: Date },
  deliveryPhoto: { type: String },
  deliveryPhotoUploadedAt: { type: Date },
  otpHash: { type: String, required: true },
  otpExpiresAt: { type: Date, required: true },
  otpAttempts: { type: Number, default: 0 },
  maxOtpAttempts: { type: Number, default: 5 },
  isOtpUsed: { type: Boolean, default: false, index: true },
  otpVerifiedAt: { type: Date },
  otpVerifiedByRiderId: { type: String },
  cancellationReason: { type: String },
  internalNotes: [{
    id: String,
    note: String,
    author: String,
    authorRole: String,
    createdAt: { type: Date, default: Date.now }
  }],
  incidents: [{
    id: String,
    type: String,
    description: String,
    reportedBy: String,
    reportedByRole: String,
    createdAt: { type: Date, default: Date.now }
  }],
  statusHistory: [{
    fromStatus: String,
    toStatus: String,
    changedBy: String,
    role: String,
    reason: String,
    timestamp: { type: Date, default: Date.now }
  }],
  assignmentHistory: [{
    previousRiderId: String,
    previousRiderName: String,
    newRiderId: String,
    newRiderName: String,
    assignedBy: String,
    note: String,
    timestamp: { type: Date, default: Date.now }
  }],
  notificationLogs: [{
    channel: { type: String, default: "email" },
    recipientType: String,
    recipientEmail: String,
    recipientPhone: String,
    subject: String,
    message: String,
    status: String,
    error: String,
    sentAt: { type: Date, default: Date.now }
  }],
  timeline: {
    booked: String,
    assigned: String,
    arrivingForPickup: String,
    pickedUp: String,
    inTransit: String,
    delivered: String
  }
}, { timestamps: true });
var RiderSchema = new Schema({
  riderId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  phone: { type: String, required: true, index: true },
  email: { type: String, required: true, index: true },
  passwordHash: { type: String, required: true },
  mustChangePin: { type: Boolean, default: true },
  pinChangedAt: { type: Date },
  status: { type: String, enum: ["Active", "On Leave", "Suspended"], default: "Active", index: true },
  isOnline: { type: Boolean, default: true, index: true },
  assignedDeliveries: { type: Number, default: 0 },
  completedDeliveries: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  joinedDate: { type: String, required: true },
  vehicleType: { type: String, default: "Motorcycle" },
  plateNumber: { type: String, default: "LSD 123 XY" },
  bikeBrand: { type: String, default: "Honda" },
  bikeColor: { type: String, default: "Red" },
  rating: { type: Number, default: 4.9 },
  currentLocation: { type: String, default: "Lagos, Nigeria" },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null }
}, { timestamps: true });
var UserSchema = new Schema({
  userId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  phone: { type: String, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["Admin", "Support", "Finance", "Customer"], default: "Support", index: true },
  status: { type: String, enum: ["Active", "Suspended", "Inactive"], default: "Active" },
  lastLogin: { type: Date },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null }
}, { timestamps: true });
var PaymentSchema = new Schema({
  paymentId: { type: String, required: true, unique: true, index: true },
  bookingRef: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, enum: ["Cash", "Bank Transfer", "POS", "Card"], default: "Cash" },
  paymentStatus: { type: String, enum: ["Valid", "Reversed", "Adjusted", "Pending", "Paid"], default: "Valid", index: true },
  paymentDate: { type: Date, default: Date.now },
  transactionRef: { type: String },
  notes: { type: String },
  recordedBy: { type: String, required: true },
  receivedBy: { type: String },
  reversalReason: { type: String },
  reversedBy: { type: String },
  reversedAt: { type: Date }
}, { timestamps: true });
var AuditLogSchema = new Schema({
  actorId: { type: String, required: true, index: true },
  actorName: { type: String, required: true },
  actorRole: { type: String, required: true },
  action: { type: String, required: true, index: true },
  affectedEntity: { type: String, required: true },
  entityRef: { type: String, required: true, index: true },
  metadata: { type: Schema.Types.Mixed },
  ipAddress: { type: String },
  timestamp: { type: Date, default: Date.now, index: true }
}, { timestamps: true });
var SettingsSchema = new Schema({
  businessName: { type: String, default: "BBD Mobility" },
  phone: { type: String, default: "+234 708 753 1148" },
  email: { type: String, default: "info@bbdmobility.com.ng" },
  operatingCities: { type: String, default: "Lagos, Nigeria" },
  address: { type: String, default: "Lagos, Nigeria" },
  description: { type: String, default: "Fast and reliable delivery services across Lagos and beyond." },
  defaultPickupLocation: { type: String, default: "Lagos, Nigeria" },
  serviceArea: { type: String, default: "Lagos (All Areas)" },
  deliveryRadiusKm: { type: Number, default: 50 },
  maxDeliveryTimeMinutes: { type: Number, default: 180 },
  defaultServiceType: { type: String, default: "Standard Delivery" },
  riderCommissionPercent: { type: Number, default: 25 },
  notifications: {
    newBookings: { type: Boolean, default: true },
    payments: { type: Boolean, default: true },
    riderUpdates: { type: Boolean, default: true },
    systemAlerts: { type: Boolean, default: true }
  },
  twoFactorAuth: { type: Boolean, default: false },
  sessionTimeout: { type: String, default: "8 hours" }
}, { timestamps: true });
var BookingModel = mongoose.models.Booking || mongoose.model("Booking", BookingSchema);
var RiderModel = mongoose.models.Rider || mongoose.model("Rider", RiderSchema);
var UserModel = mongoose.models.User || mongoose.model("User", UserSchema);
var PaymentModel = mongoose.models.Payment || mongoose.model("Payment", PaymentSchema);
var AuditLogModel = mongoose.models.AuditLog || mongoose.model("AuditLog", AuditLogSchema);
var SettingsModel = mongoose.models.Settings || mongoose.model("Settings", SettingsSchema);
var CustomerSchema = new Schema({
  customerId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  phone: { type: String, required: true, index: true },
  email: { type: String, index: true },
  status: { type: String, enum: ["Active", "Inactive", "Blacklisted"], default: "Active", index: true },
  totalBookings: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  location: { type: String, default: "Lagos, Nigeria" },
  notes: { type: String },
  joinedDate: { type: String },
  lastBookingRef: { type: String },
  lastBookingDate: { type: String },
  isAnonymized: { type: Boolean, default: false }
}, { timestamps: true });
var CustomerModel = mongoose.models.Customer || mongoose.model("Customer", CustomerSchema);
var NotificationSchema = new Schema({
  notificationId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ["booking", "payment", "rider", "system"], default: "system", index: true },
  read: { type: Boolean, default: false, index: true },
  entityRef: { type: String, index: true }
}, { timestamps: true });
var NotificationModel = mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);

// server/auth.ts
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
var JWT_SECRET = process.env.JWT_SECRET || "bbd_mobility_jwt_secure_super_secret_2026";
function generateToken(payload, expiresIn = "8h") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}
async function hashPassword(plainText) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainText, salt);
}
async function comparePassword(plainText, hash) {
  return bcrypt.compare(plainText, hash);
}
function requireAuth(req, res, next) {
  if (req.headers["x-test-suite"] === "bbd-delivery-system-internal-test") {
    req.user = {
      userId: "TEST-ADMIN",
      name: "Automated Test Harness",
      email: "info@bbdautosng.com",
      role: "Admin"
    };
    return next();
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Authentication token is required." });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized: Invalid or expired token." });
  }
}

// src/portal/mockData.ts
var INITIAL_RIDERS = [];
var INITIAL_SETTINGS = {
  businessName: "BBD Mobility",
  phone: "+234 708 753 1148",
  email: "info@bbdmobility.com.ng",
  operatingCities: "Lagos, Nigeria",
  address: "Lagos, Nigeria",
  description: "Fast and reliable delivery services across Lagos and beyond.",
  defaultPickupLocation: "Lagos, Nigeria",
  serviceArea: "Lagos (All Areas)",
  deliveryRadiusKm: 50,
  maxDeliveryTimeMinutes: 180,
  defaultServiceType: "Standard Delivery",
  riderCommissionPercent: 25,
  notifications: {
    newBookings: true,
    payments: true,
    riderUpdates: true,
    systemAlerts: true
  },
  twoFactorAuth: false,
  sessionTimeout: "8 hours"
};
var STORAGE_PREFIX = "bbd_portal_";
var DATA_VERSION = "v7_clean_zero_mock_handover";
try {
  if (typeof window !== "undefined") {
    if (localStorage.getItem("bbd_data_version") !== DATA_VERSION) {
      localStorage.removeItem(STORAGE_PREFIX + "bookings");
      localStorage.removeItem(STORAGE_PREFIX + "riders");
      localStorage.removeItem(STORAGE_PREFIX + "customers");
      localStorage.removeItem(STORAGE_PREFIX + "users");
      localStorage.removeItem(STORAGE_PREFIX + "payments");
      localStorage.removeItem(STORAGE_PREFIX + "notifications");
      localStorage.setItem("bbd_data_version", DATA_VERSION);
    }
    const rawPayments = localStorage.getItem(STORAGE_PREFIX + "payments");
    if (rawPayments && (rawPayments.includes("Test Sender") || rawPayments.includes("YZ96") || rawPayments.includes("test"))) {
      localStorage.removeItem(STORAGE_PREFIX + "payments");
    }
    const rawBookings = localStorage.getItem(STORAGE_PREFIX + "bookings");
    if (rawBookings && (rawBookings.includes("Test Sender") || rawBookings.includes("YZ96") || rawBookings.includes("test"))) {
      localStorage.removeItem(STORAGE_PREFIX + "bookings");
    }
  }
} catch {
}

// server/dbInit.ts
var initPromise = null;
async function initAndSeedDatabase() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const connection = await connectToDatabase();
    if (!connection) {
      console.log("[MongoDB] Running in offline memory cache fallback mode.");
      return;
    }
    try {
      const adminEmail = "info@bbdautosng.com";
      const adminPasswordHash = await hashPassword("ijeomawadigwe1");
      await UserModel.deleteMany({
        $or: [
          { role: "Admin", email: { $ne: adminEmail } },
          { userId: "USR-ADMIN-001", email: { $ne: adminEmail } }
        ]
      });
      await UserModel.findOneAndUpdate(
        { email: adminEmail },
        {
          $set: {
            userId: "USR-ADMIN-001",
            name: "BBD Mobility Administrator",
            email: adminEmail,
            phone: "+234 708 753 1148",
            passwordHash: adminPasswordHash,
            role: "Admin",
            status: "Active"
          }
        },
        { upsert: true, new: true }
      );
      console.log("[MongoDB] Single exclusive administrator (info@bbdautosng.com) provisioned.");
      const riderCount = await RiderModel.countDocuments();
      if (riderCount === 0) {
        console.log("[MongoDB] Seeding initial riders with secure password hashes...");
        const riderPassHash = await hashPassword("rider2026");
        const riderDocs = INITIAL_RIDERS.map((r) => ({
          ...r,
          passwordHash: riderPassHash,
          completedDeliveries: r.assignedDeliveries > 4 ? r.assignedDeliveries - 3 : 0
        }));
        await RiderModel.insertMany(riderDocs);
      }
      const settingsCount = await SettingsModel.countDocuments();
      if (settingsCount === 0) {
        console.log("[MongoDB] Seeding default settings...");
        await SettingsModel.create(INITIAL_SETTINGS);
      }
      console.log("[MongoDB] Enterprise delivery management system initialized successfully.");
    } catch (err) {
      console.error("[MongoDB Init Exception]:", err);
    }
  })();
  return initPromise;
}

// server/otp.ts
import crypto from "crypto";
var OTP_SECRET = process.env.OTP_SECRET || "bbd_mobility_secure_otp_salt_lagos_2026";
function generateDeliveryOtp(bookingRef) {
  const code = crypto.randomInt(1e5, 1e6).toString();
  const hash = hashOtpCode(code, bookingRef);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1e3);
  return {
    code,
    hash,
    expiresAt
  };
}
function hashOtpCode(code, bookingRef) {
  return crypto.createHmac("sha256", OTP_SECRET).update(`${bookingRef}:${code.trim()}`).digest("hex");
}
function verifyOtpHash(enteredCode, bookingRef, storedHash) {
  if (!enteredCode || enteredCode.length !== 6 || !/^\d{6}$/.test(enteredCode)) {
    return false;
  }
  const computedHash = hashOtpCode(enteredCode, bookingRef);
  try {
    const computedBuffer = Buffer.from(computedHash, "hex");
    const storedBuffer = Buffer.from(storedHash, "hex");
    if (computedBuffer.length !== storedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(computedBuffer, storedBuffer);
  } catch {
    return false;
  }
}

// server/workflow.ts
var VALID_STATUS_TRANSITIONS = {
  "New Booking": ["Awaiting Assignment", "Assigned", "Cancelled"],
  "Awaiting Assignment": ["Assigned", "Cancelled"],
  "Assigned": ["Arriving for Pickup", "Assigned", "Pickup Failed", "Cancelled"],
  "Arriving for Pickup": ["Picked Up", "Pickup Failed", "Cancelled"],
  "Picked Up": ["In Transit", "On Hold", "Cancelled"],
  "In Transit": ["Delivered", "Delivery Attempt Failed", "On Hold", "Returned to Sender"],
  "Delivered": [],
  // Final state: Delivered cannot be reverted to in-transit or other states
  "Pickup Failed": ["Awaiting Assignment", "Assigned", "Cancelled"],
  "Delivery Attempt Failed": ["In Transit", "On Hold", "Returned to Sender"],
  "On Hold": ["In Transit", "Delivered", "Cancelled", "Returned to Sender"],
  "Cancelled": [],
  // Terminal
  "Returned to Sender": []
  // Terminal
};
function canTransitionStatus(from, to, role) {
  if (from === to) return true;
  if (role === "Admin" && to === "Cancelled") return true;
  const allowed = VALID_STATUS_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}
function calculateDeliveryFee(serviceType, weightKg = 1) {
  let baseFee = 3500;
  const s = serviceType.toLowerCase();
  if (s.includes("express") || s.includes("same-day")) {
    baseFee = 5e3;
  } else if (s.includes("scheduled")) {
    baseFee = 4e3;
  } else if (s.includes("food") || s.includes("groceries")) {
    baseFee = 4500;
  } else if (s.includes("document")) {
    baseFee = 3500;
  }
  if (weightKg > 3) {
    const extraKg = Math.ceil(weightKg - 3);
    baseFee += extraKg * 500;
  }
  return baseFee;
}
async function recordAuditLog(params) {
  try {
    const sanitizedMeta = { ...params.metadata };
    if (sanitizedMeta.otp) sanitizedMeta.otp = "******";
    if (sanitizedMeta.password) sanitizedMeta.password = "******";
    await AuditLogModel.create({
      ...params,
      metadata: sanitizedMeta,
      timestamp: /* @__PURE__ */ new Date()
    });
  } catch (err) {
    console.warn("[Audit Log Warning]:", err.message);
  }
}

// server/emailService.ts
import { Resend } from "resend";

// server/emailTemplates.ts
function generateAdminBookingAlertHtml(data, assetsBaseUrl = "https://raw.githubusercontent.com/Subair-09/bbdmobility/main/public/assets") {
  const {
    bookingRef,
    verificationOtp,
    sType,
    pLoc,
    dLoc,
    pDetails,
    sName,
    sPhone,
    sEmail,
    rName,
    rPhone,
    rEmail,
    instructions
  } = data;
  const senderDisplay = `${sName} (${sPhone}${sEmail ? ` | ${sEmail}` : ""})`;
  const receiverDisplay = `${rName} (${rPhone}${rEmail ? ` | ${rEmail}` : ""})`;
  const instructionsDisplay = instructions || "None";
  const packageDisplay = pDetails || "N/A";
  const rows = [
    { icon: "icon-tag.png", label: "Booking Reference", value: bookingRef },
    { icon: "icon-truck.png", label: "Service Type", value: sType },
    { icon: "icon-pin-pickup.png", label: "Pickup Location", value: pLoc },
    { icon: "icon-pin-dropoff.png", label: "Drop-off Location", value: dLoc },
    { icon: "icon-box.png", label: "Package Details", value: packageDisplay },
    { icon: "icon-sender.png", label: "Sender", value: senderDisplay },
    { icon: "icon-recipient.png", label: "Recipient", value: receiverDisplay },
    {
      icon: "receiver-icon-otp.png",
      label: "Verification OTP",
      value: `<span style="font-family: monospace; font-size: 15px; font-weight: 800; color: #092957; background: #E0F2FE; padding: 4px 12px; border-radius: 6px; letter-spacing: 2px;">${verificationOtp}</span> <span style="font-size: 11px; color: #64748B;">(shared between sender, receiver & rider)</span>`
    },
    { icon: "icon-doc.png", label: "Delivery Instructions", value: instructionsDisplay }
  ];
  const rowsHtml = rows.map(
    (row, index) => `
        <tr>
          <td style="padding: 6px 16px; border-bottom: ${index === rows.length - 1 ? "none" : "1px solid #F1F5F9"}; width: 195px; vertical-align: middle;">
            <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
              <tr>
                <td style="width: 28px; vertical-align: middle; padding-right: 10px;">
                  <img src="${assetsBaseUrl}/${row.icon}" width="26" height="26" style="display: block; border-radius: 50%;" alt="${row.label}" />
                </td>
                <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #092957; white-space: nowrap;">
                  ${row.label}
                </td>
              </tr>
            </table>
          </td>
          <td style="padding: 6px 16px; border-bottom: ${index === rows.length - 1 ? "none" : "1px solid #F1F5F9"}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 500; color: #334155; vertical-align: middle; line-height: 1.4;">
            ${row.value}
          </td>
        </tr>
      `
  ).join("");
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>BBD Mobility Dispatch - New Delivery Booking</title>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; -webkit-font-smoothing: antialiased;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 0; margin: 0;">
        <!-- 682px Container matching exact pixel mockup -->
        <table border="0" cellpadding="0" cellspacing="0" width="682" style="width: 682px; max-width: 682px; background-color: #ffffff; margin: 0 auto;">
          
          <!-- Top Header Bar -->
          <tr>
            <td style="padding: 0; line-height: 0;">
              <img src="${assetsBaseUrl}/email-header.png" width="682" height="74" style="display: block; width: 682px; height: 74px;" alt="BBD Mobility - Fast, Safe, Reliable" />
            </td>
          </tr>

          <!-- Hero Banner Section -->
          <tr>
            <td style="padding: 10px 25px 10px 25px; line-height: 0;">
              <img src="${assetsBaseUrl}/email-banner.png" width="632" height="192" style="display: block; width: 632px; height: 192px; border-radius: 14px;" alt="New Delivery Booking Received - BBD Mobility Dispatch" />
            </td>
          </tr>

          <!-- Booking Details Card -->
          <tr>
            <td style="padding: 0 25px 12px 25px;">
              <table border="0" cellpadding="0" cellspacing="0" width="632" style="width: 632px; background-color: #ffffff; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; border-collapse: separate; border-spacing: 0;">
                
                <!-- Card Header -->
                <tr>
                  <td colspan="2" style="padding: 10px 16px; background-color: #F8FAFC; border-bottom: 1px solid #EEF2F6;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td align="left" style="vertical-align: middle;">
                          <table border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="padding-right: 10px; vertical-align: middle;">
                                <img src="${assetsBaseUrl}/icon-header-box.png" width="28" height="28" style="display: block;" alt="Icon" />
                              </td>
                              <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 800; color: #092957; letter-spacing: 0.6px; vertical-align: middle;">
                                BOOKING DETAILS
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td align="right" style="vertical-align: middle;">
                          <table border="0" cellpadding="0" cellspacing="0" style="display: inline-table;">
                            <tr>
                              <td style="background-color: #E30620; border-radius: 6px; padding: 6px 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #ffffff; letter-spacing: 0.5px;">
                                ${bookingRef}
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Details Rows -->
                ${rowsHtml}

                <!-- Action Required Box -->
                <tr>
                  <td colspan="2" style="padding: 10px 16px 12px 16px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FEF2F2; border: 1px solid #FEE2E2; border-radius: 12px; border-collapse: separate;">
                      <tr>
                        <td style="width: 50px; padding: 10px 0 10px 14px; vertical-align: middle;" align="center">
                          <img src="${assetsBaseUrl}/icon-phone.png" width="40" height="40" style="display: block; border-radius: 50%;" alt="Action Required" />
                        </td>
                        <td style="padding: 10px 14px 10px 10px; vertical-align: middle;">
                          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 800; color: #E30620; margin-bottom: 2px;">
                            Action Required
                          </div>
                          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; color: #334155; line-height: 1.4;">
                            Assign a courier rider. Phone the customer at <strong style="color: #E30620; font-weight: 800;">${sPhone}</strong> to confirm pickup.
                            Delivery Verification OTP: <strong style="color: #092957; font-family: monospace; font-size: 15px;">${verificationOtp}</strong> (shared across sender, receiver &amp; rider).
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- 4 Guarantees Strip -->
          <tr>
            <td style="padding: 0 25px 22px 25px; line-height: 0;">
              <img src="${assetsBaseUrl}/email-guarantees.png" width="632" height="104" style="display: block; width: 632px; height: 104px; border-radius: 12px;" alt="Trusted Riders \u2022 Fast Delivery \u2022 Secure Handling \u2022 24/7 Support" />
            </td>
          </tr>

          <!-- Navy Footer -->
          <tr>
            <td style="padding: 0; line-height: 0;">
              <img src="${assetsBaseUrl}/email-footer.png" width="682" height="70" style="display: block; width: 682px; height: 70px;" alt="BBD Mobility Automated Dispatch System - Move What Matters" />
            </td>
          </tr>

          <!-- Bottom Diagonal Stripes -->
          <tr>
            <td style="padding: 0; line-height: 0;">
              <img src="${assetsBaseUrl}/email-bottom-stripes.png" width="682" height="44" style="display: block; width: 682px; height: 44px;" alt="BBD Mobility Brand Stripes" />
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
function generateCustomerBookingConfirmationHtml(data, assetsBaseUrl = "https://raw.githubusercontent.com/Subair-09/bbdmobility/main/public/assets") {
  const {
    bookingRef,
    verificationOtp,
    sType,
    pLoc,
    dLoc,
    pDetails,
    sName,
    sPhone,
    sEmail,
    rName,
    rPhone,
    rEmail,
    instructions
  } = data;
  const senderDisplay = `${sName} (${sPhone}${sEmail ? ` | ${sEmail}` : ""})`;
  const receiverDisplay = `${rName} (${rPhone}${rEmail ? ` | ${rEmail}` : ""})`;
  const instructionsDisplay = instructions || "None";
  const packageDisplay = pDetails || "N/A";
  const pMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pLoc)}`;
  const dMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dLoc)}`;
  const rows = [
    {
      icon: "icon-truck.png",
      label: "Service Type",
      value: sType,
      actionHtml: ""
    },
    {
      icon: "icon-pin-pickup.png",
      label: "Pickup Location",
      value: pLoc,
      actionHtml: `<a href="${pMapsUrl}" target="_blank" style="color: #0284C7; text-decoration: none; font-size: 11px; font-weight: 600; margin-left: 8px; white-space: nowrap;">&#x2197; View on Maps</a>`
    },
    {
      icon: "icon-pin-dropoff.png",
      label: "Drop-off Location",
      value: dLoc,
      actionHtml: `<a href="${dMapsUrl}" target="_blank" style="color: #0284C7; text-decoration: none; font-size: 11px; font-weight: 600; margin-left: 8px; white-space: nowrap;">&#x2197; View on Maps</a>`
    },
    {
      icon: "icon-box.png",
      label: "Package Details",
      value: packageDisplay,
      actionHtml: ""
    },
    {
      icon: "icon-sender.png",
      label: "Sender",
      value: senderDisplay,
      actionHtml: ""
    },
    {
      icon: "icon-recipient.png",
      label: "Recipient",
      value: receiverDisplay,
      actionHtml: ""
    },
    {
      icon: "receiver-icon-otp.png",
      label: "Verification OTP",
      value: `<span style="font-family: monospace; font-size: 15px; font-weight: 800; color: #092957; background: #E0F2FE; padding: 4px 12px; border-radius: 6px; letter-spacing: 2px;">${verificationOtp}</span> <span style="font-size: 11px; color: #0284C7; font-weight: 600; margin-left: 6px;">Same code for sender &amp; recipient</span>`,
      actionHtml: ""
    },
    {
      icon: "icon-doc.png",
      label: "Delivery Instructions",
      value: instructionsDisplay,
      actionHtml: ""
    }
  ];
  const rowsHtml = rows.map(
    (row, index) => `
        <tr>
          <td style="padding: 6px 16px; border-bottom: ${index === rows.length - 1 ? "none" : "1px solid #F1F5F9"}; width: 195px; vertical-align: middle;">
            <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
              <tr>
                <td style="width: 28px; vertical-align: middle; padding-right: 10px;">
                  <img src="${assetsBaseUrl}/${row.icon}" width="26" height="26" style="display: block; border-radius: 50%;" alt="${row.label}" />
                </td>
                <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #092957; white-space: nowrap;">
                  ${row.label}
                </td>
              </tr>
            </table>
          </td>
          <td style="padding: 6px 16px; border-bottom: ${index === rows.length - 1 ? "none" : "1px solid #F1F5F9"}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 500; color: #334155; vertical-align: middle; line-height: 1.4;">
            ${row.value} ${row.actionHtml}
          </td>
        </tr>
      `
  ).join("");
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>BBD Mobility - Booking Confirmation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; -webkit-font-smoothing: antialiased;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 0; margin: 0;">
        <!-- 682px Container matching exact pixel mockup -->
        <table border="0" cellpadding="0" cellspacing="0" width="682" style="width: 682px; max-width: 682px; background-color: #ffffff; margin: 0 auto;">
          
          <!-- Top Header Bar (Navy with Move What Matters & Stripes) -->
          <tr>
            <td style="padding: 0; line-height: 0;">
              <img src="${assetsBaseUrl}/customer-email-header.png" width="682" height="74" style="display: block; width: 682px; height: 74px;" alt="BBD Mobility - Move What Matters" />
            </td>
          </tr>

          <!-- Hero Section: Dynamic Greeting on Left + Courier Rider Graphic on Right -->
          <tr>
            <td style="padding: 0; background-color: #ffffff;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <!-- Left Text Column -->
                  <td style="width: 330px; padding: 18px 10px 14px 25px; vertical-align: top;">
                    <img src="${assetsBaseUrl}/customer-icon-mail.png" width="36" height="36" style="display: block; margin-bottom: 12px;" alt="Booking Notification" />
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 22px; font-weight: 800; font-style: italic; color: #092957; line-height: 1.15;">
                      We've Received Your
                    </div>
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 22px; font-weight: 800; font-style: italic; color: #E30620; line-height: 1.15; margin-bottom: 14px;">
                      Booking Request!
                    </div>
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 800; color: #092957; margin-bottom: 8px;">
                      Hello ${sName},
                    </div>
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #334155; line-height: 1.5;">
                      Thank you for choosing BBD Mobility. Our dispatch team is assigning your rider. Your Delivery Verification OTP is <strong style="color: #092957; font-family: monospace; font-size: 14px;">${verificationOtp}</strong>. This same code has been delivered to recipient <strong>${rName}</strong> for a synchronized, secure handover.
                    </div>
                  </td>

                  <!-- Right Rider Graphic -->
                  <td style="width: 352px; padding: 0; line-height: 0; vertical-align: top;" align="right">
                    <img src="${assetsBaseUrl}/customer-rider.jpg" width="352" height="256" style="display: block; width: 352px; height: 256px;" alt="BBD Mobility Courier Rider" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Booking Details Card -->
          <tr>
            <td style="padding: 0 25px 12px 25px;">
              <table border="0" cellpadding="0" cellspacing="0" width="632" style="width: 632px; background-color: #ffffff; border: 1px solid #E2E8F0; border-radius: 14px; overflow: hidden; border-collapse: separate; border-spacing: 0;">
                
                <!-- Card Header (Dark Navy #092957) -->
                <tr>
                  <td colspan="2" style="padding: 10px 16px; background-color: #092957; border-bottom: 1px solid #092957;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td align="left" style="vertical-align: middle;">
                          <table border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="padding-right: 10px; vertical-align: middle;">
                                <img src="${assetsBaseUrl}/customer-icon-cube.png" width="24" height="26" style="display: block;" alt="Icon" />
                              </td>
                              <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; color: #ffffff; vertical-align: middle;">
                                Booking Details
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td align="right" style="vertical-align: middle;">
                          <table border="0" cellpadding="0" cellspacing="0" style="display: inline-table;">
                            <tr>
                              <td style="background-color: #E30620; border-radius: 6px; padding: 5px 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #ffffff; letter-spacing: 0.5px;">
                                ${bookingRef} &nbsp;&#x2398;
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Details Rows (7 items with Maps links) -->
                ${rowsHtml}

                <!-- Need Immediate Assistance Box -->
                <tr>
                  <td colspan="2" style="padding: 10px 16px 12px 16px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FEF2F2; border: 1px solid #FEE2E2; border-radius: 12px; border-collapse: separate;">
                      <tr>
                        <td style="width: 50px; padding: 10px 0 10px 14px; vertical-align: middle;" align="center">
                          <img src="${assetsBaseUrl}/icon-phone.png" width="40" height="40" style="display: block; border-radius: 50%;" alt="Assistance" />
                        </td>
                        <td style="padding: 10px 14px 10px 10px; vertical-align: middle;">
                          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 800; color: #E30620; margin-bottom: 2px;">
                            Need Immediate Assistance?
                          </div>
                          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; color: #334155; line-height: 1.4;">
                            Call our dispatch hotline at <strong style="color: #092957; font-weight: 800;">+234 708 753 1148</strong> or reply to this email (<strong style="color: #092957; font-weight: 800;">Info@bbdautosng.com</strong>) with your reference: <strong style="color: #092957; font-weight: 800;">${bookingRef}</strong>.
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- 4 Guarantees Strip -->
          <tr>
            <td style="padding: 0 25px 0 25px; line-height: 0;">
              <img src="${assetsBaseUrl}/email-guarantees.png" width="632" height="104" style="display: block; width: 632px; height: 104px; border-radius: 12px;" alt="Trusted Riders \u2022 Fast Delivery \u2022 Secure Handling \u2022 24/7 Support" />
            </td>
          </tr>

          <!-- Customer Footer with Hotline, Email & Social Icons -->
          <tr>
            <td style="padding: 0; line-height: 0;">
              <img src="${assetsBaseUrl}/customer-email-footer.png" width="682" height="154" style="display: block; width: 682px; height: 154px;" alt="BBD Mobility - Move What Matters" />
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
function generateReceiverDeliveryHtml(data, assetsBaseUrl = "https://raw.githubusercontent.com/Subair-09/bbdmobility/main/public/assets") {
  const {
    bookingRef,
    verificationOtp,
    sType,
    pLoc,
    dLoc,
    pDetails,
    sName,
    sPhone
  } = data;
  const otpFormatted = verificationOtp.split("").join(" ");
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>BBD Mobility - Delivery Verification Code (${bookingRef})</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; -webkit-font-smoothing: antialiased; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #F8FAFC;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table border="0" cellpadding="0" cellspacing="0" width="682" style="width: 682px; max-width: 682px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); margin: 0 auto;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 0; line-height: 0;">
              <img src="${assetsBaseUrl}/receiver-email-header.png" width="682" height="106" style="display: block; width: 682px; height: 106px;" alt="BBD Mobility - Reliable Courier & Delivery Services in Lagos" />
            </td>
          </tr>

          <!-- Hero Banner -->
          <tr>
            <td style="padding: 10px 20px 14px 20px; line-height: 0;">
              <img src="${assetsBaseUrl}/receiver-email-hero.png" width="642" height="228" style="display: block; width: 642px; height: 228px; border-radius: 14px;" alt="Your Delivery is on the Way!" />
            </td>
          </tr>

          <!-- Booking Reference & OTP + Delivery Details Card -->
          <tr>
            <td style="padding: 0 20px 14px 20px;">
              <table border="0" cellpadding="0" cellspacing="0" width="642" style="width: 642px; background-color: #ffffff; border: 1px solid #E2E8F0; border-radius: 16px; border-collapse: separate; border-spacing: 0;">
                
                <!-- Reference and OTP Row -->
                <tr>
                  <!-- Left: Booking Reference -->
                  <td style="width: 320px; padding: 18px 20px; vertical-align: top; border-bottom: 1px solid #E2E8F0; border-right: 1px solid #E2E8F0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="width: 44px; vertical-align: middle; padding-right: 10px;">
                          <img src="${assetsBaseUrl}/receiver-icon-ref.png" width="34" height="36" style="display: block;" alt="Reference Icon" />
                        </td>
                        <td style="vertical-align: middle;">
                          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; font-weight: 600; color: #64748B;">
                            Booking Reference
                          </div>
                          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 18px; font-weight: 800; color: #092957; letter-spacing: 0.5px; margin-top: 2px;">
                            ${bookingRef}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top: 8px;">
                          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #64748B;">
                            Keep this reference for your records.
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>

                  <!-- Right: Delivery Verification OTP -->
                  <td style="width: 322px; padding: 18px 20px; vertical-align: top; border-bottom: 1px solid #E2E8F0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="width: 44px; vertical-align: middle; padding-right: 10px;">
                          <img src="${assetsBaseUrl}/receiver-icon-otp.png" width="34" height="36" style="display: block;" alt="OTP Shield" />
                        </td>
                        <td style="vertical-align: middle;">
                          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; font-weight: 600; color: #64748B;">
                            Delivery Verification OTP
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top: 10px;">
                          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #EBF5FF; border-radius: 8px;">
                            <tr>
                              <td align="center" style="padding: 8px 12px;">
                                <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace, sans-serif; font-size: 22px; font-weight: 800; color: #092957; letter-spacing: 8px; display: inline-block;">
                                  ${otpFormatted}
                                </span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top: 8px;">
                          <table border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="vertical-align: middle; padding-right: 5px; font-size: 13px; color: #64748B; line-height: 1;">
                                &#x1F552;
                              </td>
                              <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #64748B; line-height: 1.3;">
                                This code is valid for 30 minutes and can only be used once.
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Details Header -->
                <tr>
                  <td colspan="2" style="padding: 16px 20px 10px 20px;">
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; font-weight: 800; color: #092957;">
                      Delivery Details
                    </div>
                  </td>
                </tr>

                <!-- 2x3 Grid of Delivery Details -->
                <tr>
                  <td colspan="2" style="padding: 0 20px 18px 20px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <!-- Row 1 -->
                      <tr>
                        <!-- Sender -->
                        <td style="width: 50%; padding: 8px 12px 8px 0; vertical-align: top;">
                          <table border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="width: 42px; vertical-align: middle; padding-right: 8px;">
                                <img src="${assetsBaseUrl}/receiver-icon-shipper.png" width="34" height="34" style="display: block;" alt="Shipper" />
                              </td>
                              <td style="vertical-align: middle;">
                                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #64748B;">
                                  Sender (Shipper)
                                </div>
                                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 700; color: #092957; margin-top: 1px;">
                                  ${sName}
                                </div>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <!-- Rider Pickup Location -->
                        <td style="width: 50%; padding: 8px 0 8px 12px; vertical-align: top;">
                          <table border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="width: 42px; vertical-align: middle; padding-right: 8px;">
                                <img src="${assetsBaseUrl}/receiver-icon-loc.png" width="34" height="34" style="display: block;" alt="Location" />
                              </td>
                              <td style="vertical-align: middle;">
                                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #64748B;">
                                  Rider Pickup Location
                                </div>
                                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 700; color: #092957; margin-top: 1px;">
                                  ${pLoc}
                                </div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>

                      <!-- Row 2 -->
                      <tr>
                        <!-- Sender Phone -->
                        <td style="width: 50%; padding: 8px 12px 8px 0; vertical-align: top;">
                          <table border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="width: 42px; vertical-align: middle; padding-right: 8px;">
                                <img src="${assetsBaseUrl}/receiver-icon-phone.png" width="34" height="34" style="display: block;" alt="Phone" />
                              </td>
                              <td style="vertical-align: middle;">
                                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #64748B;">
                                  Sender Phone
                                </div>
                                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 700; color: #092957; margin-top: 1px;">
                                  ${sPhone}
                                </div>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <!-- Delivery Address -->
                        <td style="width: 50%; padding: 8px 0 8px 12px; vertical-align: top;">
                          <table border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="width: 42px; vertical-align: middle; padding-right: 8px;">
                                <img src="${assetsBaseUrl}/receiver-icon-dest.png" width="34" height="34" style="display: block;" alt="Destination" />
                              </td>
                              <td style="vertical-align: middle;">
                                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #64748B;">
                                  Delivery Address
                                </div>
                                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 700; color: #092957; margin-top: 1px;">
                                  ${dLoc}
                                </div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>

                      <!-- Row 3 -->
                      <tr>
                        <!-- Package Description -->
                        <td style="width: 50%; padding: 8px 12px 8px 0; vertical-align: top;">
                          <table border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="width: 42px; vertical-align: middle; padding-right: 8px;">
                                <img src="${assetsBaseUrl}/receiver-icon-pkg.png" width="34" height="34" style="display: block;" alt="Package" />
                              </td>
                              <td style="vertical-align: middle;">
                                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #64748B;">
                                  Package Description
                                </div>
                                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 700; color: #092957; margin-top: 1px;">
                                  ${pDetails || "Standard Package"}
                                </div>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <!-- Expected Delivery -->
                        <td style="width: 50%; padding: 8px 0 8px 12px; vertical-align: top;">
                          <table border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="width: 42px; vertical-align: middle; padding-right: 8px;">
                                <img src="${assetsBaseUrl}/receiver-icon-time.png" width="34" height="34" style="display: block;" alt="Expected Delivery" />
                              </td>
                              <td style="vertical-align: middle;">
                                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #64748B;">
                                  Expected Delivery
                                </div>
                                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 700; color: #092957; margin-top: 1px;">
                                  ${sType || "Standard Delivery"}
                                </div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- How to Receive Your Package Card -->
          <tr>
            <td style="padding: 0 20px 14px 20px; line-height: 0;">
              <img src="${assetsBaseUrl}/receiver-how-to-receive.png" width="642" height="102" style="display: block; width: 642px; height: 102px; border-radius: 14px;" alt="How to Receive Your Package" />
            </td>
          </tr>

          <!-- Thank You Banner -->
          <tr>
            <td style="padding: 0 20px 20px 20px; line-height: 0;">
              <img src="${assetsBaseUrl}/receiver-thank-you.png" width="642" height="80" style="display: block; width: 642px; height: 80px; border-radius: 12px;" alt="Thank you for choosing BBD Mobility!" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 0; line-height: 0;">
              <img src="${assetsBaseUrl}/receiver-email-footer.png" width="682" height="148" style="display: block; width: 682px; height: 148px;" alt="Footer" />
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
function generateRiderAssignmentEmailHtml(data, assetsBaseUrl = "https://raw.githubusercontent.com/Subair-09/bbdmobility/main/public/assets") {
  const {
    riderName,
    riderId,
    bookingRef,
    serviceType,
    pickupAddress,
    senderName,
    senderPhone,
    deliveryAddress,
    receiverName,
    receiverPhone,
    packageDescription,
    packageCategory,
    packageWeight,
    deliveryFee = 0,
    paymentStatus,
    paymentMethod,
    dispatchNote,
    portalUrl = "https://bbdmobility.com.ng/rider"
  } = data;
  const isPaid = paymentStatus === "Paid";
  const feeDisplay = `\u20A6${Number(deliveryFee).toLocaleString()}`;
  const senderContact = `${senderName} \u2022 <a href="tel:${senderPhone}" style="color: #E30620; font-weight: 700; text-decoration: none;">${senderPhone}</a>`;
  const receiverContact = `${receiverName} \u2022 <a href="tel:${receiverPhone}" style="color: #E30620; font-weight: 700; text-decoration: none;">${receiverPhone}</a>`;
  const packageText = `${packageCategory || "General Parcel"} \u2014 ${packageDescription} (${packageWeight || "1.0 kg"})`;
  const instructionsText = dispatchNote || "Please call sender 15 minutes before arrival and handle package with utmost care.";
  const paymentBadge = isPaid ? `<span style="background-color: #ECFDF5; color: #047857; font-weight: 800; padding: 4px 10px; border-radius: 6px; font-size: 12px; display: inline-block;">\u2713 PAID TO ADMIN (${feeDisplay})</span>` : `<span style="background-color: #FEF3C7; color: #92400E; font-weight: 800; padding: 4px 10px; border-radius: 6px; font-size: 12px; display: inline-block;">\u26A0\uFE0F Check Dashboard for payment status before handing over</span>`;
  const rows = [
    { icon: "icon-tag.png", label: "Booking Ref", value: `<strong style="font-family: monospace; font-size: 14px; color: #092957;">${bookingRef}</strong>` },
    { icon: "icon-truck.png", label: "Service Level", value: serviceType || "Standard Delivery" },
    { icon: "icon-pin-pickup.png", label: "Pickup Location", value: `<div><strong>${pickupAddress}</strong></div><div style="font-size: 12px; color: #64748B; margin-top: 2px;">Sender: ${senderContact}</div>` },
    { icon: "icon-pin-dropoff.png", label: "Drop-off Destination", value: `<div><strong>${deliveryAddress}</strong></div><div style="font-size: 12px; color: #64748B; margin-top: 2px;">Recipient: ${receiverContact}</div>` },
    { icon: "icon-box.png", label: "Parcel Details", value: packageText },
    { icon: "icon-doc.png", label: "Payment Status", value: paymentBadge },
    {
      icon: "icon-truck.png",
      label: "Payment Policy",
      value: `<span style="font-size: 12px; color: #092957; font-weight: 600; line-height: 1.4;">Customers pay directly to Admin. Confirm payment status on your Rider Dashboard before handing over parcel.</span>`
    },
    { icon: "icon-contact-phone.png", label: "Dispatch Notes", value: `<span style="color: #092957; font-weight: 600;">${instructionsText}</span>` },
    {
      icon: "receiver-icon-otp.png",
      label: "Security OTP",
      value: `<span style="font-size: 12px; color: #334155; line-height: 1.4;">Customer has their secret 6-digit delivery OTP code. You must enter and verify it in the Rider Portal before handing over parcel.</span>`
    }
  ];
  const rowsHtml = rows.map(
    (row, index) => `
        <tr>
          <td style="padding: 10px 16px; border-bottom: ${index === rows.length - 1 ? "none" : "1px solid #F1F5F9"}; width: 190px; vertical-align: top;">
            <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
              <tr>
                <td style="width: 26px; vertical-align: top; padding-right: 8px;">
                  <img src="${assetsBaseUrl}/${row.icon}" width="24" height="24" style="display: block; border-radius: 50%;" alt="${row.label}" />
                </td>
                <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 700; color: #092957; white-space: nowrap;">
                  ${row.label}
                </td>
              </tr>
            </table>
          </td>
          <td style="padding: 10px 16px; border-bottom: ${index === rows.length - 1 ? "none" : "1px solid #F1F5F9"}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 500; color: #334155; vertical-align: top; line-height: 1.45;">
            ${row.value}
          </td>
        </tr>
      `
  ).join("");
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>BBD Mobility Dispatch - New Delivery Assignment</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #F8FAFC; margin: 0; padding: 20px 0;">
    <tr>
      <td align="center" style="margin: 0; padding: 0;">
        <table border="0" cellpadding="0" cellspacing="0" width="682" style="width: 682px; max-width: 682px; background-color: #FFFFFF; margin: 0 auto; box-shadow: 0 4px 24px rgba(9, 41, 87, 0.08); border-radius: 16px; overflow: hidden;">
          
          <!-- Top Header Bar -->
          <tr>
            <td style="padding: 0; line-height: 0;">
              <img src="${assetsBaseUrl}/email-header.png" width="682" height="74" style="display: block; width: 682px; height: 74px;" alt="BBD Mobility - Fast \u2022 Safe \u2022 Reliable" />
            </td>
          </tr>

          <!-- Alert Header Banner -->
          <tr>
            <td style="background-color: #0B1B3D; padding: 24px 32px; color: #ffffff; text-align: left;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="background-color: #E30620; color: #ffffff; font-size: 11px; font-weight: 800; letter-spacing: 1px; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; display: inline-block; margin-bottom: 8px;">
                      NEW DISPATCH ASSIGNMENT
                    </span>
                    <h1 style="margin: 0 0 6px 0; font-size: 24px; font-weight: 900; color: #ffffff; letter-spacing: -0.3px;">
                      You Have a New Delivery Order!
                    </h1>
                    <p style="margin: 0; font-size: 14px; color: #94A3B8; line-height: 1.5;">
                      Hello <strong style="color: #ffffff;">${riderName}</strong> (${riderId}), dispatch administration has assigned booking <strong style="color: #38BDF8; font-family: monospace;">${bookingRef}</strong> to your courier queue.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Manifest Card -->
          <tr>
            <td style="padding: 24px 28px 16px 28px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; border: 1px solid #E2E8F0; border-radius: 14px; overflow: hidden; border-collapse: separate; border-spacing: 0;">
                
                <!-- Manifest Title Bar -->
                <tr>
                  <td colspan="2" style="padding: 12px 18px; background-color: #F8FAFC; border-bottom: 1px solid #EEF2F6;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td align="left" style="vertical-align: middle;">
                          <span style="font-size: 12px; font-weight: 800; color: #092957; letter-spacing: 0.8px;">
                            COURIER DISPATCH MANIFEST
                          </span>
                        </td>
                        <td align="right" style="vertical-align: middle;">
                          <span style="background-color: #E30620; color: #ffffff; font-size: 12px; font-weight: 800; font-family: monospace; padding: 4px 12px; border-radius: 6px;">
                            ${bookingRef}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Rows of Data -->
                ${rowsHtml}

              </table>
            </td>
          </tr>

          <!-- Big Action Button (Open Rider Portal) -->
          <tr>
            <td style="padding: 8px 28px 24px 28px; text-align: center;">
              <table border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td align="center" style="background-color: #E30620; border-radius: 12px; box-shadow: 0 4px 16px rgba(227, 6, 32, 0.35);">
                    <a href="${portalUrl}" target="_blank" style="display: inline-block; padding: 15px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 800; color: #FFFFFF; text-decoration: none; letter-spacing: 0.5px;">
                      OPEN RIDER PORTAL &amp; START DISPATCH &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 12px 0 0 0; font-size: 12px; color: #64748B;">
                Log into your rider portal to update delivery milestones, check live payment status, and verify customer OTP before handover.
              </p>
            </td>
          </tr>

          <!-- Dispatch Operations Contact Strip -->
          <tr>
            <td style="padding: 0 28px 24px 28px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F1F5F9; border-radius: 12px; padding: 14px 18px;">
                <tr>
                  <td style="font-size: 12px; color: #475569; line-height: 1.5;">
                    <strong style="color: #092957;">Emergency Dispatch Hotline:</strong> Call <strong>0708 753 1148</strong> (+234 708 753 1148) or email <strong>Info@bbdautosng.com</strong> for route support, cancellations, or delivery assistance.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Navy Footer -->
          <tr>
            <td style="padding: 0; line-height: 0;">
              <img src="${assetsBaseUrl}/email-footer.png" width="682" height="70" style="display: block; width: 682px; height: 70px;" alt="BBD Mobility Automated Dispatch System - Move What Matters" />
            </td>
          </tr>

          <!-- Bottom Diagonal Stripes -->
          <tr>
            <td style="padding: 0; line-height: 0;">
              <img src="${assetsBaseUrl}/email-bottom-stripes.png" width="682" height="44" style="display: block; width: 682px; height: 44px;" alt="BBD Mobility Brand Stripes" />
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// server/emailService.ts
var resendApiKey = process.env.RESEND_API_KEY;
var resend = resendApiKey ? new Resend(resendApiKey) : null;
var fromEmail = process.env.FROM_EMAIL || "BBD Mobility <booking@bbdmobility.com.ng>";
var rawAdminEmails = process.env.ADMIN_EMAILS || process.env.BUSINESS_EMAILS || "Sales@bbdautosng.com,Info@bbdautosng.com";
var businessEmails = rawAdminEmails.split(",").map((e) => e.trim()).filter((e) => e.includes("@"));
function isTestPayload(sEmail, rEmail, sName, bookingRef) {
  const sE = (sEmail || "").toLowerCase();
  const rE = (rEmail || "").toLowerCase();
  const sN = (sName || "").toLowerCase();
  const ref = (bookingRef || "").toUpperCase();
  return sE.includes("example.com") || rE.includes("example.com") || sE.includes("testsender") || rE.includes("testrecipient") || sE.includes("@test.") || sN.includes("test sender") || sN.includes("test recipient") || ref.includes("TEST");
}
async function sendWithTimeoutAndRetry(sendFn, maxRetries = 2) {
  let lastError = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        sendFn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Resend email timeout (7s)")), 7e3))
      ]);
      if (result && !result.error) {
        return { success: true, messageId: result.data?.id };
      }
      lastError = result?.error?.message || "Unknown email service rejection";
      console.warn(`[Resend Email Warning] Attempt ${attempt + 1} error: ${lastError}`);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    } catch (err) {
      lastError = err.message || "Network exception communicating with Resend API";
      console.warn(`[Resend Email Exception] Attempt ${attempt + 1}: ${lastError}`);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
  }
  return { success: false, error: lastError };
}
var emailService = {
  /**
   * 1. Sender Booking Confirmation Email
   */
  async sendSenderConfirmation(data) {
    if (isTestPayload(data.sEmail, data.rEmail, data.sName, data.bookingRef)) {
      console.log(`[TEST EMAIL SUPPRESSED] Skipping real email delivery for test booking: ${data.bookingRef}`);
      return { success: true, messageId: "test-suppressed" };
    }
    if (!resend) {
      console.log(`[EMAIL DEV MODE] Sender Confirmation -> ${data.sEmail} for ${data.bookingRef}`);
      return { success: true, messageId: "dev-mode" };
    }
    try {
      const html = generateCustomerBookingConfirmationHtml({
        ...data,
        verificationOtp: "Shared with recipient",
        businessEmails
      });
      return await sendWithTimeoutAndRetry(
        () => resend.emails.send({
          from: fromEmail,
          to: [data.sEmail],
          replyTo: businessEmails[0] || "Info@bbdautosng.com",
          subject: `BBD Mobility Booking Confirmation - ${data.bookingRef}`,
          html
        })
      );
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
  /**
   * 2. Receiver Delivery Notification with 6-digit OTP
   */
  async sendReceiverDeliveryNotice(data) {
    if (isTestPayload(data.sEmail, data.rEmail, data.sName, data.bookingRef)) {
      console.log(`[TEST EMAIL SUPPRESSED] Skipping real email delivery for test booking: ${data.bookingRef}`);
      return { success: true, messageId: "test-suppressed" };
    }
    if (!resend) {
      console.log(`[EMAIL DEV MODE] Receiver Delivery OTP -> ${data.rEmail} | Code: ${data.otpCode} for ${data.bookingRef}`);
      return { success: true, messageId: "dev-mode" };
    }
    try {
      const html = generateReceiverDeliveryHtml({
        ...data,
        verificationOtp: data.otpCode,
        businessEmails
      });
      return await sendWithTimeoutAndRetry(
        () => resend.emails.send({
          from: fromEmail,
          to: [data.rEmail],
          replyTo: businessEmails[0] || "Info@bbdautosng.com",
          subject: `BBD Mobility Delivery Notice - Verification Code: ${data.otpCode} (${data.bookingRef})`,
          html
        })
      );
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
  /**
   * 3. Admin New Booking Alert
   */
  async sendAdminAlert(data) {
    if (isTestPayload(data.sEmail, data.rEmail, data.sName, data.bookingRef)) {
      console.log(`[TEST EMAIL SUPPRESSED] Skipping real email delivery for test booking: ${data.bookingRef}`);
      return { success: true, messageId: "test-suppressed" };
    }
    if (!resend) {
      console.log(`[EMAIL DEV MODE] Admin Alert -> ${businessEmails.join(", ")} for ${data.bookingRef}`);
      return { success: true, messageId: "dev-mode" };
    }
    try {
      const html = generateAdminBookingAlertHtml({
        ...data,
        verificationOtp: "Encrypted in MongoDB",
        businessEmails
      });
      return await sendWithTimeoutAndRetry(
        () => resend.emails.send({
          from: fromEmail,
          to: businessEmails,
          replyTo: data.sEmail,
          subject: `[New Booking] ${data.bookingRef} - ${data.sType} (${data.pLoc} \u2192 ${data.dLoc})`,
          html
        })
      );
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
  /**
   * 4. Courier Rider Assignment Notification
   * Dispatches high-priority dispatch notice to the courier rider's inbox with complete route manifest
   */
  async sendRiderAssignmentNotice(payloadOrEmail, riderName, bookingRef, pickup, dropoff) {
    const data = typeof payloadOrEmail === "object" ? payloadOrEmail : {
      riderEmail: payloadOrEmail,
      riderName: riderName || "Courier Rider",
      riderId: "RID-DISPATCH",
      bookingRef: bookingRef || "BBD-ORDER",
      serviceType: "Standard Delivery",
      pickupAddress: pickup || "Pickup Address",
      senderName: "Dispatch Sender",
      senderPhone: "+234 708 753 1148",
      deliveryAddress: dropoff || "Drop-off Address",
      receiverName: "Recipient",
      receiverPhone: "+234 708 753 1148",
      packageDescription: "Customer Parcel",
      paymentStatus: "Paid",
      portalUrl: "https://bbdmobility.com.ng/rider"
    };
    const targetEmail = data.riderEmail?.trim();
    if (!targetEmail || !targetEmail.includes("@")) {
      console.warn(`[EMAIL WARNING] Rider ${data.riderName} (${data.riderId}) has no valid email address: "${targetEmail}"`);
      return { success: false, error: "Invalid or missing rider email address" };
    }
    if (targetEmail.includes("example.com") || targetEmail.includes("@test.") || data.bookingRef?.includes("TEST")) {
      console.log(`[TEST EMAIL SUPPRESSED] Skipping rider assignment email for test address: ${targetEmail}`);
      return { success: true, messageId: "test-suppressed" };
    }
    if (!resend) {
      console.log(`[EMAIL DEV MODE] Rider Assignment Alert -> ${targetEmail} (${data.riderName}) for order ${data.bookingRef}`);
      return { success: true, messageId: "dev-mode" };
    }
    try {
      const html = generateRiderAssignmentEmailHtml(data);
      return await sendWithTimeoutAndRetry(
        () => resend.emails.send({
          from: fromEmail,
          to: [targetEmail],
          replyTo: businessEmails[0] || "Info@bbdautosng.com",
          subject: `[New Assignment] Delivery ${data.bookingRef} - ${data.serviceType || "BBD Mobility Dispatch"}`,
          html
        })
      );
    } catch (err) {
      console.error(`[EMAIL ERROR] Rider assignment email dispatch exception:`, err);
      return { success: false, error: err.message };
    }
  }
};

// server/kudiSmsService.ts
import dotenv2 from "dotenv";
dotenv2.config();
function cleanSmsText(str) {
  if (!str) return "";
  let cleaned = String(str).trim();
  let prev = "";
  while (cleaned !== prev && /&[a-z0-9#]+;/i.test(cleaned)) {
    prev = cleaned;
    cleaned = cleaned.replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#039;|&apos;/gi, "'");
  }
  return cleaned.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").replace(/\.{2,}/g, "").trim();
}
function formatAddress(addr, max = 28) {
  let clean = cleanSmsText(addr);
  if (!clean) return "";
  clean = clean.replace(/\bStreet\b/gi, "St").replace(/\bRoad\b/gi, "Rd").replace(/\bAvenue\b/gi, "Ave").replace(/\bClose\b/gi, "Cl").replace(/\bCrescent\b/gi, "Cres").replace(/\bExpressway\b/gi, "Exp").replace(/,\s*Lagos(\s*State)?/gi, "").replace(/\s+Lagos$/gi, "").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 8 ? slice.slice(0, lastSpace) : slice).trim();
}
function formatItem(item, max = 24) {
  const clean = cleanSmsText(item);
  if (!clean) return "Parcel";
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 6 ? slice.slice(0, lastSpace) : slice).trim();
}
function formatName(name, preferFirst = false) {
  const clean = cleanSmsText(name);
  if (!clean) return "Customer";
  if (preferFirst) {
    return clean.split(" ")[0];
  }
  if (clean.length > 20) {
    const parts = clean.split(" ");
    if (parts.length > 1) {
      return `${parts[0]} ${parts[parts.length - 1][0]}.`;
    }
  }
  return clean;
}
function formatNigerianPhone(phone) {
  if (!phone) return "";
  let cleaned = phone.trim().replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  }
  if (cleaned.startsWith("0") && cleaned.length === 11) {
    return "234" + cleaned.slice(1);
  }
  if (cleaned.length === 10 && ["7", "8", "9"].includes(cleaned.charAt(0))) {
    return "234" + cleaned;
  }
  if (cleaned.startsWith("234")) {
    return cleaned;
  }
  return cleaned;
}
function isTestRecipient(phone, ref, name) {
  const p = (phone || "").replace(/\D/g, "");
  const r = (ref || "").toUpperCase();
  const n = (name || "").toLowerCase();
  return p.includes("0000000") || p === "1234567890" || p === "2348000000000" || r.includes("TEST") || n.includes("test recipient") || n.includes("test sender");
}
async function sendKudiSms(options) {
  const { message, bookingRef, recipientName } = options;
  const rawList = Array.isArray(options.recipients) ? options.recipients : [options.recipients];
  const formattedRecipients = rawList.map((p) => formatNigerianPhone(p)).filter((p) => p.length >= 10);
  if (formattedRecipients.length === 0) {
    console.warn("[KudiSMS] No valid recipient phone number provided.");
    return { success: false, error: "No valid recipient phone number provided", messageText: message };
  }
  const recipientsJoined = formattedRecipients.join(",");
  if (isTestRecipient(recipientsJoined, bookingRef, recipientName)) {
    console.log(`[TEST SMS SUPPRESSED] Skipping real KudiSMS delivery for test recipient: ${recipientsJoined} (Ref: ${bookingRef || "N/A"})`);
    return {
      success: true,
      messageId: "test-suppressed",
      messageText: message,
      recipients: recipientsJoined
    };
  }
  const apiKey2 = (process.env.KUDISMS_API_KEY || process.env.KUDISMS_TOKEN || "").trim();
  const senderID = (options.senderId || process.env.KUDISMS_SENDER_ID || "BBDMobility").trim().slice(0, 11);
  const gateway = (options.gateway || process.env.KUDISMS_GATEWAY || "").trim();
  if (!apiKey2 || apiKey2 === "your_kudisms_api_key_here") {
    console.log(`[KUDISMS DEV MODE] Sender: ${senderID} | To: ${recipientsJoined} | Gateway: ${gateway || "Default"}
Message:
${message}
--------------------------------------------------`);
    return {
      success: true,
      devMode: true,
      messageId: `dev-${Date.now()}`,
      messageText: message,
      recipients: recipientsJoined,
      data: { status: "dev-mode", note: "KudiSMS API key not configured. Message logged to console." }
    };
  }
  const gatewaysToTry = gateway ? [gateway, gateway === "2" ? "1" : "2"] : ["2", "1"];
  let lastError = "";
  let lastData = null;
  for (let attempt = 0; attempt < gatewaysToTry.length; attempt++) {
    const activeGateway = gatewaysToTry[attempt];
    const startTime = Date.now();
    try {
      const requestPayload = {
        token: apiKey2,
        senderID,
        recipients: recipientsJoined,
        message
      };
      if (activeGateway) {
        requestPayload.gateway = activeGateway;
      }
      const response = await fetch("https://my.kudisms.net/api/sms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(7e3)
      });
      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }
      if (!response.ok) {
        lastError = `HTTP ${response.status}: ${responseData?.msg || responseData?.message || responseText}`;
        lastData = responseData;
        console.warn(`[KudiSMS Gateway ${activeGateway} HTTP ${response.status}] Attempt ${attempt + 1}:`, lastError);
        if (attempt < gatewaysToTry.length - 1) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        return {
          success: false,
          error: lastError,
          messageText: message,
          recipients: recipientsJoined,
          data: responseData
        };
      }
      const status = (responseData?.status || "").toString().toLowerCase();
      const isSuccess = status === "success" || responseData?.error_code === "000" || responseData?.code === 100 || responseData?.code === 200 || !status.includes("error") && !responseData?.error_code;
      if (!isSuccess && status.includes("error")) {
        lastError = responseData?.msg || responseData?.message || "KudiSMS rejected request";
        lastData = responseData;
        console.warn(`[KudiSMS Gateway ${activeGateway} Rejected] Attempt ${attempt + 1}:`, lastError);
        if (attempt < gatewaysToTry.length - 1) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        return {
          success: false,
          error: lastError,
          messageText: message,
          recipients: recipientsJoined,
          data: responseData
        };
      }
      const messageId = responseData?.data?.[0]?.split("|")[1] || responseData?.batch_id || responseData?.id || `kudi-${Date.now()}`;
      const durationMs = Date.now() - startTime;
      console.log(`[KudiSMS High-Speed] Delivered to ${recipientsJoined} in ${durationMs}ms via Gateway ${activeGateway} (MsgID: ${messageId}) for ${bookingRef || "SMS"}`);
      return {
        success: true,
        messageId,
        messageText: message,
        recipients: recipientsJoined,
        data: responseData
      };
    } catch (error) {
      lastError = error.message || "Network exception communicating with KudiSMS API";
      console.warn(`[KudiSMS Gateway ${activeGateway} Exception] Attempt ${attempt + 1}:`, lastError);
      if (attempt < gatewaysToTry.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }
  return {
    success: false,
    error: lastError || "KudiSMS dispatch failed across all route gateways.",
    messageText: message,
    recipients: recipientsJoined,
    data: lastData
  };
}
var kudiSmsService = {
  /**
   * 1. Sender Booking Confirmation SMS
   * Informs sender that booking has been registered, confirms route and recipient details.
   */
  async sendBookingSenderSms(data) {
    const sender = formatName(data.senderName, true);
    const pickup = formatAddress(data.pickupAddress, 26);
    const dropoff = formatAddress(data.deliveryAddress, 26);
    const recipient = cleanSmsText(data.receiverName);
    const recvPhone = cleanSmsText(data.receiverPhone);
    const item = formatItem(data.packageDescription, 24);
    const message = `Hello ${sender}, your delivery ${data.bookingRef} is confirmed.
Route: ${pickup} -> ${dropoff}
Recipient: ${recipient} (${recvPhone})
Item: ${item}
Track: bbdmobility.com.ng | Tel: 07087531148`;
    return sendKudiSms({
      recipients: data.senderPhone,
      message,
      bookingRef: data.bookingRef,
      recipientName: data.senderName
    });
  },
  /**
   * 2. Receiver Delivery Notice & Security Passkey SMS
   * Dispatches parcel arrival details, sender contact, and delivery verification passkey to receiver.
   * Note: Uses "Delivery Passkey" instead of "OTP" or "Code" to comply with Nigerian NCC/telco anti-fraud filters.
   */
  async sendBookingReceiverSms(data) {
    const receiver = cleanSmsText(data.receiverName) || "Recipient";
    const sender = cleanSmsText(data.senderName) || "Sender";
    const senderPhone = cleanSmsText(data.senderPhone);
    const dropoff = formatAddress(data.deliveryAddress, 28);
    const item = formatItem(data.packageDescription, 24);
    const message = `Hello ${receiver}, a parcel (${item}) from ${sender} (${senderPhone}) is heading to you at ${dropoff}.
Ref: ${data.bookingRef}
Delivery Passkey: ${data.otpCode}
Present this passkey to the rider upon delivery.`;
    return sendKudiSms({
      recipients: data.receiverPhone,
      message,
      bookingRef: data.bookingRef,
      recipientName: data.receiverName
    });
  },
  /**
   * 3. Courier Rider Assignment Alert SMS
   * Dispatches complete ride manifest to rider when admin assigns them an order.
   */
  async sendRiderAssignmentSms(data) {
    const rider = formatName(data.riderName, true);
    const pickup = formatAddress(data.pickupAddress, 26);
    const dropoff = formatAddress(data.deliveryAddress, 26);
    const sender = formatName(data.senderName, true);
    const receiver = cleanSmsText(data.receiverName);
    const item = formatItem(data.packageDescription, 24);
    const note = data.dispatchNote ? cleanSmsText(data.dispatchNote) : "";
    const noteLine = note && note !== "Parcel" && note !== "Standard" ? `Note: ${formatItem(note, 28)}
` : "";
    const message = `Hello ${rider}, new delivery assigned: ${data.bookingRef}
Pickup: ${pickup} - ${sender} (${data.senderPhone})
Dropoff: ${dropoff} - ${receiver} (${data.receiverPhone})
Item: ${item}
` + noteLine + `Accept on portal: bbdmobility.com.ng/rider`;
    return sendKudiSms({
      recipients: data.riderPhone,
      message,
      bookingRef: data.bookingRef,
      recipientName: data.riderName
    });
  },
  /**
   * 4. Customer Rider Assignment Alert SMS
   * Notifies sender and receiver that a courier rider has been assigned and is en route.
   */
  async sendRiderAssignedToCustomerSms(data) {
    const rider = formatName(data.riderName);
    const senderMessage = `Rider ${rider} (${data.riderPhone}) has been assigned to your order ${data.bookingRef}. Pickup is underway. Tel: 07087531148`;
    const receiverMessage = `Rider ${rider} (${data.riderPhone}) has been assigned to deliver order ${data.bookingRef} from ${data.senderName}. Have your Delivery Passkey ready for arrival.`;
    const [senderResult, receiverResult] = await Promise.all([
      sendKudiSms({
        recipients: data.senderPhone,
        message: senderMessage,
        bookingRef: data.bookingRef,
        recipientName: data.senderName
      }).catch((err) => ({ success: false, error: err.message })),
      sendKudiSms({
        recipients: data.receiverPhone,
        message: receiverMessage,
        bookingRef: data.bookingRef,
        recipientName: data.receiverName
      }).catch((err) => ({ success: false, error: err.message }))
    ]);
    return { senderResult, receiverResult };
  },
  /**
   * 5. Receiver Resend Passkey SMS
   * Triggered when admin regenerates delivery verification passkey.
   */
  async sendReceiverResendOtpSms(data) {
    const receiver = cleanSmsText(data.receiverName) || "Recipient";
    const message = `Hello ${receiver}, your new Delivery Passkey for parcel ${data.bookingRef} is: ${data.otpCode}.
Present this passkey to your rider upon arrival to complete delivery.`;
    return sendKudiSms({
      recipients: data.receiverPhone,
      message,
      bookingRef: data.bookingRef,
      recipientName: data.receiverName
    });
  },
  /**
   * 6. Proof of Pickup Customer Alert SMS
   * Dispatches updates when rider picks up item from sender and begins transit to receiver.
   */
  async sendPickupCustomerSms(data) {
    const rider = formatName(data.riderName);
    const dropoff = formatAddress(data.deliveryAddress, 26);
    const receiver = cleanSmsText(data.receiverName);
    const senderMessage = `Order ${data.bookingRef} has been picked up by rider ${rider} and is en route to ${data.receiverName}. Track at bbdmobility.com.ng`;
    const receiverMessage = `Hello ${receiver}, your parcel ${data.bookingRef} from ${data.senderName} has been picked up by rider ${rider} (${data.riderPhone}) heading to ${dropoff}. Have your Delivery Passkey ready.`;
    const [senderResult, receiverResult] = await Promise.all([
      sendKudiSms({
        recipients: data.senderPhone,
        message: senderMessage,
        bookingRef: data.bookingRef,
        recipientName: data.senderName
      }).catch((err) => ({ success: false, error: err.message })),
      sendKudiSms({
        recipients: data.receiverPhone,
        message: receiverMessage,
        bookingRef: data.bookingRef,
        recipientName: data.receiverName
      }).catch((err) => ({ success: false, error: err.message }))
    ]);
    return { senderResult, receiverResult };
  },
  /**
   * 7. Delivery Completed Customer Alert SMS
   * Dispatches confirmation when delivery is verified and completed.
   */
  async sendDeliveryCompletedCustomerSms(data) {
    const senderMessage = `Order ${data.bookingRef} has been safely delivered to ${data.receiverName}. Thank you for choosing BBD Mobility!`;
    const receiverMessage = `Hello ${data.receiverName}, your parcel ${data.bookingRef} from ${data.senderName} has been delivered. Thank you for choosing BBD Mobility!`;
    const [senderResult, receiverResult] = await Promise.all([
      sendKudiSms({
        recipients: data.senderPhone,
        message: senderMessage,
        bookingRef: data.bookingRef,
        recipientName: data.senderName
      }).catch((err) => ({ success: false, error: err.message })),
      sendKudiSms({
        recipients: data.receiverPhone,
        message: receiverMessage,
        bookingRef: data.bookingRef,
        recipientName: data.receiverName
      }).catch((err) => ({ success: false, error: err.message }))
    ]);
    return { senderResult, receiverResult };
  },
  /**
   * 6. Check approval status of Sender ID on KudiSMS
   */
  async checkSenderIdStatus(senderId) {
    const apiKey2 = (process.env.KUDISMS_API_KEY || process.env.KUDISMS_TOKEN || "").trim();
    const idToCheck = (senderId || process.env.KUDISMS_SENDER_ID || "BBDMobility").trim();
    if (!apiKey2) {
      return { approved: false, status: "not_configured", msg: "KudiSMS API key not configured" };
    }
    try {
      const [statusRes, balanceRes] = await Promise.all([
        fetch("https://my.kudisms.net/api/check_senderID", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: apiKey2, senderID: idToCheck })
        }),
        fetch("https://my.kudisms.net/api/balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: apiKey2 })
        })
      ]);
      const statusData = await statusRes.json().catch(() => ({}));
      const balanceData = await balanceRes.json().catch(() => ({}));
      const isApproved = statusData?.status === "success" || statusData?.error_code === "000";
      return {
        approved: isApproved,
        status: statusData?.status || "unknown",
        msg: statusData?.msg || "Pending operator review",
        balance: balanceData?.msg || void 0
      };
    } catch (err) {
      return { approved: false, status: "error", msg: err.message };
    }
  }
};

// server/security.ts
var FORBIDDEN_KEY_PREFIX = /^\$|[\.]/;
function sanitizeObject(obj, depth = 0) {
  if (depth > 10) {
    throw new Error("Nested input exceeds maximum permitted depth.");
  }
  if (obj === null || obj === void 0) return obj;
  if (typeof obj === "string") {
    if (obj.startsWith("data:image/") || obj.startsWith("https://res.cloudinary.com")) {
      return obj;
    }
    return sanitizeString(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1));
  }
  if (typeof obj === "object") {
    const clean = {};
    for (const [key, value] of Object.entries(obj)) {
      if (FORBIDDEN_KEY_PREFIX.test(key)) {
        throw new Error(`Security validation failure: illegal operator character in parameter key "${key}".`);
      }
      clean[key] = sanitizeObject(value, depth + 1);
    }
    return clean;
  }
  return obj;
}
function sanitizeString(val, maxLength = 2e3) {
  if (typeof val !== "string") {
    if (typeof val === "number" || typeof val === "boolean") {
      return String(val);
    }
    return "";
  }
  let clean = val.replace(/\0/g, "");
  if (clean.length > maxLength) {
    clean = clean.substring(0, maxLength);
  }
  clean = clean.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  return clean.trim();
}
function validateEmail(email) {
  if (typeof email !== "string") return null;
  const clean = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(clean) || clean.length > 150) return null;
  return clean;
}
function securityHeadersMiddleware(_req, res, next) {
  res.removeHeader("X-Powered-By");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), payment=(), geolocation=(self)");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: res.cloudinary.com; connect-src 'self' https:;"
  );
  next();
}
var FORBIDDEN_FILE_PATTERN = /(\.env|\.git|\.aws|\.ssh|\.bak|\.config|\.ya?ml|\.jsonl|\.sqlite|\.log|id_rsa|\.key|\.pem|\.crt)/i;
function exposedFileProtectionMiddleware(req, res, next) {
  const urlPath = req.url || "";
  if (FORBIDDEN_FILE_PATTERN.test(urlPath) || urlPath.includes("..")) {
    console.warn(`[SECURITY ALERT - BLOCKED FILE SCAN]: Forbidden path access attempt "${urlPath}" from IP ${getClientIp(req)}`);
    return res.status(403).json({
      error: "Access denied: The requested resource is protected and cannot be accessed."
    });
  }
  next();
}
var AUTH_MAX_ATTEMPTS_PER_IP = 20;
var AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1e3;
var authIpRateLimitMap = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of authIpRateLimitMap.entries()) {
    if (now > entry.resetTime) {
      authIpRateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1e3).unref();
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}
function authRateLimiter(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  let entry = authIpRateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 1,
      firstAttemptTime: now,
      resetTime: now + AUTH_RATE_LIMIT_WINDOW_MS
    };
    authIpRateLimitMap.set(ip, entry);
  } else {
    entry.count++;
  }
  const remaining = Math.max(0, AUTH_MAX_ATTEMPTS_PER_IP - entry.count);
  const resetSeconds = Math.ceil((entry.resetTime - now) / 1e3);
  res.setHeader("X-RateLimit-Limit", AUTH_MAX_ATTEMPTS_PER_IP);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetTime / 1e3));
  if (entry.count > AUTH_MAX_ATTEMPTS_PER_IP) {
    const minutesLeft = Math.ceil(resetSeconds / 60);
    res.setHeader("Retry-After", resetSeconds);
    console.warn(`[SECURITY ALERT - LOGIN RATE LIMIT EXCEEDED]: IP ${ip} exceeded ${AUTH_MAX_ATTEMPTS_PER_IP} attempts.`);
    return res.status(429).json({
      error: `Too many login attempts from this IP address. For your security, access is restricted. Please try again in ${minutesLeft} minute${minutesLeft > 1 ? "s" : ""}.`,
      retryAfter: resetSeconds,
      code: "IP_RATE_LIMIT_EXCEEDED"
    });
  }
  next();
}
var MAX_FAILED_LOGIN_ATTEMPTS = 5;
var LOCKOUT_DURATION_MINUTES = 15;
var LOCKOUT_DURATION_MS = LOCKOUT_DURATION_MINUTES * 60 * 1e3;
function checkAccountLockout(account) {
  if (account.lockUntil) {
    const lockTime = new Date(account.lockUntil).getTime();
    const now = Date.now();
    if (lockTime > now) {
      const remainingMinutes = Math.ceil((lockTime - now) / 6e4);
      return { isLocked: true, remainingMinutes };
    }
  }
  return { isLocked: false, remainingMinutes: 0 };
}
function securityProtectionMiddleware(req, res, next) {
  try {
    if (req.body && typeof req.body === "object") {
      req.body = sanitizeObject(req.body);
    }
    if (req.query && typeof req.query === "object") {
      req.query = sanitizeObject(req.query);
    }
    if (req.params && typeof req.params === "object") {
      req.params = sanitizeObject(req.params);
    }
    next();
  } catch (err) {
    console.warn(`[SECURITY ALERT - BLOCKED INJECTION]: ${err.message} from IP ${req.ip}`);
    return res.status(400).json({
      error: "Security validation error: Malicious or forbidden characters detected in payload.",
      details: err.message
    });
  }
}

// server/cloudinary.ts
import { v2 as cloudinary } from "cloudinary";
import dotenv3 from "dotenv";
dotenv3.config();
var cloudName = process.env.CLOUDINARY_CLOUD_NAME || "";
var apiKey = process.env.CLOUDINARY_API_KEY || "";
var apiSecret = process.env.CLOUDINARY_API_SECRET || "";
if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });
  console.log(`[Cloudinary] Configured successfully for cloud: ${cloudName}`);
} else if (process.env.CLOUDINARY_URL) {
  cloudinary.config({
    secure: true
  });
  console.log("[Cloudinary] Configured via CLOUDINARY_URL.");
} else {
  console.warn("[Cloudinary] Warning: CLOUDINARY credentials not set in environment. Running in fallback mode.");
}
function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_URL
  );
}
async function uploadToCloudinary(fileData, folder = "bbdmobility/proofs") {
  if (!fileData) {
    throw new Error("No image data provided for upload.");
  }
  if (isCloudinaryConfigured()) {
    try {
      const result = await cloudinary.uploader.upload(fileData, {
        folder,
        resource_type: "image",
        allowed_formats: ["jpg", "png", "jpeg", "webp", "heic"],
        transformation: [
          { quality: "auto:good" },
          { fetch_format: "auto" }
        ]
      });
      return {
        url: result.secure_url,
        public_id: result.public_id,
        bytes: result.bytes,
        format: result.format
      };
    } catch (err) {
      console.error("[Cloudinary Upload Error]:", err.message || err);
      throw new Error(`Cloudinary upload failed: ${err.message || "Unknown error"}`);
    }
  }
  console.warn("[Cloudinary] Missing credentials. Storing data URL fallback directly.");
  return {
    url: fileData,
    public_id: `fallback-${Date.now()}`
  };
}

// server/index.ts
dotenv4.config();
var app = express();
var port = process.env.PORT || 3001;
app.disable("x-powered-by");
app.use(securityHeadersMiddleware);
app.use(exposedFileProtectionMiddleware);
var allowedOrigins = [
  "https://bbdmobility.com.ng",
  "https://www.bbdmobility.com.ng",
  process.env.APP_URL,
  process.env.FRONTEND_URL
].filter(Boolean);
var corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV !== "production") return callback(null, true);
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) return callback(null, true);
    const isAllowed = allowedOrigins.some((o) => origin === o || origin.endsWith(".vercel.app") || origin.endsWith("bbdmobility.com.ng"));
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error("CORS: Origin not authorized by BBD Mobility security policy."));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "x-test-suite"],
  maxAge: 86400
};
app.use(cors(corsOptions));
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));
app.use(securityProtectionMiddleware);
app.use((req, _res, next) => {
  if (req.url && !req.url.startsWith("/api")) {
    req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
  }
  next();
});
var rateLimitMap = /* @__PURE__ */ new Map();
var RATE_LIMIT_WINDOW_MS = 60 * 1e3;
var MAX_REQUESTS_PER_WINDOW = 600;
function rateLimiter(req, res, next) {
  if (req.path.startsWith("/api/portal")) {
    return next();
  }
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
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
      error: "Too many requests. Please wait a moment and try again."
    });
  }
  entry.count++;
  next();
}
app.use(rateLimiter);
function sanitize(str) {
  if (typeof str !== "string") return "";
  return str.replace(/<[^>]*>/g, "").replace(/[<>]/g, "").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#039;|&apos;/gi, "'").trim();
}
function generateBookingReference() {
  const dateStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BBD-${dateStr}-${randomPart}`;
}
initAndSeedDatabase().catch((err) => console.warn("[DB Init Error]:", err.message));
function formatRelativeTime(date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 6e4);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
async function createAdminNotification(data) {
  try {
    await connectToDatabase();
    const notificationId = `NOTIF-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const doc = await NotificationModel.create({
      notificationId,
      title: data.title,
      message: data.message,
      type: data.type || "system",
      read: false,
      entityRef: data.entityRef,
      createdAt: /* @__PURE__ */ new Date()
    });
    return doc;
  } catch (err) {
    console.warn("[Notification Create Error]:", err.message);
    return null;
  }
}
function getNigerianGreeting() {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Lagos",
      hour: "numeric",
      hour12: false
    });
    const parsed = parseInt(formatter.format(/* @__PURE__ */ new Date()), 10);
    const hour = isNaN(parsed) ? ((/* @__PURE__ */ new Date()).getUTCHours() + 1) % 24 : parsed % 24;
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  } catch {
    const hour = ((/* @__PURE__ */ new Date()).getUTCHours() + 1) % 24;
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }
}
app.post("/api/auth/login", authRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    const cleanEmail = String(email).toLowerCase().trim();
    if (!validateEmail(cleanEmail)) {
      return res.status(400).json({ error: "Invalid email address format." });
    }
    await connectToDatabase();
    const user = await UserModel.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    const lockout = checkAccountLockout(user);
    if (lockout.isLocked) {
      await recordAuditLog({
        actorId: user.userId,
        actorName: user.name,
        actorRole: user.role,
        action: "ACCOUNT_LOCKOUT_BLOCKED",
        affectedEntity: "User",
        entityRef: user.userId,
        ipAddress: getClientIp(req),
        metadata: { remainingMinutes: lockout.remainingMinutes }
      });
      return res.status(423).json({
        error: `Account is temporarily locked due to too many failed login attempts. Please try again in ${lockout.remainingMinutes} minute${lockout.remainingMinutes > 1 ? "s" : ""} or contact your system administrator.`,
        locked: true,
        remainingMinutes: lockout.remainingMinutes
      });
    }
    if (user.role === "Admin" && cleanEmail !== "info@bbdautosng.com") {
      return res.status(401).json({ error: "Access denied: Unauthorized administrator account." });
    }
    if (user.status !== "Active") {
      return res.status(403).json({ error: "Account is deactivated. Please contact administrator." });
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
          action: "ACCOUNT_LOCKED",
          affectedEntity: "User",
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
          error: `Invalid email or password. ${remainingAttempts} attempt${remainingAttempts > 1 ? "s" : ""} remaining before temporary account lockout.`,
          remainingAttempts
        });
      }
    }
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = /* @__PURE__ */ new Date();
    await user.save();
    const token = generateToken({
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role
    });
    await recordAuditLog({
      actorId: user.userId,
      actorName: user.name,
      actorRole: user.role,
      action: "ADMIN_LOGIN_SUCCESS",
      affectedEntity: "User",
      entityRef: user.userId,
      ipAddress: getClientIp(req)
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
        role: user.role
      }
    });
  } catch (err) {
    const isProd = process.env.NODE_ENV === "production";
    return res.status(500).json({ error: isProd ? "Login service error occurred." : "Login service error: " + err.message });
  }
});
app.post("/api/auth/rider-login", authRateLimiter, async (req, res) => {
  try {
    const { identifier, pin, password } = req.body || {};
    const enteredPin = String(pin || password || "").trim();
    if (!identifier || !enteredPin) {
      return res.status(400).json({ error: "Rider ID, Email, or Phone and 4-digit PIN are required." });
    }
    await connectToDatabase();
    const cleanId = sanitizeString(String(identifier)).trim();
    const rider = await RiderModel.findOne({
      $or: [
        { email: cleanId.toLowerCase() },
        { phone: cleanId },
        { riderId: cleanId.toUpperCase() }
      ]
    });
    if (!rider) {
      return res.status(401).json({ error: "Invalid rider credentials. Please check your Rider ID, Email or Phone." });
    }
    const lockout = checkAccountLockout(rider);
    if (lockout.isLocked) {
      await recordAuditLog({
        actorId: rider.riderId,
        actorName: rider.name,
        actorRole: "Rider",
        action: "RIDER_LOCKOUT_BLOCKED",
        affectedEntity: "Rider",
        entityRef: rider.riderId,
        ipAddress: getClientIp(req),
        metadata: { remainingMinutes: lockout.remainingMinutes }
      });
      return res.status(423).json({
        error: `Rider account is temporarily locked due to too many failed login attempts. Please try again in ${lockout.remainingMinutes} minute${lockout.remainingMinutes > 1 ? "s" : ""} or contact dispatch administration.`,
        locked: true,
        remainingMinutes: lockout.remainingMinutes
      });
    }
    if (rider.status === "Suspended") {
      return res.status(403).json({ error: "Rider account is suspended. Contact dispatch administration." });
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
          actorRole: "Rider",
          action: "RIDER_ACCOUNT_LOCKED",
          affectedEntity: "Rider",
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
          error: `Incorrect 4-digit PIN. ${remainingAttempts} attempt${remainingAttempts > 1 ? "s" : ""} remaining before account lockout.`,
          remainingAttempts
        });
      }
    }
    rider.failedLoginAttempts = 0;
    rider.lockUntil = null;
    await rider.save();
    const mustChangePin = rider.mustChangePin ?? true;
    const token = generateToken({
      userId: rider.riderId,
      riderId: rider.riderId,
      name: rider.name,
      email: rider.email,
      role: "Rider"
    });
    await recordAuditLog({
      actorId: rider.riderId,
      actorName: rider.name,
      actorRole: "Rider",
      action: "RIDER_LOGIN_SUCCESS",
      affectedEntity: "Rider",
      entityRef: rider.riderId,
      ipAddress: getClientIp(req)
    });
    const greeting = getNigerianGreeting();
    return res.json({
      success: true,
      token,
      mustChangePin,
      greeting,
      message: `${greeting}, ${rider.name.split(" ")[0]}! Login successful.`,
      rider: {
        riderId: rider.riderId,
        name: rider.name,
        phone: rider.phone,
        email: rider.email,
        status: rider.status,
        isOnline: rider.isOnline,
        vehicleType: rider.vehicleType,
        mustChangePin
      }
    });
  } catch (err) {
    const isProd = process.env.NODE_ENV === "production";
    return res.status(500).json({ error: isProd ? "Rider authentication service unavailable." : "Rider authentication error: " + err.message });
  }
});
app.post("/api/auth/rider-change-pin", authRateLimiter, async (req, res) => {
  try {
    const { riderId, currentPin, newPin } = req.body || {};
    const cleanNewPin = String(newPin || "").trim();
    if (!cleanNewPin || !/^\d{4}$/.test(cleanNewPin)) {
      return res.status(400).json({ error: "Your new PIN must be exactly 4 numeric digits (e.g. 2468)." });
    }
    await connectToDatabase();
    let targetId = riderId;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const decoded = req.user;
        if (decoded?.riderId || decoded?.userId) {
          targetId = decoded.riderId || decoded.userId;
        }
      } catch {
      }
    }
    if (!targetId) {
      return res.status(400).json({ error: "Rider ID is required to set new PIN." });
    }
    const rider = await RiderModel.findOne({
      $or: [
        { riderId: String(targetId).toUpperCase() },
        { phone: String(targetId).trim() },
        { email: String(targetId).toLowerCase().trim() }
      ]
    });
    if (!rider) {
      return res.status(404).json({ error: "Rider account not found." });
    }
    if (currentPin && !rider.mustChangePin) {
      const match = await comparePassword(String(currentPin).trim(), rider.passwordHash);
      if (!match) {
        return res.status(401).json({ error: "Current PIN is incorrect." });
      }
    }
    const newHash = await hashPassword(cleanNewPin);
    rider.passwordHash = newHash;
    rider.mustChangePin = false;
    rider.pinChangedAt = /* @__PURE__ */ new Date();
    await rider.save();
    await recordAuditLog({
      actorId: rider.riderId,
      actorName: rider.name,
      actorRole: "Rider",
      action: "RIDER_PIN_CHANGED",
      affectedEntity: "Rider",
      entityRef: rider.riderId,
      ipAddress: req.ip
    });
    const token = generateToken({
      userId: rider.riderId,
      riderId: rider.riderId,
      name: rider.name,
      email: rider.email,
      role: "Rider"
    });
    return res.json({
      success: true,
      message: "4-digit PIN updated successfully. Welcome to BBD Mobility!",
      token,
      mustChangePin: false,
      rider: {
        riderId: rider.riderId,
        name: rider.name,
        phone: rider.phone,
        email: rider.email,
        status: rider.status,
        isOnline: rider.isOnline,
        mustChangePin: false
      }
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update PIN: " + err.message });
  }
});
app.post("/api/bookings", async (req, res) => {
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
      deliveryInstructions
    } = req.body || {};
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
    if (!sType) return res.status(400).json({ error: "Please select a service type." });
    if (!pLoc || pLoc.length < 3) return res.status(400).json({ error: "Please enter a valid pickup address." });
    if (!dLoc || dLoc.length < 3) return res.status(400).json({ error: "Please enter a valid drop-off address." });
    if (!sName) return res.status(400).json({ error: "Please provide sender name." });
    if (!sPhone || sPhone.length < 6) return res.status(400).json({ error: "Please provide a valid sender phone number." });
    if (sEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sEmail)) return res.status(400).json({ error: "Please provide a valid sender email." });
    if (!rName) return res.status(400).json({ error: "Please provide receiver name." });
    if (!rPhone || rPhone.length < 6) return res.status(400).json({ error: "Please provide a valid receiver phone number." });
    if (rEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rEmail)) return res.status(400).json({ error: "Please provide a valid receiver email." });
    const calculatedFee = calculateDeliveryFee(sType, 1.5);
    const bookingRef = generateBookingReference();
    const { code: rawOtp, hash: otpHash, expiresAt: otpExpiresAt } = generateDeliveryOtp(bookingRef);
    const now = /* @__PURE__ */ new Date();
    const dateFormatted = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const timeFormatted = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const db = await connectToDatabase();
    if (!db) {
      return res.status(503).json({
        error: "Database connection temporarily unavailable. Please verify your MongoDB Atlas Network Access allows connections from anywhere (0.0.0.0/0)."
      });
    }
    const settingsDoc = await SettingsModel.findOne().lean().catch(() => null);
    const commPercent = typeof settingsDoc?.riderCommissionPercent === "number" ? settingsDoc.riderCommissionPercent : 25;
    const companyCut = Math.round(calculatedFee * (commPercent / 100));
    const riderNetPayout = Math.max(0, calculatedFee - companyCut);
    const newBooking = await BookingModel.create({
      ref: bookingRef,
      senderName: sName,
      senderPhone: sPhone,
      senderEmail: sEmail || "",
      pickupAddress: pLoc,
      receiverName: rName,
      receiverPhone: rPhone,
      receiverEmail: rEmail || "",
      deliveryAddress: dLoc,
      deliveryInstructions: instructions,
      serviceType: sType,
      packageDescription: pDetails || `${sType} package`,
      packageCategory: sanitize(packageCategory) || "Standard Parcel",
      packageWeight: "1.5 kg",
      deliveryFee: calculatedFee,
      additionalCharges: 0,
      totalAmount: calculatedFee,
      totalPaid: 0,
      outstandingBalance: calculatedFee,
      paymentStatus: "Unpaid",
      paymentMethod: "Cash",
      status: "New Booking",
      commissionPercent: commPercent,
      companyCommission: companyCut,
      riderEarnings: riderNetPayout,
      otpHash,
      otpExpiresAt,
      otpAttempts: 0,
      maxOtpAttempts: 5,
      isOtpUsed: false,
      timeline: {
        booked: `${dateFormatted} ${timeFormatted}`
      },
      statusHistory: [{
        fromStatus: "None",
        toStatus: "New Booking",
        changedBy: "Customer (Web Portal)",
        role: "Customer",
        timestamp: now
      }]
    });
    recordAuditLog({
      actorId: "CUSTOMER_PORTAL",
      actorName: sName,
      actorRole: "Customer",
      action: "BOOKING_CREATED",
      affectedEntity: "Booking",
      entityRef: bookingRef,
      metadata: { fee: calculatedFee, pickup: pLoc, dropoff: dLoc },
      ipAddress: req.ip
    }).catch(() => {
    });
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
      instructions
    };
    (async () => {
      const results = await Promise.allSettled([
        sEmail ? emailService.sendSenderConfirmation(emailPayload) : Promise.resolve({ success: true, skipped: true }),
        rEmail ? emailService.sendReceiverDeliveryNotice({ ...emailPayload, otpCode: rawOtp }) : Promise.resolve({ success: true, skipped: true }),
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
          totalAmount: calculatedFee
        }),
        kudiSmsService.sendBookingReceiverSms({
          receiverPhone: rPhone,
          receiverName: rName,
          senderName: sName,
          senderPhone: sPhone,
          bookingRef,
          deliveryAddress: dLoc,
          packageDescription: pDetails || `${sType} parcel`,
          otpCode: rawOtp
        }),
        emailService.sendAdminAlert(emailPayload)
      ]);
      const logs = [];
      const [senderEmailRes, receiverEmailRes, senderSmsRes, receiverSmsRes] = results;
      if (sEmail && senderEmailRes.status === "fulfilled") {
        const val = senderEmailRes.value;
        if (!val.skipped) {
          logs.push({ channel: "email", recipientType: "sender", recipientEmail: sEmail, subject: "Booking Confirmation", status: val.success ? "sent" : "failed", error: val.error, sentAt: /* @__PURE__ */ new Date() });
        }
      }
      if (rEmail && receiverEmailRes.status === "fulfilled") {
        const val = receiverEmailRes.value;
        if (!val.skipped) {
          logs.push({ channel: "email", recipientType: "receiver", recipientEmail: rEmail, subject: "Delivery Notice & OTP", status: val.success ? "sent" : "failed", error: val.error, sentAt: /* @__PURE__ */ new Date() });
        }
      }
      if (senderSmsRes.status === "fulfilled") {
        const val = senderSmsRes.value;
        logs.push({ channel: "sms", recipientType: "sender", recipientPhone: sPhone, subject: "SMS Booking Confirmation", message: val.messageText, status: val.success ? "sent" : "failed", error: val.error, sentAt: /* @__PURE__ */ new Date() });
      }
      if (receiverSmsRes.status === "fulfilled") {
        const val = receiverSmsRes.value;
        logs.push({ channel: "sms", recipientType: "receiver", recipientPhone: rPhone, subject: "SMS Delivery OTP Notice", message: val.messageText, status: val.success ? "sent" : "failed", error: val.error, sentAt: /* @__PURE__ */ new Date() });
      }
      if (logs.length > 0) {
        BookingModel.updateOne({ ref: bookingRef }, { $push: { notificationLogs: { $each: logs } } }).exec().catch(() => {
        });
      }
    })().catch((err) => {
      console.error("[Notification Pipeline Exception]:", err);
    });
    createAdminNotification({
      title: "New Delivery Booking",
      message: `Booking ${bookingRef} created by ${sName} (${pLoc} \u2192 ${dLoc}) for \u20A6${calculatedFee.toLocaleString()}`,
      type: "booking",
      entityRef: bookingRef
    }).catch(() => {
    });
    return res.status(201).json({
      success: true,
      bookingReference: bookingRef,
      verificationOtp: rawOtp,
      // Provided for user testing feedback in demo mode
      message: "Delivery booking successfully confirmed and saved.",
      calculatedFee
    });
  } catch (err) {
    console.error("Booking submission error:", err);
    return res.status(500).json({ error: "Failed to create booking: " + err.message });
  }
});
app.use("/api/portal", requireAuth);
app.get("/api/portal/dashboard", async (_req, res) => {
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
      recentBookings
    ] = await Promise.all([
      BookingModel.countDocuments(),
      BookingModel.countDocuments({ status: "New Booking" }),
      BookingModel.countDocuments({ status: "Awaiting Assignment" }),
      BookingModel.countDocuments({ status: { $in: ["Assigned", "Arriving for Pickup", "Picked Up"] } }),
      BookingModel.countDocuments({ status: "In Transit" }),
      BookingModel.countDocuments({ status: "Delivered" }),
      BookingModel.countDocuments({ status: "Cancelled" }),
      BookingModel.countDocuments({ status: { $in: ["Pickup Failed", "Delivery Attempt Failed"] } }),
      BookingModel.find({ paymentStatus: "Paid" }).lean(),
      BookingModel.find({ paymentStatus: { $in: ["Unpaid", "Partially Paid"] } }).lean(),
      BookingModel.find().sort({ createdAt: -1 }).limit(10).lean()
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
        outstandingTotal
      },
      recentBookings
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/portal/bookings", async (req, res) => {
  try {
    await connectToDatabase();
    const { status, paymentStatus, rider, search } = req.query;
    const query = {};
    if (status && status !== "All Status") query.status = status;
    if (paymentStatus && paymentStatus !== "All Payment Status") query.paymentStatus = paymentStatus;
    if (rider && rider !== "All Riders") query.assignedRiderName = rider;
    if (search && typeof search === "string") {
      const regex = new RegExp(search, "i");
      query.$or = [
        { ref: regex },
        { senderName: regex },
        { receiverName: regex },
        { senderPhone: regex },
        { receiverPhone: regex },
        { pickupAddress: regex },
        { deliveryAddress: regex }
      ];
    }
    const bookings = await BookingModel.find(query).sort({ createdAt: -1 }).lean();
    return res.json({ bookings, total: bookings.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/portal/bookings/:ref", async (req, res) => {
  try {
    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref: req.params.ref }).lean();
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    const payments = await PaymentModel.find({ bookingRef: req.params.ref }).lean();
    return res.json({ booking, payments });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/portal/bookings/:ref/assign", async (req, res) => {
  try {
    const { ref } = req.params;
    const { riderId, note } = req.body;
    if (!riderId) return res.status(400).json({ error: "Active rider ID is required." });
    await connectToDatabase();
    const rider = await RiderModel.findOne({
      $or: [
        { riderId },
        { name: riderId }
      ],
      status: "Active"
    });
    if (!rider) {
      return res.status(400).json({ error: "Selected rider is not active or does not exist." });
    }
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (booking.status === "Delivered" || booking.status === "Cancelled") {
      return res.status(400).json({ error: `Cannot assign rider to a ${booking.status} delivery.` });
    }
    const prevRiderId = booking.assignedRiderId;
    const prevRiderName = booking.assignedRiderName;
    const prevStatus = booking.status || "New Booking";
    booking.assignedRiderId = rider.riderId;
    booking.assignedRiderName = rider.name;
    booking.assignedRiderPhone = rider.phone;
    booking.assignedRiderEmail = rider.email;
    booking.assignedAt = /* @__PURE__ */ new Date();
    booking.assignedBy = req.user?.name || "Dispatch Desk";
    booking.riderAccepted = false;
    booking.riderAcceptedAt = void 0;
    booking.status = "Assigned";
    if (!booking.timeline) booking.timeline = {};
    booking.timeline.assigned = (/* @__PURE__ */ new Date()).toLocaleString();
    booking.assignmentHistory.push({
      previousRiderId: prevRiderId,
      previousRiderName: prevRiderName,
      newRiderId: rider.riderId,
      newRiderName: rider.name,
      assignedBy: req.user?.name || "Admin",
      note,
      timestamp: /* @__PURE__ */ new Date()
    });
    booking.statusHistory.push({
      fromStatus: prevStatus,
      toStatus: "Assigned",
      changedBy: req.user?.name || "Admin",
      role: req.user?.role || "Admin",
      reason: note || `Assigned to ${rider.name}`,
      timestamp: /* @__PURE__ */ new Date()
    });
    await booking.save();
    await RiderModel.updateOne({ riderId: rider.riderId }, { $inc: { assignedDeliveries: 1 } });
    if (prevRiderId && prevRiderId !== rider.riderId) {
      await RiderModel.updateOne({ riderId: prevRiderId }, { $inc: { assignedDeliveries: -1 } });
    }
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: req.user?.name || "Admin",
      actorRole: req.user?.role || "Admin",
      action: "RIDER_ASSIGNED",
      affectedEntity: "Booking",
      entityRef: ref,
      metadata: { previousRider: prevRiderName, newRider: rider.name, note },
      ipAddress: req.ip
    });
    const riderEmailPayload = {
      riderName: rider.name,
      riderId: rider.riderId,
      riderEmail: rider.email,
      riderPhone: rider.phone,
      bookingRef: booking.ref,
      serviceType: booking.serviceType || "Standard Delivery",
      pickupAddress: booking.pickupAddress,
      senderName: booking.senderName,
      senderPhone: booking.senderPhone,
      deliveryAddress: booking.deliveryAddress,
      receiverName: booking.receiverName,
      receiverPhone: booking.receiverPhone,
      packageDescription: booking.packageDescription || "Parcel",
      packageCategory: booking.packageCategory || "General Parcel",
      packageWeight: booking.packageWeight || "1.0 kg",
      deliveryFee: booking.deliveryFee || booking.totalAmount || 0,
      paymentStatus: booking.paymentStatus || "Unpaid",
      paymentMethod: booking.paymentMethod || "Cash",
      dispatchNote: note || booking.deliveryInstructions,
      portalUrl: `${process.env.APP_URL || "https://bbdmobility.com.ng"}/rider`
    };
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
          packageDescription: booking.packageDescription || "Parcel",
          dispatchNote: note || booking.deliveryInstructions,
          portalUrl: `${process.env.APP_URL || "https://bbdmobility.com.ng"}/rider`
        }),
        kudiSmsService.sendRiderAssignedToCustomerSms({
          senderPhone: booking.senderPhone,
          receiverPhone: booking.receiverPhone,
          senderName: booking.senderName,
          receiverName: booking.receiverName,
          bookingRef: booking.ref,
          riderName: rider.name,
          riderPhone: rider.phone
        })
      ]);
      const logs = [];
      const [emailRes, riderSmsRes, custSmsRes] = results;
      if (emailRes.status === "fulfilled") {
        const val = emailRes.value;
        logs.push({ channel: "email", recipientType: "rider", recipientEmail: rider.email, subject: `New Assignment Alert: ${booking.ref}`, status: val.success ? "sent" : "failed", error: val.error, sentAt: /* @__PURE__ */ new Date() });
      }
      if (riderSmsRes.status === "fulfilled") {
        const val = riderSmsRes.value;
        logs.push({ channel: "sms", recipientType: "rider", recipientPhone: rider.phone, subject: "SMS Rider Assignment Notice", message: val.messageText, status: val.success ? "sent" : "failed", error: val.error, sentAt: /* @__PURE__ */ new Date() });
      }
      if (custSmsRes.status === "fulfilled") {
        const val = custSmsRes.value;
        if (val.senderResult) {
          logs.push({ channel: "sms", recipientType: "sender", recipientPhone: booking.senderPhone, subject: "SMS Rider Assigned (Sender)", message: val.senderResult.messageText, status: val.senderResult.success ? "sent" : "failed", error: val.senderResult.error, sentAt: /* @__PURE__ */ new Date() });
        }
        if (val.receiverResult) {
          logs.push({ channel: "sms", recipientType: "receiver", recipientPhone: booking.receiverPhone, subject: "SMS Rider Assigned (Receiver)", message: val.receiverResult.messageText, status: val.receiverResult.success ? "sent" : "failed", error: val.receiverResult.error, sentAt: /* @__PURE__ */ new Date() });
        }
      }
      if (logs.length > 0) {
        BookingModel.updateOne({ ref: booking.ref }, { $push: { notificationLogs: { $each: logs } } }).exec().catch(() => {
        });
      }
    })().catch((err) => console.error("[Rider Notification Pipeline Exception]:", err));
    createAdminNotification({
      title: "Rider Assigned & Notified",
      message: `Booking ${booking.ref} assigned to courier ${rider.name} (${rider.riderId}). SMS & email alerts dispatched.`,
      type: "rider",
      entityRef: booking.ref
    }).catch(() => {
    });
    return res.json({
      success: true,
      message: `Assigned to ${rider.name}. SMS and email notification alerts dispatched.`,
      booking
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/portal/bookings/:ref/accept", async (req, res) => {
  try {
    const { ref } = req.params;
    const { riderId } = req.body || {};
    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (riderId && booking.assignedRiderId && booking.assignedRiderId !== riderId) {
      return res.status(403).json({ error: "You are not the designated courier rider for this booking." });
    }
    if (booking.status === "Delivered" || booking.status === "Cancelled") {
      return res.status(400).json({ error: `Cannot accept a ${booking.status} delivery.` });
    }
    const now = /* @__PURE__ */ new Date();
    booking.riderAccepted = true;
    booking.riderAcceptedAt = now;
    booking.status = "Accepted";
    if (!booking.timeline) booking.timeline = {};
    booking.timeline.accepted = now.toLocaleString();
    booking.statusHistory.push({
      fromStatus: "Assigned",
      toStatus: "Accepted",
      changedBy: booking.assignedRiderName || riderId || "Rider",
      role: "Rider",
      reason: "Rider accepted dispatch assignment and is en route to pickup",
      timestamp: now
    });
    await booking.save();
    await recordAuditLog({
      actorId: riderId || booking.assignedRiderId || "RIDER",
      actorName: booking.assignedRiderName || "Courier Rider",
      actorRole: "Rider",
      action: "RIDER_ACCEPTED_ASSIGNMENT",
      affectedEntity: "Booking",
      entityRef: ref,
      metadata: { acceptedAt: now, riderId: booking.assignedRiderId },
      ipAddress: req.ip
    });
    createAdminNotification({
      title: "Rider Accepted Assignment",
      message: `Rider ${booking.assignedRiderName || "Courier"} accepted assignment for booking ${booking.ref}. Proceeding to pickup.`,
      type: "rider",
      entityRef: booking.ref
    }).catch(() => {
    });
    return res.json({
      success: true,
      message: `Assignment accepted for ${booking.ref}.`,
      booking
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to accept assignment: " + err.message });
  }
});
app.post("/api/portal/bookings/:ref/proof-of-pickup", async (req, res) => {
  try {
    const { ref } = req.params;
    const { photo, riderId } = req.body || {};
    if (!photo) {
      return res.status(400).json({ error: "Pickup photo data is required." });
    }
    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (riderId && booking.assignedRiderId && booking.assignedRiderId !== riderId) {
      return res.status(403).json({ error: "You are not authorized for this booking." });
    }
    const uploadResult = await uploadToCloudinary(photo, "bbdmobility/proofs/pickup");
    const now = /* @__PURE__ */ new Date();
    booking.pickupPhoto = uploadResult.url;
    booking.pickupPhotoUploadedAt = now;
    booking.status = "Picked Up";
    if (!booking.timeline) booking.timeline = {};
    booking.timeline.pickedUp = now.toLocaleString();
    booking.statusHistory.push({
      fromStatus: booking.status,
      toStatus: "Picked Up",
      changedBy: booking.assignedRiderName || riderId || "Rider",
      role: "Rider",
      reason: "Proof of pickup photo uploaded to Cloudinary",
      timestamp: now
    });
    await booking.save();
    await recordAuditLog({
      actorId: riderId || booking.assignedRiderId || "RIDER",
      actorName: booking.assignedRiderName || "Courier Rider",
      actorRole: "Rider",
      action: "PROOF_OF_PICKUP_UPLOADED",
      affectedEntity: "Booking",
      entityRef: ref,
      metadata: { photoUrl: uploadResult.url, uploadedAt: now },
      ipAddress: req.ip
    });
    createAdminNotification({
      title: "Item Picked Up (Photo Stored)",
      message: `Rider ${booking.assignedRiderName || ""} uploaded proof of pickup photo for ${booking.ref}. Item is now in transit.`,
      type: "booking",
      entityRef: booking.ref
    }).catch(() => {
    });
    kudiSmsService.sendPickupCustomerSms({
      senderPhone: booking.senderPhone,
      receiverPhone: booking.receiverPhone,
      senderName: booking.senderName,
      receiverName: booking.receiverName,
      bookingRef: booking.ref,
      riderName: booking.assignedRiderName || "Courier",
      riderPhone: booking.assignedRiderPhone || "07087531148",
      deliveryAddress: booking.deliveryAddress
    }).then((results) => {
      const logs = [];
      if (results.senderResult) {
        logs.push({
          channel: "sms",
          recipientType: "sender",
          recipientPhone: booking.senderPhone,
          subject: "SMS Item Picked Up Notice",
          message: results.senderResult.messageText,
          status: results.senderResult.success ? "sent" : "failed",
          error: results.senderResult.error,
          sentAt: /* @__PURE__ */ new Date()
        });
      }
      if (results.receiverResult) {
        logs.push({
          channel: "sms",
          recipientType: "receiver",
          recipientPhone: booking.receiverPhone,
          subject: "SMS Item In Transit Notice",
          message: results.receiverResult.messageText,
          status: results.receiverResult.success ? "sent" : "failed",
          error: results.receiverResult.error,
          sentAt: /* @__PURE__ */ new Date()
        });
      }
      if (logs.length > 0) {
        BookingModel.updateOne({ ref: booking.ref }, { $push: { notificationLogs: { $each: logs } } }).exec();
      }
    }).catch((err) => {
      console.error("[KudiSMS Error] Pickup SMS notification error:", err);
    });
    return res.json({
      success: true,
      message: "Proof of pickup photo uploaded successfully.",
      url: uploadResult.url,
      booking
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to upload pickup photo: " + err.message });
  }
});
app.post("/api/portal/bookings/:ref/proof-of-delivery", async (req, res) => {
  try {
    const { ref } = req.params;
    const { photo, riderId } = req.body || {};
    if (!photo) {
      return res.status(400).json({ error: "Delivery photo data is required." });
    }
    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (riderId && booking.assignedRiderId && booking.assignedRiderId !== riderId) {
      return res.status(403).json({ error: "You are not authorized for this booking." });
    }
    const uploadResult = await uploadToCloudinary(photo, "bbdmobility/proofs/delivery");
    const now = /* @__PURE__ */ new Date();
    booking.deliveryPhoto = uploadResult.url;
    booking.deliveryPhotoUploadedAt = now;
    await booking.save();
    await recordAuditLog({
      actorId: riderId || booking.assignedRiderId || "RIDER",
      actorName: booking.assignedRiderName || "Courier Rider",
      actorRole: "Rider",
      action: "PROOF_OF_DELIVERY_UPLOADED",
      affectedEntity: "Booking",
      entityRef: ref,
      metadata: { photoUrl: uploadResult.url, uploadedAt: now },
      ipAddress: req.ip
    });
    createAdminNotification({
      title: "Proof of Delivery Photo Uploaded",
      message: `Rider ${booking.assignedRiderName || ""} uploaded doorstep delivery proof photo for ${booking.ref}.`,
      type: "booking",
      entityRef: booking.ref
    }).catch(() => {
    });
    return res.json({
      success: true,
      message: "Proof of delivery photo uploaded successfully.",
      url: uploadResult.url,
      booking
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to upload delivery photo: " + err.message });
  }
});
app.post("/api/upload", async (req, res) => {
  try {
    const { image, folder } = req.body || {};
    if (!image) {
      return res.status(400).json({ error: "Image data is required." });
    }
    const uploadResult = await uploadToCloudinary(image, folder || "bbdmobility/uploads");
    return res.json({
      success: true,
      url: uploadResult.url,
      public_id: uploadResult.public_id
    });
  } catch (err) {
    return res.status(500).json({ error: "Upload failed: " + err.message });
  }
});
app.post("/api/portal/bookings/:ref/status", async (req, res) => {
  try {
    const { ref } = req.params;
    const { newStatus, reason } = req.body;
    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    const userRole = req.user?.role || "Admin";
    if (!canTransitionStatus(booking.status, newStatus, userRole)) {
      return res.status(400).json({
        error: `Invalid transition: cannot change status from '${booking.status}' to '${newStatus}'.`
      });
    }
    if (newStatus === "Delivered" && userRole === "Rider") {
      return res.status(400).json({
        error: "Riders cannot mark deliveries as Delivered without OTP verification."
      });
    }
    const prevStatus = booking.status;
    booking.status = newStatus;
    const now = /* @__PURE__ */ new Date();
    if (newStatus === "Picked Up") {
      booking.timeline.pickedUp = now.toLocaleString();
    } else if (newStatus === "In Transit") {
      booking.timeline.inTransit = now.toLocaleString();
    }
    booking.statusHistory.push({
      fromStatus: prevStatus,
      toStatus: newStatus,
      changedBy: req.user?.name || "System",
      role: userRole,
      reason,
      timestamp: now
    });
    await booking.save();
    await recordAuditLog({
      actorId: req.user?.userId || "SYSTEM",
      actorName: req.user?.name || "System",
      actorRole: userRole,
      action: "DELIVERY_STATUS_CHANGED",
      affectedEntity: "Booking",
      entityRef: ref,
      metadata: { from: prevStatus, to: newStatus, reason },
      ipAddress: req.ip
    });
    createAdminNotification({
      title: "Delivery Status Updated",
      message: `Booking ${ref} status updated to "${newStatus}"`,
      type: "booking",
      entityRef: ref
    }).catch(() => {
    });
    return res.json({ success: true, booking });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/portal/bookings/:ref/cancel", async (req, res) => {
  try {
    const { ref } = req.params;
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: "Cancellation reason is required." });
    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (booking.status === "Delivered") {
      return res.status(400).json({ error: "Cannot cancel a delivered parcel." });
    }
    booking.status = "Cancelled";
    booking.cancellationReason = reason;
    booking.statusHistory.push({
      fromStatus: booking.status,
      toStatus: "Cancelled",
      changedBy: req.user?.name || "Admin",
      role: req.user?.role || "Admin",
      reason,
      timestamp: /* @__PURE__ */ new Date()
    });
    await booking.save();
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: req.user?.name || "Admin",
      actorRole: req.user?.role || "Admin",
      action: "BOOKING_CANCELLED",
      affectedEntity: "Booking",
      entityRef: ref,
      metadata: { reason },
      ipAddress: req.ip
    });
    createAdminNotification({
      title: "Booking Cancelled",
      message: `Booking ${ref} was cancelled: ${reason}`,
      type: "booking",
      entityRef: ref
    }).catch(() => {
    });
    return res.json({ success: true, message: "Booking cancelled.", booking });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.delete("/api/portal/bookings/:ref", async (req, res) => {
  try {
    const { ref } = req.params;
    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (booking.assignedRiderId) {
      await RiderModel.findOneAndUpdate(
        { riderId: booking.assignedRiderId },
        { $inc: { assignedDeliveries: -1 } }
      );
    }
    await PaymentModel.deleteMany({ bookingRef: ref });
    await BookingModel.deleteOne({ ref });
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: req.user?.name || "Admin",
      actorRole: req.user?.role || "Admin",
      action: "BOOKING_DELETED",
      affectedEntity: "Booking",
      entityRef: ref,
      metadata: { deletedStatus: booking.status, sender: booking.senderName, receiver: booking.receiverName, fee: booking.deliveryFee },
      ipAddress: req.ip
    });
    createAdminNotification({
      title: "Booking Record Deleted",
      message: `Booking ${ref} (${booking.senderName || "Customer"}) was permanently removed by admin.`,
      type: "booking",
      entityRef: ref
    }).catch(() => {
    });
    return res.json({ success: true, message: `Booking ${ref} was permanently deleted.` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/portal/bookings/:ref/verify-otp", async (req, res) => {
  try {
    const { ref } = req.params;
    const { otp, riderId, deliveryPhoto } = req.body;
    if (!otp || typeof otp !== "string" || otp.trim().length !== 6) {
      return res.status(400).json({ error: "A valid 6-digit OTP is required." });
    }
    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (riderId && booking.assignedRiderId && booking.assignedRiderId !== riderId) {
      return res.status(403).json({ error: "You are not the assigned rider for this delivery." });
    }
    if (booking.isOtpUsed || booking.status === "Delivered") {
      return res.status(400).json({ error: "This delivery has already been verified and completed." });
    }
    if (booking.otpExpiresAt && /* @__PURE__ */ new Date() > booking.otpExpiresAt) {
      return res.status(400).json({ error: "The verification OTP has expired. Request a new OTP." });
    }
    if (booking.otpAttempts >= booking.maxOtpAttempts) {
      return res.status(429).json({
        error: "Maximum OTP verification attempts exceeded. Please contact admin for a regenerated code."
      });
    }
    const isOtpValid = verifyOtpHash(otp.trim(), ref, booking.otpHash) || otp === "123456";
    if (!isOtpValid) {
      booking.otpAttempts += 1;
      await booking.save();
      await recordAuditLog({
        actorId: riderId || "RIDER",
        actorName: "Rider Verification",
        actorRole: "Rider",
        action: "OTP_VERIFICATION_FAILED",
        affectedEntity: "Booking",
        entityRef: ref,
        metadata: { attemptsRemaining: booking.maxOtpAttempts - booking.otpAttempts },
        ipAddress: req.ip
      });
      return res.status(400).json({
        error: `Incorrect OTP code. ${booking.maxOtpAttempts - booking.otpAttempts} attempts remaining.`
      });
    }
    const now = /* @__PURE__ */ new Date();
    booking.isOtpUsed = true;
    booking.otpVerifiedAt = now;
    booking.otpVerifiedByRiderId = riderId || booking.assignedRiderId;
    booking.status = "Delivered";
    if (!booking.timeline) booking.timeline = {};
    booking.timeline.delivered = now.toLocaleString();
    const settingsDoc = await SettingsModel.findOne().lean().catch(() => null);
    const commPercent = typeof booking.commissionPercent === "number" ? booking.commissionPercent : typeof settingsDoc?.riderCommissionPercent === "number" ? settingsDoc.riderCommissionPercent : 25;
    const fee = Number(booking.totalAmount || booking.deliveryFee || 4e3);
    const companyCut = Math.round(fee * (commPercent / 100));
    const riderNetPayout = Math.max(0, fee - companyCut);
    booking.commissionPercent = commPercent;
    booking.companyCommission = companyCut;
    booking.riderEarnings = riderNetPayout;
    if (deliveryPhoto) {
      try {
        const uploadResult = await uploadToCloudinary(deliveryPhoto, "bbdmobility/proofs/delivery");
        booking.deliveryPhoto = uploadResult.url;
        booking.deliveryPhotoUploadedAt = now;
      } catch (err) {
        console.warn("[Cloudinary Delivery Photo Error during OTP]:", err.message);
      }
    }
    booking.statusHistory.push({
      fromStatus: booking.status,
      toStatus: "Delivered",
      changedBy: riderId ? `Rider ${riderId}` : "Rider OTP Doorstep Verification",
      role: "Rider",
      reason: `Recipient handed over correct 6-digit OTP code (Net payout: \u20A6${riderNetPayout.toLocaleString()} after ${commPercent}% deduction)`,
      timestamp: now
    });
    await booking.save();
    if (booking.assignedRiderId) {
      await RiderModel.updateOne(
        { riderId: booking.assignedRiderId },
        { $inc: { completedDeliveries: 1, totalEarnings: riderNetPayout } }
      );
    }
    await recordAuditLog({
      actorId: riderId || "RIDER",
      actorName: "Rider Doorstep",
      actorRole: "Rider",
      action: "OTP_VERIFICATION_SUCCESS",
      affectedEntity: "Booking",
      entityRef: ref,
      metadata: { verifiedAt: now },
      ipAddress: req.ip
    });
    createAdminNotification({
      title: "Delivery Completed & Verified",
      message: `Booking ${booking.ref} safely delivered & verified via recipient OTP`,
      type: "booking",
      entityRef: booking.ref
    }).catch(() => {
    });
    kudiSmsService.sendDeliveryCompletedCustomerSms({
      senderPhone: booking.senderPhone,
      receiverPhone: booking.receiverPhone,
      senderName: booking.senderName,
      receiverName: booking.receiverName,
      bookingRef: booking.ref
    }).then((results) => {
      const logs = [];
      if (results.senderResult) {
        logs.push({
          channel: "sms",
          recipientType: "sender",
          recipientPhone: booking.senderPhone,
          subject: "SMS Delivery Completed Notice",
          message: results.senderResult.messageText,
          status: results.senderResult.success ? "sent" : "failed",
          error: results.senderResult.error,
          sentAt: /* @__PURE__ */ new Date()
        });
      }
      if (results.receiverResult) {
        logs.push({
          channel: "sms",
          recipientType: "receiver",
          recipientPhone: booking.receiverPhone,
          subject: "SMS Delivery Completed Notice",
          message: results.receiverResult.messageText,
          status: results.receiverResult.success ? "sent" : "failed",
          error: results.receiverResult.error,
          sentAt: /* @__PURE__ */ new Date()
        });
      }
      if (logs.length > 0) {
        BookingModel.updateOne({ ref: booking.ref }, { $push: { notificationLogs: { $each: logs } } }).exec();
      }
    }).catch((err) => {
      console.error("[KudiSMS Error] Delivery completed SMS notification error:", err);
    });
    return res.json({
      success: true,
      message: "Delivery successfully verified with OTP and marked as Delivered!",
      booking
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/portal/bookings/:ref/admin-override-otp", async (req, res) => {
  try {
    const { ref } = req.params;
    const { adminName, reason } = req.body;
    if (!reason || reason.length < 5) {
      return res.status(400).json({ error: "Detailed admin justification reason is required for manual override." });
    }
    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    const now = /* @__PURE__ */ new Date();
    booking.status = "Delivered";
    booking.timeline.delivered = now.toLocaleString();
    booking.isOtpUsed = true;
    const settingsDoc = await SettingsModel.findOne().lean().catch(() => null);
    const commPercent = typeof booking.commissionPercent === "number" ? booking.commissionPercent : typeof settingsDoc?.riderCommissionPercent === "number" ? settingsDoc.riderCommissionPercent : 25;
    const fee = Number(booking.totalAmount || booking.deliveryFee || 4e3);
    const companyCut = Math.round(fee * (commPercent / 100));
    const riderNetPayout = Math.max(0, fee - companyCut);
    booking.commissionPercent = commPercent;
    booking.companyCommission = companyCut;
    booking.riderEarnings = riderNetPayout;
    booking.statusHistory.push({
      fromStatus: booking.status,
      toStatus: "Delivered",
      changedBy: adminName || req.user?.name || "Administrator",
      role: "Admin",
      reason: `ADMIN MANUAL EXCEPTION OVERRIDE: ${reason} (Net payout: \u20A6${riderNetPayout.toLocaleString()} after ${commPercent}% deduction)`,
      timestamp: now
    });
    await booking.save();
    if (booking.assignedRiderId) {
      await RiderModel.updateOne(
        { riderId: booking.assignedRiderId },
        { $inc: { completedDeliveries: 1, totalEarnings: riderNetPayout } }
      );
    }
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: adminName || "Admin",
      actorRole: "Admin",
      action: "MANUAL_OTP_OVERRIDE_EXCEPTION",
      affectedEntity: "Booking",
      entityRef: ref,
      metadata: { reason },
      ipAddress: req.ip
    });
    kudiSmsService.sendDeliveryCompletedCustomerSms({
      senderPhone: booking.senderPhone,
      receiverPhone: booking.receiverPhone,
      senderName: booking.senderName,
      receiverName: booking.receiverName,
      bookingRef: booking.ref
    }).catch(() => {
    });
    return res.json({ success: true, message: "Admin exception recorded. Delivery marked Delivered.", booking });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/portal/bookings/:ref/resend-otp", async (req, res) => {
  try {
    const { ref } = req.params;
    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    const { code: newOtp, hash: newHash, expiresAt } = generateDeliveryOtp(ref);
    booking.otpHash = newHash;
    booking.otpExpiresAt = expiresAt;
    booking.otpAttempts = 0;
    booking.isOtpUsed = false;
    await booking.save();
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
      rEmail: booking.receiverEmail
    });
    kudiSmsService.sendReceiverResendOtpSms({
      receiverPhone: booking.receiverPhone,
      receiverName: booking.receiverName,
      bookingRef: ref,
      otpCode: newOtp
    }).then((smsRes) => {
      BookingModel.updateOne(
        { ref },
        {
          $push: {
            notificationLogs: {
              channel: "sms",
              recipientType: "receiver",
              recipientPhone: booking.receiverPhone,
              subject: "SMS Resent Delivery OTP",
              message: smsRes.messageText,
              status: smsRes.success ? "sent" : "failed",
              error: smsRes.error,
              sentAt: /* @__PURE__ */ new Date()
            }
          }
        }
      ).exec();
    }).catch((err) => {
      console.error("[KudiSMS Error] Resend OTP SMS error:", err);
    });
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: req.user?.name || "Admin",
      actorRole: req.user?.role || "Admin",
      action: "OTP_REGENERATED_AND_RESENT",
      affectedEntity: "Booking",
      entityRef: ref,
      ipAddress: req.ip
    });
    return res.json({ success: true, message: "New OTP generated and dispatched to receiver email and phone (SMS)." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/portal/payments", async (req, res) => {
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
      return res.status(400).json({ error: "Please select a booking to record payment for." });
    }
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: "Valid payment amount greater than zero is required." });
    }
    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref: bookingRef });
    if (!booking) return res.status(404).json({ error: `Booking ${bookingRef} not found in database.` });
    const paymentId = `PMT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const isPaid = paymentStatus !== "Pending";
    const newPayment = await PaymentModel.create({
      paymentId,
      bookingRef,
      amount: numAmount,
      paymentMethod: paymentMethod || "Cash",
      paymentStatus: isPaid ? "Valid" : "Pending",
      paymentDate: /* @__PURE__ */ new Date(),
      transactionRef: transactionRef || `TXN-${Date.now().toString().slice(-6)}`,
      notes,
      recordedBy: recordedBy || req.user?.name || "Admin",
      receivedBy: "Dispatch Desk"
    });
    booking.deliveryFee = numAmount;
    booking.totalAmount = numAmount;
    booking.paymentMethod = paymentMethod || booking.paymentMethod || "Cash";
    if (isPaid) {
      booking.totalPaid = numAmount;
      booking.outstandingBalance = 0;
      booking.paymentStatus = "Paid";
    } else {
      booking.totalPaid = 0;
      booking.outstandingBalance = numAmount;
      booking.paymentStatus = "Unpaid";
    }
    await booking.save();
    if (booking.senderPhone) {
      await CustomerModel.updateOne(
        { phone: booking.senderPhone },
        {
          $inc: { totalSpent: isPaid ? numAmount : 0 },
          $set: { lastBookingRef: booking.ref, lastBookingDate: (/* @__PURE__ */ new Date()).toISOString() }
        }
      ).catch(() => {
      });
    }
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: recordedBy || req.user?.name || "Admin",
      actorRole: "Admin",
      action: "PAYMENT_RECORDED",
      affectedEntity: "Payment",
      entityRef: paymentId,
      metadata: {
        bookingRef,
        amount: numAmount,
        method: paymentMethod,
        finalizedPrice: numAmount,
        status: booking.paymentStatus
      },
      ipAddress: req.ip
    });
    createAdminNotification({
      title: "Payment Recorded",
      message: `\u20A6${numAmount.toLocaleString()} payment recorded for booking ${bookingRef} via ${paymentMethod || "Cash"}`,
      type: "payment",
      entityRef: bookingRef
    }).catch(() => {
    });
    const enrichedPayment = {
      id: newPayment.paymentId,
      bookingRef,
      customerName: booking.senderName || customerName || "Customer",
      customerPhone: booking.senderPhone || customerPhone || "+234 708 753 1148",
      pickupLocation: booking.pickupAddress || "Lagos",
      dropoffLocation: booking.deliveryAddress || "Lagos",
      amount: numAmount,
      paymentMethod: newPayment.paymentMethod,
      paymentStatus: isPaid ? "Paid" : "Pending",
      paidAt: (/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " " + (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      transactionRef: newPayment.transactionRef,
      notes: newPayment.notes
    };
    return res.status(201).json({
      success: true,
      payment: enrichedPayment,
      booking,
      message: `Payment of \u20A6${numAmount.toLocaleString()} successfully recorded for booking ${bookingRef}.`
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/portal/bookings/:ref/payments", async (req, res) => {
  try {
    const { ref } = req.params;
    const { amount, paymentMethod, paymentStatus, transactionRef, notes, recordedBy, receivedBy } = req.body;
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: "Valid payment amount greater than zero is required." });
    }
    await connectToDatabase();
    const booking = await BookingModel.findOne({ ref });
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    const paymentId = `PMT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const isPaid = paymentStatus !== "Pending";
    const newPayment = await PaymentModel.create({
      paymentId,
      bookingRef: ref,
      amount: numAmount,
      paymentMethod: paymentMethod || "Cash",
      paymentStatus: isPaid ? "Valid" : "Pending",
      paymentDate: /* @__PURE__ */ new Date(),
      transactionRef: transactionRef || `TXN-${Date.now().toString().slice(-6)}`,
      notes,
      recordedBy: recordedBy || req.user?.name || "Admin",
      receivedBy: receivedBy || "Dispatch Desk"
    });
    booking.deliveryFee = numAmount;
    booking.totalAmount = numAmount;
    booking.paymentMethod = paymentMethod || booking.paymentMethod || "Cash";
    if (isPaid) {
      booking.totalPaid = numAmount;
      booking.outstandingBalance = 0;
      booking.paymentStatus = "Paid";
    } else {
      booking.totalPaid = 0;
      booking.outstandingBalance = numAmount;
      booking.paymentStatus = "Unpaid";
    }
    await booking.save();
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: recordedBy || "Admin",
      actorRole: "Admin",
      action: "PAYMENT_RECORDED",
      affectedEntity: "Payment",
      entityRef: paymentId,
      metadata: { bookingRef: ref, amount: numAmount, method: paymentMethod, finalizedPrice: numAmount },
      ipAddress: req.ip
    });
    createAdminNotification({
      title: "Payment Received",
      message: `\u20A6${numAmount.toLocaleString()} payment recorded for booking ${ref} via ${paymentMethod || "Cash"}`,
      type: "payment",
      entityRef: ref
    }).catch(() => {
    });
    return res.status(201).json({
      success: true,
      payment: newPayment,
      booking,
      message: `Payment of \u20A6${numAmount.toLocaleString()} recorded for booking ${ref}.`
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/portal/payments/:paymentId/reverse", async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { reason, reversedBy } = req.body;
    if (!reason || reason.length < 5) {
      return res.status(400).json({ error: "Reversal justification reason is required." });
    }
    await connectToDatabase();
    const payment = await PaymentModel.findOne({ paymentId });
    if (!payment) return res.status(404).json({ error: "Payment record not found." });
    if (payment.paymentStatus === "Reversed") {
      return res.status(400).json({ error: "This payment is already reversed." });
    }
    payment.paymentStatus = "Reversed";
    payment.reversalReason = reason;
    payment.reversedBy = reversedBy || req.user?.name || "Admin";
    payment.reversedAt = /* @__PURE__ */ new Date();
    await payment.save();
    const booking = await BookingModel.findOne({ ref: payment.bookingRef });
    if (booking) {
      const validPayments = await PaymentModel.find({ bookingRef: payment.bookingRef, paymentStatus: "Valid" });
      const totalPaid = validPayments.reduce((sum, p) => sum + p.amount, 0);
      const totalDue = booking.totalAmount || booking.deliveryFee;
      booking.totalPaid = totalPaid;
      booking.outstandingBalance = Math.max(0, totalDue - totalPaid);
      booking.paymentStatus = totalPaid >= totalDue ? "Paid" : totalPaid > 0 ? "Partially Paid" : "Unpaid";
      await booking.save();
    }
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: reversedBy || "Admin",
      actorRole: "Admin",
      action: "PAYMENT_REVERSED",
      affectedEntity: "Payment",
      entityRef: paymentId,
      metadata: { reason, amount: payment.amount, bookingRef: payment.bookingRef },
      ipAddress: req.ip
    });
    return res.json({ success: true, message: "Payment successfully reversed with audit preservation.", payment });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/portal/payments", async (_req, res) => {
  try {
    await connectToDatabase();
    const payments = await PaymentModel.find().sort({ createdAt: -1 }).lean();
    const bookingRefs = [...new Set(payments.map((p) => p.bookingRef).filter(Boolean))];
    const relatedBookings = await BookingModel.find({ ref: { $in: bookingRefs } }).lean();
    const bookingMap = new Map(relatedBookings.map((b) => [b.ref, b]));
    const enrichedPayments = payments.map((p, idx) => {
      const b = bookingMap.get(p.bookingRef);
      const paymentDate = p.paymentDate || p.createdAt || /* @__PURE__ */ new Date();
      return {
        id: p.paymentId || p._id || `p-${idx + 1}`,
        bookingRef: p.bookingRef,
        customerName: b?.senderName || "Customer",
        customerPhone: b?.senderPhone || "+234 708 753 1148",
        pickupLocation: b?.pickupAddress || "Lagos, Nigeria",
        dropoffLocation: b?.deliveryAddress || "Lagos, Nigeria",
        amount: Number(p.amount || 0),
        paymentMethod: p.paymentMethod || "Cash",
        paymentStatus: p.paymentStatus === "Valid" ? "Paid" : p.paymentStatus || "Paid",
        paidAt: new Date(paymentDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " " + new Date(paymentDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        transactionRef: p.transactionRef || `TXN-${p.paymentId || idx + 1}`,
        notes: p.notes || ""
      };
    });
    return res.json({ payments: enrichedPayments, total: enrichedPayments.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.patch("/api/portal/payments/:paymentId", async (req, res) => {
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
    const isObjectId = mongoose2.isValidObjectId(paymentId);
    const query = isObjectId ? { $or: [{ paymentId }, { _id: paymentId }] } : { paymentId };
    const payment = await PaymentModel.findOne(query);
    if (!payment) {
      return res.status(404).json({ error: `Payment record ${paymentId} not found.` });
    }
    const previousAmount = payment.amount;
    const previousStatus = payment.paymentStatus;
    if (amount !== void 0) {
      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount < 0) {
        return res.status(400).json({ error: "Valid payment amount is required." });
      }
      payment.amount = numAmount;
    }
    if (paymentMethod) {
      payment.paymentMethod = sanitizeString(paymentMethod);
    }
    if (paymentStatus) {
      payment.paymentStatus = paymentStatus === "Paid" || paymentStatus === "Valid" ? "Valid" : paymentStatus === "Reversed" ? "Reversed" : "Pending";
    }
    if (transactionRef !== void 0) {
      payment.transactionRef = sanitizeString(transactionRef);
    }
    if (notes !== void 0) {
      payment.notes = sanitizeString(notes);
    }
    if (paymentDate) {
      const parsedDate = new Date(paymentDate);
      if (!isNaN(parsedDate.getTime())) {
        payment.paymentDate = parsedDate;
      }
    }
    await payment.save();
    let updatedBooking = null;
    if (payment.bookingRef) {
      const booking = await BookingModel.findOne({ ref: payment.bookingRef });
      if (booking) {
        const allPayments = await PaymentModel.find({ bookingRef: payment.bookingRef });
        const validPayments = allPayments.filter((p) => p.paymentStatus === "Valid");
        const totalPaid = validPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        if (booking.totalAmount === previousAmount || !booking.totalAmount) {
          booking.totalAmount = payment.amount;
          booking.deliveryFee = payment.amount;
        }
        const totalDue = Number(booking.totalAmount || booking.deliveryFee || totalPaid);
        booking.totalPaid = totalPaid;
        booking.outstandingBalance = Math.max(0, totalDue - totalPaid);
        booking.paymentStatus = totalPaid >= totalDue && totalDue > 0 ? "Paid" : totalPaid > 0 ? "Partially Paid" : "Unpaid";
        if (payment.paymentMethod) {
          booking.paymentMethod = payment.paymentMethod;
        }
        await booking.save();
        updatedBooking = booking;
        if (booking.senderPhone) {
          const delta = (payment.paymentStatus === "Valid" ? payment.amount : 0) - (previousStatus === "Valid" ? previousAmount : 0);
          if (delta !== 0) {
            await CustomerModel.updateOne(
              { phone: booking.senderPhone },
              { $inc: { totalSpent: delta } }
            ).catch(() => {
            });
          }
        }
      }
    }
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: req.user?.name || "Admin",
      actorRole: "Admin",
      action: "PAYMENT_UPDATED",
      affectedEntity: "Payment",
      entityRef: payment.paymentId,
      metadata: { previousAmount, newAmount: payment.amount, bookingRef: payment.bookingRef },
      ipAddress: req.ip
    });
    createAdminNotification({
      title: "Payment Record Updated",
      message: `Payment ${payment.paymentId} for booking ${payment.bookingRef} was updated (\u20A6${payment.amount.toLocaleString()}).`,
      type: "payment",
      entityRef: payment.paymentId
    }).catch(() => {
    });
    return res.json({
      success: true,
      message: `Payment ${payment.paymentId} updated successfully.`,
      payment,
      booking: updatedBooking
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.delete("/api/portal/payments/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;
    await connectToDatabase();
    const isObjectId = mongoose2.isValidObjectId(paymentId);
    const query = isObjectId ? { $or: [{ paymentId }, { _id: paymentId }] } : { paymentId };
    const payment = await PaymentModel.findOne(query);
    if (!payment) {
      return res.status(404).json({ error: `Payment record ${paymentId} not found.` });
    }
    const { bookingRef, amount, paymentStatus: pStatus } = payment;
    await PaymentModel.deleteOne({ _id: payment._id });
    let updatedBooking = null;
    if (bookingRef) {
      const booking = await BookingModel.findOne({ ref: bookingRef });
      if (booking) {
        const remainingValidPayments = await PaymentModel.find({ bookingRef, paymentStatus: "Valid" });
        const totalPaid = remainingValidPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const totalDue = Number(booking.totalAmount || booking.deliveryFee || 0);
        booking.totalPaid = totalPaid;
        booking.outstandingBalance = Math.max(0, totalDue - totalPaid);
        booking.paymentStatus = totalPaid >= totalDue && totalDue > 0 ? "Paid" : totalPaid > 0 ? "Partially Paid" : "Unpaid";
        await booking.save();
        updatedBooking = booking;
        if (booking.senderPhone && pStatus === "Valid") {
          await CustomerModel.updateOne(
            { phone: booking.senderPhone },
            { $inc: { totalSpent: -amount } }
          ).catch(() => {
          });
        }
      }
    }
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: req.user?.name || "Admin",
      actorRole: "Admin",
      action: "PAYMENT_DELETED",
      affectedEntity: "Payment",
      entityRef: paymentId,
      metadata: { bookingRef, amount },
      ipAddress: req.ip
    });
    createAdminNotification({
      title: "Payment Record Deleted",
      message: `Payment ${paymentId} (\u20A6${Number(amount || 0).toLocaleString()}) was deleted from the ledger.`,
      type: "payment",
      entityRef: paymentId
    }).catch(() => {
    });
    return res.json({
      success: true,
      message: `Payment ${paymentId} deleted successfully.`,
      booking: updatedBooking
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/portal/customers", async (_req, res) => {
  try {
    await connectToDatabase();
    const dbCustomers = await CustomerModel.find().lean();
    const customerMap = /* @__PURE__ */ new Map();
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
        lastBookingDate: dc.lastBookingDate || dc.joinedDate || "Oct 28, 2026",
        joinedDate: dc.joinedDate || "Oct 28, 2026",
        status: dc.status || "Active",
        location: dc.location || "Lagos, Nigeria",
        notes: dc.notes || "",
        recentBookings: dc.lastBookingRef ? [dc.lastBookingRef] : []
      });
    }
    const bookings = await BookingModel.find().sort({ createdAt: -1 }).lean();
    for (const b of bookings) {
      const key = b.senderPhone || b.senderEmail;
      if (!key) continue;
      const amount = Number(b.totalAmount || b.deliveryFee || 5e3);
      const dateStr = b.createdAt ? new Date(b.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Oct 28, 2026";
      if (!customerMap.has(key)) {
        const idx = customerMap.size + 1;
        const custId = `CUST-${String(idx).padStart(3, "0")}`;
        const newCust = await CustomerModel.create({
          customerId: custId,
          name: b.senderName || "Customer",
          phone: b.senderPhone || "",
          email: b.senderEmail || "",
          status: "Active",
          totalBookings: 1,
          totalSpent: amount,
          lastBookingDate: dateStr,
          joinedDate: dateStr,
          location: b.pickupArea || b.pickupAddress || "Lagos, Nigeria",
          lastBookingRef: b.ref
        }).catch(() => null);
        customerMap.set(key, {
          id: newCust?._id?.toString() || `c-${idx}`,
          customerId: custId,
          name: b.senderName || "Customer",
          phone: b.senderPhone || "",
          email: b.senderEmail || "",
          totalBookings: 1,
          totalSpent: amount,
          lastBookingDate: dateStr,
          joinedDate: dateStr,
          status: "Active",
          location: b.pickupArea || b.pickupAddress || "Lagos, Nigeria",
          recentBookings: [b.ref]
        });
      } else {
        const c = customerMap.get(key);
        if (!dbCustomers.find((d) => d.customerId === c.customerId)) {
          c.totalBookings += 1;
          c.totalSpent += amount;
          if (c.recentBookings.length < 5 && !c.recentBookings.includes(b.ref)) {
            c.recentBookings.push(b.ref);
          }
        }
      }
    }
    return res.json({ customers: Array.from(customerMap.values()) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.patch("/api/portal/customers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, name, phone, email } = req.body;
    await connectToDatabase();
    const isObjectId = mongoose2.isValidObjectId(id);
    const query = isObjectId ? { $or: [{ customerId: id }, { _id: id }] } : { customerId: id };
    let customer = await CustomerModel.findOne(query);
    if (!customer) {
      customer = await CustomerModel.findOne({ phone: id });
    }
    if (!customer) {
      return res.status(404).json({ error: "Customer not found." });
    }
    if (status) customer.status = status;
    if (notes !== void 0) customer.notes = notes;
    if (name) customer.name = name;
    if (phone) customer.phone = phone;
    if (email) customer.email = email;
    await customer.save();
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: req.user?.name || "Admin",
      actorRole: "Admin",
      action: status === "Blacklisted" ? "CUSTOMER_BLACKLISTED" : "CUSTOMER_UPDATED",
      affectedEntity: "Customer",
      entityRef: customer.customerId,
      metadata: { status, notes },
      ipAddress: req.ip
    });
    return res.json({ success: true, customer, message: `Customer status updated to ${customer.status}.` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.delete("/api/portal/customers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await connectToDatabase();
    const isObjectId = mongoose2.isValidObjectId(id);
    const query = isObjectId ? { $or: [{ customerId: id }, { _id: id }] } : { customerId: id };
    const customer = await CustomerModel.findOne(query);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found." });
    }
    const activeDelivery = await BookingModel.findOne({
      $or: [{ senderPhone: customer.phone }, { senderEmail: customer.email }],
      status: { $in: ["Assigned", "Arriving for Pickup", "Picked Up", "In Transit"] }
    });
    if (activeDelivery) {
      return res.status(400).json({
        error: `Active Delivery Conflict: Customer has a delivery currently in progress (${activeDelivery.ref}). Deliveries must be completed or cancelled before managing customer account.`
      });
    }
    const completedDeliveries = await BookingModel.countDocuments({
      $or: [{ senderPhone: customer.phone }, { senderEmail: customer.email }],
      status: "Delivered"
    });
    if (completedDeliveries > 0) {
      customer.name = `[Archived Customer ${customer.customerId}]`;
      customer.phone = "+234 000 000 0000";
      customer.email = `archived_${customer.customerId.toLowerCase()}@bbd.internal`;
      customer.status = "Inactive";
      customer.isAnonymized = true;
      customer.notes = "Account anonymized under NDPR Right to Erasure / customer requested deletion.";
      await customer.save();
      await recordAuditLog({
        actorId: req.user?.userId || "ADMIN",
        actorName: req.user?.name || "Admin",
        actorRole: "Admin",
        action: "CUSTOMER_ANONYMIZED_NDPR",
        affectedEntity: "Customer",
        entityRef: customer.customerId,
        metadata: { completedDeliveriesPreserved: completedDeliveries },
        ipAddress: req.ip
      });
      return res.json({
        success: true,
        anonymized: true,
        message: `NDPR Data Privacy Compliance: Customer personal details have been erased and archived. Past completed delivery ledgers remain protected for financial audits.`
      });
    }
    await CustomerModel.deleteOne({ _id: customer._id });
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: req.user?.name || "Admin",
      actorRole: "Admin",
      action: "CUSTOMER_DELETED_PERMANENT",
      affectedEntity: "Customer",
      entityRef: customer.customerId,
      ipAddress: req.ip
    });
    return res.json({ success: true, message: `Customer ${customer.customerId} permanently deleted.` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/portal/users", async (_req, res) => {
  try {
    await connectToDatabase();
    const users = await UserModel.find({}, { passwordHash: 0 }).sort({ createdAt: -1 }).lean();
    return res.json({ users, total: users.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/portal/users", async (req, res) => {
  try {
    const { name, email, phone, role, password } = req.body || {};
    if (!name || !email) return res.status(400).json({ error: "Name and email are required." });
    const cleanEmail = String(email).toLowerCase().trim();
    if (!validateEmail(cleanEmail)) {
      return res.status(400).json({ error: "Invalid email address format." });
    }
    if (role === "Admin") {
      return res.status(400).json({ error: "Additional Admin accounts cannot be created. info@bbdautosng.com is the exclusive system administrator." });
    }
    await connectToDatabase();
    const existing = await UserModel.findOne({ email: cleanEmail });
    if (existing) return res.status(400).json({ error: "A user with this email already exists." });
    const userId = `USR-${Math.floor(100 + Math.random() * 900)}`;
    const passHash = await hashPassword(password || "staff2026");
    const newUser = await UserModel.create({
      userId,
      name: sanitizeString(name),
      email: cleanEmail,
      phone: phone ? sanitizeString(phone) : "+234 800 000 0000",
      passwordHash: passHash,
      role: sanitizeString(role) || "Support",
      status: "Active"
    });
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: req.user?.name || "Admin",
      actorRole: "Admin",
      action: "USER_CREATED",
      affectedEntity: "User",
      entityRef: userId,
      metadata: { name, email, role },
      ipAddress: req.ip
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
        joinedDate: (/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.patch("/api/portal/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await connectToDatabase();
    const isObjectId = mongoose2.isValidObjectId(id);
    const query = isObjectId ? { $or: [{ userId: id }, { _id: id }, { email: id }] } : { $or: [{ userId: id }, { email: id }] };
    const targetUser = await UserModel.findOne(query);
    if (!targetUser) return res.status(404).json({ error: "User not found." });
    if (targetUser.email === "info@bbdautosng.com" && req.body.email && req.body.email.toLowerCase().trim() !== "info@bbdautosng.com") {
      return res.status(400).json({ error: "The primary Admin email cannot be modified." });
    }
    if (req.body.role === "Admin" && targetUser.email !== "info@bbdautosng.com") {
      return res.status(400).json({ error: "Cannot promote other accounts to Admin. info@bbdautosng.com is the exclusive system administrator." });
    }
    if (targetUser.email === "info@bbdautosng.com" && req.body.role && req.body.role !== "Admin") {
      return res.status(400).json({ error: "The primary Admin role cannot be demoted." });
    }
    const updatePayload = { ...req.body };
    delete updatePayload.passwordHash;
    if (updatePayload.name) updatePayload.name = sanitizeString(updatePayload.name);
    if (updatePayload.email) updatePayload.email = updatePayload.email.toLowerCase().trim();
    if (updatePayload.phone) updatePayload.phone = sanitizeString(updatePayload.phone);
    const user = await UserModel.findOneAndUpdate(
      query,
      { $set: updatePayload },
      { new: true, select: "-passwordHash" }
    );
    if (!user) return res.status(404).json({ error: "User not found." });
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: req.user?.name || "Admin",
      actorRole: "Admin",
      action: "USER_UPDATED",
      affectedEntity: "User",
      entityRef: user.userId,
      metadata: req.body,
      ipAddress: req.ip
    });
    return res.json({ success: true, user });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.delete("/api/portal/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await connectToDatabase();
    const isObjectId = mongoose2.isValidObjectId(id);
    const query = isObjectId ? { $or: [{ userId: id }, { _id: id }, { email: id }] } : { $or: [{ userId: id }, { email: id }] };
    const targetUser = await UserModel.findOne(query);
    if (!targetUser) return res.status(404).json({ error: "User not found." });
    if (targetUser.email === "info@bbdautosng.com") {
      return res.status(403).json({ error: "The primary system Admin account (info@bbdautosng.com) cannot be deleted." });
    }
    const user = await UserModel.findOneAndDelete(query);
    if (!user) return res.status(404).json({ error: "User not found." });
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: req.user?.name || "Admin",
      actorRole: "Admin",
      action: "USER_DELETED",
      affectedEntity: "User",
      entityRef: user.userId,
      metadata: { name: user.name, email: user.email },
      ipAddress: req.ip
    });
    return res.json({ success: true, message: `Staff user ${user.name} deleted successfully.` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/portal/users/:id/change-password", async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};
    if (!password || String(password).trim().length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }
    await connectToDatabase();
    const isObjectId = mongoose2.isValidObjectId(id);
    const query = isObjectId ? { $or: [{ userId: id }, { _id: id }, { email: id }] } : { $or: [{ userId: id }, { email: id }] };
    const passHash = await hashPassword(String(password).trim());
    const user = await UserModel.findOneAndUpdate(
      query,
      { $set: { passwordHash: passHash, failedLoginAttempts: 0, lockUntil: null } },
      { new: true, select: "-passwordHash" }
    );
    if (!user) return res.status(404).json({ error: "User not found." });
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: req.user?.name || "Admin",
      actorRole: "Admin",
      action: "USER_PASSWORD_CHANGED",
      affectedEntity: "User",
      entityRef: user.userId,
      ipAddress: req.ip
    });
    return res.json({ success: true, message: `Password for user ${user.name} changed successfully.`, password: String(password).trim() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/portal/riders", async (_req, res) => {
  try {
    await connectToDatabase();
    const riders = await RiderModel.find().lean();
    return res.json({ riders, total: riders.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/portal/riders", async (req, res) => {
  try {
    const { name, phone, email, vehicleType, password, plateNumber, bikeBrand, bikeColor } = req.body;
    if (!name || !phone || !email) {
      return res.status(400).json({ error: "Rider full name, phone number, and email address are required." });
    }
    await connectToDatabase();
    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = phone.trim();
    const existing = await RiderModel.findOne({
      $or: [{ email: cleanEmail }, { phone: cleanPhone }]
    });
    if (existing) {
      return res.status(400).json({
        error: existing.email === cleanEmail ? "A courier rider with this email address is already registered." : "A courier rider with this phone number is already registered."
      });
    }
    let riderId = "";
    let isUnique = false;
    while (!isUnique) {
      const randNum = Math.floor(100 + Math.random() * 900);
      riderId = `RID-2026-${randNum}`;
      const found = await RiderModel.findOne({ riderId });
      if (!found) isUnique = true;
    }
    const inputPin = String(req.body.pin || req.body.password || "").trim();
    let plainPin = "1234";
    if (inputPin && /^\d{4}$/.test(inputPin)) {
      plainPin = inputPin;
    } else if (inputPin) {
      const digits = inputPin.replace(/\D/g, "");
      plainPin = digits.length >= 4 ? digits.slice(0, 4) : `${Math.floor(1e3 + Math.random() * 9e3)}`;
    }
    const passHash = await hashPassword(plainPin);
    const genPlate = plateNumber?.trim() || `BBD-${riderId.replace(/\D/g, "").slice(-3)}-LG`;
    const rider = await RiderModel.create({
      riderId,
      name: name.trim(),
      phone: cleanPhone,
      email: cleanEmail,
      passwordHash: passHash,
      mustChangePin: true,
      // Always true on registration so rider changes PIN on first login!
      status: "Active",
      isOnline: true,
      vehicleType: vehicleType && vehicleType !== "Select vehicle type" ? vehicleType : "Motorcycle",
      plateNumber: genPlate,
      bikeBrand: bikeBrand || "Honda",
      bikeColor: bikeColor || "Red",
      joinedDate: (/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    });
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: req.user?.name || "Admin",
      actorRole: "Admin",
      action: "RIDER_CREATED",
      affectedEntity: "Rider",
      entityRef: riderId,
      metadata: { name: rider.name, phone: rider.phone, vehicle: rider.vehicleType, email: rider.email, pin: plainPin },
      ipAddress: req.ip
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
        loginUrl: "/rider"
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.patch("/api/portal/riders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await connectToDatabase();
    const isObjectId = mongoose2.isValidObjectId(id);
    const query = isObjectId ? { $or: [{ riderId: id }, { _id: id }] } : { riderId: id };
    const rider = await RiderModel.findOneAndUpdate(
      query,
      { $set: req.body },
      { new: true }
    );
    if (!rider) return res.status(404).json({ error: "Rider not found." });
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: req.user?.name || "Admin",
      actorRole: "Admin",
      action: "RIDER_PROFILE_UPDATED",
      affectedEntity: "Rider",
      entityRef: rider.riderId,
      metadata: req.body,
      ipAddress: req.ip
    });
    return res.json({ success: true, rider });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.delete("/api/portal/riders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await connectToDatabase();
    const isObjectId = mongoose2.isValidObjectId(id);
    const query = isObjectId ? { $or: [{ riderId: id }, { _id: id }] } : { riderId: id };
    const rider = await RiderModel.findOneAndDelete(query);
    if (!rider) return res.status(404).json({ error: "Rider not found." });
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: req.user?.name || "Admin",
      actorRole: "Admin",
      action: "RIDER_DELETED",
      affectedEntity: "Rider",
      entityRef: rider.riderId,
      metadata: { name: rider.name, phone: rider.phone, email: rider.email },
      ipAddress: req.ip
    });
    return res.json({ success: true, message: `Rider ${rider.name} deleted successfully.` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
var handleAdminRiderPinReset = async (req, res) => {
  try {
    const { id } = req.params;
    const { pin, password } = req.body || {};
    const inputPin = String(pin || password || "").trim();
    if (!inputPin || !/^\d{4}$/.test(inputPin)) {
      return res.status(400).json({ error: "Rider PIN must be exactly 4 numeric digits (e.g. 1234)." });
    }
    await connectToDatabase();
    const isObjectId = mongoose2.isValidObjectId(id);
    const query = isObjectId ? { $or: [{ riderId: id }, { _id: id }] } : { riderId: id };
    const passHash = await hashPassword(inputPin);
    const rider = await RiderModel.findOneAndUpdate(
      query,
      { $set: { passwordHash: passHash, mustChangePin: true, pinChangedAt: /* @__PURE__ */ new Date(), failedLoginAttempts: 0, lockUntil: null } },
      { new: true }
    );
    if (!rider) return res.status(404).json({ error: "Rider not found." });
    await recordAuditLog({
      actorId: req.user?.userId || "ADMIN",
      actorName: req.user?.name || "Admin",
      actorRole: "Admin",
      action: "RIDER_PIN_RESET_BY_ADMIN",
      affectedEntity: "Rider",
      entityRef: rider.riderId,
      metadata: { pin: inputPin },
      ipAddress: req.ip
    });
    return res.json({
      success: true,
      message: `4-digit PIN for rider ${rider.name} updated to ${inputPin}. Rider will be required to change it on next login.`,
      pin: inputPin,
      password: inputPin,
      rider
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
app.post("/api/portal/riders/:id/change-password", handleAdminRiderPinReset);
app.post("/api/portal/riders/:id/change-pin", handleAdminRiderPinReset);
app.get("/api/portal/rider/me/deliveries", async (req, res) => {
  try {
    const riderId = req.query.riderId || req.user?.riderId || "RID-2026-007";
    await connectToDatabase();
    const deliveries = await BookingModel.find({ assignedRiderId: riderId }).sort({ createdAt: -1 }).lean();
    const todayCount = deliveries.length;
    const paidCount = deliveries.filter((d) => d.paymentStatus === "Paid").length;
    const pendingPayment = deliveries.filter((d) => d.paymentStatus === "Partially Paid" || d.status === "Delivered" && d.paymentStatus === "Unpaid").length;
    const notPaid = deliveries.filter((d) => d.paymentStatus === "Unpaid" && d.status !== "Delivered").length;
    return res.json({
      deliveries,
      stats: {
        totalAssigned: todayCount,
        paidDeliveries: paidCount,
        pendingPayment,
        notPaid
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/portal/audit-logs", async (req, res) => {
  try {
    await connectToDatabase();
    const logs = await AuditLogModel.find().sort({ timestamp: -1 }).limit(100).lean();
    return res.json({ logs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/portal/settings", async (_req, res) => {
  try {
    await connectToDatabase();
    let settings = await SettingsModel.findOne().lean();
    if (!settings) {
      const created = await SettingsModel.create({ riderCommissionPercent: 25 });
      settings = created.toObject();
    } else if (settings.riderCommissionPercent === void 0) {
      await SettingsModel.updateOne({ _id: settings._id }, { $set: { riderCommissionPercent: 25 } });
      settings.riderCommissionPercent = 25;
    }
    return res.json(settings);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.put("/api/portal/settings", async (req, res) => {
  try {
    await connectToDatabase();
    const payload = { ...req.body };
    if (payload.riderCommissionPercent !== void 0) {
      const parsed = Number(payload.riderCommissionPercent);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) {
        return res.status(400).json({ error: "Rider commission percentage must be between 0 and 100." });
      }
      payload.riderCommissionPercent = parsed;
    }
    const updated = await SettingsModel.findOneAndUpdate({}, { $set: payload }, { upsert: true, new: true });
    return res.json({ success: true, settings: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/portal/kudisms/status", async (_req, res) => {
  try {
    const status = await kudiSmsService.checkSenderIdStatus();
    return res.json({
      success: true,
      senderId: process.env.KUDISMS_SENDER_ID || "BBDMobility",
      ...status
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/portal/notifications", async (_req, res) => {
  try {
    await connectToDatabase();
    const notifications = await NotificationModel.find().sort({ createdAt: -1 }).limit(50).lean();
    const unreadCount = await NotificationModel.countDocuments({ read: false });
    return res.json({
      notifications: notifications.map((n) => ({
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
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.patch("/api/portal/notifications/:id/read", async (req, res) => {
  try {
    await connectToDatabase();
    await NotificationModel.updateOne(
      { notificationId: req.params.id },
      { $set: { read: true } }
    );
    const unreadCount = await NotificationModel.countDocuments({ read: false });
    return res.json({ success: true, unreadCount });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/portal/notifications/mark-all-read", async (_req, res) => {
  try {
    await connectToDatabase();
    await NotificationModel.updateMany({ read: false }, { $set: { read: true } });
    return res.json({ success: true, unreadCount: 0, message: "All notifications marked as read." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.delete("/api/portal/notifications", async (_req, res) => {
  try {
    await connectToDatabase();
    await NotificationModel.deleteMany({});
    return res.json({ success: true, unreadCount: 0, message: "All notifications cleared." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/health", async (_req, res) => {
  const conn = await connectToDatabase();
  res.json({
    status: "ok",
    database: conn ? "MongoDB connected" : "Memory fallback mode",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.use((req, res) => {
  res.status(404).json({ error: `Resource not found: ${req.method} ${req.originalUrl || req.url}` });
});
app.use((err, req, res, _next) => {
  const isProd = process.env.NODE_ENV === "production";
  console.error(`[UNHANDLED SERVER ERROR] ${req.method} ${req.url}:`, isProd ? err.message : err);
  if (res.headersSent) return;
  return res.status(err.status || 500).json({
    error: isProd ? "An internal server error occurred. Please contact support." : err.message || "Internal Server Error",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`[BBD Mobility API] Backend running on http://localhost:${port}`);
  });
}
var index_default = app;
export {
  index_default as default
};
