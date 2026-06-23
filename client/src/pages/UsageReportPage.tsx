import React, { useEffect, useState, useCallback } from 'react';
import { Card, Table, Typography, Spin, Space, Row, Col, message, Select, Button } from 'antd';
import {
  BarChartOutlined,
  UserOutlined,
  CalendarOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import api from '../services/api';
import dayjs from 'dayjs';

const { Text } = Typography;
const { Option } = Select;

const MONTHS = [
  { value: 1,  label: 'January'   },
  { value: 2,  label: 'February'  },
  { value: 3,  label: 'March'     },
  { value: 4,  label: 'April'     },
  { value: 5,  label: 'May'       },
  { value: 6,  label: 'June'      },
  { value: 7,  label: 'July'      },
  { value: 8,  label: 'August'    },
  { value: 9,  label: 'September' },
  { value: 10, label: 'October'   },
  { value: 11, label: 'November'  },
  { value: 12, label: 'December'  },
];

const currentYear  = dayjs().year();
const currentMonth = dayjs().month() + 1;

const YEARS = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

const UsageReportPage: React.FC = () => {
  const [loading, setLoading]           = useState(true);
  const [usageGrid, setUsageGrid]       = useState<any>({ gridData: [], months: [], availableMonths: [] });
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedYear, setSelectedYear]   = useState<number>(currentYear);

  const fetchData = useCallback(async (month: number, year: number) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/usage/usage-grid?month=${month}&year=${year}`);
      setUsageGrid(data.data || { gridData: [], months: [], availableMonths: [] });
    } catch (err: any) {
      console.error('Failed to fetch usage data', err);
      message.error(`Failed to load usage data: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount - fetch with defaults, but backend will return latest available if no data for current month
  useEffect(() => {
    fetchData(selectedMonth, selectedYear);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilter = () => {
    fetchData(selectedMonth, selectedYear);
  };

  // When the backend sends back availableMonths and we loaded without params,
  // auto-select the latest available month
  useEffect(() => {
    if (usageGrid.availableMonths?.length) {
      const latest = usageGrid.availableMonths[usageGrid.availableMonths.length - 1];
      const [yr, mo] = latest.split('-').map(Number);
      if (!usageGrid.months?.length || usageGrid.months[0] !== latest) return; // already correct
      setSelectedYear(yr);
      setSelectedMonth(mo);
    }
  }, [usageGrid.availableMonths]);

  // Build the table column for the selected month
  const activeMonthKey = usageGrid.months?.[0];
  const activeLabel    = activeMonthKey ? dayjs(activeMonthKey).format('MMMM YYYY') : '-';

  const totalHours   = usageGrid.gridData.reduce((acc: number, r: any) => acc + (r[activeMonthKey] || 0), 0);
  const activeClients = usageGrid.gridData.filter((r: any) => (r[activeMonthKey] || 0) > 0).length;

  const gridColumns = [
    {
      title: 'Account Name',
      dataIndex: 'clientName',
      key: 'clientName',
      fixed: 'left' as const,
      width: 240,
      render: (text: string) => (
        <Text strong style={{ fontSize: 13, color: '#0F1117' }}>{text}</Text>
      ),
    },
    ...(activeMonthKey ? [{
      title: <span style={{ color: '#E8363D', fontWeight: 700 }}>{activeLabel}</span>,
      dataIndex: activeMonthKey,
      key: activeMonthKey,
      width: 180,
      align: 'right' as const,
      render: (val: any) => {
        const v = val ?? 0;
        return (
          <Text strong style={{ color: v > 0 ? '#0F1117' : '#D1D5DB', fontSize: 13 }}>
            {v.toFixed(2)} hrs
          </Text>
        );
      },
    }] : []),
  ];

  const renderSummary = (pageData: readonly any[]) => (
    <Table.Summary fixed>
      <Table.Summary.Row style={{ background: '#FFF5F5', fontWeight: 700 }}>
        <Table.Summary.Cell index={0}>
          <Text strong style={{ color: '#E8363D' }}>Total</Text>
        </Table.Summary.Cell>
        {activeMonthKey && (
          <Table.Summary.Cell index={1} align="right">
            <Text strong style={{ color: '#E8363D' }}>
              {pageData.reduce((acc, r) => acc + (r[activeMonthKey] || 0), 0).toFixed(2)} hrs
            </Text>
          </Table.Summary.Cell>
        )}
      </Table.Summary.Row>
    </Table.Summary>
  );

  return (
    <div>
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ marginBottom: 24 }}
      >
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0F1117', letterSpacing: '-0.4px' }}>
          Usage Report
        </h1>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Billable hours consumed per client - select a month to view
        </Text>
      </motion.div>

      {/* Filter bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.35 }}
      >
        <Card style={{ marginBottom: 20, borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <CalendarOutlined style={{ color: '#E8363D', fontSize: 18 }} />
            <Text strong style={{ fontSize: 14 }}>Filter by Period:</Text>

            <Select
              value={selectedMonth}
              onChange={setSelectedMonth}
              style={{ width: 140 }}
              size="middle"
            >
              {MONTHS.map(m => (
                <Option key={m.value} value={m.value}>{m.label}</Option>
              ))}
            </Select>

            <Select
              value={selectedYear}
              onChange={setSelectedYear}
              style={{ width: 100 }}
              size="middle"
            >
              {YEARS.map(y => (
                <Option key={y} value={y}>{y}</Option>
              ))}
            </Select>

            <motion.div whileTap={{ scale: 0.97 }}>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={handleFilter}
                loading={loading}
                style={{
                  background: '#E8363D', border: 'none',
                  borderRadius: 8, fontWeight: 600,
                }}
              >
                Show Data
              </Button>
            </motion.div>

            {/* Available months hint */}
            {usageGrid.availableMonths?.length > 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Data available for:{' '}
                {usageGrid.availableMonths.map((m: string) => dayjs(m).format('MMM YYYY')).join(', ')}
              </Text>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Stat cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12}>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
          >
            <Card style={{ borderRadius: 14 }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: '14px 14px 0 0', background: '#E8363D' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <Text style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 8 }}>
                    Total Hours - {activeLabel}
                  </Text>
                  <div style={{ fontSize: 32, fontWeight: 800, color: '#0F1117', lineHeight: 1 }}>
                    {loading ? '-' : totalHours.toFixed(2)}{' '}
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#6B7280' }}>hrs</span>
                  </div>
                </div>
                <div style={{ width: 50, height: 50, borderRadius: 14, background: 'rgba(232,54,61,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#E8363D' }}>
                  <BarChartOutlined />
                </div>
              </div>
            </Card>
          </motion.div>
        </Col>
        <Col xs={24} sm={12}>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.4 }}
          >
            <Card style={{ borderRadius: 14 }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: '14px 14px 0 0', background: '#2563EB' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <Text style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 8 }}>
                    Clients with Usage
                  </Text>
                  <div style={{ fontSize: 32, fontWeight: 800, color: '#0F1117', lineHeight: 1 }}>
                    {loading ? '-' : activeClients}
                  </div>
                </div>
                <div style={{ width: 50, height: 50, borderRadius: 14, background: 'rgba(37,99,235,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#2563EB' }}>
                  <UserOutlined />
                </div>
              </div>
            </Card>
          </motion.div>
        </Col>
      </Row>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: '#E8363D' }} />
              Hours Consumed - {activeLabel}
            </div>
          }
          styles={{ body: { padding: 0 } }}
        >
          <Table
            dataSource={usageGrid.gridData}
            columns={gridColumns}
            scroll={{ x: 'max-content' }}
            pagination={false}
            size="middle"
            rowKey="clientName"
            loading={loading}
            summary={activeMonthKey ? renderSummary : undefined}
            locale={{
              emptyText: loading
                ? 'Loading…'
                : `No usage data available for ${activeLabel}. Try uploading data for this period.`,
            }}
          />
        </Card>
      </motion.div>
    </div>
  );
};

export default UsageReportPage;
