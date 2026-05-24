import React, { useEffect, useState, useMemo } from 'react';
import { Card, Col, Row, Typography, Table, Tag, Button, message, Popconfirm, DatePicker, List, Modal, Select, Tabs, InputNumber, Tooltip } from 'antd';
import {
  UserOutlined, WarningOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined,
  InfoCircleOutlined, BellOutlined,
  ClockCircleOutlined, CalendarOutlined, FileProtectOutlined,
  TeamOutlined, BarChartOutlined, SyncOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import api from '../services/api';
import dayjs, { Dayjs } from 'dayjs';
import { useAuth } from '../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

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
  const [notifications, setNotifications] = useState<any[]>([]);
  const [centerData, setCenterData]     = useState<any>(null);
  const [loading, setLoading]           = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<Dayjs | null>(null);
  const [lastUploadAt, setLastUploadAt] = useState<string | null>(null);
  const [workload, setWorkload]         = useState<{agent:string;openCount:number}[]>([]);
  
  const [compMonth1, setCompMonth1] = useState<Dayjs>(dayjs());
  const [compMonth2, setCompMonth2] = useState<Dayjs>(dayjs().subtract(1, 'month'));
  const [customChartData, setCustomChartData] = useState<any>(null);

  const [clientsList, setClientsList] = useState<{_id: string, client_name: string}[]>([]);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [clientMonth, setClientMonth] = useState<Dayjs | null>(null);
  const [clientBreakdown, setClientBreakdown] = useState<any>(null);

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

  const formatDate = (iso: string | null): string => {
    if (!iso) return '—';
    return dayjs(iso).format('DD MMM YYYY, HH:mm');
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
      const [statsRes, notifRes] = await Promise.all([
        api.get(statsUrl),
        api.get('/notifications'),
      ]);
      setStats(statsRes.data.data);
      setNotifications(notifRes.data.data);
    } catch { /* silent */ } finally { setLoading(false); }
  };

  const fetchLastUpload = async () => {
    try {
      const res = await api.get('/dashboard/last-upload');
      setLastUploadAt(res.data.data.lastUploadAt);
    } catch { /* silent */ }
  };

  const fetchWorkload = async () => {
    try {
      const res = await api.get('/dashboard/consultant-workload');
      setWorkload(res.data.data || []);
    } catch { /* silent */ }
  };

  const fetchCustomChart = async () => {
    try {
      const m1 = compMonth1.month() + 1; const y1 = compMonth1.year();
      const m2 = compMonth2.month() + 1; const y2 = compMonth2.year();
      const res = await api.get(`/dashboard/chart/custom-comparison?m1=${m1}&y1=${y1}&m2=${m2}&y2=${y2}`);
      setCustomChartData(res.data.data);
    } catch { /* silent */ }
  };

  const fetchClientList = async () => {
    try {
      const res = await api.get('/clients?limit=1000');
      const clients = res.data.data.clients || [];
      setClientsList(clients);
      if (clients.length > 0 && !selectedClient) {
        setSelectedClient(clients[0]._id);
      }
    } catch { /* silent */ }
  };

  const fetchClientBreakdown = async () => {
    if (!selectedClient) return;
    try {
      let url = `/dashboard/chart/client-breakdown?clientId=${selectedClient}`;
      if (clientMonth) {
        url += `&month=${clientMonth.month() + 1}&year=${clientMonth.year()}`;
      }
      const res = await api.get(url);
      setClientBreakdown(res.data.data);
    } catch { /* silent */ }
  };

  useEffect(() => { fetchData(); fetchLastUpload(); fetchWorkload(); fetchClientList(); }, [selectedMonth]);
  useEffect(() => { fetchCenterData(); }, [maxBalanceFilter, minDaysFilter]);
  useEffect(() => { fetchCustomChart(); }, [compMonth1, compMonth2]);
  useEffect(() => { fetchClientBreakdown(); }, [selectedClient, clientMonth]);

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



  const mLabel = selectedMonth ? ` (${selectedMonth.format('MMM YYYY')})` : '';

  const metrics: MetricProps[] = [
    { label: 'Active Clients',          value: stats.totalClients,    icon: <UserOutlined />,        iconBg: 'rgba(232,54,61,0.08)', iconColor: '#E8363D', accentColor: '#E8363D', index: 0, loading },
    { label: `Open Tickets${mLabel}`,   value: stats.totalOpenCases,  icon: <WarningOutlined />,     iconBg: 'rgba(234,179,8,0.10)', iconColor: '#B45309', accentColor: '#F59E0B', index: 1, loading, onClick: () => fetchCases('open') },
    { label: `Closed Tickets${mLabel}`, value: stats.totalClosedCases,icon: <CheckCircleOutlined />, iconBg: 'rgba(22,163,74,0.09)', iconColor: '#16A34A', accentColor: '#16A34A', index: 2, loading, onClick: () => fetchCases('closed') },
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {lastUploadAt && (
            <Tooltip title={`Last data sync: ${formatDate(lastUploadAt)}`}>
              <span className="last-updated-badge">
                <span className="dot" />
                <SyncOutlined style={{ fontSize: 11 }} />
                Last Updated: {formatDate(lastUploadAt)}
              </span>
            </Tooltip>
          )}
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
          <Col key={m.label} xs={24} sm={12} xl={8}>
            <MetricCard {...m} />
          </Col>
        ))}
      </Row>

      {/* ── Charts Row ─────────────────────────── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {/* Custom Month Comparison Chart */}
        <Col xs={24} lg={12}>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28, duration: 0.4 }} style={{ height: '100%' }}>
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BarChartOutlined style={{ color: '#2563EB', fontSize: 16 }} />
                    <span style={{ fontSize: 14 }}>Month Comparison</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <DatePicker.MonthPicker size="small" style={{ width: 110 }} value={compMonth1} onChange={(d) => d && setCompMonth1(d)} allowClear={false} />
                    <span style={{ color: '#9CA3AF', fontSize: 12, alignSelf: 'center' }}>vs</span>
                    <DatePicker.MonthPicker size="small" style={{ width: 110 }} value={compMonth2} onChange={(d) => d && setCompMonth2(d)} allowClear={false} />
                  </div>
                </div>
              }
              loading={loading && !customChartData}
              style={{ height: '100%' }}
            >
              {customChartData ? (() => {
                const data = [
                  {
                    name: 'Tickets Created',
                    [customChartData.month1.label]: customChartData.month1.open,
                    [customChartData.month2.label]: customChartData.month2.open,
                  },
                  {
                    name: 'Tickets Resolved',
                    [customChartData.month1.label]: customChartData.month1.closed,
                    [customChartData.month2.label]: customChartData.month2.closed,
                  }
                ];
                return (
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data} margin={{ top: 20, right: 20, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8ECF4" />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#4B5568', fontWeight: 500 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                        <RechartsTooltip 
                          cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                          contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                          itemStyle={{ fontSize: 13, fontWeight: 600 }}
                          labelStyle={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                        <Bar dataKey={customChartData.month1.label} fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={50} animationDuration={1000} />
                        <Bar dataKey={customChartData.month2.label} fill="#93C5FD" radius={[4, 4, 0, 0]} maxBarSize={50} animationDuration={1000} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })() : <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF' }}>Loading...</div>}
            </Card>
          </motion.div>
        </Col>

        {/* Per-Client Breakdown Chart */}
        <Col xs={24} lg={12}>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36, duration: 0.4 }} style={{ height: '100%' }}>
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BarChartOutlined style={{ color: '#7C3AED', fontSize: 16 }} />
                    <span style={{ fontSize: 14 }}>Client Breakdown</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <DatePicker.MonthPicker
                      size="small"
                      style={{ width: 120 }}
                      value={clientMonth}
                      onChange={(d) => setClientMonth(d)}
                      placeholder="All time"
                      allowClear
                    />
                    <Select
                      size="small"
                      style={{ width: 160 }}
                      showSearch
                      optionFilterProp="children"
                      value={selectedClient}
                      onChange={setSelectedClient}
                      placeholder="Select a client"
                    >
                      {clientsList.map((c: any) => <Select.Option key={c._id} value={c._id}>{c.client_name}</Select.Option>)}
                    </Select>
                  </div>
                </div>
              }
              loading={loading && !clientBreakdown}
              style={{ height: '100%' }}
            >
              {clientBreakdown ? (() => {
                const data = [
                  { name: 'Open', value: clientBreakdown.open },
                  { name: 'Closed', value: clientBreakdown.closed }
                ].filter(d => d.value > 0);
                
                const COLORS = ['#F59E0B', '#16A34A'];

                if (data.length === 0) {
                  return <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF' }}>No tickets for this client.</div>;
                }

                return (
                  <div style={{ width: '100%', height: 260, position: 'relative' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data}
                          cx="50%"
                          cy="45%"
                          innerRadius={65}
                          outerRadius={90}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                          animationDuration={1000}
                        >
                          {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip 
                          contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                          itemStyle={{ fontSize: 14, fontWeight: 700 }}
                        />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: '#0F1117', lineHeight: 1 }}>{clientBreakdown.open + clientBreakdown.closed}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', marginTop: 4 }}>Total</div>
                    </div>
                  </div>
                );
              })() : <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF' }}>Loading...</div>}
            </Card>
          </motion.div>
        </Col>
      </Row>

      {/* ── Lower Section ─────────────────────── */}
      <Row gutter={[16, 16]}>
        {/* Left column — Consultant Workload */}
        <Col xs={24} lg={16}>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32, duration: 0.4 }}>
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TeamOutlined style={{ color: '#7C3AED', fontSize: 16 }} />
                  <span>Consultant Workload</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 500, color: '#9CA3AF' }}>Open tickets per consultant</span>
                </div>
              }
              loading={loading}
            >
              {workload.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <CheckCircleOutlined style={{ fontSize: 32, color: '#16A34A', display: 'block', marginBottom: 8 }} />
                  <Text type="secondary" style={{ fontSize: 13 }}>No open tickets assigned</Text>
                </div>
              ) : (() => {
                const maxCount = workload[0]?.openCount || 1;
                return (
                  <div>
                    {workload.map((w, i) => {
                      const pct = (w.openCount / maxCount) * 100;
                      const color = pct > 70 ? '#EF4444' : pct > 40 ? '#F59E0B' : '#16A34A';
                      const bg   = pct > 70 ? '#FEF2F2' : pct > 40 ? '#FFFBEB' : '#F0FDF4';
                      return (
                        <motion.div key={i} className="workload-row"
                          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05, duration: 0.3 }}
                        >
                          <div className="workload-name" title={w.agent}>{w.agent}</div>
                          <div className="workload-bar-track">
                            <div className="workload-bar-fill"
                              style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}cc, ${color})`, animationDelay: `${i * 0.05}s` }}
                            />
                          </div>
                          <Tooltip title={`${w.openCount} open ticket${w.openCount !== 1 ? 's' : ''}`}>
                            <span className="workload-count"
                              style={{ color, background: bg, borderRadius: 6, padding: '1px 8px' }}
                            >{w.openCount}</span>
                          </Tooltip>
                        </motion.div>
                      );
                    })}
                  </div>
                );
              })()}
            </Card>
          </motion.div>

          {/* Danger Zone */}
          {user?.role === 'admin' && (
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44, duration: 0.4 }} style={{ marginTop: 16 }}>
              <Card
                className="danger-card"
                title={<span style={{ color: '#DC2626', fontWeight: 700 }}><WarningOutlined style={{ marginRight: 8 }} />Danger Zone</span>}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                  <div>
                    <Text strong style={{ fontSize: 14 }}>Clear All Application Data</Text><br />
                    <Text type="secondary" style={{ fontSize: 12 }}>Permanently deletes all uploads, cases, and reports. <strong>Client Master and Users are preserved.</strong></Text>
                  </div>
                  <Popconfirm title="Clear all data?" description="This will delete all uploads, cases, and reports. Your Client Master will NOT be deleted. This cannot be undone." onConfirm={handleClearData} okText="Yes, clear it" cancelText="Cancel" okButtonProps={{ danger: true, loading: deleteLoading }}>
                    <motion.div whileTap={{ scale: 0.97 }}>
                      <Button danger icon={<WarningOutlined />} style={{ fontWeight: 600, flexShrink: 0 }}>Clear All Data</Button>
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
