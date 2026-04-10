import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  message,
  Tag,
  Space,
  Tooltip,
  Popconfirm,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  KeyOutlined,
  DeleteOutlined,
  SafetyCertificateOutlined,
  UserSwitchOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import api from '../services/api';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

interface PortalUser {
  userId: string;
  email: string;
  fullName: string;
  clientId: string | null;
  clientName: string;
  isActive: boolean;
  createdAt: string;
}

interface ClientOption {
  id: string;
  name: string;
}

const ClientCredentialsPage: React.FC = () => {
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [allClients, setAllClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PortalUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/client-access');
      setPortalUsers(res.data.data.portalUsers);
      setAllClients(res.data.data.allClients);
    } catch {
      message.error('Failed to load client access data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async (values: any) => {
    setSubmitting(true);
    try {
      await api.post('/client-access', values);
      message.success('Client portal access created!');
      setModalOpen(false);
      form.resetFields();
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to create access');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (values: any) => {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      await api.put(`/client-access/${selectedUser.userId}/reset-password`, { password: values.password });
      message.success('Password reset successfully!');
      setResetModalOpen(false);
      resetForm.resetFields();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    try {
      await api.delete(`/client-access/${userId}`);
      message.success('Access revoked');
      fetchData();
    } catch {
      message.error('Failed to revoke access');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('Copied to clipboard!');
  };

  // Find clients that already have access
  const clientsWithAccess = new Set(portalUsers.map((u) => u.clientId));

  const columns = [
    {
      title: 'Client',
      dataIndex: 'clientName',
      key: 'clientName',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Portal Email',
      dataIndex: 'email',
      key: 'email',
      render: (email: string) => (
        <Space>
          <Text copyable={{ tooltips: false }}>{email}</Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'red'} style={{ borderRadius: 12, fontWeight: 600 }}>
          {isActive ? 'Active' : 'Revoked'}
        </Tag>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 130,
      render: (d: string) => dayjs(d).format('DD MMM YYYY'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_: any, record: PortalUser) => (
        <Space size={4}>
          <Tooltip title="Reset Password">
            <Button
              type="text"
              icon={<KeyOutlined />}
              onClick={() => {
                setSelectedUser(record);
                setResetModalOpen(true);
              }}
              style={{ color: '#6366F1' }}
            />
          </Tooltip>
          <Popconfirm
            title="Revoke this client's portal access?"
            onConfirm={() => handleRevoke(record.userId)}
            okText="Yes, Revoke"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Revoke Access">
              <Button
                type="text"
                icon={<DeleteOutlined />}
                danger
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <SafetyCertificateOutlined style={{ marginRight: 10, color: '#6366F1' }} />
            Client Portal Credentials
          </Title>
          <Text type="secondary">Manage login access for your clients to view their dashboards</Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalOpen(true)}
          style={{
            background: '#6366F1',
            border: 'none',
            borderRadius: 10,
            height: 42,
            fontWeight: 600,
            boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
          }}
        >
          Grant Access
        </Button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <Card style={{ borderRadius: 14, border: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(99,102,241,0.05))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#6366F1', fontSize: 18,
            }}>
              <UserSwitchOutlined />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0F1117' }}>{portalUsers.length}</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500 }}>Total Portal Users</div>
            </div>
          </div>
        </Card>
        <Card style={{ borderRadius: 14, border: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(52,211,153,0.1), rgba(52,211,153,0.05))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#34D399', fontSize: 18,
            }}>
              <SafetyCertificateOutlined />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0F1117' }}>
                {portalUsers.filter((u) => u.isActive).length}
              </div>
              <div style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500 }}>Active Accounts</div>
            </div>
          </div>
        </Card>
        <Card style={{ borderRadius: 14, border: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(251,191,36,0.1), rgba(251,191,36,0.05))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#FBBF24', fontSize: 18,
            }}>
              <KeyOutlined />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0F1117' }}>
                {allClients.length - clientsWithAccess.size}
              </div>
              <div style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500 }}>Without Access</div>
            </div>
          </div>
        </Card>
      </div>

      <Card style={{ borderRadius: 16, border: '1px solid #f0f0f0' }}>
        <Table
          columns={columns}
          dataSource={portalUsers}
          rowKey="userId"
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'No client portal accounts yet. Click "Grant Access" to create one.' }}
        />
      </Card>

      {/* Create / Grant Access Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SafetyCertificateOutlined style={{ color: '#6366F1' }} />
            <span>Grant Client Portal Access</span>
          </div>
        }
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item
            name="clientId"
            label="Select Client"
            rules={[{ required: true, message: 'Please select a client' }]}
          >
            <Select
              showSearch
              placeholder="Search and select a client..."
              optionFilterProp="label"
              options={allClients.map((c) => ({
                value: c.id,
                label: c.name,
                disabled: clientsWithAccess.has(c.id),
              }))}
              style={{ borderRadius: 10 }}
            />
          </Form.Item>

          <Form.Item
            name="email"
            label="Login Email"
            rules={[
              { required: true, message: 'Email is required' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
          >
            <Input placeholder="client@example.com" style={{ borderRadius: 10, height: 42 }} />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            rules={[
              { required: true, message: 'Password is required' },
              { min: 6, message: 'Password must be at least 6 characters' },
            ]}
          >
            <Input.Password placeholder="Enter a secure password" style={{ borderRadius: 10, height: 42 }} />
          </Form.Item>

          <Form.Item name="fullName" label="Display Name (optional)">
            <Input placeholder="Will default to client name" style={{ borderRadius: 10, height: 42 }} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setModalOpen(false); form.resetFields(); }}>Cancel</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting}
                style={{ background: '#6366F1', border: 'none', borderRadius: 10, fontWeight: 600 }}
              >
                Create Access
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyOutlined style={{ color: '#6366F1' }} />
            <span>Reset Password — {selectedUser?.clientName}</span>
          </div>
        }
        open={resetModalOpen}
        onCancel={() => { setResetModalOpen(false); resetForm.resetFields(); }}
        footer={null}
        destroyOnClose
      >
        <Form form={resetForm} layout="vertical" onFinish={handleResetPassword} style={{ marginTop: 16 }}>
          <Form.Item
            name="password"
            label="New Password"
            rules={[
              { required: true, message: 'Password is required' },
              { min: 6, message: 'Password must be at least 6 characters' },
            ]}
          >
            <Input.Password placeholder="Enter new password" style={{ borderRadius: 10, height: 42 }} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setResetModalOpen(false); resetForm.resetFields(); }}>Cancel</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting}
                style={{ background: '#6366F1', border: 'none', borderRadius: 10, fontWeight: 600 }}
              >
                Reset Password
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </motion.div>
  );
};

export default ClientCredentialsPage;
