import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  BookOpen,
  Users,
  Calendar,
  Award,
  Banknote,
  ShieldAlert,
  LogOut,
  Settings,
  Clock,
  Menu,
  X
} from 'lucide-react';

interface NavbarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPage, onNavigate }) => {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentTimes, setCurrentTimes] = useState({
    cairo: '',
    riyadh: '',
    dubai: ''
  });

  // Keep live time updated for international reference
  useEffect(() => {
    const updateTimes = () => {
      const now = new Date();
      const formatTime = (tz: string) =>
        new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }).format(now);

      setCurrentTimes({
        cairo: formatTime('Africa/Cairo'),
        riyadh: formatTime('Asia/Riyadh'),
        dubai: formatTime('Asia/Dubai')
      });
    };

    updateTimes();
    const interval = setInterval(updateTimes, 30000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'الرئيسية', icon: BookOpen },
    { id: 'students', label: 'الطلاب', icon: Users },
    { id: 'schedule', label: 'جدول الحصص', icon: Calendar },
    { id: 'certificates', label: 'شهادات التقدير', icon: Award },
    { id: 'salary', label: 'المرتبات', icon: Banknote },
  ];

  if (user?.role === 'ADMIN') {
    navItems.push({ id: 'admin', label: 'لوحة الإدارة والمتابعة', icon: ShieldAlert });
  }

  return (
    <header className="bg-emerald-950 text-white border-b border-emerald-800/80 sticky top-0 z-50 shadow-md">
      {/* Top International Clocks Bar */}
      <div className="bg-emerald-900/90 border-b border-emerald-800/50 px-4 py-1.5 text-xs text-emerald-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-emerald-300" />
          <span className="font-semibold text-emerald-200">التوقيت الدولي المعتمد:</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-300">مصر (القاهرة):</span>
            <span className="font-mono font-bold text-white bg-emerald-950/60 px-1.5 py-0.5 rounded">
              {currentTimes.cairo || '--:--'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-300">السعودية (الرياض):</span>
            <span className="font-mono font-bold text-white bg-emerald-950/60 px-1.5 py-0.5 rounded">
              {currentTimes.riyadh || '--:--'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-300">الإمارات (دبي):</span>
            <span className="font-mono font-bold text-white bg-emerald-950/60 px-1.5 py-0.5 rounded">
              {currentTimes.dubai || '--:--'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-800 flex items-center justify-center border border-emerald-700 shadow-inner group-hover:bg-emerald-700 transition">
              <BookOpen className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-wide group-hover:text-emerald-200 transition">
                أكاديمية ترتيل القرآن الكريم
              </h1>
              <p className="text-xs text-emerald-300/80">بوابة المعلمين والشهادات الرسمية</p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? 'bg-emerald-800 text-white shadow-sm'
                      : 'text-emerald-100 hover:bg-emerald-900 hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-300' : 'text-emerald-400'}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* User info & quick controls */}
          <div className="hidden md:flex items-center gap-3">
            <div className="text-left text-xs">
              <div className="font-semibold text-white">
                {user?.role === 'ADMIN'
                  ? user.fullName
                  : user?.gender === 'FEMALE'
                  ? `فضيلة المعلمة ${user.fullName}`
                  : user?.gender === 'MALE'
                  ? `فضيلة المعلم ${user.fullName}`
                  : user?.fullName}
              </div>
              <div className="text-emerald-300/90 flex items-center gap-1">
                <span>
                  {user?.role === 'ADMIN'
                    ? 'مدير الأكاديمية (Super Admin)'
                    : user?.gender === 'FEMALE'
                    ? 'معلمة معتمدة'
                    : user?.gender === 'MALE'
                    ? 'معلم معتمد'
                    : 'معلم (يرجى تحديد الصفة)'}
                </span>
                {user?.status === 'PENDING' && (
                  <span className="text-amber-300">(قيد المراجعة)</span>
                )}
              </div>
            </div>

            <button
              onClick={() => onNavigate('settings')}
              title="إعدادات الحساب"
              className={`p-2 rounded-lg transition-colors ${
                currentPage === 'settings'
                  ? 'bg-emerald-800 text-white'
                  : 'text-emerald-200 hover:bg-emerald-900 hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>

            <button
              onClick={logout}
              title="تسجيل الخروج"
              className="p-2 text-emerald-200 hover:bg-red-950/60 hover:text-red-200 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile menu trigger */}
          <div className="md:hidden flex items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-emerald-200 hover:text-white rounded-lg focus:outline-none"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-emerald-800/80 bg-emerald-950 px-4 pt-3 pb-4 space-y-2">
          <div className="pb-3 border-b border-emerald-800 text-xs flex justify-between items-center">
            <div>
              <span className="font-bold text-white">
                {user?.role === 'ADMIN'
                  ? user.fullName
                  : user?.gender === 'FEMALE'
                  ? `فضيلة المعلمة ${user.fullName}`
                  : user?.gender === 'MALE'
                  ? `فضيلة المعلم ${user.fullName}`
                  : user?.fullName}
              </span>
              <span className="text-emerald-300 block">
                {user?.role === 'ADMIN'
                  ? 'مسؤول النظام'
                  : user?.gender === 'FEMALE'
                  ? 'معلمة معتمدة'
                  : user?.gender === 'MALE'
                  ? 'معلم معتمد'
                  : 'معلم'}
              </span>
            </div>
            <button
              onClick={() => {
                onNavigate('settings');
                setMobileMenuOpen(false);
              }}
              className="px-2.5 py-1 text-xs bg-emerald-900 rounded border border-emerald-700 text-emerald-200"
            >
              الإعدادات
            </button>
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg text-right transition ${
                  isActive ? 'bg-emerald-800 text-white' : 'text-emerald-100 hover:bg-emerald-900'
                }`}
              >
                <Icon className="w-4 h-4 text-emerald-300" />
                {item.label}
              </button>
            );
          })}

          <button
            onClick={() => {
              logout();
              setMobileMenuOpen(false);
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-red-300 hover:bg-red-950/60 rounded-lg text-right transition"
          >
            <LogOut className="w-4 h-4 text-red-400" />
            تسجيل الخروج
          </button>
        </div>
      )}
    </header>
  );
};
