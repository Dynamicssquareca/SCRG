import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Layout, Menu, Button, Space, Typography, Tooltip } from 'antd';
import {
  DashboardOutlined,
  UploadOutlined,
  FileExcelOutlined,
  TeamOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BarChartOutlined,
  BellOutlined,
  SafetyCertificateOutlined,
  KeyOutlined,
  MailOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';


const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const pageVariants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } },
  exit:    { opacity: 0, y: -8,  transition: { duration: 0.18 } },
};

const DynamicsSquareLogo = () => (
  <div className="ds-logo-text">
    <span className="ds-logo-top">Dynamics</span>
    <span className="ds-logo-bottom">Square<sup className="ds-tm">™</sup></span>
  </div>
);

const DSIcon = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: 34, height: 34 }}>
    <svg width="24" height="24" viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 35 60 
               L 260 60 
               C 320 60 350 130 350 250 
               C 350 370 320 440 260 440 
               L 10 440 
               L 10 190 
               L 85 165 
               L 85 365 
               L 220 365 
               C 255 365 275 310 275 250 
               C 275 190 255 135 220 135 
               L 85 135 
               L 10 135 
               Z" 
            fill="white" />
      <rect x="390" y="340" width="100" height="100" fill="#E8363D" />
    </svg>
  </div>
);

const PAGE_LABELS: Record<string, string> = {
  '/':                    'Dashboard',
  '/search':              'Search Results',
  '/upload':              'Upload & Generate',
  '/reports':             'Reports',
  '/usage':               'Usage Report',
  '/clients':             'Client Master',
  '/reminders':           'Automated Reminders',
  '/report-scheduler':    'Report Scheduler',
  '/credentials':         'Client Credentials',
  '/auth-devices':        'Auth & Devices',
};

// ── Universal Search ─────────────────────────────────────────────

interface NavItem {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

interface ApiResults {
  clients: Array<{ _id: string; client_name: string; account_manager: string | null; is_active: boolean }>;
  cases:   Array<{ _id: string; case_number: string; customer_name: string; case_title: string | null; support_agent: string | null; contact: string | null; status_reason: string | null; client_id: { client_name: string } | null }>;
  reports: Array<{ _id: string; month: number; year: number; status: string; file_name: string | null; client_id: { client_name: string } | null }>;
}

const NAV_ITEMS: NavItem[] = [
  { key: '/',                 label: 'Dashboard',           description: 'View KPIs, charts & support metrics',    icon: <DashboardOutlined /> },
  { key: '/upload',           label: 'Upload & Generate',   description: 'Upload Excel data & generate reports',    icon: <UploadOutlined /> },
  { key: '/reports',          label: 'Reports',             description: 'Browse & download generated reports',     icon: <FileExcelOutlined /> },
  { key: '/usage',            label: 'Usage Report',        description: 'Track consultant usage & activity',       icon: <BarChartOutlined /> },
  { key: '/clients',          label: 'Client Master',       description: 'Manage client accounts & details',        icon: <TeamOutlined />,              adminOnly: true },
  { key: '/reminders',        label: 'Automated Reminders', description: 'Configure automated email reminders',     icon: <BellOutlined />,              adminOnly: true },
  { key: '/report-scheduler', label: 'Report Scheduler',    description: 'Schedule automatic report delivery',      icon: <MailOutlined />,              adminOnly: true },
  { key: '/credentials',      label: 'Client Credentials',  description: 'Manage client login credentials',         icon: <SafetyCertificateOutlined />, adminOnly: true },
  { key: '/auth-devices',     label: 'Auth & Devices',      description: 'Manage authentication & trusted devices', icon: <KeyOutlined />,               adminOnly: true },
];

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function highlight(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(232,54,61,0.18)', color: '#E8363D', borderRadius: 3, padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase', color: '#9CA3AF' }}>
      {label}
    </div>
  );
}

function ResultRow({
  icon, iconColor = '#9CA3AF', iconBg = '#F7F8FC',
  primary, secondary, isActive, onClick, onHover,
}: {
  icon: React.ReactNode; iconColor?: string; iconBg?: string;
  primary: React.ReactNode; secondary?: React.ReactNode;
  isActive: boolean; onClick: () => void; onHover: () => void;
}) {
  return (
    <div
      onMouseEnter={onHover}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '9px 16px', cursor: 'pointer',
        background: isActive ? '#FFF5F5' : 'transparent',
        borderLeft: isActive ? '3px solid #E8363D' : '3px solid transparent',
        transition: 'all 0.1s ease',
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
        background: isActive ? 'rgba(232,54,61,0.10)' : iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, color: isActive ? '#E8363D' : iconColor,
        transition: 'all 0.1s ease',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0F1117', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {primary}
        </div>
        {secondary && (
          <div style={{ fontSize: 11.5, color: '#9CA3AF', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {secondary}
          </div>
        )}
      </div>
      {isActive && (
        <kbd style={{ fontSize: 10, fontWeight: 700, background: '#F7F8FC', border: '1px solid #E8ECF4', borderRadius: 4, padding: '2px 5px', color: '#9CA3AF', flexShrink: 0 }}>↵</kbd>
      )}
    </div>
  );
}


const UniversalSearch: React.FC = () => {
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [apiData, setApiData]   = useState<ApiResults>({ clients: [], cases: [], reports: [] });
  const [active, setActive]     = useState(0);
  const inputRef                = useRef<HTMLInputElement>(null);
  const wrapRef                 = useRef<HTMLDivElement>(null);
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user }                = useAuth();
  const navigate                = useNavigate();

  // Filtered nav items (always visible)
  const navItems = NAV_ITEMS.filter(item => {
    if (item.adminOnly && user?.role !== 'admin') return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
  });

  // Build a flat list of all selectable rows for keyboard nav
  type FlatRow = { type: 'nav'; navKey: string } | { type: 'client'; id: string } | { type: 'case'; id: string } | { type: 'report'; id: string };
  const flatRows: FlatRow[] = [
    ...navItems.map(n => ({ type: 'nav' as const, navKey: n.key })),
    ...apiData.clients.map(c => ({ type: 'client' as const, id: c._id })),
    ...apiData.cases.map(c => ({ type: 'case' as const, id: c._id })),
    ...apiData.reports.map(r => ({ type: 'report' as const, id: r._id })),
  ];

  const handleRowAction = useCallback((row: FlatRow) => {
    if (row.type === 'nav') { navigate(row.navKey); closeSearch(); }
    else if (row.type === 'client') { navigate('/clients'); closeSearch(); }
    else if (row.type === 'case')   { navigate('/'); closeSearch(); }
    else if (row.type === 'report') { navigate('/reports'); closeSearch(); }
  }, [navigate]); // eslint-disable-line

  // Debounced API fetch
  useEffect(() => {
    if (!query || query.length < 2) {
      setApiData({ clients: [], cases: [], reports: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/search?q=${encodeURIComponent(query)}`);
        setApiData(data.data || { clients: [], cases: [], reports: [] });
      } catch {
        setApiData({ clients: [], cases: [], reports: [] });
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const openSearch = useCallback(() => {
    setOpen(true); setQuery(''); setActive(0);
    setApiData({ clients: [], cases: [], reports: [] });
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  function closeSearch() { setOpen(false); setQuery(''); setApiData({ clients: [], cases: [], reports: [] }); }

  // Global Ctrl+K shortcut
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => { if (!prev) setTimeout(() => inputRef.current?.focus(), 50); return !prev; });
      }
      if (e.key === 'Escape') { setOpen(false); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Click outside
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) closeSearch();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const goToSearchPage = useCallback((q: string) => {
    if (!q.trim()) return;
    navigate(`/search?q=${encodeURIComponent(q.trim())}`);
    closeSearch();
  }, [navigate]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, flatRows.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (query.trim()) {
        goToSearchPage(query);
      } else if (flatRows[active]) {
        handleRowAction(flatRows[active]);
      }
    }
    if (e.key === 'Escape') closeSearch();
  };

  const hasResults = navItems.length > 0 || apiData.clients.length > 0 || apiData.cases.length > 0 || apiData.reports.length > 0;
  let rowIdx = -1;

  return (
    <div ref={wrapRef} style={{ position: 'relative', zIndex: 200 }}>
      {/* Trigger pill */}
      <button
        id="universal-search-trigger"
        onClick={openSearch}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#F7F8FC', border: '1.5px solid #E8ECF4',
          borderRadius: 10, padding: '0 14px', height: 38, cursor: 'pointer',
          color: '#9CA3AF', fontSize: 13, fontWeight: 500,
          transition: 'all 0.18s ease', minWidth: 220, fontFamily: 'inherit',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8363D';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 3px rgba(232,54,61,0.10)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8ECF4';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
        }}
      >
        <SearchOutlined style={{ fontSize: 14, color: '#9CA3AF' }} />
        <span style={{ flex: 1, textAlign: 'left' }}>Search tickets, clients…</span>
        <span style={{ fontSize: 10, fontWeight: 700, background: '#E8ECF4', borderRadius: 5, padding: '2px 6px', color: '#9CA3AF', letterSpacing: '0.3px' }}>Ctrl K</span>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              width: 460, background: '#FFFFFF',
              borderRadius: 14, boxShadow: '0 8px 40px rgba(15,17,23,0.16)',
              border: '1.5px solid #E8ECF4', overflow: 'hidden',
            }}
          >
            {/* Input row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #F0F2F7' }}>
              <SearchOutlined style={{ fontSize: 16, color: '#E8363D', flexShrink: 0 }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onKey}
                placeholder="Ticket number, client name, contact, case title…"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: '#0F1117', background: 'transparent', fontFamily: 'inherit', fontWeight: 500 }}
              />
              {loading && (
                <div style={{ width: 14, height: 14, border: '2px solid #E8ECF4', borderTopColor: '#E8363D', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
              )}
              <kbd onClick={closeSearch} style={{ fontSize: 10, fontWeight: 700, background: '#F7F8FC', border: '1px solid #E8ECF4', borderRadius: 5, padding: '2px 6px', color: '#9CA3AF', cursor: 'pointer', flexShrink: 0 }}>Esc</kbd>
            </div>

            {/* Results body */}
            <div style={{ maxHeight: 400, overflowY: 'auto', padding: '6px 0' }}>

              {/* ── Pages / Navigation ── */}
              {navItems.length > 0 && (
                <>
                  {query && <SectionLabel label="Pages" />}
                  {navItems.map(item => {
                    rowIdx++;
                    const ri = rowIdx;
                    return (
                      <ResultRow
                        key={item.key}
                        icon={item.icon}
                        primary={highlight(item.label, query)}
                        secondary={highlight(item.description, query)}
                        isActive={active === ri}
                        onHover={() => setActive(ri)}
                        onClick={() => { navigate(item.key); closeSearch(); }}
                      />
                    );
                  })}
                </>
              )}

              {/* ── Clients ── */}
              {apiData.clients.length > 0 && (
                <>
                  <SectionLabel label="Clients" />
                  {apiData.clients.map(c => {
                    rowIdx++;
                    const ri = rowIdx;
                    return (
                      <ResultRow
                        key={c._id}
                        icon={<TeamOutlined />}
                        primary={highlight(c.client_name, query)}
                        secondary={c.account_manager ? <>AM: {highlight(c.account_manager, query)}</> : undefined}
                        isActive={active === ri}
                        onHover={() => setActive(ri)}
                        onClick={() => { navigate('/clients'); closeSearch(); }}
                      />
                    );
                  })}
                </>
              )}

              {/* ── Tickets / Cases ── */}
              {apiData.cases.length > 0 && (
                <>
                  <SectionLabel label="Tickets / Cases" />
                  {apiData.cases.map(c => {
                    rowIdx++;
                    const ri = rowIdx;
                    const sub = [c.customer_name, c.support_agent, c.status_reason].filter(Boolean).join(' · ');
                    return (
                      <ResultRow
                        key={c._id}
                        icon={<span style={{ fontSize: 11, fontWeight: 800 }}>#</span>}
                        primary={<><span style={{ color: '#E8363D', fontWeight: 700 }}>{highlight(c.case_number, query)}</span>{c.case_title ? <> — {highlight(c.case_title, query)}</> : null}</>}
                        secondary={sub ? highlight(sub, query) : undefined}
                        isActive={active === ri}
                        onHover={() => setActive(ri)}
                        onClick={() => { goToSearchPage(c.case_number); }}
                      />
                    );
                  })}
                </>
              )}

              {/* ── Reports ── */}
              {apiData.reports.length > 0 && (
                <>
                  <SectionLabel label="Reports" />
                  {apiData.reports.map(r => {
                    rowIdx++;
                    const ri = rowIdx;
                    const clientName = (r.client_id as any)?.client_name ?? '';
                    const monthLabel = `${MONTH_NAMES[(r.month ?? 1) - 1]} ${r.year}`;
                    return (
                      <ResultRow
                        key={r._id}
                        icon={<FileExcelOutlined />}
                        primary={<>{highlight(clientName, query)} <span style={{ color: '#9CA3AF', fontWeight: 400 }}>— {monthLabel}</span></>}
                        secondary={r.status === 'published' ? '✓ Published' : 'Draft'}
                        isActive={active === ri}
                        onHover={() => setActive(ri)}
                        onClick={() => { navigate('/reports'); closeSearch(); }}
                      />
                    );
                  })}
                </>
              )}

              {/* Empty state */}
              {!loading && query.length >= 2 && !hasResults && (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
                  No results for <strong style={{ color: '#0F1117' }}>"{query}"</strong>
                </div>
              )}

              {/* Prompt to type */}
              {!query && (
                <div style={{ padding: '20px 16px', textAlign: 'center', color: '#C4C9D4', fontSize: 12.5 }}>
                  Type to search tickets, clients, contacts, reports…
                </div>
              )}

              {query.length === 1 && (
                <div style={{ padding: '20px 16px', textAlign: 'center', color: '#C4C9D4', fontSize: 12.5 }}>
                  Keep typing…
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '8px 16px', borderTop: '1px solid #F0F2F7', display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {[['↑↓', 'Navigate'], ['↵', 'Full Search'], ['Esc', 'Close']].map(([k, lbl]) => (
                  <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9CA3AF' }}>
                    <kbd style={{ background: '#F7F8FC', border: '1px solid #E8ECF4', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 700 }}>{k}</kbd>
                    {lbl}
                  </span>
                ))}
              </div>
              {query.trim() && (
                <Button
                  type="link"
                  size="small"
                  onClick={() => goToSearchPage(query)}
                  style={{ padding: 0, fontSize: 12, fontWeight: 600, color: '#E8363D' }}
                >
                  View all results →
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const navigate    = useNavigate();
  const location    = useLocation();

  const menuItems = [
    { key: '/',        icon: <DashboardOutlined />, label: 'Dashboard'     },
    { key: '/upload',  icon: <UploadOutlined />,    label: 'Upload Data'   },
    { key: '/reports', icon: <FileExcelOutlined />, label: 'Reports'       },
    { key: '/usage',   icon: <BarChartOutlined />,  label: 'Usage Report'  },
    ...(user?.role === 'admin'
      ? [
          { key: '/clients',          icon: <TeamOutlined />,               label: 'Client Master'       },
          { key: '/reminders',        icon: <BellOutlined />,               label: 'Reminders'           },
          { key: '/report-scheduler', icon: <MailOutlined />,               label: 'Report Scheduler'    },
          { key: '/credentials',      icon: <SafetyCertificateOutlined />,  label: 'Client Credentials'  },
          { key: '/auth-devices',     icon: <KeyOutlined />,                label: 'Auth & Devices'      },
        ]
      : []),
  ];

  const activeLabel = PAGE_LABELS[location.pathname] ?? 'Support Case Report Generator';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* ── Dark Sidebar ─────────────────── */}
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        className="app-sider"
        width={220}
        style={{ overflow: 'auto', height: '100vh', position: 'sticky', top: 0, left: 0, display: 'flex', flexDirection: 'column' }}
      >
        {/* Logo */}
        <div className="sider-logo-wrap">
          <AnimatePresence mode="wait">
            {collapsed ? (
              <motion.div
                key="icon"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.18 }}
              >
                <DSIcon />
              </motion.div>
            ) : (
              <motion.div
                key="full"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
                style={{ display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <DSIcon />
                <DynamicsSquareLogo />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <Menu
            theme="dark"
            mode="inline"
            className="app-menu"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            inlineCollapsed={collapsed}
            style={{ flex: 1 }}
          />

          {/* User section */}
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                margin: '0 10px 8px',
                padding: '12px 14px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: 'linear-gradient(135deg, #E8363D, #C42D33)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>
                  {(user?.fullName || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.88)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.fullName}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 500 }}>
                    {user?.role}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Footer: collapse toggle */}
          <div className="sider-footer">
            <Tooltip title={collapsed ? 'Expand sidebar' : ''} placement="right">
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(v => !v)}
                style={{
                  width: '100%', height: 38, color: 'rgba(255,255,255,0.4)',
                  borderRadius: 10, display: 'flex', alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'flex-end',
                  paddingRight: collapsed ? 0 : 4,
                }}
              />
            </Tooltip>
          </div>
        </div>
      </Sider>

      {/* ── Main Area ───────────────────── */}
      <Layout>
        {/* Header */}
        <Header className="app-header">
          <AnimatePresence mode="wait">
            <motion.span
              key={activeLabel}
              className="header-page-label"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
            >
              {activeLabel}
            </motion.span>
          </AnimatePresence>

          <Space size={16} align="center">
            <UniversalSearch />
            <Text type="secondary" style={{ fontSize: 13 }}>
              Welcome,{' '}
              <Text strong style={{ color: '#0F1117' }}>{user?.fullName}</Text>
            </Text>
            <Tooltip title="Logout">
              <Button
                type="text"
                danger
                icon={<LogoutOutlined />}
                onClick={logout}
                style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                Logout
              </Button>
            </Tooltip>
          </Space>
        </Header>

        {/* Page content */}
        <Content className="page-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
