import React, { useState } from 'react';
import { 
  Package, 
  Navigation, 
  ShieldCheck, 
  BarChart3, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  Shield, 
  Headphones,
  ArrowLeft,
  AlertCircle
} from 'lucide-react';
import { useNigerianGreeting } from './timeGreeting';

interface RiderLoginProps {
  onLoginSuccess: (riderData?: { name: string; phone: string; riderId: string; email?: string }, token?: string) => void;
  onNavigateHome: () => void;
  onSwitchToAdminLogin?: () => void;
}

export const RiderLogin: React.FC<RiderLoginProps> = ({ 
  onLoginSuccess, 
  onNavigateHome
}) => {
  const { greeting, timeFormatted } = useNigerianGreeting();
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // First login PIN change modal / step
  const [mustChangePinRider, setMustChangePinRider] = useState<{
    riderId: string;
    name: string;
    phone: string;
    email?: string;
    token?: string;
  } | null>(null);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showNewPin, setShowNewPin] = useState(false);
  const [changingPin, setChangingPin] = useState(false);
  const [changePinError, setChangePinError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !pin) {
      setError('Please enter your Rider ID, Email or Phone and your 4-digit PIN.');
      return;
    }

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setError('PIN must be exactly 4 numeric digits (e.g. 1234).');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/rider-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), pin, password: pin })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Invalid credentials. Please verify your Rider ID and 4-digit PIN with dispatch admin.');
        setLoading(false);
        return;
      }

      // Check if rider must set their own PIN (First Login or Admin Reset)
      if (data.mustChangePin) {
        setMustChangePinRider({
          riderId: data.rider.riderId,
          name: data.rider.name,
          phone: data.rider.phone,
          email: data.rider.email,
          token: data.token
        });
        setLoading(false);
        return;
      }

      if (data.token) {
        localStorage.setItem('bbd_rider_token', data.token);
      }

      onLoginSuccess({
        name: data.rider.name,
        phone: data.rider.phone,
        email: data.rider.email,
        riderId: data.rider.riderId
      }, data.token);
    } catch {
      setError('Network connection error. Please verify your internet connection and retry.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mustChangePinRider) return;

    if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      setChangePinError('New PIN must be exactly 4 numeric digits.');
      return;
    }

    if (newPin !== confirmPin) {
      setChangePinError('Confirmation PIN does not match. Please re-enter.');
      return;
    }

    setChangePinError(null);
    setChangingPin(true);

    try {
      const res = await fetch('/api/auth/rider-change-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(mustChangePinRider.token ? { 'Authorization': `Bearer ${mustChangePinRider.token}` } : {})
        },
        body: JSON.stringify({
          riderId: mustChangePinRider.riderId,
          newPin
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setChangePinError(data.error || 'Failed to update PIN. Please retry.');
        setChangingPin(false);
        return;
      }

      const activeToken = data.token || mustChangePinRider.token;
      if (activeToken) {
        localStorage.setItem('bbd_rider_token', activeToken);
      }

      onLoginSuccess({
        name: mustChangePinRider.name,
        phone: mustChangePinRider.phone,
        email: mustChangePinRider.email,
        riderId: mustChangePinRider.riderId
      }, activeToken);
    } catch {
      setChangePinError('Network connection error updating PIN.');
    } finally {
      setChangingPin(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-white text-bbd-navy font-sans relative">
      {/* LEFT COLUMN: Rider Presentation (Matching Screenshot 2) */}
      <div className="lg:w-1/2 relative bg-[#09152e] text-white flex flex-col justify-between p-8 sm:p-12 lg:p-16 overflow-hidden min-h-[520px] lg:min-h-screen">
        {/* Subtle Background Rider Graphic */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-luminosity scale-105 pointer-events-none"
          style={{ backgroundImage: `url('/assets/portal/portal-hero-backdrop.png')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-[#071126] via-[#0b1b3d]/90 to-[#0e2759]/75 pointer-events-none" />

        {/* Diagonal Brand Accents (Bottom-Left Red/White Stripes) */}
        <div className="absolute -bottom-8 -left-8 w-44 h-44 pointer-events-none overflow-hidden z-10">
          <div className="absolute transform -rotate-45 -bottom-10 -left-10 w-48 h-8 bg-bbd-red shadow-lg" />
          <div className="absolute transform -rotate-45 -bottom-2 -left-2 w-48 h-3 bg-white" />
        </div>

        {/* Top Header / Brand Logo */}
        <div className="relative z-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/assets/logo.png" 
              alt="BBD Mobility" 
              className="h-10 sm:h-12 w-auto object-contain brightness-0 invert drop-shadow" 
            />
            <div className="border-l border-white/20 pl-3 hidden sm:block">
              <span className="text-xs uppercase tracking-wider text-gray-300 font-semibold block">Move What Matters.</span>
            </div>
          </div>

          <button
            onClick={onNavigateHome}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 hover:text-white bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-lg backdrop-blur-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Public Site</span>
          </button>
        </div>

        {/* Middle Feature Highlights */}
        <div className="relative z-20 my-auto py-8 max-w-lg">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-xs text-blue-200 font-semibold mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{greeting} • Nigerian Time (WAT)</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mb-3">
            {greeting}, Rider!
          </h1>
          <p className="text-base text-gray-300 mb-8 font-normal leading-relaxed">
            Log in to your BBD Mobility account and start your next delivery.
          </p>

          <div className="space-y-4 sm:space-y-4.5">
            {/* Feature 1 */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 backdrop-blur-md text-white shadow-inner">
                <Package className="w-5 h-5 text-gray-100" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white tracking-wide">View Assignments</h4>
                <p className="text-xs text-gray-300">Check your active and upcoming deliveries.</p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 backdrop-blur-md text-white shadow-inner">
                <Navigation className="w-5 h-5 text-gray-100" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white tracking-wide">Navigate Easily</h4>
                <p className="text-xs text-gray-300">Get pickup and drop-off locations with clear directions.</p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 backdrop-blur-md text-white shadow-inner">
                <ShieldCheck className="w-5 h-5 text-gray-100" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white tracking-wide">Verify with OTP</h4>
                <p className="text-xs text-gray-300">Secure every pickup and delivery with one-time codes.</p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 backdrop-blur-md text-white shadow-inner">
                <BarChart3 className="w-5 h-5 text-gray-100" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white tracking-wide">Track Your Earnings</h4>
                <p className="text-xs text-gray-300">See your completed deliveries and earnings history.</p>
              </div>
            </div>
          </div>

          {/* Script Accent: Riders Power Our Movement */}
          <div className="mt-8 pt-4">
            <span className="font-serif italic text-xl sm:text-2xl text-gray-200 tracking-wide select-none drop-shadow">
              Riders Power Our Movement
            </span>
          </div>
        </div>

      </div>

      {/* RIGHT COLUMN: Rider Sign In Form (Matching Screenshot 2) */}
      <div className="lg:w-1/2 flex flex-col justify-between p-8 sm:p-12 lg:p-16 bg-white">
        {/* Top Tagline Indicator with Shield */}
        <div className="flex justify-end items-center gap-2 text-xs font-semibold text-bbd-navy">
          <Shield className="w-4 h-4 text-bbd-navy" />
          <span className="text-bbd-navy">Safe</span>
          <span className="text-bbd-red">•</span>
          <span className="text-bbd-navy">Fast</span>
          <span className="text-bbd-red">•</span>
          <span className="text-bbd-navy">Reliable</span>
        </div>

        {/* Center Form Card */}
        <div className="w-full max-w-md mx-auto my-auto py-6">
          <div className="mb-7">
            <span className="text-xs font-black tracking-widest text-bbd-red uppercase block mb-1">
              {mustChangePinRider ? 'SECURITY UPDATE' : 'RIDER LOGIN'}
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0B1B3D] tracking-tight">
              {mustChangePinRider ? 'Set Your Desired PIN' : `${greeting}, Rider`}
            </h2>
            <p className="text-sm text-gray-500 mt-1 font-normal">
              {mustChangePinRider 
                ? 'Create a personal 4-digit PIN for your courier account.' 
                : `Enter your Rider ID and 4-digit PIN to access your account (${timeFormatted} WAT).`}
            </p>
          </div>

          {error && !mustChangePinRider && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {mustChangePinRider ? (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-3 bg-blue-50/90 border border-blue-200/90 rounded-2xl text-xs text-blue-950 flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">First Login: Change Default PIN</p>
                  <p className="text-[11px] text-blue-800 mt-0.5 leading-relaxed">
                    Hello <strong className="text-gray-900">{mustChangePinRider.name}</strong> ({mustChangePinRider.riderId}). Admin set an initial PIN for you. Please set your own desired <strong>4-digit PIN</strong> now to continue.
                  </p>
                </div>
              </div>

              {changePinError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{changePinError}</span>
                </div>
              )}

              <form onSubmit={handleChangePinSubmit} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-gray-700">
                      New 4-Digit PIN *
                    </label>
                    <span className="text-[10px] text-gray-400 font-medium">4 numbers</span>
                  </div>
                  <div className="relative rounded-xl border border-gray-300 focus-within:border-bbd-navy focus-within:ring-2 focus-within:ring-bbd-navy/15 transition-all">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showNewPin ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={4}
                      required
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="••••"
                      className="w-full pl-10 pr-10 py-3 text-lg font-mono tracking-widest font-black text-gray-900 placeholder-gray-400 bg-transparent rounded-xl focus:outline-none text-center"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPin(!showNewPin)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                      aria-label="Toggle PIN visibility"
                    >
                      {showNewPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-gray-700">
                      Confirm New 4-Digit PIN *
                    </label>
                    <span className="text-[10px] text-gray-400 font-medium">Re-enter 4 numbers</span>
                  </div>
                  <div className="relative rounded-xl border border-gray-300 focus-within:border-bbd-navy focus-within:ring-2 focus-within:ring-bbd-navy/15 transition-all">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showNewPin ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={4}
                      required
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="••••"
                      className="w-full pl-10 pr-10 py-3 text-lg font-mono tracking-widest font-black text-gray-900 placeholder-gray-400 bg-transparent rounded-xl focus:outline-none text-center"
                    />
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={changingPin || newPin.length !== 4 || confirmPin.length !== 4}
                    className="w-full py-3 px-4 bg-[#0B1B3D] hover:bg-[#07132c] disabled:opacity-50 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
                  >
                    {changingPin ? (
                      <>
                        <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Saving Your New PIN...</span>
                      </>
                    ) : (
                      <>
                        <span>Save PIN & Go to Dashboard</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMustChangePinRider(null);
                    setNewPin('');
                    setConfirmPin('');
                    setChangePinError(null);
                  }}
                  className="w-full py-2 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors"
                >
                  Cancel & Back to Login
                </button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Notice for Riders */}
              <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] leading-relaxed">
                  Rider accounts are set up by the BBD Mobility Dispatch Administrator with an initial 4-digit PIN.
                </p>
              </div>

              {/* Rider ID / Email / Phone Number */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Rider ID, Email Address, or Phone Number
                </label>
                <div className="relative rounded-xl border border-gray-300 focus-within:border-bbd-navy focus-within:ring-2 focus-within:ring-bbd-navy/15 transition-all">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. RID-2026-001, rider@bbdmobility.com.ng or 07087531148"
                    className="w-full pl-10 pr-4 py-2.5 sm:py-3 text-sm text-gray-800 placeholder-gray-400 bg-transparent rounded-xl focus:outline-none"
                  />
                </div>
              </div>

              {/* 4-Digit Login PIN */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-gray-700">
                    4-Digit Login PIN
                  </label>
                  <span className="text-[10px] text-gray-400 font-medium">4 numbers</span>
                </div>
                <div className="relative rounded-xl border border-gray-300 focus-within:border-bbd-navy focus-within:ring-2 focus-within:ring-bbd-navy/15 transition-all">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={4}
                    required
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className="w-full pl-10 pr-10 py-2.5 sm:py-3 text-base font-mono tracking-widest font-black text-gray-900 placeholder-gray-400 bg-transparent rounded-xl focus:outline-none text-center"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Toggle PIN visibility"
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me & Forgot PIN */}
              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none text-gray-600 font-medium">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded text-[#0B1B3D] border-gray-300 focus:ring-[#0B1B3D]"
                  />
                  <span>Remember me</span>
                </label>

                <button
                  type="button"
                  onClick={() => alert('Please contact your BBD Mobility Dispatch Administrator to reset your 4-digit PIN.')}
                  className="text-blue-600 hover:text-blue-700 font-semibold transition-colors"
                >
                  Forgot PIN?
                </button>
              </div>

              {/* Log In Primary Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || pin.length !== 4}
                  className="w-full py-3 px-4 bg-[#0B1B3D] hover:bg-[#07132c] disabled:opacity-50 active:scale-[0.99] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
                >
                  {loading ? (
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Log In with 4-Digit PIN</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {/* Support Hotline Link */}
              <div className="pt-2 text-center">
                <span className="text-[11px] text-gray-500">
                  Need help logging in? Contact dispatch hotline at{' '}
                  <a href="tel:+2347087531148" className="text-bbd-navy font-bold hover:underline">
                    0708 753 1148
                  </a>
                </span>
              </div>
            </form>
          )}
        </div>

        {/* Footer with Helpline & Version Info */}
        <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-gray-400 pt-5 border-t border-gray-100 gap-3">
          <div className="flex items-center gap-2 text-gray-600 font-medium">
            <Headphones className="w-4 h-4 text-bbd-red" />
            <span>Need Help? Contact support:</span>
            <a href="tel:+2347087531148" className="text-bbd-navy hover:text-bbd-red font-bold underline">
              +234 708 753 1148
            </a>
          </div>

          <div className="flex items-center gap-3">
            <span>BBD Mobility Rider Portal v1.0.0</span>
            <span>•</span>
            <span>© 2026 BBD Mobility. All rights reserved.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
