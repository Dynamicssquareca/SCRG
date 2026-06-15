import React, { useEffect, useState } from 'react';
import {
  Card, Table, Tag, Button, Typography, Space, Badge,
  Tooltip, Popconfirm, message, Alert, Modal
} from 'antd';
import {
  MobileOutlined, CheckCircleFilled, CloseCircleFilled,
  UnlockOutlined, ReloadOutlined, KeyOutlined, QrcodeOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import api from '../services/api';
import dayjs from 'dayjs';

const { Text } = Typography;

interface UserRecord {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  totp_enabled: boolean;
  createdAt: string;
}

const ROLE_COLOR: Record<string, string> = {
  admin:    '#7C3AED',
  operator: '#2563EB',
  client:   '#059669',
};

const AuthDevicesPage: React.FC = () => {
  const [users, setUsers]     = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [isQrModalVisible, setIsQrModalVisible] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [currentQrUrl, setCurrentQrUrl] = useState<string | null>(null);
  const [currentQrUser, setCurrentQrUser] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/users');
      setUsers(res.data.data);
    } catch {
      message.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleRevokeTotp = async (id: string, name: string) => {
    try {
      await api.delete(`/users/${id}/totp`);
      message.success(`2FA revoked for ${name}. They will re-enroll on next login.`);
      fetchUsers();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to revoke 2FA');
    }
  };

  const handleShowQr = async (id: string, name: string) => {
    setQrLoading(true);
    try {
      const { data } = await api.get(`/users/${id}/qr-code`);
      setCurrentQrUrl(data.data.qrCodeUrl);
      setCurrentQrUser(name);
      setIsQrModalVisible(true);
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to fetch QR code');
    } finally {
      setQrLoading(false);
    }
  };

  const totalEnabled  = users.filter(u => u.totp_enabled).length;
  const totalDisabled = users.filter(u => !u.totp_enabled).length;

  const columns = [
    {
      title: 'User',
      key: 'user',
      render: (_: any, r: UserRecord) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: `linear-gradient(135deg, ${ROLE_COLOR[r.role] ?? '#6B7280'}, ${ROLE_COLOR[r.role] ?? '#6B7280'}99)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#fff',
          }}>
            {r.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div>
            <Text strong style={{ fontSize: 14, display: 'block' }}>{r.full_name}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{r.email}</Text>
          </div>
        </div>
      ),
    },
    {
      title: 'Role', dataIndex: 'role', key: 'role', width: 120,
      render: (v: string) => (
        <Tag style={{
          borderRadius: 20, fontWeight: 700, fontSize: 11, letterSpacing: '0.4px',
          textTransform: 'uppercase', border: 'none',
          background: `${ROLE_COLOR[v] ?? '#6B7280'}18`,
          color: ROLE_COLOR[v] ?? '#6B7280',
        }}>
          {v}
        </Tag>
      ),
    },
    {
      title: '2FA Authentication', dataIndex: 'totp_enabled', key: 'totp_enabled', width: 200,
      render: (enabled: boolean) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {enabled ? (
            <>
              <CheckCircleFilled style={{ color: '#16A34A', fontSize: 17 }} />
              <div>
                <Text style={{ fontSize: 13, fontWeight: 700, color: '#16A34A', display: 'block', lineHeight: 1.2 }}>Enabled</Text>
                <Text type="secondary" style={{ fontSize: 11 }}>Device registered</Text>
              </div>
            </>
          ) : (
            <>
              <CloseCircleFilled style={{ color: '#DC2626', fontSize: 17 }} />
              <div>
                <Text style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', display: 'block', lineHeight: 1.2 }}>Not Set Up</Text>
                <Text type="secondary" style={{ fontSize: 11 }}>No device registered</Text>
              </div>
            </>
          )}
        </div>
      ),
    },
    {
      title: 'Account Status', dataIndex: 'is_active', key: 'is_active', width: 130,
      render: (v: boolean) => (
        <Badge
          status={v ? 'success' : 'default'}
          text={<Text style={{ fontSize: 12, fontWeight: 600, color: v ? '#16A34A' : '#9CA3AF' }}>{v ? 'Active' : 'Inactive'}</Text>}
        />
      ),
    },
    {
      title: 'Joined', dataIndex: 'createdAt', key: 'createdAt', width: 130,
      render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(v).format('DD MMM YYYY')}</Text>,
    },
    {
      title: 'Actions', key: 'actions', width: 160,
      render: (_: any, r: UserRecord) => (
        r.totp_enabled ? (
          <Space>
            <Button
              icon={<QrcodeOutlined />}
              onClick={() => handleShowQr(r.id, r.full_name)}
              loading={qrLoading && currentQrUser === r.full_name}
              style={{
                borderRadius: 8,
                borderColor: '#10B981',
                color: '#059669',
                background: '#ECFDF5',
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              Show QR
            </Button>
            <Popconfirm
              title={`Revoke 2FA for ${r.full_name}?`}
              description="They will need to re-enroll their authenticator app on next login."
              onConfirm={() => handleRevokeTotp(r.id, r.full_name)}
              okText="Revoke"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Remove their 2FA device registration">
                <Button
                  icon={<UnlockOutlined />}
                  style={{
                    borderRadius: 8,
                    borderColor: '#F59E0B',
                    color: '#D97706',
                    background: '#FFFBEB',
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  Revoke
                </Button>
              </Tooltip>
            </Popconfirm>
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>-</Text>
        )
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0F1117', letterSpacing: '-0.4px' }}>
            Auth &amp; Devices
          </h1>
          <Text type="secondary" style={{ fontSize: 13, marginTop: 2, display: 'block' }}>
            Manage two-factor authentication across all user accounts
          </Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={fetchUsers}
          loading={loading}
          style={{ borderRadius: 8, height: 38 }}
        >
          Refresh
        </Button>
      </motion.div>

      <Alert 
        message="How to add 2FA for a user?" 
        description="Users without 2FA enabled will be prompted to scan a QR code and register their device the next time they log in. You can click 'Revoke 2FA' to force a user to re-register on their next login." 
        type="info" 
        showIcon 
        style={{ marginBottom: 24, borderRadius: 10 }} 
      />

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Users',   value: users.length,  color: '#2563EB', bg: 'rgba(37,99,235,0.06)',   border: 'rgba(37,99,235,0.2)',   icon: <KeyOutlined /> },
          { label: '2FA Enabled',   value: totalEnabled,  color: '#16A34A', bg: 'rgba(22,163,74,0.06)',   border: 'rgba(22,163,74,0.2)',   icon: <CheckCircleFilled /> },
          { label: '2FA Not Set Up',value: totalDisabled, color: '#DC2626', bg: 'rgba(220,38,38,0.05)',   border: 'rgba(220,38,38,0.2)',   icon: <CloseCircleFilled /> },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 + i * 0.07, duration: 0.38 }}
            style={{ flex: 1, minWidth: 180 }}
          >
            <Card
              style={{
                borderRadius: 14,
                background: s.bg,
                border: `1.5px solid ${s.border}`,
                position: 'relative', overflow: 'hidden',
              }}
              styles={{ body: { padding: '18px 22px' } }}
            >
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                height: 3, borderRadius: '14px 14px 0 0', background: s.color,
              }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <Text style={{ display: 'block', fontSize: 11, fontWeight: 700, color: s.color, letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 6 }}>
                    {s.label}
                  </Text>
                  <div style={{ fontSize: 32, fontWeight: 800, color: '#0F1117', lineHeight: 1 }}>
                    {s.value}
                  </div>
                </div>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: `${s.color}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, color: s.color,
                }}>
                  {s.icon}
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Users Table */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.38 }}
      >
        <Card
          title={
            <Space>
              <MobileOutlined style={{ color: '#E8363D' }} />
              <span style={{ fontWeight: 700 }}>User Accounts</span>
              <Tag style={{ borderRadius: 20, fontSize: 11, background: '#FEF2F2', color: '#E8363D', border: '1px solid #FECACA', fontWeight: 700 }}>
                {users.length} users
              </Tag>
            </Space>
          }
          style={{ borderRadius: 16 }}
        >
          <Table
            dataSource={users}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            size="middle"
          />
        </Card>
      </motion.div>

      {/* QR Code Reveal Modal */}
      <Modal
        title={<span style={{ fontWeight: 700 }}>2FA QR Code for {currentQrUser}</span>}
        open={isQrModalVisible}
        onCancel={() => {
          setIsQrModalVisible(false);
          setCurrentQrUrl(null);
          setCurrentQrUser(null);
        }}
        footer={
          <Button block size="large" type="primary" onClick={() => setIsQrModalVisible(false)} style={{ background: '#111827', borderRadius: 8 }}>
            Done
          </Button>
        }
        destroyOnClose
      >
        <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            Scan this QR code with a new authenticator app to add another device to this account.
          </Text>
          {currentQrUrl && (
            <img src={currentQrUrl} alt="2FA QR Code" style={{ width: 220, height: 220, borderRadius: 12, border: '1px solid #E5E7EB', padding: 8 }} />
          )}
        </div>
      </Modal>

    </div>
  );
};

export default AuthDevicesPage;
