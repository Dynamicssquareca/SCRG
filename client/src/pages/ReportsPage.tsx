import React, { useEffect, useState } from 'react';
import { Card, Table, Typography, Space, Button, Input, Select, Tag, message } from 'antd';
import { SearchOutlined, DownloadOutlined, FileZipOutlined } from '@ant-design/icons';
import api from '../services/api';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;

const ReportsPage: React.FC = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  
  // Filters
  const [searchText, setSearchText] = useState('');
  const [month, setMonth] = useState<number | undefined>(undefined);
  const [year, setYear] = useState<number | undefined>(undefined);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);
  const months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' },
    { value: 3, label: 'March' }, { value: 4, label: 'April' },
    { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' },
    { value: 9, label: 'September' }, { value: 10, label: 'October' },
    { value: 11, label: 'November' }, { value: 12, label: 'December' },
  ];

  const fetchReports = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pagination.pageSize),
      });
      if (searchText) params.append('clientName', searchText);
      if (month) params.append('month', String(month));
      if (year) params.append('year', String(year));

      const { data } = await api.get(`/reports?${params.toString()}`);
      setReports(data.data.reports);
      setPagination({
        ...pagination,
        current: data.data.pagination.page,
        total: data.data.pagination.total,
      });
    } catch (err) {
      message.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [month, year]); // Search triggers on enter, pagination triggers via table change

  const handleTableChange = (newPagination: any) => {
    fetchReports(newPagination.current);
  };

  const downloadReport = async (reportId: number, fileName: string) => {
    try {
      const response = await api.get(`/reports/${reportId}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      message.error('Download failed');
    }
  };

  const downloadAllZip = async () => {
    if (!month || !year) {
      return message.warning('Please select both Month and Year to download a ZIP archive');
    }
    
    try {
      const response = await api.get(`/reports/download-all?month=${month}&year=${year}`, { responseType: 'blob' });
      
      const monthLabel = months.find(m => m.value === month)?.label.substring(0, 3) || '';
      const zipName = `Reports_${monthLabel}${year}.zip`;
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', zipName);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      message.error('Failed to download ZIP archive');
    }
  };

  const columns = [
    { 
      title: 'Client Name', 
      dataIndex: 'client_name', 
      key: 'client_name',
      render: (text: string) => <Typography.Text strong>{text}</Typography.Text> 
    },
    { 
      title: 'Period', 
      key: 'period', 
      render: (_: any, record: any) => {
        const m = months.find(m => m.value === record.month)?.label || '';
        return `${m} ${record.year}`;
      } 
    },
    { 
      title: 'Tickets', 
      key: 'tickets',
      render: (_: any, record: any) => (
        <Space size="small">
          <Tag color="error">Open: {record.tickets_opened}</Tag>
          <Tag color="success">Closed: {record.tickets_closed}</Tag>
        </Space>
      )
    },
    { 
      title: 'Generated At', 
      dataIndex: 'generated_at', 
      key: 'generated_at',
      render: (val: string) => dayjs(val).format('DD MMM YYYY, HH:mm')
    },
    { 
      title: 'Actions', 
      key: 'actions', 
      render: (_: any, record: any) => (
        <Button 
          type="primary" 
          icon={<DownloadOutlined />} 
          size="small"
          onClick={() => downloadReport(record.id, record.file_name)}
          style={{ background: '#006B7B' }}
        >
          Download XLSX
        </Button>
      ) 
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>Generated Reports</Title>
        </Col>
        <Col>
          <Button 
            type="primary" 
            icon={<FileZipOutlined />} 
            onClick={downloadAllZip}
            disabled={!month || !year}
            style={{ background: '#1B3A5C' }}
          >
            Download Filtered ZIP
          </Button>
        </Col>
      </Row>

      <Card>
        <Space style={{ marginBottom: 24 }} wrap>
          <Input 
            placeholder="Search clients..." 
            prefix={<SearchOutlined />} 
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onPressEnter={() => fetchReports(1)}
            style={{ width: 250 }}
          />
          <Button onClick={() => fetchReports(1)}>Search</Button>
          
          <Select 
            placeholder="Month" 
            style={{ width: 120, marginLeft: 16 }} 
            allowClear
            value={month}
            onChange={setMonth}
            options={months}
          />
          <Select 
            placeholder="Year" 
            style={{ width: 100 }} 
            allowClear
            value={year}
            onChange={setYear}
          >
            {years.map(y => <Option key={y} value={y}>{y}</Option>)}
          </Select>
        </Space>

        <Table
          dataSource={reports}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={pagination}
          onChange={handleTableChange}
        />
      </Card>
    </div>
  );
};

// Assuming Row and Col from antd need to be imported:
import { Row, Col } from 'antd';

export default ReportsPage;
