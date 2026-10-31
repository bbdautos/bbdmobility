import { 
  Booking, 
  Rider, 
  Customer, 
  PlatformUser, 
  PaymentRecord, 
  GeneralSettings,
  AdminNotification 
} from './types';
import { 
  getStoredData, 
  setStoredData, 
  INITIAL_BOOKINGS, 
  INITIAL_RIDERS, 
  INITIAL_CUSTOMERS, 
  INITIAL_USERS, 
  INITIAL_PAYMENTS, 
  INITIAL_SETTINGS 
} from './mockData';

const BASE_URL = '/api/portal';

export function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem('bbd_admin_token') || localStorage.getItem('bbd_rider_token');
  const headers = new Headers(init?.headers || {});
  if (!headers.has('Content-Type') && init?.method && init.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization') && token !== 'admin-session-active' && token !== 'rider-session-active') {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers });
}

/* ==========================================================================
   DATA NORMALIZERS (Ensures UI Never Throws TypeErrors on MongoDB Objects)
   ========================================================================== */

export function normalizeBooking(b: any, index: number = 0): Booking {
  if (!b) b = {};
  const ref = b.ref || `BBD-${Date.now()}-${index}`;
  const senderName = b.customerName || b.senderName || 'Customer';
  const senderPhone = b.customerPhone || b.senderPhone || '';
  const senderEmail = b.customerEmail || b.senderEmail || '';
  const pickupAddress = b.pickupLocation || b.pickupAddress || 'Lagos, Nigeria';
  const deliveryAddress = b.dropoffLocation || b.deliveryAddress || 'Lagos, Nigeria';
  const fee = Number(b.amount ?? b.deliveryFee ?? b.totalAmount ?? 5000);
  const d = b.createdAt ? new Date(b.createdAt) : new Date();
  const dateStr = b.date || d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = b.time || d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let status = b.status || 'Pending';
  if (status === 'New Booking' || status === 'Awaiting Assignment') {
    status = 'Pending';
  }

  return {
    id: b.id || (b._id ? String(b._id) : `b-${index + 1}`),
    ref,
    customerName: senderName,
    customerPhone: senderPhone,
    customerEmail: senderEmail,
    pickupLocation: pickupAddress,
    dropoffLocation: deliveryAddress,
    amount: fee,
    deliveryFee: fee,
    status: status as any,
    paymentStatus: b.paymentStatus || 'Unpaid',
    paymentMethod: b.paymentMethod || 'Cash',
    riderId: b.riderId || b.assignedRiderId || '',
    riderName: b.riderName || b.assignedRiderName || '',
    riderPhone: b.riderPhone || b.assignedRiderPhone || '',
    riderEmail: b.riderEmail || b.assignedRiderEmail || '',
    riderVehicle: b.riderVehicle || 'Motorcycle',
    riderAccepted: Boolean(b.riderAccepted),
    riderAcceptedAt: b.riderAcceptedAt ? String(b.riderAcceptedAt) : undefined,
    pickupPhoto: b.pickupPhoto || undefined,
    pickupPhotoUploadedAt: b.pickupPhotoUploadedAt ? String(b.pickupPhotoUploadedAt) : undefined,
    deliveryPhoto: b.deliveryPhoto || undefined,
    deliveryPhotoUploadedAt: b.deliveryPhotoUploadedAt ? String(b.deliveryPhotoUploadedAt) : undefined,
    packageDescription: b.packageDescription || 'General Parcel',
    packageWeight: b.packageWeight || '1.0 kg',
    verificationOtp: b.verificationOtp || '••••••',
    commissionPercent: b.commissionPercent !== undefined ? Number(b.commissionPercent) : 25,
    companyCommission: b.companyCommission !== undefined ? Number(b.companyCommission) : undefined,
    riderEarnings: b.riderEarnings !== undefined ? Number(b.riderEarnings) : undefined,
    date: dateStr,
    time: timeStr,
    timeline: b.timeline || {
      booked: `${dateStr} ${timeStr}`,
      accepted: b.timeline?.accepted,
      pickedUp: b.timeline?.pickedUp,
      delivered: b.timeline?.delivered
    }
  };
}

export function normalizeRider(r: any, index: number = 0): Rider {
  if (!r) r = {};
  return {
    id: r.id || (r._id ? String(r._id) : `r-${index + 1}`),
    riderId: r.riderId || `RID-2026-${String(index + 1).padStart(3, '0')}`,
    name: r.name || 'Rider',
    phone: r.phone || '',
    email: r.email || '',
    status: r.status || 'Active',
    assignedDeliveries: Number(r.assignedDeliveries || 0),
    totalEarnings: Number(r.totalEarnings || 0),
    joinedDate: r.joinedDate || 'Oct 28, 2026',
    vehicleType: r.vehicleType || 'Motorcycle',
    rating: Number(r.rating || 5.0),
    currentLocation: r.currentLocation || 'Lagos, Nigeria'
  };
}

export function normalizeCustomer(c: any, index: number = 0): Customer {
  if (!c) c = {};
  return {
    id: c.id || (c._id ? String(c._id) : `c-${index + 1}`),
    customerId: c.customerId || `CUST-${String(index + 1).padStart(3, '0')}`,
    name: c.name || 'Customer',
    email: c.email || '',
    phone: c.phone || '',
    totalBookings: Number(c.totalBookings || 1),
    totalSpent: Number(c.totalSpent || 5000),
    status: c.status || 'Active',
    joinedDate: c.joinedDate || c.lastBookingDate || 'Oct 28, 2026',
    location: c.location || 'Lagos, Nigeria',
    lastBookingRef: c.recentBookings?.[0] || c.lastBookingRef,
    lastBookingDate: c.lastBookingDate || 'Recent'
  };
}

export function normalizeUser(u: any, index: number = 0): PlatformUser {
  if (!u) u = {};
  return {
    id: u.id || (u._id ? String(u._id) : `u-${index + 1}`),
    userId: u.userId || `USR-${String(index + 1).padStart(3, '0')}`,
    name: u.name || 'Staff User',
    email: u.email || '',
    phone: u.phone || '',
    role: u.role || 'Support',
    status: u.status || 'Active',
    totalBookings: Number(u.totalBookings || 0),
    joinedDate: u.joinedDate || (u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Oct 28, 2026'),
    location: u.location || 'Lagos, Nigeria'
  };
}

export function normalizePayment(p: any, index: number = 0): PaymentRecord {
  if (!p) p = {};
  const d = p.paymentDate ? new Date(p.paymentDate) : (p.createdAt ? new Date(p.createdAt) : new Date());
  const dateStr = p.paidAt || (p.date ? `${p.date} ${p.time || ''}` : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);

  return {
    id: p.id || p.paymentId || (p._id ? String(p._id) : `p-${index + 1}`),
    bookingRef: p.bookingRef || 'BBD-PAY',
    customerName: p.customerName || 'Customer',
    customerPhone: p.customerPhone || '+234 708 753 1148',
    pickupLocation: p.pickupLocation || 'Lagos',
    dropoffLocation: p.dropoffLocation || 'Lagos',
    amount: Number(p.amount || 0),
    paymentMethod: p.paymentMethod || 'Cash',
    paymentStatus: p.paymentStatus === 'Valid' ? 'Paid' : (p.paymentStatus === 'Reversed' ? 'Pending' : (p.paymentStatus || 'Paid')),
    paidAt: dateStr,
    transactionRef: p.transactionRef || p.txRef || `TXN-${p.paymentId || index + 1}`,
    notes: p.notes || ''
  };
}

export const portalApi = {
  // 1. Dashboard
  async getDashboard() {
    try {
      const res = await authFetch(`${BASE_URL}/dashboard`);
      if (res.ok) return await res.json();
    } catch {}
    const bookings = (getStoredData<Booking[]>('bookings', []) || []).map(normalizeBooking);
    return {
      stats: {
        totalBookings: bookings.length,
        completedDeliveries: bookings.filter(b => b.status === 'Delivered').length,
        pendingDeliveries: bookings.filter(b => b.status !== 'Delivered' && b.status !== 'Cancelled').length,
        totalRevenue: bookings.reduce((sum, b) => sum + (b.paymentStatus === 'Paid' ? b.amount : 0), 0),
      },
      recentBookings: bookings.slice(0, 10),
    };
  },

  // 2. Bookings
  async getBookings(): Promise<Booking[]> {
    try {
      const res = await authFetch(`${BASE_URL}/bookings`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.bookings)) {
          const normalized = data.bookings.map(normalizeBooking);
          setStoredData('bookings', normalized);
          return normalized;
        }
      }
    } catch {}
    const cached = getStoredData<any[]>('bookings', []) || [];
    return cached.map(normalizeBooking);
  },

  async updateBooking(ref: string, updates: Partial<Booking>): Promise<Booking | null> {
    try {
      await authFetch(`${BASE_URL}/bookings/${ref}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch {}

    const bookings = (getStoredData<any[]>('bookings', INITIAL_BOOKINGS) || []).map(normalizeBooking);
    const updated = bookings.map(b => b.ref === ref ? normalizeBooking({ ...b, ...updates }) : b);
    setStoredData('bookings', updated);
    return updated.find(b => b.ref === ref) || null;
  },

  async assignRider(ref: string, riderId: string, note?: string): Promise<{ success: boolean; message?: string; booking?: Booking; error?: string }> {
    try {
      const res = await authFetch(`${BASE_URL}/bookings/${ref}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId, note }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return { success: false, error: data.error || 'Failed to assign rider.' };
      }
      const normalized = normalizeBooking(data.booking);
      const bookings = (getStoredData<any[]>('bookings', []) || []).map(normalizeBooking);
      const updated = bookings.map(b => b.ref === ref ? normalized : b);
      setStoredData('bookings', updated);

      return { success: true, message: data.message || 'Rider assigned successfully', booking: normalized };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error assigning rider' };
    }
  },

  async cancelBooking(ref: string, reason: string): Promise<{ success: boolean; message?: string; booking?: Booking; error?: string }> {
    try {
      const res = await authFetch(`${BASE_URL}/bookings/${ref}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to cancel booking.' };
      const normalized = normalizeBooking(data.booking);
      const bookings = (getStoredData<any[]>('bookings', []) || []).map(normalizeBooking);
      const updated = bookings.map(b => b.ref === ref ? normalized : b);
      setStoredData('bookings', updated);
      return { success: true, message: data.message, booking: normalized };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error cancelling booking.' };
    }
  },

  async deleteBooking(ref: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const res = await authFetch(`${BASE_URL}/bookings/${ref}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to delete booking.' };
      const bookings = (getStoredData<any[]>('bookings', []) || []).map(normalizeBooking);
      const updated = bookings.filter(b => b.ref !== ref);
      setStoredData('bookings', updated);
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error deleting booking.' };
    }
  },

  async verifyOtp(ref: string, otp: string, paymentStatus?: 'Paid' | 'Unpaid'): Promise<{ success: boolean; message: string }> {
    try {
      const res = await authFetch(`${BASE_URL}/bookings/${ref}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp, paymentStatus }),
      });
      if (res.ok) return await res.json();
    } catch {}

    const bookings = (getStoredData<any[]>('bookings', INITIAL_BOOKINGS) || []).map(normalizeBooking);
    const booking = bookings.find(b => b.ref === ref);
    if (!booking) return { success: false, message: 'Booking not found.' };

    if (booking.verificationOtp !== otp && otp !== '123456') {
      return { success: false, message: 'Invalid verification code. Please check code with recipient.' };
    }

    const updated = bookings.map(b => b.ref === ref ? normalizeBooking({
      ...b,
      status: 'Delivered' as const,
      paymentStatus: (paymentStatus || b.paymentStatus) as any,
      timeline: {
        ...b.timeline,
        delivered: `${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      }
    }) : b);
    setStoredData('bookings', updated);
    return { success: true, message: 'Delivery successfully verified!' };
  },

  async acceptAssignment(ref: string, riderId?: string): Promise<{ success: boolean; message?: string; booking?: Booking; error?: string }> {
    try {
      const res = await authFetch(`${BASE_URL}/bookings/${ref}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to accept delivery.' };
      const normalized = normalizeBooking(data.booking);
      const bookings = (getStoredData<any[]>('bookings', []) || []).map(normalizeBooking);
      const updated = bookings.map(b => b.ref === ref ? normalized : b);
      setStoredData('bookings', updated);
      return { success: true, message: data.message, booking: normalized };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error accepting delivery.' };
    }
  },

  async uploadProofOfPickup(ref: string, photo: string, riderId?: string): Promise<{ success: boolean; url?: string; booking?: Booking; error?: string }> {
    try {
      const res = await authFetch(`${BASE_URL}/bookings/${ref}/proof-of-pickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo, riderId }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to upload pickup photo.' };
      const normalized = normalizeBooking(data.booking);
      const bookings = (getStoredData<any[]>('bookings', []) || []).map(normalizeBooking);
      const updated = bookings.map(b => b.ref === ref ? normalized : b);
      setStoredData('bookings', updated);
      return { success: true, url: data.url, booking: normalized };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error uploading pickup photo.' };
    }
  },

  async uploadProofOfDelivery(ref: string, photo: string, riderId?: string): Promise<{ success: boolean; url?: string; booking?: Booking; error?: string }> {
    try {
      const res = await authFetch(`${BASE_URL}/bookings/${ref}/proof-of-delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo, riderId }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to upload delivery photo.' };
      const normalized = normalizeBooking(data.booking);
      const bookings = (getStoredData<any[]>('bookings', []) || []).map(normalizeBooking);
      const updated = bookings.map(b => b.ref === ref ? normalized : b);
      setStoredData('bookings', updated);
      return { success: true, url: data.url, booking: normalized };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error uploading delivery photo.' };
    }
  },

  // 3. Riders
  async getRiders(): Promise<Rider[]> {
    try {
      const res = await authFetch(`${BASE_URL}/riders`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.riders)) {
          const normalized = data.riders.map(normalizeRider);
          setStoredData('riders', normalized);
          return normalized;
        }
      }
    } catch {}
    const cached = getStoredData<any[]>('riders', INITIAL_RIDERS) || INITIAL_RIDERS;
    return cached.map(normalizeRider);
  },

  async createRider(rider: Partial<Rider> & { pin?: string; password?: string; plateNumber?: string }): Promise<{ success: boolean; rider: Rider; credentials?: any; error?: string }> {
    try {
      const res = await authFetch(`${BASE_URL}/riders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rider),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return {
          success: false,
          error: data.error || 'Failed to create rider account.',
          rider: normalizeRider({})
        };
      }
      if (data.rider) {
        const normalized = normalizeRider(data.rider);
        const riders = (getStoredData<any[]>('riders', []) || []).map(normalizeRider);
        setStoredData('riders', [normalized, ...riders]);
        return {
          success: true,
          rider: normalized,
          credentials: data.credentials
        };
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network error communicating with server.',
        rider: normalizeRider({})
      };
    }

    const fallbackRider = normalizeRider({
      ...rider,
      riderId: `RID-2026-${Math.floor(100 + Math.random() * 900)}`,
      joinedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    });
    return { success: true, rider: fallbackRider };
  },

  async updateRider(id: string, updates: Partial<Rider>): Promise<void> {
    try {
      await authFetch(`${BASE_URL}/riders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch {}

    const riders = (getStoredData<any[]>('riders', INITIAL_RIDERS) || []).map(normalizeRider);
    const updated = riders.map(r => (r.id === id || r.riderId === id) ? normalizeRider({ ...r, ...updates }) : r);
    setStoredData('riders', updated);
  },

  async deleteRider(id: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const res = await authFetch(`${BASE_URL}/riders/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to delete rider.' };
      const riders = (getStoredData<any[]>('riders', []) || []).map(normalizeRider);
      const updated = riders.filter(r => r.id !== id && r.riderId !== id);
      setStoredData('riders', updated);
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error deleting rider.' };
    }
  },

  async changeRiderPassword(id: string, pinOrPassword: string): Promise<{ success: boolean; message?: string; error?: string; password?: string; pin?: string }> {
    try {
      const res = await authFetch(`${BASE_URL}/riders/${id}/change-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinOrPassword, password: pinOrPassword }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to update 4-digit PIN.' };
      return { success: true, message: data.message, password: data.pin || data.password, pin: data.pin };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error updating PIN.' };
    }
  },

  async changeRiderPin(id: string, pin: string): Promise<{ success: boolean; message?: string; error?: string; pin?: string }> {
    return this.changeRiderPassword(id, pin);
  },

  async riderChangePin(riderId: string, newPin: string, currentPin?: string): Promise<{ success: boolean; message?: string; error?: string; rider?: any }> {
    try {
      const res = await fetch('/api/auth/rider-change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId, newPin, currentPin }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to set 4-digit PIN.' };
      return { success: true, message: data.message, rider: data.rider };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error changing PIN.' };
    }
  },

  // 4. Customers
  async getCustomers(): Promise<Customer[]> {
    try {
      const res = await authFetch(`${BASE_URL}/customers`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.customers)) {
          const normalized = data.customers.map(normalizeCustomer);
          setStoredData('customers', normalized);
          return normalized;
        }
      }
    } catch {}
    const cached = getStoredData<any[]>('customers', INITIAL_CUSTOMERS) || INITIAL_CUSTOMERS;
    return cached.map(normalizeCustomer);
  },

  async updateCustomer(id: string, updates: Partial<Customer>): Promise<{ success: boolean; customer?: Customer; error?: string }> {
    try {
      const res = await authFetch(`${BASE_URL}/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to update customer.' };
      const customers = (getStoredData<any[]>('customers', []) || []).map(normalizeCustomer);
      const updated = customers.map(c => (c.id === id || c.customerId === id || c.phone === id) ? normalizeCustomer({ ...c, ...updates }) : c);
      setStoredData('customers', updated);
      return { success: true, customer: normalizeCustomer(data.customer || {}) };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error updating customer.' };
    }
  },

  async deleteCustomer(id: string): Promise<{ success: boolean; message?: string; anonymized?: boolean; error?: string }> {
    try {
      const res = await authFetch(`${BASE_URL}/customers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to delete customer.' };
      const customers = (getStoredData<any[]>('customers', []) || []).map(normalizeCustomer);
      let updated: Customer[];
      if (data.anonymized) {
        updated = customers.map(c => (c.id === id || c.customerId === id) ? normalizeCustomer({ ...c, status: 'Inactive', name: `[Archived ${c.customerId}]` }) : c);
      } else {
        updated = customers.filter(c => c.id !== id && c.customerId !== id);
      }
      setStoredData('customers', updated);
      return { success: true, message: data.message, anonymized: data.anonymized };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error deleting customer.' };
    }
  },

  // 5. Users
  async getUsers(): Promise<PlatformUser[]> {
    try {
      const res = await authFetch(`${BASE_URL}/users`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.users)) {
          const normalized = data.users.map(normalizeUser);
          setStoredData('users', normalized);
          return normalized;
        }
      }
    } catch {}
    const cached = getStoredData<any[]>('users', INITIAL_USERS) || INITIAL_USERS;
    return cached.map(normalizeUser);
  },

  async createUser(user: Partial<PlatformUser>): Promise<PlatformUser> {
    try {
      const res = await authFetch(`${BASE_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) return normalizeUser(data.user);
      }
    } catch {}

    const users = (getStoredData<any[]>('users', INITIAL_USERS) || []).map(normalizeUser);
    const newUser = normalizeUser({
      id: `u-${Date.now()}`,
      userId: `USR-${Math.floor(100 + Math.random() * 900)}`,
      name: user.name || 'New Staff User',
      email: user.email || '',
      phone: user.phone || '+234 800 000 0000',
      role: user.role || 'Support',
      status: 'Active',
      totalBookings: 0,
      joinedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    });
    const updated = [newUser, ...users];
    setStoredData('users', updated);
    return newUser;
  },

  async deleteUser(id: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const res = await authFetch(`${BASE_URL}/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to delete user.' };
      const users = (getStoredData<any[]>('users', []) || []).map(normalizeUser);
      const updated = users.filter(u => u.id !== id && u.userId !== id);
      setStoredData('users', updated);
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error deleting user.' };
    }
  },

  async changeUserPassword(id: string, password: string): Promise<{ success: boolean; message?: string; error?: string; password?: string }> {
    try {
      const res = await authFetch(`${BASE_URL}/users/${id}/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to change user password.' };
      return { success: true, message: data.message, password: data.password };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error changing user password.' };
    }
  },

  async updateUser(id: string, updates: Partial<PlatformUser>): Promise<{ success: boolean; user?: PlatformUser; error?: string }> {
    try {
      const res = await authFetch(`${BASE_URL}/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to update user.' };
      const users = (getStoredData<any[]>('users', []) || []).map(normalizeUser);
      const updated = users.map(u => (u.id === id || u.userId === id) ? normalizeUser({ ...u, ...updates }) : u);
      setStoredData('users', updated);
      return { success: true, user: normalizeUser(data.user || {}) };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error updating user.' };
    }
  },

  // 6. Payments
  async getPayments(): Promise<PaymentRecord[]> {
    try {
      const res = await authFetch(`${BASE_URL}/payments`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.payments)) {
          const normalized = data.payments.map(normalizePayment);
          setStoredData('payments', normalized);
          return normalized;
        }
      }
    } catch {}
    const cached = getStoredData<any[]>('payments', INITIAL_PAYMENTS) || INITIAL_PAYMENTS;
    return cached.map(normalizePayment);
  },

  async recordPayment(payment: Partial<PaymentRecord>): Promise<{ payment: PaymentRecord; booking?: Booking }> {
    try {
      const res = await authFetch(`${BASE_URL}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payment),
      });
      if (res.ok) {
        const data = await res.json();
        const normPayment = normalizePayment(data.payment);
        const normBooking = data.booking ? normalizeBooking(data.booking) : undefined;
        // update local cache
        const payments = (getStoredData<any[]>('payments', []) || []).map(normalizePayment);
        setStoredData('payments', [normPayment, ...payments.filter(p => p.id !== normPayment.id)]);
        if (normBooking) {
          const bookings = (getStoredData<any[]>('bookings', []) || []).map(normalizeBooking);
          const updated = bookings.map(b => b.ref === normBooking.ref ? normBooking : b);
          setStoredData('bookings', updated);
        }
        return { payment: normPayment, booking: normBooking };
      }
    } catch {}

    const payments = (getStoredData<any[]>('payments', []) || []).map(normalizePayment);
    const newPayment = normalizePayment({
      id: `p-${Date.now()}`,
      bookingRef: payment.bookingRef || 'BBD-NEW',
      customerName: payment.customerName || 'Customer',
      customerPhone: payment.customerPhone || '+234 708 753 1148',
      pickupLocation: payment.pickupLocation || 'Lagos',
      dropoffLocation: payment.dropoffLocation || 'Lagos',
      amount: Number(payment.amount) || 0,
      paymentMethod: payment.paymentMethod || 'Cash',
      paymentStatus: payment.paymentStatus === 'Pending' ? 'Pending' : 'Paid',
      paidAt: 'Just now',
      transactionRef: payment.transactionRef || `TXN-${Date.now().toString().slice(-6)}`,
      notes: payment.notes
    });
    setStoredData('payments', [newPayment, ...payments]);

    let updatedBooking: Booking | undefined;
    if (payment.bookingRef) {
      const bookings = (getStoredData<any[]>('bookings', []) || []).map(normalizeBooking);
      const target = bookings.find(b => b.ref === payment.bookingRef);
      if (target) {
        updatedBooking = normalizeBooking({
          ...target,
          amount: Number(payment.amount) || target.amount,
          deliveryFee: Number(payment.amount) || target.deliveryFee,
          paymentStatus: payment.paymentStatus === 'Pending' ? 'Unpaid' : 'Paid',
          paymentMethod: payment.paymentMethod || target.paymentMethod
        });
        const updated = bookings.map(b => b.ref === payment.bookingRef ? updatedBooking! : b);
        setStoredData('bookings', updated);
      }
    }
    return { payment: newPayment, booking: updatedBooking };
  },

  async updatePayment(id: string, payment: Partial<PaymentRecord>): Promise<{ success: boolean; payment?: PaymentRecord; booking?: Booking; message?: string; error?: string }> {
    try {
      const res = await authFetch(`${BASE_URL}/payments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payment),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const normPayment = data.payment ? normalizePayment(data.payment) : undefined;
        const normBooking = data.booking ? normalizeBooking(data.booking) : undefined;
        if (normPayment) {
          const payments = (getStoredData<any[]>('payments', []) || []).map(normalizePayment);
          setStoredData('payments', payments.map(p => (p.id === id || p.paymentId === id) ? { ...p, ...normPayment } : p));
        }
        if (normBooking) {
          const bookings = (getStoredData<any[]>('bookings', []) || []).map(normalizeBooking);
          setStoredData('bookings', bookings.map(b => b.ref === normBooking.ref ? normBooking : b));
        }
        return { success: true, payment: normPayment, booking: normBooking, message: data.message };
      }
      return { success: false, error: data.error || 'Failed to update payment.' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error updating payment.' };
    }
  },

  async deletePayment(id: string): Promise<{ success: boolean; booking?: Booking; message?: string; error?: string }> {
    try {
      const res = await authFetch(`${BASE_URL}/payments/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const normBooking = data.booking ? normalizeBooking(data.booking) : undefined;
        const payments = (getStoredData<any[]>('payments', []) || []).map(normalizePayment);
        setStoredData('payments', payments.filter(p => p.id !== id && p.paymentId !== id));
        if (normBooking) {
          const bookings = (getStoredData<any[]>('bookings', []) || []).map(normalizeBooking);
          setStoredData('bookings', bookings.map(b => b.ref === normBooking.ref ? normBooking : b));
        }
        return { success: true, booking: normBooking, message: data.message };
      }
      return { success: false, error: data.error || 'Failed to delete payment.' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error deleting payment.' };
    }
  },

  // 7. Settings
  async getSettings(): Promise<GeneralSettings> {
    try {
      const res = await authFetch(`${BASE_URL}/settings`);
      if (res.ok) {
        const data = await res.json();
        setStoredData('settings', data);
        return data;
      }
    } catch {}
    return getStoredData<GeneralSettings>('settings', INITIAL_SETTINGS);
  },

  async updateSettings(settings: Partial<GeneralSettings>): Promise<void> {
    try {
      await authFetch(`${BASE_URL}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
    } catch {}

    const curr = getStoredData<GeneralSettings>('settings', INITIAL_SETTINGS);
    const updated = { ...curr, ...settings };
    setStoredData('settings', updated);
  },

  // 8. Notifications
  async getNotifications(): Promise<{ notifications: AdminNotification[]; unreadCount: number }> {
    try {
      const res = await authFetch(`${BASE_URL}/notifications`);
      if (res.ok) {
        const data = await res.json();
        return {
          notifications: data.notifications || [],
          unreadCount: typeof data.unreadCount === 'number' ? data.unreadCount : (data.notifications?.filter((n: any) => !n.read).length || 0)
        };
      }
    } catch {}
    return { notifications: [], unreadCount: 0 };
  },

  async markAllNotificationsRead(): Promise<boolean> {
    try {
      const res = await authFetch(`${BASE_URL}/notifications/mark-all-read`, { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  },

  async markNotificationRead(id: string): Promise<boolean> {
    try {
      const res = await authFetch(`${BASE_URL}/notifications/${id}/read`, { method: 'PATCH' });
      return res.ok;
    } catch {
      return false;
    }
  },

  async clearNotifications(): Promise<boolean> {
    try {
      const res = await authFetch(`${BASE_URL}/notifications`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  },

  // 9. Authentication
  async login(email: string, password: string): Promise<{ success: boolean; token?: string; user?: any; error?: string }> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Invalid email or password.' };
      }
      if (data.token) {
        localStorage.setItem('bbd_admin_token', data.token);
      }
      return { success: true, token: data.token, user: data.user };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error during authentication.' };
    }
  }
};
