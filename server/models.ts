import mongoose, { Schema, Document } from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Global Mongoose connection caching for serverless environments (Vercel)
interface MongooseCache {
  conn: mongoose.Connection | null;
  promise: Promise<mongoose.Connection> | null;
}

let cached: MongooseCache = (global as any).mongooseConnection;

if (!cached) {
  cached = (global as any).mongooseConnection = { conn: null, promise: null };
}

export async function connectToDatabase(retries = 2): Promise<mongoose.Connection | null> {
  // 1. If active connected instance already exists, reuse it immediately
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // 2. If connection is currently in progress, await the ongoing promise
  if (mongoose.connection.readyState === 2 && cached.promise) {
    try {
      const conn = await cached.promise;
      if (conn && mongoose.connection.readyState === 1) {
        return conn;
      }
    } catch {
      // Proceed to fresh connection attempt below
    }
  }

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bbdmobility';

  // 3. Reset any stale/failed cached connection objects
  cached.promise = null;
  cached.conn = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      cached.promise = mongoose.connect(uri, {
        bufferCommands: true,
        serverSelectionTimeoutMS: 30000, // 30 seconds for mobile/remote Atlas latency
        connectTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        family: 4, // Force IPv4 to avoid broken IPv6 resolution timeouts on Nigerian ISPs
        maxPoolSize: 10,
        minPoolSize: 1,
        retryWrites: true,
      }).then((m) => {
        console.log(`[MongoDB] Connected to database: ${m.connection.name}`);
        return m.connection;
      });

      cached.conn = await cached.promise;
      if (cached.conn && mongoose.connection.readyState === 1) {
        return cached.conn;
      }
    } catch (error: any) {
      cached.promise = null;
      cached.conn = null;
      console.warn(`[MongoDB] Connection attempt ${attempt}/${retries} failed:`, error.message);
      
      if (attempt < retries) {
        // Wait 1.5 seconds before retrying
        await new Promise(r => setTimeout(r, 1500));
      } else {
        console.error('[MongoDB Atlas Warning] Connection timed out. Please ensure 0.0.0.0/0 is whitelisted in MongoDB Atlas -> Network Access.');
      }
    }
  }

  return null;
}

/* ==========================================================================
   1. BOOKING MODEL
   ========================================================================== */
export type DeliveryStatus = 
  | 'New Booking'
  | 'Awaiting Assignment'
  | 'Assigned'
  | 'Accepted'
  | 'Arriving for Pickup'
  | 'Picked Up'
  | 'In Transit'
  | 'Delivered'
  | 'Pickup Failed'
  | 'Delivery Attempt Failed'
  | 'On Hold'
  | 'Cancelled'
  | 'Returned to Sender';

export type PaymentStatus = 'Unpaid' | 'Partially Paid' | 'Paid' | 'Overpaid' | 'Refunded';
export type PaymentMethod = 'Cash' | 'Bank Transfer' | 'POS' | 'Card';

export interface IInternalNote {
  id: string;
  note: string;
  author: string;
  authorRole: string;
  createdAt: Date;
}

export interface IIncident {
  id: string;
  type: string;
  description: string;
  reportedBy: string;
  reportedByRole: string;
  createdAt: Date;
}

export interface IStatusHistory {
  fromStatus: string;
  toStatus: string;
  changedBy: string;
  role: string;
  reason?: string;
  timestamp: Date;
}

export interface IAssignmentHistory {
  previousRiderId?: string;
  previousRiderName?: string;
  newRiderId: string;
  newRiderName: string;
  assignedBy: string;
  note?: string;
  timestamp: Date;
}

export interface INotificationLog {
  channel?: 'email' | 'sms';
  recipientType: 'sender' | 'receiver' | 'rider' | 'admin';
  recipientEmail?: string;
  recipientPhone?: string;
  subject: string;
  message?: string;
  status: 'sent' | 'failed' | 'fallback';
  error?: string;
  sentAt: Date;
}

export interface IBooking extends Document {
  ref: string;
  senderName: string;
  senderPhone: string;
  senderEmail?: string;
  pickupAddress: string;
  pickupArea?: string;
  pickupInstructions?: string;

  receiverName: string;
  receiverPhone: string;
  receiverEmail?: string;
  deliveryAddress: string;
  deliveryArea?: string;
  deliveryInstructions?: string;

  serviceType: string;
  packageDescription: string;
  packageCategory?: string;
  packageWeight: string;
  quantity?: number;
  specialInstructions?: string;
  preferredPickupTime?: string;

  deliveryFee: number;
  additionalCharges: number;
  totalAmount: number;
  totalPaid: number;
  outstandingBalance: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  status: DeliveryStatus;

  // Commission & Rider Earnings Breakdown
  commissionPercent?: number;
  companyCommission?: number;
  riderEarnings?: number;

  assignedRiderId?: string;
  assignedRiderName?: string;
  assignedRiderPhone?: string;
  assignedRiderEmail?: string;
  assignedAt?: Date;
  assignedBy?: string;

  // Rider Acceptance & Proof Photos (Cloudinary)
  riderAccepted?: boolean;
  riderAcceptedAt?: Date;
  pickupPhoto?: string;
  pickupPhotoUploadedAt?: Date;
  deliveryPhoto?: string;
  deliveryPhotoUploadedAt?: Date;

  // Secure OTP storage (hashed)
  otpHash: string;
  otpExpiresAt: Date;
  otpAttempts: number;
  maxOtpAttempts: number;
  isOtpUsed: boolean;
  otpVerifiedAt?: Date;
  otpVerifiedByRiderId?: string;

  cancellationReason?: string;
  internalNotes: IInternalNote[];
  incidents: IIncident[];
  statusHistory: IStatusHistory[];
  assignmentHistory: IAssignmentHistory[];
  notificationLogs: INotificationLog[];

  timeline: {
    booked?: string;
    assigned?: string;
    accepted?: string;
    arrivingForPickup?: string;
    pickedUp?: string;
    inTransit?: string;
    delivered?: string;
  };

  createdAt: Date;
  updatedAt: Date;
}

const BookingSchema = new Schema<IBooking>({
  ref: { type: String, required: true, unique: true, index: true },
  senderName: { type: String, required: true },
  senderPhone: { type: String, required: true },
  senderEmail: { type: String, required: false, default: '' },
  pickupAddress: { type: String, required: true },
  pickupArea: { type: String },
  pickupInstructions: { type: String },

  receiverName: { type: String, required: true },
  receiverPhone: { type: String, required: true },
  receiverEmail: { type: String, required: false, default: '' },
  deliveryAddress: { type: String, required: true },
  deliveryArea: { type: String },
  deliveryInstructions: { type: String },

  serviceType: { type: String, default: 'Standard Delivery' },
  packageDescription: { type: String, required: true },
  packageCategory: { type: String, default: 'General Parcel' },
  packageWeight: { type: String, default: '1.0 kg' },
  quantity: { type: Number, default: 1 },
  specialInstructions: { type: String },
  preferredPickupTime: { type: String },

  deliveryFee: { type: Number, required: true, default: 5000 },
  additionalCharges: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true, default: 5000 },
  totalPaid: { type: Number, default: 0 },
  outstandingBalance: { type: Number, required: true, default: 5000 },

  // Commission & Rider Earnings Breakdown
  commissionPercent: { type: Number, default: 25 },
  companyCommission: { type: Number, default: 0 },
  riderEarnings: { type: Number, default: 0 },
  paymentStatus: { 
    type: String, 
    enum: ['Unpaid', 'Partially Paid', 'Paid', 'Overpaid', 'Refunded'], 
    default: 'Unpaid',
    index: true 
  },
  paymentMethod: { type: String, default: 'Cash' },
  status: { 
    type: String, 
    enum: [
      'New Booking',
      'Awaiting Assignment',
      'Assigned',
      'Accepted',
      'Arriving for Pickup',
      'Picked Up',
      'In Transit',
      'Delivered',
      'Pickup Failed',
      'Delivery Attempt Failed',
      'On Hold',
      'Cancelled',
      'Returned to Sender'
    ], 
    default: 'New Booking',
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
    channel: { type: String, default: 'email' },
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

/* ==========================================================================
   2. RIDER MODEL
   ========================================================================== */
export interface IRider extends Document {
  riderId: string;
  name: string;
  phone: string;
  email: string;
  passwordHash: string;
  mustChangePin?: boolean;
  pinChangedAt?: Date;
  status: 'Active' | 'On Leave' | 'Suspended';
  isOnline: boolean;
  assignedDeliveries: number;
  completedDeliveries: number;
  totalEarnings: number;
  joinedDate: string;
  vehicleType: string;
  plateNumber?: string;
  bikeBrand?: string;
  bikeColor?: string;
  rating?: number;
  currentLocation?: string;
  failedLoginAttempts?: number;
  lockUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const RiderSchema = new Schema<IRider>({
  riderId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  phone: { type: String, required: true, index: true },
  email: { type: String, required: true, index: true },
  passwordHash: { type: String, required: true },
  mustChangePin: { type: Boolean, default: true },
  pinChangedAt: { type: Date },
  status: { type: String, enum: ['Active', 'On Leave', 'Suspended'], default: 'Active', index: true },
  isOnline: { type: Boolean, default: true, index: true },
  assignedDeliveries: { type: Number, default: 0 },
  completedDeliveries: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  joinedDate: { type: String, required: true },
  vehicleType: { type: String, default: 'Motorcycle' },
  plateNumber: { type: String, default: 'LSD 123 XY' },
  bikeBrand: { type: String, default: 'Honda' },
  bikeColor: { type: String, default: 'Red' },
  rating: { type: Number, default: 4.9 },
  currentLocation: { type: String, default: 'Lagos, Nigeria' },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null }
}, { timestamps: true });

/* ==========================================================================
   3. PLATFORM USER (ADMIN, SUPPORT, FINANCE)
   ========================================================================== */
export interface IPlatformUser extends Document {
  userId: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: 'Admin' | 'Support' | 'Finance' | 'Customer';
  status: 'Active' | 'Suspended' | 'Inactive';
  lastLogin?: Date;
  failedLoginAttempts?: number;
  lockUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IPlatformUser>({
  userId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  phone: { type: String, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['Admin', 'Support', 'Finance', 'Customer'], default: 'Support', index: true },
  status: { type: String, enum: ['Active', 'Suspended', 'Inactive'], default: 'Active' },
  lastLogin: { type: Date },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null }
}, { timestamps: true });

/* ==========================================================================
   4. PAYMENT RECORD (APPEND-ONLY FINANCIAL LEDGER)
   ========================================================================== */
export interface IPayment extends Document {
  paymentId: string;
  bookingRef: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: 'Valid' | 'Reversed' | 'Adjusted' | 'Pending' | 'Paid';
  paymentDate: Date;
  transactionRef?: string;
  notes?: string;
  recordedBy: string;
  receivedBy?: string;
  reversalReason?: string;
  reversedBy?: string;
  reversedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>({
  paymentId: { type: String, required: true, unique: true, index: true },
  bookingRef: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['Cash', 'Bank Transfer', 'POS', 'Card'], default: 'Cash' },
  paymentStatus: { type: String, enum: ['Valid', 'Reversed', 'Adjusted', 'Pending', 'Paid'], default: 'Valid', index: true },
  paymentDate: { type: Date, default: Date.now },
  transactionRef: { type: String },
  notes: { type: String },
  recordedBy: { type: String, required: true },
  receivedBy: { type: String },
  reversalReason: { type: String },
  reversedBy: { type: String },
  reversedAt: { type: Date }
}, { timestamps: true });

/* ==========================================================================
   5. AUDIT LOG (IMMUTABLE APPEND-ONLY TRAIL)
   ========================================================================== */
export interface IAuditLog extends Document {
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  affectedEntity: string;
  entityRef: string;
  metadata?: any;
  ipAddress?: string;
  timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
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

/* ==========================================================================
   6. SETTINGS MODEL
   ========================================================================== */
export interface ISettings extends Document {
  businessName: string;
  phone: string;
  email: string;
  operatingCities: string;
  address: string;
  description: string;
  defaultPickupLocation: string;
  serviceArea: string;
  deliveryRadiusKm: number;
  maxDeliveryTimeMinutes: number;
  defaultServiceType: string;
  riderCommissionPercent?: number;
  notifications: {
    newBookings: boolean;
    payments: boolean;
    riderUpdates: boolean;
    systemAlerts: boolean;
  };
  twoFactorAuth: boolean;
  sessionTimeout: string;
}

const SettingsSchema = new Schema<ISettings>({
  businessName: { type: String, default: 'BBD Mobility' },
  phone: { type: String, default: '+234 708 753 1148' },
  email: { type: String, default: 'info@bbdmobility.com.ng' },
  operatingCities: { type: String, default: 'Lagos, Nigeria' },
  address: { type: String, default: 'Lagos, Nigeria' },
  description: { type: String, default: 'Fast and reliable delivery services across Lagos and beyond.' },
  defaultPickupLocation: { type: String, default: 'Lagos, Nigeria' },
  serviceArea: { type: String, default: 'Lagos (All Areas)' },
  deliveryRadiusKm: { type: Number, default: 50 },
  maxDeliveryTimeMinutes: { type: Number, default: 180 },
  defaultServiceType: { type: String, default: 'Standard Delivery' },
  riderCommissionPercent: { type: Number, default: 25 },
  notifications: {
    newBookings: { type: Boolean, default: true },
    payments: { type: Boolean, default: true },
    riderUpdates: { type: Boolean, default: true },
    systemAlerts: { type: Boolean, default: true }
  },
  twoFactorAuth: { type: Boolean, default: false },
  sessionTimeout: { type: String, default: '8 hours' }
}, { timestamps: true });

export const BookingModel = mongoose.models.Booking || mongoose.model<IBooking>('Booking', BookingSchema);
export const RiderModel = mongoose.models.Rider || mongoose.model<IRider>('Rider', RiderSchema);
export const UserModel = mongoose.models.User || mongoose.model<IPlatformUser>('User', UserSchema);
export const PaymentModel = mongoose.models.Payment || mongoose.model<IPayment>('Payment', PaymentSchema);
export const AuditLogModel = mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
export const SettingsModel = mongoose.models.Settings || mongoose.model<ISettings>('Settings', SettingsSchema);

/* ==========================================================================
   7. CUSTOMER MODEL (NDPR COMPLIANT AUDIT PERSISTENCE)
   ========================================================================== */
export interface ICustomer extends Document {
  customerId: string;
  name: string;
  phone: string;
  email: string;
  status: 'Active' | 'Inactive' | 'Blacklisted';
  totalBookings: number;
  totalSpent: number;
  location: string;
  notes?: string;
  joinedDate: string;
  lastBookingRef?: string;
  lastBookingDate?: string;
  isAnonymized?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>({
  customerId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  phone: { type: String, required: true, index: true },
  email: { type: String, index: true },
  status: { type: String, enum: ['Active', 'Inactive', 'Blacklisted'], default: 'Active', index: true },
  totalBookings: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  location: { type: String, default: 'Lagos, Nigeria' },
  notes: { type: String },
  joinedDate: { type: String },
  lastBookingRef: { type: String },
  lastBookingDate: { type: String },
  isAnonymized: { type: Boolean, default: false }
}, { timestamps: true });

export const CustomerModel = mongoose.models.Customer || mongoose.model<ICustomer>('Customer', CustomerSchema);

/* ==========================================================================
   8. NOTIFICATION MODEL (ADMIN REAL-TIME NOTIFICATIONS)
   ========================================================================== */
export interface INotification extends Document {
  notificationId: string;
  title: string;
  message: string;
  type: 'booking' | 'payment' | 'rider' | 'system';
  read: boolean;
  entityRef?: string;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  notificationId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['booking', 'payment', 'rider', 'system'], default: 'system', index: true },
  read: { type: Boolean, default: false, index: true },
  entityRef: { type: String, index: true },
}, { timestamps: true });

export const NotificationModel = mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);
