import React, { useState } from 'react';
import { 
  Package, 
  Bike, 
  TrendingUp, 
  ShieldCheck, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  Shield,
  ArrowLeft,
  AlertCircle
} from 'lucide-react';
import { portalApi } from './api';
import { useNigerianGreeting } from './timeGreeting';

interface AdminLoginProps {
  onLoginSuccess: (token?: string) => void;
  onNavigateHome: () => void;
  onSwitchToRiderLogin?: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ 
  onLoginSuccess, 
  onNavigateHome,
  onSwitchToRiderLogin
}) => {
  const { greeting, timeFormatted } = useNigerianGreeting();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [is2FaMode, setIs2FaMode] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('Please enter your administrator email and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await portalApi.login(cleanEmail, password);
      if (res.success) {
        onLoginSuccess(res.token);
      } else {
        setError(res.error || 'Invalid credentials. Access denied.');
      }
    } catch {
      setError('Authentication service error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-white text-bbd-navy font-sans relative">
      {/* LEFT COLUMN: Hero Presentation (Matching Screenshot 1) */}
      <div className="lg:w-1/2 relative bg-[#09152e] text-white flex flex-col justify-between p-8 sm:p-12 lg:p-16 overflow-hidden min-h-[520px] lg:min-h-screen">
        {/* Subtle Background Rider Graphic & City Ambience */}
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
        <div className="relative z-20 my-auto py-10 max-w-lg">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-xs text-blue-200 font-semibold mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{greeting} • Nigerian Time (WAT)</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mb-3">
            Admin Portal
          </h1>
          <p className="text-base text-gray-300 mb-8 sm:mb-10 font-normal leading-relaxed">
            Manage deliveries, track performance, and keep your business moving.
          </p>

          <div className="space-y-4 sm:space-y-5">
            {/* Feature 1 */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 backdrop-blur-md text-white shadow-inner">
                <Package className="w-5 h-5 text-gray-100" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white tracking-wide">Manage Bookings</h4>
                <p className="text-xs text-gray-300">View and update delivery requests</p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 backdrop-blur-md text-white shadow-inner">
                <Bike className="w-5 h-5 text-gray-100" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white tracking-wide">Track Riders</h4>
                <p className="text-xs text-gray-300">Monitor your riders and deliveries</p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 backdrop-blur-md text-white shadow-inner">
                <TrendingUp className="w-5 h-5 text-gray-100" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white tracking-wide">View Analytics</h4>
                <p className="text-xs text-gray-300">Get insights and performance reports</p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 backdrop-blur-md text-white shadow-inner">
                <ShieldCheck className="w-5 h-5 text-gray-100" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white tracking-wide">Secure Access</h4>
                <p className="text-xs text-gray-300">Your data is safe with us</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Tagline / Rider Portal Switcher */}
        <div className="relative z-20 pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-gray-400 gap-2 border-t border-white/10">
          <span>Are you a delivery rider?</span>
          {onSwitchToRiderLogin && (
            <button
              onClick={onSwitchToRiderLogin}
              className="text-white hover:text-bbd-red font-semibold transition-colors flex items-center gap-1"
            >
              <span>Go to Rider Login</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Sign In Form (Matching Screenshot 1) */}
      <div className="lg:w-1/2 flex flex-col justify-between p-8 sm:p-12 lg:p-16 bg-white">
        {/* Top Tagline Indicator */}
        <div className="flex justify-end items-center gap-2 text-xs font-semibold text-bbd-navy">
          <span className="text-bbd-navy">Fast</span>
          <span className="text-bbd-red">•</span>
          <span className="text-bbd-navy">Safe</span>
          <span className="text-bbd-red">•</span>
          <span className="text-bbd-navy">Reliable</span>
        </div>

        {/* Center Form Card */}
        <div className="w-full max-w-md mx-auto my-auto py-8">
          <div className="mb-8">
            <span className="text-xs font-black tracking-widest text-bbd-red uppercase block mb-1">
              ADMIN ACCESS
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0B1B3D] tracking-tight">
              {greeting}, Admin
            </h2>
            <p className="text-sm text-gray-500 mt-1.5 font-normal">
              Sign in to your BBD Mobility admin dashboard ({timeFormatted} WAT)
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Address */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                Email Address
              </label>
              <div className="relative rounded-xl border border-gray-300 focus-within:border-bbd-navy focus-within:ring-2 focus-within:ring-bbd-navy/15 transition-all">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  className="w-full pl-10 pr-4 py-2.5 sm:py-3 text-sm text-gray-800 placeholder-gray-400 bg-transparent rounded-xl focus:outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative rounded-xl border border-gray-300 focus-within:border-bbd-navy focus-within:ring-2 focus-within:ring-bbd-navy/15 transition-all">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10 py-2.5 sm:py-3 text-sm text-gray-800 placeholder-gray-400 bg-transparent rounded-xl focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Optional 2FA Field */}
            {is2FaMode && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2 animate-fadeIn">
                <label className="block text-xs font-bold text-blue-900">
                  Two-Factor Authentication Code (6 Digits)
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full px-3 py-2 text-center tracking-widest text-base font-mono font-bold bg-white border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-blue-700">Check your authenticator app for the 6-digit verification code.</p>
              </div>
            )}

            {/* Remember Me & Forgot Password */}
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
                onClick={() => setShowForgotModal(true)}
                className="text-blue-600 hover:text-blue-700 font-semibold transition-colors"
              >
                Forgot password?
              </button>
            </div>

            {/* Sign In Primary Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-[#0B1B3D] hover:bg-[#07132c] active:scale-[0.99] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            {/* OR Divider */}
            <div className="relative my-4 flex items-center justify-center">
              <div className="border-t border-gray-200 w-full" />
              <span className="bg-white px-3 text-[11px] font-bold tracking-wider uppercase text-gray-400 absolute">
                SECURITY VERIFICATION
              </span>
            </div>

            {/* Sign in with 2FA Button */}
            <button
              type="button"
              onClick={() => setIs2FaMode(!is2FaMode)}
              className="w-full py-2.5 px-4 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm"
            >
              <Shield className="w-4 h-4 text-blue-600" />
              <span>{is2FaMode ? 'Use Regular Password' : 'Sign in with 2FA Code'}</span>
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-gray-400 pt-6 border-t border-gray-100 gap-2">
          <span>BBD Mobility Enterprise Console</span>
          <span>© 2026 BBD Mobility. All rights reserved.</span>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Reset Password</h3>
            <p className="text-xs text-gray-500 mb-4">
              Enter your registered administrator email address to receive password reset instructions.
            </p>
            {forgotSent ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs mb-4">
                Password reset instructions sent to your registered email address.
              </div>
            ) : (
              <input
                type="email"
                defaultValue={email}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-bbd-navy"
                placeholder="name@company.com"
              />
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowForgotModal(false);
                  setForgotSent(false);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800"
              >
                Close
              </button>
              {!forgotSent && (
                <button
                  onClick={() => setForgotSent(true)}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-bbd-navy rounded-lg hover:bg-bbd-navy/90"
                >
                  Send Reset Link
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
