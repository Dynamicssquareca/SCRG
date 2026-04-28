import React, { useEffect, useState, useMemo } from 'react';
import { Card, Col, Row, Typography, Table, Tag, Button, message, Popconfirm, DatePicker, List, Modal, Select, Tabs, InputNumber } from 'antd';
import {
  UserOutlined, CloudUploadOutlined, WarningOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined,
  InfoCircleOutlined, BellOutlined,
  ClockCircleOutlined, CalendarOutlined, FileProtectOutlined,
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
  onClick?: () => void;
}

const MetricCard: React.FC<MetricProps> = ({ label, value, icon, iconBg, iconColor, accentColor, index, loading, onClick }) => (
  <motion.div
    initial={{ opacity: 0, y: 22 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.07, duration: 0.42, ease: [0.4, 0, 0.2, 1] }}
    whileHover={{ y: -4 }}
    style={{ borderRadius: 16 }}
    onClick={onClick}
  >
    <Card
      loading={loading}
      className={`metric-card ${onClick ? 'clickable-card' : ''}`}
      style={{ borderRadius: 16, cursor: onClick ? 'pointer' : 'default' }}
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
  const [centerData, setCenterData]     = useState<any>(null);
  const [loading, setLoading]           = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<Dayjs | null>(null);
  const [uploadTz, setUploadTz] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');

  const [maxBalanceFilter, setMaxBalanceFilter] = useState<number>(10);
  const [minDaysFilter, setMinDaysFilter] = useState<number>(15);

  const [lowBalanceSort, setLowBalanceSort] = useState<'lowest' | 'highest'>('lowest');
  const [longOpenSort, setLongOpenSort] = useState<'oldest' | 'newest'>('oldest');

  const sortedLowBalance = useMemo(() => {
    if (!centerData?.lowBalanceClients?.items) return [];
    const items = [...centerData.lowBalanceClients.items];
    return items.sort((a, b) => lowBalanceSort === 'lowest' ? a.balance - b.balance : b.balance - a.balance);
  }, [centerData, lowBalanceSort]);

  const sortedLongOpen = useMemo(() => {
    if (!centerData?.longOpenTickets?.items) return [];
    const items = [...centerData.longOpenTickets.items];
    return items.sort((a, b) => {
      const timeA = new Date(a.created_on).getTime();
      const timeB = new Date(b.created_on).getTime();
      return longOpenSort === 'oldest' ? timeA - timeB : timeB - timeA;
    });
  }, [centerData, longOpenSort]);

  // Returns how many minutes `tz` is ahead of UTC right now (same helper as RemindersPage)
  const tzOffsetMinutes = (tz: string): number => {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      }).formatToParts(now);
      const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value);
      const wallMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
      return Math.round((wallMs - now.getTime()) / 60000);
    } catch { return 0; }
  };

  // Convert a UTC ISO string → display string in the selected uploadTz
  const formatInTz = (utcStr: string): string => {
    if (!utcStr) return '—';
    try {
      const utcMs = new Date(utcStr).getTime();
      const offset = tzOffsetMinutes(uploadTz);
      const local = new Date(utcMs + offset * 60000);
      const pad = (n: number) => String(n).padStart(2, '0');
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${pad(local.getUTCDate())} ${months[local.getUTCMonth()]} ${local.getUTCFullYear()}, ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
    } catch { return utcStr; }
  };

  const [casesModalVisible, setCasesModalVisible] = useState(false);
  const [casesData, setCasesData] = useState<any[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<'open' | 'closed'>('open');

  const fetchCenterData = async () => {
    try {
      const res = await api.get(`/notifications/center?maxBalance=${maxBalanceFilter}&minDays=${minDaysFilter}`);
      setCenterData(res.data.data);
    } catch {
      // silent
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      let statsUrl = '/dashboard/stats';
      if (selectedMonth) {
        const start = selectedMonth.startOf('month').toISOString();
        const end = selectedMonth.endOf('month').toISOString();
        statsUrl += `?month=${selectedMonth.month() + 1}&year=${selectedMonth.year()}&startDate=${start}&endDate=${end}`;
      }
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
  useEffect(() => { fetchCenterData(); }, [maxBalanceFilter, minDaysFilter]);

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

  const fetchCases = async (status: 'open' | 'closed') => {
    setSelectedStatus(status);
    setCasesModalVisible(true);
    setCasesLoading(true);
    try {
      let url = `/dashboard/cases?status=${status}`;
      if (selectedMonth) {
        const start = selectedMonth.startOf('month').toISOString();
        const end = selectedMonth.endOf('month').toISOString();
        url += `&month=${selectedMonth.month() + 1}&year=${selectedMonth.year()}&startDate=${start}&endDate=${end}`;
      }
      const res = await api.get(url);
      setCasesData(res.data.data);
    } catch (err) {
      message.error('Failed to load tickets');
    } finally {
      setCasesLoading(false);
    }
  };

  const columns = [
    {
      title: 'File Name', dataIndex: 'original_name', key: 'original_name',
      render: (v: string) => <Text strong style={{ fontSize: 13 }}>{v}</Text>,
    },
    { title: 'Rows', dataIndex: 'row_count', key: 'row_count', width: 80 },
    {
      title: 'Uploaded', dataIndex: 'createdAt', key: 'createdAt',
      render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{formatInTz(v)}</Text>,
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
    { label: `Open Tickets${mLabel}`,   value: stats.totalOpenCases,  icon: <WarningOutlined />,       iconBg: 'rgba(234,179,8,0.10)',    iconColor: '#B45309', accentColor: '#F59E0B',          index: 2, loading, onClick: () => fetchCases('open') },
    { label: `Closed Tickets${mLabel}`, value: stats.totalClosedCases,icon: <CheckCircleOutlined />,   iconBg: 'rgba(22,163,74,0.09)',    iconColor: '#16A34A', accentColor: '#16A34A',          index: 3, loading, onClick: () => fetchCases('closed') },
  ];

  const caseColumns = [
    { title: 'Case Number', dataIndex: 'case_number', key: 'case_number', render: (v: string) => <Text strong style={{ whiteSpace: 'nowrap' }}>{v}</Text> },
    { title: 'Customer Name (Customer)', dataIndex: 'customer_name', key: 'customer_name' },
    { title: 'Contact', dataIndex: 'contact', key: 'contact' },
    { title: 'Created On', dataIndex: 'created_on', key: 'created_on', render: (v: string) => v ? dayjs(v).format('D/M/YY') : '-' },
    { title: 'Case Title', dataIndex: 'case_title', key: 'case_title' },
    { title: 'Support Agent', dataIndex: 'support_agent', key: 'support_agent' },
    { title: 'Status Reason', dataIndex: 'status_reason', key: 'status_reason' },
    { title: 'Priority', dataIndex: 'priority', key: 'priority' },
    { title: 'Country', dataIndex: 'country', key: 'country' },
    { title: 'Billable Duration', dataIndex: 'billable_duration', key: 'billable_duration' },
    { title: 'Updated On', dataIndex: 'updated_on', key: 'updated_on', render: (v: string) => v ? dayjs(v).format('D/M/YY') : '-' },
    { title: 'Total Days', dataIndex: 'total_days', key: 'total_days' },
    { title: 'Comments', dataIndex: 'comments', key: 'comments' },
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Select
            value={uploadTz}
            onChange={setUploadTz}
            style={{ width: 220, borderRadius: 8, height: 38 }}
            options={[
              { label: 'Local Time',              value: Intl.DateTimeFormat().resolvedOptions().timeZone },
              { label: 'UTC',                     value: 'UTC' },
              { label: 'EST / EDT (New York)',     value: 'America/New_York' },
              { label: 'CST / CDT (Chicago)',      value: 'America/Chicago' },
              { label: 'MST / MDT (Denver)',       value: 'America/Denver' },
              { label: 'PST / PDT (Los Angeles)',  value: 'America/Los_Angeles' },
              { label: 'GMT (London)',             value: 'Europe/London' },
              { label: 'CET (Paris/Berlin)',       value: 'Europe/Paris' },
              { label: 'IST (India)',              value: 'Asia/Kolkata' },
              { label: 'GST (Dubai)',              value: 'Asia/Dubai' },
              { label: 'SGT (Singapore)',          value: 'Asia/Singapore' },
              { label: 'JST (Tokyo)',              value: 'Asia/Tokyo' },
              { label: 'AEST (Sydney)',            value: 'Australia/Sydney' },
            ]}
          />
          <DatePicker.MonthPicker
            value={selectedMonth}
            onChange={setSelectedMonth}
            allowClear
            placeholder="Filter by Month"
            style={{ borderRadius: 8, height: 38 }}
          />
        </div>
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

        {/* Right column — Notification Center */}
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
                  <BellOutlined style={{ color: '#E8363D' }} />
                  Notification Center
                  {/* total alert badge */}
                  {centerData && (centerData.lowBalanceClients.count + centerData.longOpenTickets.count + centerData.contractAlerts.count) > 0 && (
                    <span style={{
                      marginLeft: 'auto', background: '#E8363D', color: '#fff',
                      fontSize: 11, fontWeight: 700, borderRadius: 99,
                      padding: '1px 8px', lineHeight: '18px',
                    }}>
                      {centerData.lowBalanceClients.count + centerData.longOpenTickets.count + centerData.contractAlerts.count}
                    </span>
                  )}
                </div>
              }
              loading={loading}
              style={{ height: '100%' }}
              styles={{ body: { padding: '0 0 8px' } }}
            >
              <Tabs
                defaultActiveKey="contracts"
                size="small"
                style={{ padding: '0 12px' }}
                tabBarStyle={{ marginBottom: 0 }}
                items={[
                  /* ── Tab 1: Contract Alerts ── */
                  {
                    key: 'contracts',
                    label: (
                      <span style={{ fontSize: 12, fontWeight: 600 }}>
                        <FileProtectOutlined style={{ marginRight: 5, color: '#7C3AED' }} />
                        Contracts
                        {centerData && centerData.contractAlerts.count > 0 && (
                          <span style={{
                            marginLeft: 5, background: '#7C3AED', color: '#fff',
                            borderRadius: 99, fontSize: 10, fontWeight: 700,
                            padding: '1px 6px',
                          }}>{centerData.contractAlerts.count}</span>
                        )}
                      </span>
                    ),
                    children: (
                      <div style={{ maxHeight: 380, overflowY: 'auto', padding: '8px 12px 4px' }}>
                        {!centerData || centerData.contractAlerts.count === 0 ? (
                          <div style={{ textAlign: 'center', padding: '24px 0' }}>
                            <CheckCircleOutlined style={{ fontSize: 32, color: '#16A34A', display: 'block', marginBottom: 8 }} />
                            <Text type="secondary" style={{ fontSize: 12 }}>All contracts are healthy</Text>
                          </div>
                        ) : (
                          <List
                            dataSource={centerData.contractAlerts.items}
                            renderItem={(item: any, i: number) => (
                              <motion.div
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.04, duration: 0.28 }}
                              >
                                <List.Item className="notif-item" style={{ padding: '10px 0' }}>
                                  <List.Item.Meta
                                    avatar={
                                      item.level === 'critical'
                                        ? <ExclamationCircleOutlined style={{ color: '#DC2626', fontSize: 18, marginTop: 2 }} />
                                        : item.level === 'warning'
                                        ? <WarningOutlined style={{ color: '#D97706', fontSize: 18, marginTop: 2 }} />
                                        : <InfoCircleOutlined style={{ color: '#2563EB', fontSize: 18, marginTop: 2 }} />
                                    }
                                    title={<Text strong style={{ fontSize: 12 }}>{item.clientName}</Text>}
                                    description={
                                      <div>
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                          {item.daysRemaining < 0 ? 'Expired: ' : 'Renews: '}
                                          {dayjs(String(item.contractEndDate).substring(0, 10)).format('MMM DD, YYYY')}
                                        </Text><br />
                                        <Tag
                                          color={item.level === 'critical' ? 'error' : item.level === 'warning' ? 'warning' : 'default'}
                                          style={{ marginTop: 4, fontSize: 10, borderRadius: 10 }}
                                        >
                                          {item.daysRemaining < 0
                                            ? `${Math.abs(item.daysRemaining)} days overdue`
                                            : `${item.daysRemaining} days left`}
                                        </Tag>
                                      </div>
                                    }
                                  />
                                </List.Item>
                              </motion.div>
                            )}
                          />
                        )}
                      </div>
                    ),
                  },
                  /* ── Tab 2: Low Balance Clients ── */
                  {
                    key: 'low_balance',
                    label: (
                      <span style={{ fontSize: 12, fontWeight: 600 }}>
                        <ClockCircleOutlined style={{ marginRight: 5, color: '#B45309' }} />
                        Low Balance
                        {centerData && centerData.lowBalanceClients.count > 0 && (
                          <span style={{
                            marginLeft: 5, background: '#B45309', color: '#fff',
                            borderRadius: 99, fontSize: 10, fontWeight: 700,
                            padding: '1px 6px',
                          }}>{centerData.lowBalanceClients.count}</span>
                        )}
                      </span>
                    ),
                    children: (
                      <div style={{ maxHeight: 380, overflowY: 'auto', padding: '8px 12px 4px' }}>
                        {!centerData || centerData.lowBalanceClients.count === 0 ? (
                          <div style={{ textAlign: 'center', padding: '24px 0' }}>
                            <CheckCircleOutlined style={{ fontSize: 32, color: '#16A34A', display: 'block', marginBottom: 8 }} />
                            <Text type="secondary" style={{ fontSize: 12 }}>All clients have sufficient balance</Text>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, background: '#f9fafb', padding: '6px 8px', borderRadius: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Text style={{ fontSize: 11, fontWeight: 600, color: '#6B7280' }}>Show {'<'} </Text>
                                <InputNumber 
                                  size="small" 
                                  min={0} 
                                  max={100} 
                                  value={maxBalanceFilter} 
                                  onChange={(val) => setMaxBalanceFilter(val || 0)} 
                                  style={{ width: 60 }} 
                                />
                                <Text style={{ fontSize: 11, fontWeight: 600, color: '#6B7280' }}> hrs</Text>
                              </div>
                              <Select
                                value={lowBalanceSort}
                                onChange={setLowBalanceSort}
                                size="small"
                                style={{ width: 130 }}
                                options={[
                                  { value: 'lowest', label: 'Lowest Balance' },
                                  { value: 'highest', label: 'Highest Balance' },
                                ]}
                              />
                            </div>
                            <List
                              dataSource={sortedLowBalance}
                              renderItem={(item: any, i: number) => (
                                <motion.div
                                  initial={{ opacity: 0, x: 10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: i * 0.04, duration: 0.28 }}
                                >
                                  <List.Item className="notif-item" style={{ padding: '10px 0' }}>
                                    <List.Item.Meta
                                      avatar={
                                        <WarningOutlined style={{
                                          color: item.balance <= 0 ? '#DC2626' : '#D97706',
                                          fontSize: 18, marginTop: 2,
                                        }} />
                                      }
                                      title={<Text strong style={{ fontSize: 12 }}>{item.clientName}</Text>}
                                      description={
                                        <div>
                                          {item.accountManager && (
                                            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                                              AM: {item.accountManager}
                                            </Text>
                                          )}
                                          <Tag
                                            style={{
                                              marginTop: 4, fontSize: 10, borderRadius: 10, border: 'none',
                                              background: item.balance <= 0 ? '#FEF2F2' : '#FFF7ED',
                                              color: item.balance <= 0 ? '#DC2626' : '#B45309',
                                              fontWeight: 700,
                                            }}
                                          >
                                            {item.balance <= 0 ? `${item.balance} hrs (Overdrawn)` : `${item.balance} hrs remaining`}
                                          </Tag>
                                          {item.lastReportMonth && (
                                            <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 3 }}>
                                              As of {dayjs().month(item.lastReportMonth - 1).format('MMM')} {item.lastReportYear}
                                            </Text>
                                          )}
                                        </div>
                                      }
                                    />
                                  </List.Item>
                                </motion.div>
                              )}
                            />
                          </>
                        )}
                      </div>
                    ),
                  },
                  /* ── Tab 3: Long-open Tickets ── */
                  {
                    key: 'long_open',
                    label: (
                      <span style={{ fontSize: 12, fontWeight: 600 }}>
                        <CalendarOutlined style={{ marginRight: 5, color: '#DC2626' }} />
                        {'>'} 15 Days
                        {centerData && centerData.longOpenTickets.count > 0 && (
                          <span style={{
                            marginLeft: 5, background: '#DC2626', color: '#fff',
                            borderRadius: 99, fontSize: 10, fontWeight: 700,
                            padding: '1px 6px',
                          }}>{centerData.longOpenTickets.count}</span>
                        )}
                      </span>
                    ),
                    children: (
                      <div style={{ maxHeight: 380, overflowY: 'auto', padding: '8px 12px 4px' }}>
                        {!centerData || centerData.longOpenTickets.count === 0 ? (
                          <div style={{ textAlign: 'center', padding: '24px 0' }}>
                            <CheckCircleOutlined style={{ fontSize: 32, color: '#16A34A', display: 'block', marginBottom: 8 }} />
                            <Text type="secondary" style={{ fontSize: 12 }}>No tickets older than 15 days</Text>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, background: '#f9fafb', padding: '6px 8px', borderRadius: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Text style={{ fontSize: 11, fontWeight: 600, color: '#6B7280' }}>Show {'>'} </Text>
                                <InputNumber 
                                  size="small" 
                                  min={0} 
                                  max={365} 
                                  value={minDaysFilter} 
                                  onChange={(val) => setMinDaysFilter(val || 0)} 
                                  style={{ width: 60 }} 
                                />
                                <Text style={{ fontSize: 11, fontWeight: 600, color: '#6B7280' }}> days</Text>
                              </div>
                              <Select
                                value={longOpenSort}
                                onChange={setLongOpenSort}
                                size="small"
                                style={{ width: 130 }}
                                options={[
                                  { value: 'oldest', label: 'Oldest Tickets' },
                                  { value: 'newest', label: 'Newest Tickets' },
                                ]}
                              />
                            </div>
                            <List
                              dataSource={sortedLongOpen}
                              renderItem={(item: any, i: number) => {
                                const daysOpen = item.created_on ? dayjs().diff(dayjs(item.created_on), 'day') : null;
                                return (
                                  <motion.div
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.04, duration: 0.28 }}
                                  >
                                    <List.Item className="notif-item" style={{ padding: '10px 0' }}>
                                      <List.Item.Meta
                                        avatar={
                                          <ExclamationCircleOutlined style={{
                                            color: daysOpen && daysOpen > 30 ? '#DC2626' : '#D97706',
                                            fontSize: 18, marginTop: 2,
                                          }} />
                                        }
                                        title={
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Text strong style={{ fontSize: 12 }}>{item.case_number}</Text>
                                            {daysOpen !== null && (
                                              <Tag style={{
                                                fontSize: 10, borderRadius: 10, border: 'none', fontWeight: 700,
                                                background: daysOpen > 30 ? '#FEF2F2' : '#FFF7ED',
                                                color: daysOpen > 30 ? '#DC2626' : '#B45309',
                                              }}>
                                                {daysOpen}d
                                              </Tag>
                                            )}
                                          </div>
                                        }
                                        description={
                                          <div style={{ marginTop: 2 }}>
                                            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                                              <span style={{ fontWeight: 600 }}>{item.customer_name}</span>
                                              {item.case_title && ` — ${item.case_title}`}
                                            </Text>
                                            {item.support_agent && (
                                              <Text type="secondary" style={{ fontSize: 11, marginTop: 2, display: 'block' }}>
                                                Consultant: {item.support_agent}
                                              </Text>
                                            )}
                                          </div>
                                        }
                                      />
                                    </List.Item>
                                  </motion.div>
                                );
                              }}
                            />
                          </>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            </Card>
          </motion.div>
        </Col>
      </Row>

      {/* Cases Modal */}
      <Modal
        title={selectedStatus === 'open' ? `Open Tickets${mLabel}` : `Closed Tickets${mLabel}`}
        open={casesModalVisible}
        onCancel={() => setCasesModalVisible(false)}
        footer={null}
        width={1100}
      >
        <Table
          dataSource={casesData}
          columns={caseColumns}
          rowKey="_id"
          loading={casesLoading}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 10 }}
        />
      </Modal>
    </div>
  );
};

export default DashboardPage;
