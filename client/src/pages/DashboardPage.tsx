import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Typography, Table, Tag, Button, Modal, message, Popconfirm, Divider } from 'antd';
import { UserOutlined, FileTextOutlined, CloudUploadOutlined, IssuesCloseOutlined, WarningOutlined } from '@ant-design/icons';
import api from '../services/api';
import dayjs from 'dayjs';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>({});
  const [uploads, setUploads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, uploadsRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/uploads?limit=5')
      ]);
      setStats(statsRes.data.data);
      setUploads(uploadsRes.data.data.uploads);
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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
      <Title level={4} style={{ marginTop: 0 }}>Dashboard Overview</Title>
      
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
            <Statistic title="Reports Generated" value={stats.totalReportsGenerated || 0} prefix={<FileTextOutlined style={{ color: '#1B3A5C' }} />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card loading={loading}>
            <Statistic title="Total Cases Tracked" value={stats.totalCases || 0} prefix={<IssuesCloseOutlined style={{ color: '#006B7B' }} />} />
          </Card>
        </Col>
      </Row>

      <Card title="Recent Data Uploads" loading={loading} style={{ marginTop: 24 }}>
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
              <Text type="secondary">This will permanently delete all clients, cases, uploads, and reports. Users will not be deleted.</Text>
            </div>
            <Popconfirm
              title="Delete all data?"
              description="Are you absolutely sure you want to delete all clients, cases, and reports? This cannot be undone."
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
    </div>
  );
};

export default DashboardPage;

