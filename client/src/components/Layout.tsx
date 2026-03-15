import React, { useState } from 'react';
import { Layout, Menu, Button, theme, Space, Typography } from 'antd';
import {
  DashboardOutlined,
  UploadOutlined,
  FileExcelOutlined,
  TeamOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/upload', icon: <UploadOutlined />, label: 'Upload Data' },
    { key: '/reports', icon: <FileExcelOutlined />, label: 'Reports' },
    { key: '/usage', icon: <DashboardOutlined />, label: 'Usage Report' },
    ...(user?.role === 'admin' ? [{ key: '/clients', icon: <TeamOutlined />, label: 'Client Master' }] : []),
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme="light" style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          {!collapsed ? (
            <Title level={4} style={{ margin: 0, color: token.colorPrimary }}>SCRG</Title>
          ) : (
            <Title level={4} style={{ margin: 0, color: token.colorPrimary }}>S</Title>
          )}
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0, padding: '8px 0' }}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 24px', background: token.colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <Space>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: '16px', width: 64, height: 64, marginLeft: -24 }}
            />
            <Title level={5} style={{ margin: 0, fontWeight: 500 }}>Support Case Report Generator</Title>
          </Space>
          <Space size="middle">
            <Text type="secondary">Welcome, <Text strong>{user?.fullName}</Text></Text>
            <Button type="text" danger icon={<LogoutOutlined />} onClick={logout}>
              Logout
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: '24px 16px', padding: 24, minHeight: 280, background: token.colorBgContainer, borderRadius: token.borderRadiusLG, overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
