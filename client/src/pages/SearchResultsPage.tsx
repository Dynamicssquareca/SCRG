import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Input, Tabs, Table, Tag, Card, Button, Spin, Empty, Typography, Breadcrumb, Space } from 'antd';
import {
  SearchOutlined,
  ArrowLeftOutlined,
  FileTextOutlined,
  TeamOutlined,
  FileExcelOutlined,
  UserOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import api from '../services/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface CaseItem {
  _id: string;
  case_number: string;
  customer_name: string;
  contact?: string | null;
  created_on?: string | null;
  case_title?: string | null;
  support_agent?: string | null;
  status_reason?: string | null;
  priority?: string | null;
  country?: string | null;
  billable_duration?: number;
  total_days?: number;
  comments?: string | null;
  client_id?: { client_name: string } | null;
}

interface ClientItem {
  _id: string;
  client_name: string;
  account_manager?: string | null;
  customer_success_mgr?: string | null;
  is_active: boolean;
  total_contracted_hours?: number;
  tool_version?: string | null;
  createdAt?: string;
}

interface ReportItem {
  _id: string;
  month: number;
  year: number;
  status: 'draft' | 'published';
  file_name?: string | null;
  tickets_opened?: number;
  tickets_closed?: number;
  hours_consumed?: number;
  generated_at?: string;
  client_id?: { client_name: string } | null;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const SearchResultsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryParam = searchParams.get('q') || '';

  const [searchTerm, setSearchTerm] = useState(queryParam);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('top');
  const [data, setData] = useState<{ clients: ClientItem[]; cases: CaseItem[]; reports: ReportItem[] }>({
    clients: [],
    cases: [],
    reports: [],
  });

  useEffect(() => {
    setSearchTerm(queryParam);
    if (!queryParam.trim()) {
      setData({ clients: [], cases: [], reports: [] });
      return;
    }

    let isMounted = true;
    setLoading(true);

    api.get(`/search?q=${encodeURIComponent(queryParam)}&full=true`)
      .then(res => {
        if (isMounted) {
          setData(res.data?.data || { clients: [], cases: [], reports: [] });
        }
      })
      .catch(err => {
        console.error('Search error:', err);
        if (isMounted) setData({ clients: [], cases: [], reports: [] });
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [queryParam]);

  const handleSearch = (value: string) => {
    if (value.trim()) {
      setSearchParams({ q: value.trim() });
    }
  };

  const totalResults = data.cases.length + data.clients.length + data.reports.length;

  // Case Table Columns
  const caseColumns = [
    {
      title: 'Case Title',
      dataIndex: 'case_title',
      key: 'case_title',
      render: (text: string, record: CaseItem) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: '#1890ff', cursor: 'pointer' }} onClick={() => navigate('/')}>
            {text || 'Untitled Case'}
          </Text>
          {record.comments && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {record.comments.slice(0, 60)}{record.comments.length > 60 ? '...' : ''}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Case Number',
      dataIndex: 'case_number',
      key: 'case_number',
      render: (text: string) => <Tag color="red" style={{ fontWeight: 700 }}>{text}</Tag>,
    },
    {
      title: 'Account / Customer',
      dataIndex: 'customer_name',
      key: 'customer_name',
      render: (text: string, record: CaseItem) => (
        <div>
          <Text strong>{text || record.client_id?.client_name || '-'}</Text>
        </div>
      ),
    },
    {
      title: 'Contact',
      dataIndex: 'contact',
      key: 'contact',
      render: (text: string) => text ? <><UserOutlined style={{ color: '#8c8c8c', marginRight: 4 }} />{text}</> : <Text type="secondary">-</Text>,
    },
    {
      title: 'Created On',
      dataIndex: 'created_on',
      key: 'created_on',
      render: (date: string) => date ? dayjs(date).format('DD/MM/YYYY h:mm A') : '-',
    },
    {
      title: 'Support Agent',
      dataIndex: 'support_agent',
      key: 'support_agent',
      render: (agent: string) => agent ? <Tag color="blue">{agent}</Tag> : '-',
    },
    {
      title: 'Status',
      dataIndex: 'status_reason',
      key: 'status_reason',
      render: (status: string) => {
        if (!status) return '-';
        const isClosed = status.toLowerCase().includes('closed') || status.toLowerCase().includes('resolved');
        return <Tag icon={isClosed ? <CheckCircleOutlined /> : <ClockCircleOutlined />} color={isClosed ? 'success' : 'processing'}>{status}</Tag>;
      },
    },
    {
      title: 'Billable Duration',
      dataIndex: 'billable_duration',
      key: 'billable_duration',
      render: (val: number) => val !== undefined && val !== null ? `${val} hrs` : '-',
    },
  ];

  // Client Table Columns
  const clientColumns = [
    {
      title: 'Account Name',
      dataIndex: 'client_name',
      key: 'client_name',
      render: (text: string) => (
        <Text strong style={{ color: '#1890ff', cursor: 'pointer' }} onClick={() => navigate('/clients')}>
          {text}
        </Text>
      ),
    },
    {
      title: 'Account Manager',
      dataIndex: 'account_manager',
      key: 'account_manager',
      render: (text: string) => text || '-',
    },
    {
      title: 'Customer Success Mgr',
      dataIndex: 'customer_success_mgr',
      key: 'customer_success_mgr',
      render: (text: string) => text || '-',
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'red'}>{active ? 'Active' : 'Inactive'}</Tag>
      ),
    },
    {
      title: 'Contracted Hours',
      dataIndex: 'total_contracted_hours',
      key: 'total_contracted_hours',
      render: (val: number) => val ? `${val} hrs` : '-',
    },
    {
      title: 'Created On',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => date ? dayjs(date).format('DD/MM/YYYY') : '-',
    },
  ];

  // Report Table Columns
  const reportColumns = [
    {
      title: 'Client Name',
      dataIndex: 'client_id',
      key: 'client_id',
      render: (client: any) => <Text strong>{client?.client_name || '-'}</Text>,
    },
    {
      title: 'Period',
      key: 'period',
      render: (_: any, r: ReportItem) => (
        <Tag color="purple" style={{ fontWeight: 600 }}>
          {MONTH_NAMES[(r.month || 1) - 1]} {r.year}
        </Tag>
      ),
    },
    {
      title: 'File Name',
      dataIndex: 'file_name',
      key: 'file_name',
      render: (file: string) => file ? <><FileExcelOutlined style={{ color: '#52c41a', marginRight: 6 }} />{file}</> : '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'published' ? 'success' : 'warning'}>
          {status === 'published' ? 'Published' : 'Draft'}
        </Tag>
      ),
    },
    {
      title: 'Generated At',
      dataIndex: 'generated_at',
      key: 'generated_at',
      render: (date: string) => date ? dayjs(date).format('DD/MM/YYYY h:mm A') : '-',
    },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', paddingBottom: 40 }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
            style={{ fontSize: 16, height: 40, width: 40, borderRadius: 10 }}
          />
          <div>
            <Breadcrumb items={[{ title: 'Support Hub' }, { title: 'Search' }]} style={{ fontSize: 12, marginBottom: 2 }} />
            <Title level={3} style={{ margin: 0, fontWeight: 700, letterSpacing: '-0.5px' }}>
              Search results
            </Title>
          </div>
        </div>

        {/* Search Bar Input */}
        <Input.Search
          placeholder="Search tickets, accounts, contacts..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          onSearch={handleSearch}
          enterButton="Search"
          size="large"
          style={{ width: 440, maxWidth: '100%' }}
        />
      </div>

      {/* Subhead status */}
      <div style={{ marginBottom: 20, color: '#595959', fontSize: 13, fontWeight: 500 }}>
        {queryParam ? (
          <>
            Showing <strong style={{ color: '#0F1117' }}>{totalResults}</strong> results for{' '}
            <strong style={{ color: '#E8363D' }}>"{queryParam}"</strong> in Support Case Report Generator
          </>
        ) : (
          'Enter a search query above to search cases, accounts, and reports'
        )}
      </div>

      {loading ? (
        <div style={{ padding: '80px 0', textAlign: 'center' }}>
          <Spin size="large" tip="Searching database..." />
        </div>
      ) : !queryParam ? (
        <Card style={{ borderRadius: 16, textAlign: 'center', padding: '60px 20px' }}>
          <Empty description="Start typing to search cases, clients, contacts and reports" />
        </Card>
      ) : totalResults === 0 ? (
        <Card style={{ borderRadius: 16, textAlign: 'center', padding: '60px 20px' }}>
          <Empty description={`No results found for "${queryParam}"`} />
        </Card>
      ) : (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          type="line"
          size="large"
          style={{ marginBottom: 24 }}
          items={[
            {
              key: 'top',
              label: `Top results (${totalResults})`,
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {/* Cases Section */}
                  {data.cases.length > 0 && (
                    <Card
                      title={
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Space>
                            <FileTextOutlined style={{ color: '#E8363D' }} />
                            <span>Cases ({data.cases.length})</span>
                          </Space>
                          {data.cases.length > 5 && (
                            <Button type="link" onClick={() => setActiveTab('cases')} style={{ padding: 0 }}>
                              Show more →
                            </Button>
                          )}
                        </div>
                      }
                    >
                      <Table
                        columns={caseColumns}
                        dataSource={data.cases.slice(0, 5)}
                        rowKey="_id"
                        pagination={false}
                        size="middle"
                      />
                    </Card>
                  )}

                  {/* Accounts / Clients Section */}
                  {data.clients.length > 0 && (
                    <Card
                      title={
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Space>
                            <TeamOutlined style={{ color: '#1890ff' }} />
                            <span>Accounts ({data.clients.length})</span>
                          </Space>
                          {data.clients.length > 5 && (
                            <Button type="link" onClick={() => setActiveTab('clients')} style={{ padding: 0 }}>
                              Show more →
                            </Button>
                          )}
                        </div>
                      }
                    >
                      <Table
                        columns={clientColumns}
                        dataSource={data.clients.slice(0, 5)}
                        rowKey="_id"
                        pagination={false}
                        size="middle"
                      />
                    </Card>
                  )}

                  {/* Reports Section */}
                  {data.reports.length > 0 && (
                    <Card
                      title={
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Space>
                            <FileExcelOutlined style={{ color: '#52c41a' }} />
                            <span>Reports ({data.reports.length})</span>
                          </Space>
                          {data.reports.length > 5 && (
                            <Button type="link" onClick={() => setActiveTab('reports')} style={{ padding: 0 }}>
                              Show more →
                            </Button>
                          )}
                        </div>
                      }
                    >
                      <Table
                        columns={reportColumns}
                        dataSource={data.reports.slice(0, 5)}
                        rowKey="_id"
                        pagination={false}
                        size="middle"
                      />
                    </Card>
                  )}
                </div>
              ),
            },
            {
              key: 'cases',
              label: `Cases (${data.cases.length})`,
              children: (
                <Card>
                  <Table
                    columns={caseColumns}
                    dataSource={data.cases}
                    rowKey="_id"
                    pagination={{ pageSize: 10, showSizeChanger: true }}
                  />
                </Card>
              ),
            },
            {
              key: 'clients',
              label: `Accounts (${data.clients.length})`,
              children: (
                <Card>
                  <Table
                    columns={clientColumns}
                    dataSource={data.clients}
                    rowKey="_id"
                    pagination={{ pageSize: 10, showSizeChanger: true }}
                  />
                </Card>
              ),
            },
            {
              key: 'reports',
              label: `Reports (${data.reports.length})`,
              children: (
                <Card>
                  <Table
                    columns={reportColumns}
                    dataSource={data.reports}
                    rowKey="_id"
                    pagination={{ pageSize: 10, showSizeChanger: true }}
                  />
                </Card>
              ),
            },
          ]}
        />
      )}
    </div>
  );
};

export default SearchResultsPage;
