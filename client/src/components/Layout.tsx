import React, { useState } from 'react';
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
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

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
  <div className="ds-logo-icon">
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="1" width="7" height="7" rx="1.5" fill="white"/>
      <rect x="10" y="1" width="7" height="7" rx="1.5" fill="rgba(255,255,255,0.5)"/>
      <rect x="1" y="10" width="7" height="7" rx="1.5" fill="rgba(255,255,255,0.5)"/>
      <rect x="10" y="10" width="7" height="7" rx="1.5" fill="white"/>
    </svg>
  </div>
);

const PAGE_LABELS: Record<string, string> = {
  '/':        'Dashboard',
  '/upload':  'Upload & Generate',
  '/reports': 'Reports',
  '/usage':   'Usage Report',
  '/clients': 'Client Master',
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
      ? [{ key: '/clients', icon: <TeamOutlined />, label: 'Client Master' }]
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

          <Space size={8} align="center">
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
