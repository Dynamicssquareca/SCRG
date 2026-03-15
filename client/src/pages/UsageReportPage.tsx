import React, { useEffect, useState } from 'react';
import { Card, Table, Typography, Spin, Space, Row, Col, message, Statistic, Alert } from 'antd';
import { 
  BarChartOutlined, 
  HourglassOutlined, 
  UserOutlined, 
  HistoryOutlined,
  ArrowUpOutlined
} from '@ant-design/icons';
import api from '../services/api';
import dayjs from 'dayjs';
import './UsageReport.css';

const { Title, Text } = Typography;

const UsageReportPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [usageGrid, setUsageGrid] = useState<any>({ gridData: [], months: [] });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data } = await api.get('/usage/usage-grid');
        const originalData = data.data || { gridData: [], months: [] };
        
        // Filter to only show the last month as requested
        const latestMonthOnly = originalData.months.length > 0 
          ? [originalData.months[originalData.months.length - 1]] 
          : [];

        setUsageGrid({
          gridData: originalData.gridData,
          months: latestMonthOnly
        });
      } catch (err: any) {
        console.error('Failed to fetch usage data', err);
        const errMsg = err.response?.data?.message || err.message || 'Unknown error';
        message.error(`Failed to load usage report data: ${errMsg}`);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const gridColumns = [
    { 
      title: 'Account Name', 
      dataIndex: 'clientName', 
      key: 'clientName', 
      fixed: 'left' as const, 
      width: 250,
      render: (text: string) => <Text className="client-name-bold">{text}</Text>
    },
    ...(usageGrid.months || []).map((m: string) => ({
      title: dayjs(m).format('MMMM YYYY'),
      dataIndex: m,
      key: m,
      width: 150,
      align: 'right' as const,
      render: (val: any) => (
        <Text strong style={{ color: val > 0 ? '#1B3A5C' : '#bfbfbf' }}>
          {val !== null && val !== undefined ? val.toFixed(2) : '0.00'}
        </Text>
      ),
    }))
  ];

  // Stats Logic - Focus on Latest Month
  const latestMonth = usageGrid.months?.[0];
  const latestMonthLabel = latestMonth ? dayjs(latestMonth).format('MMMM YYYY') : 'N/A';
  
  const totalHoursLatest = usageGrid.gridData.reduce((acc: number, curr: any) => acc + (curr[latestMonth] || 0), 0);
  const activeClients = usageGrid.gridData.length;

  const renderSummary = (pageData: readonly any[]) => {
    return (
      <Table.Summary fixed>
        <Table.Summary.Row style={{ background: '#f8fafc', fontWeight: 'bold' }}>
          <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
          {usageGrid.months.map((m: string, i: number) => {
            const total = pageData.reduce((acc, curr) => acc + (curr[m] || 0), 0);
            return (
              <Table.Summary.Cell index={i + 1} key={m} align="right">
                <Text strong style={{ color: '#006B7B' }}>{total.toFixed(2)}</Text>
              </Table.Summary.Cell>
            );
          })}
        </Table.Summary.Row>
      </Table.Summary>
    );
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" tip="Loading usage metrics..." /></div>;

  return (
    <div className="usage-report-container">
      <div className="report-header">
        <Title level={3} style={{ margin: 0, fontWeight: 800, color: '#1b3a5c' }}>
          Monthly Usage Breakdown
        </Title>
        <Text type="secondary">Actual billable hours consumed by month</Text>
      </div>
      
      <Row gutter={[20, 20]} style={{ marginBottom: 32 }}>
        <Col xs={24} sm={12}>
          <Card className="stats-card">
            <Statistic 
              title={<Text strong type="secondary">LATEST MONTH USAGE ({latestMonthLabel})</Text>} 
              value={totalHoursLatest} 
              precision={2}
              suffix="hrs"
              valueStyle={{ color: '#006B7B' }}
              prefix={<BarChartOutlined />}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>Total billable duration for the period</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card className="stats-card">
            <Statistic 
              title={<Text strong type="secondary">TOTAL CLIENTS</Text>} 
              value={activeClients} 
              prefix={<UserOutlined style={{ color: '#1B3A5C' }} />}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>Count of active accounts with reports</Text>
          </Card>
        </Col>
      </Row>

      <Space direction="vertical" size={32} style={{ width: '100%' }}>
        <Card bodyStyle={{ padding: 0 }} className="premium-table-container">
          <Table 
            dataSource={usageGrid.gridData} 
            columns={gridColumns} 
            scroll={{ x: 'max-content' }}
            pagination={false}
            size="middle"
            rowKey="clientName"
            className="premium-table"
            summary={renderSummary}
            locale={{ emptyText: 'No usage data available for the latest reports' }}
          />
        </Card>

        <Card title="Data Interpretation" className="stats-card">
          <Text type="secondary">
            This table shows the hours used by each account as calculated from the raw support case data. 
            The columns represent the reporting months identified in your master sheet uploads.
          </Text>
          <div style={{ marginTop: 24 }}>
            <Alert 
              message="Reporting Note" 
              description="Values are summed automatically from all Closed cases for each reporting period." 
              type="info" 
              showIcon 
            />
          </div>
        </Card>
      </Space>
    </div>
  );
};

export default UsageReportPage;
