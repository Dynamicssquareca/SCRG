import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Typography, Table, Tag, Button, message, Popconfirm, DatePicker, List } from 'antd';
import {
  UserOutlined, CloudUploadOutlined, WarningOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined,
  InfoCircleOutlined, BellOutlined, ArrowUpOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import api from '../services/api';
import dayjs, { Dayjs } from 'dayjs';
import { useAuth } from '../context/AuthContext';

const { Text } = Typography;

/* ── Metric Card ─────────────────────────────── */
interface MetricProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  accentColor: string;
  index: number;
  loading: boolean;
}

const MetricCard: React.FC<MetricProps> = ({ label, value, icon, iconBg, iconColor, accentColor, index, loading }) => (
  <motion.div
    initial={{ opacity: 0, y: 22 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.07, duration: 0.42, ease: [0.4, 0, 0.2, 1] }}
    whileHover={{ y: -4 }}
    style={{ borderRadius: 16 }}
  >
    <Card
      loading={loading}
      className="metric-card"
      style={{ borderRadius: 16 }}
      styles={{ body: { padding: '22px 24px' } }}
    >
      {/* Accent bar on top */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 3, borderRadius: '16px 16px 0 0',
        background: accentColor,
      }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Text style={{
            display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.7px',
            textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 10,
          }}>
            {label}
          </Text>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#0F1117', lineHeight: 1, letterSpacing: '-1px' }}>
            {(value ?? 0).toLocaleString()}
          </div>
        </div>
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, color: iconColor,
        }}>
          {icon}
        </div>
      </div>
    </Card>
  </motion.div>
);

/* ── Dashboard ───────────────────────────────── */
const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats]               = useState<any>({});
  const [uploads, setUploads]           = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<Dayjs | null>(dayjs());

  const fetchData = async () => {
    setLoading(true);
    try {
      let statsUrl = '/dashboard/stats';
      if (selectedMonth) statsUrl += `?month=${selectedMonth.month() + 1}&year=${selectedMonth.year()}`;
      const [statsRes, uploadsRes, notifRes] = await Promise.all([
        api.get(statsUrl),
        api.get('/uploads?limit=5'),
        api.get('/notifications'),
      ]);
      setStats(statsRes.data.data);
      setUploads(uploadsRes.data.data.uploads);
      setNotifications(notifRes.data.data);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [selectedMonth]);

  const handleClearData = async () => {
    setDeleteLoading(true);
    try {
      await api.post('/admin/clear-all-data');
      message.success('All data cleared. Client Master preserved.');
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Failed to clear data');
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns = [
    {
      title: 'File Name', dataIndex: 'original_name', key: 'original_name',
      render: (v: string) => <Text strong style={{ fontSize: 13 }}>{v}</Text>,
    },
    { title: 'Rows', dataIndex: 'row_count', key: 'row_count', width: 80 },
    {
      title: 'Uploaded', dataIndex: 'created_at', key: 'created_at',
      render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(v).format('DD MMM YYYY, HH:mm')}</Text>,
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 120,
      render: (v: string) => (
        <Tag color={v === 'completed' ? 'success' : v === 'failed' ? 'error' : 'processing'}>
          {v.toUpperCase()}
        </Tag>
      ),
    },
  ];

  const mLabel = selectedMonth ? ` (${selectedMonth.format('MMM YYYY')})` : '';

  const metrics: MetricProps[] = [
    { label: 'Total Clients',           value: stats.totalClients,    icon: <UserOutlined />,          iconBg: 'rgba(232,54,61,0.08)',    iconColor: '#E8363D', accentColor: '#E8363D',          index: 0, loading },
    { label: 'Total Uploads',           value: stats.totalUploads,    icon: <CloudUploadOutlined />,   iconBg: 'rgba(37,99,235,0.08)',    iconColor: '#2563EB', accentColor: '#2563EB',          index: 1, loading },
    { label: `Open Tickets${mLabel}`,   value: stats.totalOpenCases,  icon: <WarningOutlined />,       iconBg: 'rgba(234,179,8,0.10)',    iconColor: '#B45309', accentColor: '#F59E0B',          index: 2, loading },
    { label: `Closed Tickets${mLabel}`, value: stats.totalClosedCases,icon: <CheckCircleOutlined />,   iconBg: 'rgba(22,163,74,0.09)',    iconColor: '#16A34A', accentColor: '#16A34A',          index: 3, loading },
  ];

  return (
    <div>
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0F1117', letterSpacing: '-0.4px' }}>
            Dashboard Overview
          </h1>
          <Text type="secondary" style={{ fontSize: 13, marginTop: 2, display: 'block' }}>
            {selectedMonth ? `Showing data for ${selectedMonth.format('MMMM YYYY')}` : 'All time data'}
          </Text>
        </div>
        <DatePicker.MonthPicker
          value={selectedMonth}
          onChange={setSelectedMonth}
          allowClear
          placeholder="Filter by Month"
          style={{ borderRadius: 8, height: 38 }}
        />
      </motion.div>

      {/* Metric cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {metrics.map(m => (
          <Col key={m.label} xs={24} sm={12} xl={6}>
            <MetricCard {...m} />
          </Col>
        ))}
      </Row>

      {/* Lower section */}
      <Row gutter={[16, 16]}>
        {/* Left column */}
        <Col xs={24} lg={16}>
          {/* Recent Uploads */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32, duration: 0.4 }}
          >
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: '#E8363D' }} />
                  Recent Data Uploads
                </div>
              }
              loading={loading}
            >
              <Table
                dataSource={uploads}
                columns={columns}
                rowKey="_id"
                pagination={false}
                size="middle"
              />
            </Card>
          </motion.div>

          {/* Danger Zone */}
          {user?.role === 'admin' && (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.44, duration: 0.4 }}
              style={{ marginTop: 16 }}
            >
              <Card
                className="danger-card"
                title={
                  <span style={{ color: '#DC2626', fontWeight: 700 }}>
                    <WarningOutlined style={{ marginRight: 8 }} />
                    Danger Zone
                  </span>
                }
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                  <div>
                    <Text strong style={{ fontSize: 14 }}>Clear All Application Data</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Permanently deletes all uploads, cases, and reports. <strong>Client Master and Users are preserved.</strong>
                    </Text>
                  </div>
                  <Popconfirm
                    title="Clear all data?"
                    description="This will delete all uploads, cases, and reports. Your Client Master will NOT be deleted. This cannot be undone."
                    onConfirm={handleClearData}
                    okText="Yes, clear it"
                    cancelText="Cancel"
                    okButtonProps={{ danger: true, loading: deleteLoading }}
                  >
                    <motion.div whileTap={{ scale: 0.97 }}>
                      <Button danger icon={<WarningOutlined />} style={{ fontWeight: 600, flexShrink: 0 }}>
                        Clear All Data
                      </Button>
                    </motion.div>
                  </Popconfirm>
                </div>
              </Card>
            </motion.div>
          )}
        </Col>

        {/* Right column — Notifications */}
        <Col xs={24} lg={8}>
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.38, duration: 0.4 }}
            style={{ height: '100%' }}
          >
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: '#E8363D' }} />
                  Contract Notifications
                  {notifications.length > 0 && (
                    <span style={{
                      marginLeft: 'auto', background: '#E8363D', color: '#fff',
                      fontSize: 11, fontWeight: 700, borderRadius: 99,
                      padding: '1px 8px', lineHeight: '18px',
                    }}>
                      {notifications.length}
                    </span>
                  )}
                </div>
              }
              loading={loading}
              style={{ height: '100%' }}
              styles={{ body: { padding: '8px 24px' } }}
            >
              {notifications.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                  style={{ textAlign: 'center', padding: '28px 0' }}
                >
                  <CheckCircleOutlined style={{ fontSize: 36, color: '#16A34A', marginBottom: 10, display: 'block' }} />
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    No contracts expiring soon or overdue.
                  </Text>
                </motion.div>
              ) : (
                <List
                  dataSource={notifications}
                  renderItem={(item, i) => (
                    <motion.div
                      initial={{ opacity: 0, x: 14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.48 + i * 0.06, duration: 0.32 }}
                    >
                      <List.Item className="notif-item">
                        <List.Item.Meta
                          avatar={
                            item.level === 'critical'
                              ? <ExclamationCircleOutlined style={{ color: '#DC2626', fontSize: 20, marginTop: 2 }} />
                              : item.level === 'warning'
                              ? <WarningOutlined style={{ color: '#D97706', fontSize: 20, marginTop: 2 }} />
                              : <InfoCircleOutlined style={{ color: '#2563EB', fontSize: 20, marginTop: 2 }} />
                          }
                          title={<Text strong style={{ fontSize: 13 }}>{item.clientName}</Text>}
                          description={
                            <div>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {item.daysRemaining < 0 ? 'Expired: ' : 'Renews: '} {dayjs(String(item.contractEndDate).substring(0, 10)).format('MMM DD, YYYY')}
                              </Text>
                              <br />
                              <Tag
                                color={item.level === 'critical' ? 'error' : item.level === 'warning' ? 'warning' : 'default'}
                                style={{ marginTop: 5 }}
                              >
                                {item.daysRemaining < 0 
                                  ? `${Math.abs(item.daysRemaining)} days overdue` 
                                  : `${item.daysRemaining} days remaining`}
                              </Tag>
                            </div>
                          }
                        />
                      </List.Item>
                    </motion.div>
                  )}
                />
              )}
            </Card>
          </motion.div>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
