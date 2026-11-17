import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShoppingBag, User, LogOut, Home, Globe, Moon, Sun, ChevronLeft, Menu, X, Settings, BookOpenCheck, BarChart3, ClipboardList, MessageSquareWarning } from 'lucide-react';
import useAuth from '@/hooks/auth/useAuth';
import useRole from '@/hooks/useRole';


const TEACHER_THEME_STORAGE_KEY = 'teacherTheme';

export default function TeacherSidebar({ isMobileOpen, setIsMobileOpen }) {
  const { t, i18n } = useTranslation('teacher');
  const { logout } = useAuth();
  const { isTeacher } = useRole();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [theme, setTheme] = useState('light');

  const isRtl = i18n.dir() === 'rtl';

  useEffect(() => {
    const savedTheme = localStorage.getItem(TEACHER_THEME_STORAGE_KEY);
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');

    setTheme(initialTheme);
    document.documentElement.classList.toggle('dark', initialTheme === 'dark');

    return () => {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem(TEACHER_THEME_STORAGE_KEY, nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
  };

  const exams = { name: t('nav.exams', 'My Exams'), href: '/teacher/exams', icon: ClipboardList, id: 'exams' };
  const appeals = { name: t('nav.appeals', 'Appeals'), href: '/teacher/appeals', icon: MessageSquareWarning, id: 'appeals' };
  // An assistant only has the exams of the teachers they work for.
  const navigation = !isTeacher ? [{ name: t('nav.home', 'Home'), href: '/', icon: Home, id: 'home' }, exams, appeals] : [
    { name: t('nav.home', 'Home'), href: '/', icon: Home, id: 'home' },
    { name: t('nav.profile', 'My Profile'), href: '/teacher/profile', icon: User, id: 'profile' },
    exams,
    appeals,
    { name: t('nav.eBooklets', 'My E-Booklets'), href: '/teacher/e-booklets', icon: BookOpenCheck, id: 'e-booklets' },
    { name: t('nav.eBookletOrders', 'E-Booklet Orders'), href: '/e-booklet-orders', icon: ShoppingBag, id: 'e-booklet-orders' },
    { name: t('nav.eBookletAnalytics', 'E-Booklet Analytics'), href: '/teacher/e-booklet-analytics', icon: BarChart3, id: 'e-booklet-analytics' },
    { name: t('nav.orders', 'My Orders'), href: '/teacher/orders', icon: ShoppingBag, id: 'orders' },
    { name: t('nav.settings', 'Settings'), href: '/teacher/settings', icon: Settings, id: 'settings' },
  ];

  const toggleLanguage = () => {
    const newLang = i18n.language === "ar" ? "en" : "ar";
    i18n.changeLanguage(newLang);
  };

  // Calculate width class
  const widthClass = isCollapsed ? "w-64 lg:w-20" : "w-64";

  return (
    <aside
      className={`fixed inset-y-0 start-0 z-50 ${widthClass} transform bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out flex flex-col lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${isMobileOpen ? "translate-x-0" : isRtl ? "translate-x-full" : "-translate-x-full"}`}
    >
      {/* Header + Toggles */}
      <div
        className={`flex h-16 items-center px-4 border-b border-sidebar-border ${isCollapsed ? "lg:justify-center justify-between" : "justify-between"}`}
      >
        <span
          className={`text-lg font-bold truncate ${isCollapsed ? "lg:hidden" : ""}`}
        >
          {t("portalTitle", "Teacher Portal")}
        </span>

        <div className="flex items-center gap-2">
          {/* Desktop/Tablet Collapse Toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-sidebar-foreground hover:bg-sidebar-accent rounded-md p-1.5 hidden lg:block"
            title={isCollapsed ? t('nav.expandSidebar', 'Expand sidebar') : t('nav.collapseSidebar', 'Collapse sidebar')}
            data-testid="teacher-sidebar-mobile-toggle-button"
          >
            {isCollapsed ? <Menu size={20} /> : <ChevronLeft size={20} />}
          </button>

          {/* Mobile Close Toggle */}
          <button
            className="lg:hidden text-sidebar-foreground hover:bg-sidebar-accent rounded-md p-1.5"
            onClick={() => setIsMobileOpen(false)}
            title={t('nav.closeSidebar', 'Close sidebar')}
            data-testid="teacher-sidebar-mobile-close-button"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-2 px-2 py-4 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = item.href === '/' 
            ? location.pathname === '/' 
            : location.pathname.startsWith(item.href);
          return (
            <Link
              key={item.id}
              to={item.href}
              title={isCollapsed ? item.name : undefined}
              data-testid={`teacher-sidebar-nav-${item.id}`}
              className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md ${isActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                } ${isCollapsed ? "lg:justify-center" : ""}`}
            >
              <item.icon
                className={`h-5 w-5 shrink-0 me-3 ${isCollapsed ? "lg:me-0" : ""}`}
                aria-hidden="true"
              />
              <span className={`truncate ${isCollapsed ? "lg:hidden" : ""}`}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Actions */}
      <div className="border-t border-sidebar-border p-4 space-y-2 mt-auto">
        <button
          onClick={toggleLanguage}
          title={isCollapsed ? (i18n.language === 'ar' ? 'English' : 'العربية') : undefined}
          className={`group flex w-full items-center px-2 py-2 text-sm font-medium rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${isCollapsed ? 'lg:justify-center' : ''}`}
          data-testid="teacher-sidebar-language-toggle"
        >
          <Globe className={`h-5 w-5 shrink-0 me-3 ${isCollapsed ? 'lg:me-0' : ''}`} />
          <span className={`truncate ${isCollapsed ? 'lg:hidden' : ''}`}>{i18n.language === 'ar' ? 'English' : 'العربية'}</span>
        </button>

        <button
          onClick={toggleTheme}
          title={isCollapsed ? t('nav.themeToggle', 'Toggle theme') : undefined}
          className={`group flex w-full items-center px-2 py-2 text-sm font-medium rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${isCollapsed ? 'lg:justify-center' : ''}`}
          data-testid="teacher-sidebar-theme-toggle"
        >
          {theme === 'dark' ? (
            <Sun className={`h-5 w-5 shrink-0 me-3 ${isCollapsed ? 'lg:me-0' : ''}`} />
          ) : (
            <Moon className={`h-5 w-5 shrink-0 me-3 ${isCollapsed ? 'lg:me-0' : ''}`} />
          )}
          <span className={`truncate ${isCollapsed ? 'lg:hidden' : ''}`}>
            {theme === 'dark' ? t('nav.lightMode', 'Light mode') : t('nav.darkMode', 'Dark mode')}
          </span>
        </button>



        <button
          onClick={logout}
          title={isCollapsed ? t("nav.logout", "Logout") : undefined}
          className={`group flex w-full items-center px-2 py-2 text-sm font-medium rounded-md text-destructive hover:bg-destructive/10 ${isCollapsed ? "lg:justify-center" : ""}`}
          data-testid="teacher-sidebar-logout-button"
        >
          <LogOut
            className={`h-5 w-5 shrink-0 me-3 ${isCollapsed ? "lg:me-0" : ""}`}
          />
          <span className={`truncate ${isCollapsed ? "lg:hidden" : ""}`}>
            {t("nav.logout", "Logout")}
          </span>
        </button>
      </div>
    </aside>
  );
}
