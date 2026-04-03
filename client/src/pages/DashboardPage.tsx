import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Typography, Table, Tag, Button, Modal, message, Popconfirm, Divider, DatePicker, List, Badge } from 'antd';
import { UserOutlined, FileTextOutlined, CloudUploadOutlined, IssuesCloseOutlined, WarningOutlined, CheckCircleOutlined, ExclamationCircleOutlined, InfoCircleOutlined, BellOutlined } from '@ant-design/icons';
import api from '../services/api';
import dayjs, { Dayjs } from 'dayjs';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>({});
  const [uploads, setUploads] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<Dayjs | null>(dayjs());

  const fetchData = async () => {
    setLoading(true);
    try {
      let statsUrl = '/dashboard/stats';
      if (selectedMonth) {
        statsUrl += `?month=${selectedMonth.month() + 1}&year=${selectedMonth.year()}`;
      }

      const [statsRes, uploadsRes, notifRes] = await Promise.all([
        api.get(statsUrl),
        api.get('/uploads?limit=5'),
        api.get('/notifications')
      ]);
      setStats(statsRes.data.data);
      setUploads(uploadsRes.data.data.uploads);
      setNotifications(notifRes.data.data);
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedMonth]);

  const handleClearData = async () => {
    setDeleteLoading(true);
    try {
      await api.post('/admin/clear-all-data');
      message.success('All data has been cleared successfully');
      fetchData(); // Refresh stats
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Failed to clear data');
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns = [
    { title: 'File Name', dataIndex: 'original_name', key: 'original_name' },
    { title: 'Rows', dataIndex: 'row_count', key: 'row_count' },
    { title: 'Date', dataIndex: 'created_at', key: 'created_at', render: (val: string) => dayjs(val).format('DD MMM YYYY, HH:mm') },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (val: string) => (
      <Tag color={val === 'completed' ? 'success' : val === 'failed' ? 'error' : 'processing'}>{val.toUpperCase()}</Tag>
    )},
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>Dashboard Overview</Title>
        </Col>
        <Col>
          <DatePicker.MonthPicker 
            value={selectedMonth} 
            onChange={(date) => setSelectedMonth(date)}
            allowClear={true}
            placeholder="Filter Stats by Month"
          />
        </Col>
      </Row>
      
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card loading={loading}>
            <Statistic title="Total Clients" value={stats.totalClients || 0} prefix={<UserOutlined style={{ color: '#1B3A5C' }} />} valueStyle={{ color: '#1B3A5C' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card loading={loading}>
            <Statistic title="Total Uploads" value={stats.totalUploads || 0} prefix={<CloudUploadOutlined style={{ color: '#006B7B' }} />} valueStyle={{ color: '#006B7B' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card loading={loading}>
             <Statistic title={`Open Tickets ${selectedMonth ? `(${selectedMonth.format('MMM YYYY')})` : ''}`} value={stats.totalOpenCases || 0} prefix={<WarningOutlined style={{ color: '#faad14' }} />} valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card loading={loading}>
             <Statistic title={`Closed Tickets ${selectedMonth ? `(${selectedMonth.format('MMM YYYY')})` : ''}`} value={stats.totalClosedCases || 0} prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Recent Data Uploads" loading={loading}>
            <Table
              dataSource={uploads}
              columns={columns}
              rowKey="_id"
              pagination={false}
              size="middle"
            />
          </Card>

          {user?.role === 'admin' && (
            <Card title={<><WarningOutlined style={{ color: '#ff4d4f' }} /> Danger Zone</>} style={{ marginTop: 24, borderColor: '#ff4d4f' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text strong>Clear All Application Data</Text>
                  <br />
                  <Text type="secondary">This will permanently delete all uploads, cases, and reports. Client Master and Users will be preserved.</Text>
                </div>
                <Popconfirm
                  title="Clear all data?"
                  description="This will delete all uploads, cases, and reports. Your Client Master will NOT be deleted. This cannot be undone."
                  onConfirm={handleClearData}
                  okText="Yes, delete everything"
                  cancelText="No, cancel"
                  okButtonProps={{ danger: true, loading: deleteLoading }}
                >
                  <Button danger icon={<WarningOutlined />}>Clear All Data</Button>
                </Popconfirm>
              </div>
            </Card>
          )}
        </Col>

        <Col xs={24} lg={8}>
          <Card 
            title={<><BellOutlined /> Contract Notifications</>} 
            loading={loading}
            bodyStyle={{ padding: '0 24px' }}
          >
            {notifications.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <Text type="secondary">No upcoming contract expirations in the next 30 days.</Text>
              </div>
            ) : (
              <List
                itemLayout="horizontal"
                dataSource={notifications}
                renderItem={(item) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={
                        item.level === 'critical' ? <ExclamationCircleOutlined style={{ color: '#cf1322', fontSize: '20px' }} /> :
                        item.level === 'warning' ? <WarningOutlined style={{ color: '#d48806', fontSize: '20px' }} /> :
                        <InfoCircleOutlined style={{ color: '#1B3A5C', fontSize: '20px' }} />
                      }
                      title={<Text strong>{item.clientName}</Text>}
                      description={
                        <div>
                          <p style={{ margin: 0 }}>Renews: {dayjs(item.contractEndDate).format('MMM DD, YYYY')}</p>
                          <Tag color={item.level === 'critical' ? 'error' : item.level === 'warning' ? 'warning' : 'default'} style={{ marginTop: '4px' }}>
                            {item.daysRemaining} days remaining
                          </Tag>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;

