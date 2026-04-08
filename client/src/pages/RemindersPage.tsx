import React, { useEffect, useState } from 'react';
import { Card, Table, Typography, Switch, Button, Tag, Space, message, Modal, Form, Select, Tabs, List, TimePicker, Popconfirm } from 'antd';
import { BellOutlined, SettingOutlined, UserOutlined, ClockCircleOutlined, SendOutlined, DeleteOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import api from '../services/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const RemindersPage: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayTz, setDisplayTz] = useState<string>(dayjs.tz?.guess() || 'UTC');
  
  // Edit Modal State
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: remData }, { data: logData }] = await Promise.all([
        api.get('/reminders'),
        api.get('/reminders/logs?limit=30')
      ]);
      setData(remData.data);
      setLogs(logData.data);
    } catch {
      message.error('Failed to load reminders');
    } finally {
      setLoading(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      await api.delete('/reminders/logs');
      message.success('Email history cleared');
      setLogs([]);
    } catch {
      message.error('Failed to clear logs');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggle = async (clientId: string, checked: boolean) => {
    const backup = [...data];
    setData(data.map(d => d.client._id === clientId ? { ...d, setting: { ...d.setting, is_enabled: checked } } : d));
    try {
      const clientData = backup.find(d => d.client._id === clientId);
      await api.post(`/reminders/${clientId}`, {
        ...clientData?.setting,
        is_enabled: checked
      });
      message.success(checked ? 'Reminders enabled' : 'Reminders disabled');
    } catch {
      setData(backup);
      message.error('Failed to update toggle');
    }
  };

  const handleEdit = (record: any) => {
    setEditingClient(record);
    form.setFieldsValue({
      reminder_days: record.setting.reminder_days || [30],
      recipient_emails: record.setting.recipient_emails || [],
      cc_emails: record.setting.cc_emails || [],
      send_time: record.setting.send_time ? dayjs(record.setting.send_time, 'HH:mm') : dayjs('09:00', 'HH:mm'),
    });
    setIsModalVisible(true);
  };

  const handleSaveConfig = async () => {
    try {
      const values = await form.validateFields();
      if (values.send_time) {
        values.send_time = values.send_time.format('HH:mm');
      }
      
      await api.post(`/reminders/${editingClient.client._id}`, {
        is_enabled: editingClient.setting.is_enabled,
        ...values
      });
      message.success('Configuration saved');
      setIsModalVisible(false);
      fetchData();
    } catch {
      message.error('Failed to save configuration');
    }
  };

  const handleTestEmail = async (clientId: string, recipients: string[], ccRecipients: string[] = []) => {
    if (recipients.length === 0) {
      return message.warning('Please add at least one recipient email first.');
    }
    try {
      await api.post(`/reminders/${clientId}/test`, { 
        to: recipients,
        cc: ccRecipients
      });
      message.success('Test email has been fired!');
    } catch {
      message.error('Failed to send test email');
    }
  };

  const columns = [
    {
      title: 'Client Name',
      dataIndex: ['client', 'client_name'],
      render: (text: string) => <Text strong style={{ fontSize: 13 }}>{text}</Text>,
    },
    {
      title: 'Contract Ends',
      dataIndex: ['client', 'contract_end_date'],
      render: (date: string) => date ? dayjs(date).tz(displayTz).format('DD MMM YYYY') : <Text type="secondary">Not set</Text>,
    },
    {
      title: 'Reminders Enabled',
      align: 'center' as const,
      width: 160,
      render: (record: any) => (
        <Switch 
          checkedChildren="Enabled"
          unCheckedChildren="Disabled"
          checked={record.setting.is_enabled} 
          onChange={(checked) => handleToggle(record.client._id, checked)} 
          disabled={!record.client.contract_end_date}
        />
      ),
    },
    {
      title: 'Triggers (Days Before)',
      render: (record: any) => (
        <Space size={[0, 4]} wrap>
          {record.setting.reminder_days?.map((day: number) => (
            <Tag color="red" key={day}>{day} Days</Tag>
          ))}
          {!record.setting.reminder_days?.length && <Text type="secondary">—</Text>}
        </Space>
      ),
    },
    {
      title: 'Recipients',
      render: (record: any) => (
        <Space size={[0, 4]} wrap>
          {record.setting.recipient_emails?.slice(0, 2).map((email: string) => (
            <Tag icon={<UserOutlined />} key={email}>{email.split('@')[0]}</Tag>
          ))}
          {(record.setting.recipient_emails?.length || 0) > 2 && (
            <Tag>+{(record.setting.recipient_emails?.length || 0) - 2} more</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Action',
      render: (record: any) => (
        <Space>
          <Button size="small" icon={<SettingOutlined />} onClick={() => handleEdit(record)}>
            Configure
          </Button>
          <Button 
            size="small" 
            type="dashed" 
            icon={<SendOutlined />}
            onClick={() => handleTestEmail(record.client._id, record.setting.recipient_emails || [], record.setting.cc_emails || [])}
            disabled={!record.client.contract_end_date}
          >
            Test
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0F1117', letterSpacing: '-0.4px' }}>
            Automated Reminders
          </h1>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Manage contract expiration emails and alerts.
          </Text>
        </motion.div>
        
        <Select
          value={displayTz}
          onChange={setDisplayTz}
          style={{ width: 220 }}
          options={[
            { value: dayjs.tz?.guess() || 'UTC', label: 'Local Time' },
            { value: 'UTC', label: 'UTC' },
            { value: 'America/New_York', label: 'EST / EDT (New York)' },
            { value: 'America/Los_Angeles', label: 'PST / PDT (Los Angeles)' },
            { value: 'Asia/Kolkata', label: 'IST (India)' },
            { value: 'Europe/London', label: 'GMT / BST (London)' },
            { value: 'Australia/Sydney', label: 'AEST / AEDT (Sydney)' }
          ]}
        />
      </div>

      <Tabs defaultActiveKey="clients" items={[
        {
          key: 'clients',
          label: 'Client Configurations',
          children: (
            <Card styles={{ body: { padding: 0 } }}>
              <Table 
                dataSource={data} 
                columns={columns} 
                rowKey={(r) => r.client._id}
                loading={loading}
                pagination={false}
                size="middle"
              />
            </Card>
          )
        },
        {
          key: 'logs',
          label: 'Email History',
          children: (
            <Card
              extra={
                <Popconfirm
                  title="Clear Email History"
                  description="Are you sure you want to delete all historical email logs?"
                  onConfirm={handleClearLogs}
                  okText="Yes"
                  cancelText="No"
                  placement="left"
                >
                  <Button danger icon={<DeleteOutlined />}>Clear History</Button>
                </Popconfirm>
              }
            >
              <List
                loading={loading}
                dataSource={logs}
                renderItem={item => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<ClockCircleOutlined style={{ fontSize: 24, color: item.status === 'sent' ? '#10b981' : '#ef4444' }} />}
                      title={<Text strong>{item.client_id?.client_name || 'Unknown'}</Text>}
                      description={
                        <div>
                          <Tag color={item.status === 'sent' ? 'green' : 'red'}>{item.status.toUpperCase()}</Tag>
                          <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
                            {item.days_before}-day trigger at {dayjs(item.sent_at).tz(displayTz).format('DD MMM YYYY, HH:mm')}
                          </Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: 12 }}>To: {item.sent_to.join(', ')}</Text>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>
          )
        }
      ]} />

      <Modal
        title={`Configure Reminders: ${editingClient?.client?.client_name}`}
        open={isModalVisible}
        onOk={handleSaveConfig}
        onCancel={() => setIsModalVisible(false)}
        okText="Save Configuration"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item 
            name="reminder_days" 
            label="Trigger Days (Before Expiration)"
            rules={[{ required: true, message: 'Please select at least one trigger' }]}
          >
            <Select mode="tags" placeholder="Select or type numbers (e.g. 30, 15, 7)">
              <Select.Option value={60}>60 Days</Select.Option>
              <Select.Option value={30}>30 Days</Select.Option>
              <Select.Option value={15}>15 Days</Select.Option>
              <Select.Option value={7}>7 Days</Select.Option>
              <Select.Option value={3}>3 Days</Select.Option>
              <Select.Option value={0}>On Expiration (0 Days)</Select.Option>
              <Select.Option value={-7}>7 Days Overdue</Select.Option>
              <Select.Option value={-15}>15 Days Overdue</Select.Option>
              <Select.Option value={-30}>30 Days Overdue</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item 
            name="recipient_emails" 
            label="Recipient Emails (To)"
            rules={[{ required: true, message: 'At least one recipient is required' }]}
          >
            <Select mode="tags" placeholder="Type email and press Enter" />
          </Form.Item>

          <Form.Item 
            name="cc_emails" 
            label="CC Emails (Optional)"
          >
            <Select mode="tags" placeholder="Type email and press Enter" />
          </Form.Item>

          <Form.Item 
            name="send_time" 
            label="Exact Trigger Time"
            extra="The exact time of day you want this email to officially fire."
            rules={[{ required: true, message: 'Please select a trigger time' }]}
          >
            <TimePicker format="HH:mm" style={{ width: 200 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RemindersPage;
