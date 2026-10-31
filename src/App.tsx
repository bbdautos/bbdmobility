import { useState, useEffect } from 'react';
import { Phone, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { BenefitsStrip } from './components/BenefitsStrip';
import { ServicesSection } from './components/ServicesSection';
import { WhyChooseUsSection } from './components/WhyChooseUsSection';
import { TestimonialsSection } from './components/TestimonialsSection';
import { Footer } from './components/Footer';
import { AllServicesModal } from './components/AllServicesModal';
import { ReviewsModal } from './components/ReviewsModal';
import { InfoModal, ModalType } from './components/InfoModal';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { ServicesPage } from './pages/ServicesPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { FaqsPage } from './pages/FaqsPage';
import { SEO } from './components/SEO';
import { AdminPortal } from './portal/AdminPortal';
import { AdminLogin } from './portal/AdminLogin';
import { RiderPortal } from './portal/RiderPortal';
import { RiderLogin } from './portal/RiderLogin';

export function App() {
  const [currentView, setCurrentView] = useState<
    'home' | 'about' | 'contact' | 'services' | 'how-it-works' | 'faqs' | 'admin' | 'rider'
  >('home');
  const [activeNav, setActiveNav] = useState('Home');
  const [selectedService, setSelectedService] = useState('Documents & Files');
  const [allServicesOpen, setAllServicesOpen] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [infoModalType, setInfoModalType] = useState<ModalType | null>(null);
  const [showMobileStickyBar, setShowMobileStickyBar] = useState(false);

  // Portal authentication states
  const [adminLoggedIn, setAdminLoggedIn] = useState<boolean>(() => {
    return Boolean(localStorage.getItem('bbd_admin_token') || sessionStorage.getItem('bbd_admin_token'));
  });
  const [riderLoggedIn, setRiderLoggedIn] = useState<boolean>(() => {
    return Boolean(localStorage.getItem('bbd_rider_token') || sessionStorage.getItem('bbd_rider_token'));
  });
  const [riderUser, setRiderUser] = useState<{
    riderId: string;
    name: string;
    phone: string;
    email?: string;
  }>(() => {
    try {
      const saved = localStorage.getItem('bbd_rider_user');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      riderId: 'RID-2026-007',
      name: 'Tunde Adeleke',
      phone: '+234 802 345 6789',
      email: 'tunde.adeleke@bbdmobility.com.ng',
    };
  });

  // Sync route from URL / hash
  useEffect(() => {
    const syncRoute = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();

      if (path === '/admin' || path === '/admin/login' || hash === '#/admin' || hash === '#admin') {
        setCurrentView('admin');
        setActiveNav('Admin');
      } else if (path === '/rider' || path === '/rider/login' || hash === '#/rider' || hash === '#rider') {
        setCurrentView('rider');
        setActiveNav('Rider');
      } else if (path === '/contact' || hash === '#/contact' || hash === '#contact-page') {
        setCurrentView('contact');
        setActiveNav('Contact');
      } else if (path === '/about' || hash === '#/about' || hash === '#about-page') {
        setCurrentView('about');
        setActiveNav('About Us');
      } else if (path === '/services' || hash === '#/services' || hash === '#services-page') {
        setCurrentView('services');
        setActiveNav('Services');
      } else if (path === '/how-it-works' || hash === '#/how-it-works' || hash === '#how-it-works-page') {
        setCurrentView('how-it-works');
        setActiveNav('How It Works');
      } else if (path === '/faqs' || path === '/faq' || hash === '#/faqs' || hash === '#faqs-page') {
        setCurrentView('faqs');
        setActiveNav('FAQs');
      } else {
        setCurrentView('home');
        if (hash === '#services') {
          setActiveNav('Services');
        } else if (hash === '#about') {
          setActiveNav('About Us');
        } else {
          setActiveNav('Home');
        }
      }
    };

    syncRoute();
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  // Navigation helpers
  const navigateToAbout = () => {
    setCurrentView('about');
    setActiveNav('About Us');
    if (window.location.pathname !== '/about') {
      window.history.pushState(null, '', '/about');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToContact = () => {
    setCurrentView('contact');
    setActiveNav('Contact');
    if (window.location.pathname !== '/contact') {
      window.history.pushState(null, '', '/contact');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToServices = () => {
    setCurrentView('services');
    setActiveNav('Services');
    if (window.location.pathname !== '/services') {
      window.history.pushState(null, '', '/services');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToHowItWorks = () => {
    setCurrentView('how-it-works');
    setActiveNav('How It Works');
    if (window.location.pathname !== '/how-it-works') {
      window.history.pushState(null, '', '/how-it-works');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToFaqs = () => {
    setCurrentView('faqs');
    setActiveNav('FAQs');
    if (window.location.pathname !== '/faqs') {
      window.history.pushState(null, '', '/faqs');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToHome = (targetId?: string) => {
    setCurrentView('home');
    setActiveNav(targetId === 'services' ? 'Services' : 'Home');
    if (window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
    }
    if (targetId) {
      setTimeout(() => {
        const el = document.getElementById(targetId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const navigateToAdmin = () => {
    setCurrentView('admin');
    setActiveNav('Admin');
    if (window.location.pathname !== '/admin') {
      window.history.pushState(null, '', '/admin');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToRider = () => {
    setCurrentView('rider');
    setActiveNav('Rider');
    if (window.location.pathname !== '/rider') {
      window.history.pushState(null, '', '/rider');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const handleScroll = () => {
      setShowMobileStickyBar(window.scrollY > 350);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleBookNowClick = (serviceType?: string) => {
    if (serviceType) {
      setSelectedService(serviceType);
    }
    if (currentView !== 'home') {
      navigateToHome();
      setTimeout(() => {
        const el = document.getElementById('booking-form');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
          el.classList.add('ring-2', 'ring-bbd-red');
          setTimeout(() => el.classList.remove('ring-2', 'ring-bbd-red'), 1200);
        }
      }, 200);
      return;
    }

    const el = document.getElementById('booking-form');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      el.classList.add('ring-2', 'ring-bbd-red');
      setTimeout(() => el.classList.remove('ring-2', 'ring-bbd-red'), 1200);
    }
  };

  const handleSelectService = (serviceName: string) => {
    setSelectedService(serviceName);
    handleBookNowClick();
  };

  // Dedicated Full-Screen Admin & Rider Portals
  if (currentView === 'admin') {
    return adminLoggedIn ? (
      <AdminPortal
        onLogout={() => {
          localStorage.removeItem('bbd_admin_token');
          sessionStorage.removeItem('bbd_admin_token');
          setAdminLoggedIn(false);
        }}
        onNavigateHome={navigateToHome}
      />
    ) : (
      <AdminLogin
        onLoginSuccess={(token) => {
          if (token) {
            localStorage.setItem('bbd_admin_token', token);
          }
          sessionStorage.setItem('bbd_admin_just_logged_in', 'true');
          setAdminLoggedIn(true);
        }}
        onNavigateHome={navigateToHome}
        onSwitchToRiderLogin={navigateToRider}
      />
    );
  }

  if (currentView === 'rider') {
    return riderLoggedIn ? (
      <RiderPortal
        riderData={riderUser}
        onLogout={() => {
          localStorage.removeItem('bbd_rider_token');
          sessionStorage.removeItem('bbd_rider_token');
          setRiderLoggedIn(false);
        }}
        onNavigateHome={navigateToHome}
      />
    ) : (
      <RiderLogin
        onLoginSuccess={(rData, token) => {
          if (rData) {
            setRiderUser(rData);
            localStorage.setItem('bbd_rider_user', JSON.stringify(rData));
          }
          if (token) {
            localStorage.setItem('bbd_rider_token', token);
          }
          sessionStorage.setItem('bbd_rider_just_logged_in', 'true');
          setRiderLoggedIn(true);
        }}
        onNavigateHome={navigateToHome}
        onSwitchToAdminLogin={navigateToAdmin}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white text-bbd-text-navy font-sans flex flex-col selection:bg-bbd-red selection:text-white relative">
      {/* 1. Header & Navigation */}
      <Navbar
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        onOpenModal={(type) => setInfoModalType(type)}
        onBookNowClick={() => handleBookNowClick()}
        onNavigateHome={navigateToHome}
        onNavigateAbout={navigateToAbout}
        onNavigateContact={navigateToContact}
        onNavigateServices={navigateToServices}
        onNavigateHowItWorks={navigateToHowItWorks}
        onNavigateFaqs={navigateToFaqs}
        onNavigateAdmin={navigateToAdmin}
        onNavigateRider={navigateToRider}
        currentView={currentView}
      />

      <main className="flex-grow">
        {currentView === 'contact' ? (
          /* Dedicated Contact Page */
          <ContactPage
            onBackToHome={() => navigateToHome()}
            onBookNow={() => handleBookNowClick()}
            onOpenModal={(type) => {
              if (type === 'how-it-works') navigateToHowItWorks();
              else if (type === 'faqs') navigateToFaqs();
              else setInfoModalType(type);
            }}
          />
        ) : currentView === 'about' ? (
          /* Dedicated About Page */
          <AboutPage
            onBackToHome={() => navigateToHome()}
            onBookNow={() => handleBookNowClick()}
            onOpenModal={(type) => {
              if (type === 'contact') navigateToContact();
              else if (type === 'faqs') navigateToFaqs();
            }}
          />
        ) : currentView === 'services' ? (
          /* Dedicated Services Page */
          <ServicesPage
            onBackToHome={() => navigateToHome()}
            onBookNow={(svc) => handleBookNowClick(svc)}
            onOpenModal={(type) => {
              if (type === 'contact') navigateToContact();
              else if (type === 'faqs') navigateToFaqs();
              else if (type === 'how-it-works') navigateToHowItWorks();
            }}
          />
        ) : currentView === 'how-it-works' ? (
          /* Dedicated How It Works Page */
          <HowItWorksPage
            onBackToHome={() => navigateToHome()}
            onBookNow={() => handleBookNowClick()}
            onOpenModal={(type) => {
              if (type === 'contact') navigateToContact();
              else if (type === 'faqs') navigateToFaqs();
              else if (type === 'services') navigateToServices();
            }}
          />
        ) : currentView === 'faqs' ? (
          /* Dedicated FAQs Page */
          <FaqsPage
            onBackToHome={() => navigateToHome()}
            onBookNow={() => handleBookNowClick()}
            onNavigateContact={navigateToContact}
          />
        ) : (
          /* Homepage with full content */
          <>
            <SEO
              title="Courier & Delivery Services in Lagos, Nigeria | BBD Mobility"
              description="Book reliable parcel delivery and courier services in Lagos, Nigeria, with BBD Mobility. Arrange your pickup and drop-off conveniently. Move What Matters."
              canonicalPath="/"
              keywords="courier services in Lagos, delivery services in Lagos, parcel delivery Lagos, book delivery Lagos, local delivery service Lagos, package pickup Lagos Nigeria, dispatch rider Lagos"
              image="/assets/highway-rider-sharp.jpg"
            />

            {/* Hero Section with Rider Image & Booking Card */}
            <Hero
              onBookClick={() => handleBookNowClick()}
              selectedServiceType={selectedService}
            />

            {/* Horizontal Benefits Strip */}
            <BenefitsStrip />

            {/* Our Services Section */}
            <ServicesSection
              onSelectService={handleSelectService}
              onOpenAllServices={() => setAllServicesOpen(true)}
            />

            {/* Split Section: Highway Rider Image & Why Choose Us */}
            <WhyChooseUsSection />

            {/* Customer Testimonials */}
            <TestimonialsSection
              onOpenReviewsModal={() => setReviewsOpen(true)}
            />
          </>
        )}
      </main>

      {/* Corporate Footer */}
      <Footer
        onOpenModal={(type) => setInfoModalType(type)}
        onSelectService={handleSelectService}
        onNavigateHome={navigateToHome}
        onNavigateAbout={navigateToAbout}
        onNavigateContact={navigateToContact}
        onNavigateServices={navigateToServices}
        onNavigateHowItWorks={navigateToHowItWorks}
        onNavigateFaqs={navigateToFaqs}
        onNavigateAdmin={navigateToAdmin}
        onNavigateRider={navigateToRider}
        currentView={currentView}
      />

      {/* Floating Mobile Sticky Action Bar */}
      <AnimatePresence>
        {showMobileStickyBar && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed bottom-3 inset-x-3 z-30 md:hidden bg-white/95 backdrop-blur-md rounded-2xl p-2.5 shadow-2xl border border-gray-200/80 flex items-center gap-2"
          >
            <a
              href="tel:+2347087531148"
              className="p-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-bbd-navy transition-colors flex items-center justify-center flex-shrink-0"
              aria-label="Call Dispatch"
            >
              <Phone className="w-5 h-5 text-bbd-red" />
            </a>

            <button
              onClick={() => handleBookNowClick()}
              className="flex-1 py-3 px-4 bg-bbd-red hover:bg-bbd-red-hover active:scale-[0.98] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all"
            >
              <span>Book a Delivery Now</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AllServicesModal
        isOpen={allServicesOpen}
        onClose={() => setAllServicesOpen(false)}
        onSelectService={handleSelectService}
      />

      <ReviewsModal
        isOpen={reviewsOpen}
        onClose={() => setReviewsOpen(false)}
      />

      <InfoModal
        type={infoModalType}
        onClose={() => setInfoModalType(null)}
        onBookNow={() => handleBookNowClick()}
      />
    </div>
  );
}

export default App;
