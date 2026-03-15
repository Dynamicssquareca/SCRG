import React, { useEffect, useState } from 'react';
import { Card, Table, Typography, Space, Button, Input, Modal, Form, DatePicker, InputNumber, Switch, message, Row, Col } from 'antd';
import { SearchOutlined, EditOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../services/api';
import dayjs from 'dayjs';

const { Title } = Typography;

const ClientMasterPage: React.FC = () => {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [searchText, setSearchText] = useState('');
  
  // Modal state
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const fetchClients = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pagination.pageSize),
      });
      if (searchText) params.append('search', searchText);

      const { data } = await api.get(`/clients?${params.toString()}`);
      setClients(data.data.clients);
      setPagination({
        ...pagination,
        current: data.data.pagination.page,
        total: data.data.pagination.total,
      });
    } catch (err) {
      message.error('Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleTableChange = (newPagination: any) => {
    fetchClients(newPagination.current);
  };

  const showAddModal = () => {
    setEditingClient(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const showEditModal = (record: any) => {
    setEditingClient(record);
    form.setFieldsValue({
      clientName: record.client_name,
      accountManager: record.account_manager,
      customerSuccessMgr: record.customer_success_mgr,
      toolVersion: record.tool_version,
      contractStartDate: record.contract_start_date ? dayjs(record.contract_start_date) : null,
      contractEndDate: record.contract_end_date ? dayjs(record.contract_end_date) : null,
      totalContractedHours: Number(record.total_contracted_hours),
      previousBalanceHours: Number(record.previous_balance_hours),
      feedbackLink: record.feedback_link,
      isActive: record.is_active === 1 || record.is_active === true,
    });
    setIsModalVisible(true);
  };

  const toggleStatus = async (record: any) => {
    const clientId = record._id || record.id;
    if (!clientId) return message.error('Client ID is missing');
    
    try {
      const newStatus = !(record.is_active === 1 || record.is_active === true);
      await api.put(`/clients/${clientId}`, { isActive: newStatus });
      message.success(`Client ${newStatus ? 'activated' : 'deactivated'}`);
      fetchClients(pagination.current);
    } catch (err) {
      console.error('Status Toggle Error:', err);
      message.error('Failed to update status');
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (!id) return message.error('Client ID is missing');
    Modal.confirm({
      title: 'Delete Client',
      content: `Are you sure you want to PERMANENTLY delete ${name}? This action cannot be undone and may affect associated reports.`,
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await api.delete(`/clients/${id}`);
          message.success('Client deleted successfully');
          fetchClients(pagination.current);
        } catch (err) {
          console.error('Delete Error:', err);
          message.error('Failed to delete client');
        }
      }
    });
  };

  const handleModalSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      
      const payload = {
        ...values,
        contractStartDate: values.contractStartDate?.format('YYYY-MM-DD'),
        contractEndDate: values.contractEndDate?.format('YYYY-MM-DD'),
      };

      if (editingClient) {
        const clientId = editingClient._id || editingClient.id;
        if (!clientId) throw new Error('Client ID is missing');
        await api.put(`/clients/${clientId}`, payload);
        message.success('Client updated successfully');
      } else {
        await api.post('/clients', payload);
        message.success('Client created successfully');
      }
      
      setIsModalVisible(false);
      fetchClients(editingClient ? pagination.current : 1);
    } catch (err: any) {
      console.error('Form Submit Error:', err);
      if (err.response?.data?.error?.message) {
        message.error(err.response.data.error.message);
      } else if (err.errorFields) {
        // Validation error, do nothing
      } else {
        message.error('Operation failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { 
      title: 'Client Name', 
      dataIndex: 'client_name', 
      key: 'client_name',
      render: (text: string) => <Typography.Text strong>{text}</Typography.Text> 
    },
    { title: 'Account Manager', dataIndex: 'account_manager', key: 'account_manager' },
    { title: 'Contracted Hours', dataIndex: 'total_contracted_hours', key: 'hours' },
    { 
      title: 'Current Balance', 
      dataIndex: 'current_balance', 
      key: 'balance',
      render: (val: any) => {
        if (val === null || val === undefined) return <span style={{ color: '#999' }}>—</span>;
        const num = Number(val);
        const color = num < 0 ? '#cf1322' : '#389e0d';
        return <span style={{ color, fontWeight: 500 }}>{num.toFixed(2)}</span>;
      }
    },
    { 
      title: 'Last Month Balance', 
      dataIndex: 'last_month_balance', 
      key: 'last_month_balance',
      render: (val: any) => {
        if (val === null || val === undefined) return <span style={{ color: '#999' }}>—</span>;
        const num = Number(val);
        const color = num < 0 ? '#cf1322' : '#389e0d';
        return <span style={{ color, fontWeight: 500 }}>{num.toFixed(2)}</span>;
      }
    },
    { 
      title: 'Status', 
      key: 'status',
      render: (_: any, record: any) => {
        const isActive = record.is_active === 1 || record.is_active === true;
        return <Switch checked={isActive} size="small" onChange={() => toggleStatus(record)} />;
      }
    },
    { 
      title: 'Actions', 
      key: 'actions', 
      render: (_: any, record: any) => (
        <Space size="small">
          <Button type="text" icon={<EditOutlined />} onClick={() => showEditModal(record)} />
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record._id, record.client_name)} />
        </Space>
      ) 
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>Client Master</Title>
        </Col>
        <Col>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={showAddModal}
            style={{ background: '#1B3A5C' }}
          >
            Add New Client
          </Button>
        </Col>
      </Row>

      <Card>
        <Space style={{ marginBottom: 24 }}>
          <Input 
            placeholder="Search clients..." 
            prefix={<SearchOutlined />} 
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onPressEnter={() => fetchClients(1)}
            style={{ width: 300 }}
          />
          <Button onClick={() => fetchClients(1)}>Search</Button>
        </Space>

        <Table
          dataSource={clients}
          columns={columns}
          rowKey={(record) => record._id || record.id}
          loading={loading}
          pagination={pagination}
          onChange={handleTableChange}
        />
      </Card>

      <Modal
        title={editingClient ? 'Edit Client' : 'Add New Client'}
        open={isModalVisible}
        onOk={handleModalSubmit}
        onCancel={() => setIsModalVisible(false)}
        confirmLoading={submitting}
        width={700}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="clientName" label="Client Name" rules={[{ required: true }]}>
                <Input placeholder="E.g. Iridex Corporation" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="accountManager" label="Account Manager">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="customerSuccessMgr" label="Customer Success Manager">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="toolVersion" label="Tool Version (NAV / BC)">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="feedbackLink" label="Feedback Survey URL">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="contractStartDate" label="Contract Start Date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="contractEndDate" label="Contract End Date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="totalContractedHours" label="Total Contracted Hours" initialValue={0}>
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item 
                name="previousBalanceHours" 
                label="Current Balance Hours" 
                initialValue={0}
                tooltip="This carries over automatically after report generation"
              >
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            {editingClient && (
              <Col span={24}>
                <Form.Item name="isActive" label="Active Status" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Col>
            )}
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default ClientMasterPage;
