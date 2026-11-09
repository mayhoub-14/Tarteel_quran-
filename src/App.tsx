import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { PendingApproval } from './pages/PendingApproval';
import { ForgotPassword } from './pages/ForgotPassword';
import { TeacherDashboard } from './pages/TeacherDashboard';
import { StudentsPage } from './pages/StudentsPage';
import { SchedulePage } from './pages/SchedulePage';
import { CertificatePage } from './pages/CertificatePage';
import { SalaryPage } from './pages/SalaryPage';
import { AdminPage } from './pages/AdminPage';
import { SettingsPage } from './pages/SettingsPage';

const getInitialPage = (): string => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || params.get('setupToken');
    const page = params.get('page');
    if (token || page === 'setup-password' || page === 'forgot-password' || window.location.hash === '#setup-password') {
      return 'forgot-password';
    }
    if (page === 'register') return 'register';
  }
  return 'dashboard';
};

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<string>(getInitialPage);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-emerald-800 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-bold text-slate-800">أكاديمية ترتيل القرآن الكريم</p>
          <p className="text-xs text-slate-500">جارٍ التحقق من بيانات الدخول والجلسة الآمنة...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated routing
  if (!user) {
    if (currentPage === 'register') {
      return <Register onNavigate={setCurrentPage} />;
    }
    if (currentPage === 'forgot-password') {
      return <ForgotPassword onNavigate={setCurrentPage} />;
    }
    return <Login onNavigate={setCurrentPage} />;
  }

  // Account is PENDING approval
  if (user.status === 'PENDING') {
    return <PendingApproval onNavigate={setCurrentPage} />;
  }

  // Approved User (Teacher or Admin)
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      <Navbar currentPage={currentPage} onNavigate={setCurrentPage} />

      <main className="flex-1">
        {currentPage === 'dashboard' && <TeacherDashboard onNavigate={setCurrentPage} />}
        {currentPage === 'students' && <StudentsPage />}
        {currentPage === 'schedule' && <SchedulePage />}
        {currentPage === 'certificates' && <CertificatePage />}
        {currentPage === 'salary' && <SalaryPage />}
        {currentPage === 'admin' && user.role === 'ADMIN' && <AdminPage />}
        {currentPage === 'settings' && <SettingsPage />}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            جميع الحقوق محفوظة © {new Date().getFullYear()} لأكاديمية ترتيل القرآن الكريم
          </p>
          <p className="text-[11px] text-slate-400">
            بوابة المعلمين والشهادات الرسمية · نظام محمي ومشفر بالكامل
          </p>
        </div>
      </footer>
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
