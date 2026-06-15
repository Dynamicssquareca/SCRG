import React, { useEffect, useState } from 'react';
import { Card, Table, Typography, Switch, Button, Tag, Space, message, Modal, Form, Select, Tabs, List, TimePicker, Popconfirm, InputNumber, Tooltip } from 'antd';
import { BellOutlined, SettingOutlined, UserOutlined, ClockCircleOutlined, SendOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import api from '../services/api';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

const { Title, Text } = Typography;

// ── Timezone helpers (no external libraries needed) ──────────────────────────
/**
 * Returns how many minutes `tz` is ahead of UTC right now.
 * e.g. Asia/Calcutta → +330,  America/New_York (EDT) → -240
 */
function tzOffsetMinutes(tz: string): number {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value);
    // Reconstruct the wall-clock time in `tz` as if it were UTC
    const wallMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    return Math.round((wallMs - now.getTime()) / 60000);
  } catch {
    return 0;
  }
}

/** Convert "HH:mm" representing a time in `tz` → "HH:mm" in UTC. */
function tzHHmmToUtcHHmm(hhMm: string, tz: string): string {
  const [h, m] = hhMm.split(':').map(Number);
  const offset = tzOffsetMinutes(tz);
  const utcMin = ((h * 60 + m - offset) % 1440 + 1440) % 1440;
  return `${String(Math.floor(utcMin / 60)).padStart(2, '0')}:${String(utcMin % 60).padStart(2, '0')}`;
}

/** Convert "HH:mm" in UTC → "HH:mm" in `tz`. */
function utcHHmmToTzHHmm(utcHHmm: string, tz: string): string {
  const [h, m] = utcHHmm.split(':').map(Number);
  const offset = tzOffsetMinutes(tz);
  const tzMin = ((h * 60 + m + offset) % 1440 + 1440) % 1440;
  return `${String(Math.floor(tzMin / 60)).padStart(2, '0')}:${String(tzMin % 60).padStart(2, '0')}`;
}
// ─────────────────────────────────────────────────────────────────────────────

const RemindersPage: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayTz, setDisplayTz] = useState<string>(dayjs.tz?.guess() || 'UTC');
  const [emailSuggestions, setEmailSuggestions] = useState<{email: string; is_user: boolean}[]>([]);
  
  // Edit Modal State
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [form] = Form.useForm();
  const [customDay, setCustomDay] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: remData }, { data: logData }] = await Promise.all([
        api.get('/reminders'),
        api.get('/reminders/logs?limit=30')
      ]);
      setData(remData.data);
      setLogs(logData.data);

      try {
        const suggRes = await api.get('/dashboard/report/recipient-suggestions');
        setEmailSuggestions(suggRes.data.data || []);
      } catch (err) {
        console.error('Failed to load email suggestions', err);
      }
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
    setCustomDay(null);

    // send_time is stored as UTC "HH:mm" in the DB.
    // Convert it to the currently selected display timezone for the TimePicker.
    const storedUtcTime = record.setting.send_time || '09:00';
    const localHHmm = utcHHmmToTzHHmm(storedUtcTime, displayTz);
    const [lh, lm] = localHHmm.split(':').map(Number);

    form.setFieldsValue({
      reminder_days: record.setting.reminder_days || [30],
      recipient_emails: record.setting.recipient_emails || [],
      cc_emails: record.setting.cc_emails || [],
      send_time: dayjs().hour(lh).minute(lm).second(0),
    });
    setIsModalVisible(true);
  };

  const handleAddCustomDay = () => {
    if (customDay === null) return;
    const current: number[] = form.getFieldValue('reminder_days') || [];
    if (current.includes(customDay)) {
      message.warning(`${customDay} days is already added`);
      return;
    }
    form.setFieldValue('reminder_days', [...current, customDay].sort((a, b) => b - a));
    setCustomDay(null);
  };

  const handleSaveConfig = async () => {
    try {
      const values = await form.validateFields();
      if (values.send_time) {
        // User entered time in `displayTz`. Convert to UTC before storing.
        const localHHmm = values.send_time.format('HH:mm');
        values.send_time = tzHHmmToUtcHHmm(localHHmm, displayTz);
      }

      await api.post(`/reminders/${editingClient.client._id}`, {
        is_enabled: editingClient.setting.is_enabled,
        send_timezone: displayTz, // stored for display reference
        ...values
      });

      // Refresh suggestions
      try {
        const suggRes = await api.get('/dashboard/report/recipient-suggestions');
        setEmailSuggestions(suggRes.data.data || []);
      } catch (err) {
        console.error('Failed to load email suggestions', err);
      }

      message.success('Configuration saved');
      setIsModalVisible(false);
      fetchData();
    } catch {
      message.error('Failed to save configuration');
    }
  };

  const handleRemoveSuggestion = async (email: string) => {
    try {
      await api.post('/dashboard/report/recipient-suggestions/remove', { email });
      message.success(`Removed '${email}' from suggestions.`);
      const suggRes = await api.get('/dashboard/report/recipient-suggestions');
      setEmailSuggestions(suggRes.data.data || []);
    } catch (err) {
      message.error('Failed to remove email suggestion.');
    }
  };

  const getEmailOptions = () => {
    return emailSuggestions.map(item => ({
      value: item.email,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span>{item.email}</span>
          {!item.is_user && (
            <span
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleRemoveSuggestion(item.email);
              }}
              style={{
                color: '#ff4d4f',
                cursor: 'pointer',
                fontWeight: 'bold',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '14px',
                lineHeight: 1,
                marginLeft: '8px'
              }}
              title="Remove email from suggestions"
            >
              ✕
            </span>
          )}
        </div>
      )
    }));
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
          {!record.setting.reminder_days?.length && <Text type="secondary">-</Text>}
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
            <Select
              mode="multiple"
              placeholder="Select trigger days"
              optionLabelProp="label"
            >
              <Select.Option value={60} label="60 Days">60 Days</Select.Option>
              <Select.Option value={30} label="30 Days">30 Days</Select.Option>
              <Select.Option value={15} label="15 Days">15 Days</Select.Option>
              <Select.Option value={7} label="7 Days">7 Days</Select.Option>
              <Select.Option value={3} label="3 Days">3 Days</Select.Option>
              <Select.Option value={0} label="On Expiration">On Expiration (0 Days)</Select.Option>
              <Select.Option value={-7} label="7 Days Overdue">7 Days Overdue</Select.Option>
              <Select.Option value={-15} label="15 Days Overdue">15 Days Overdue</Select.Option>
              <Select.Option value={-30} label="30 Days Overdue">30 Days Overdue</Select.Option>
            </Select>
          </Form.Item>

          {/* Custom day picker */}
          <Form.Item label="Add Custom Day">
            <Space.Compact style={{ width: '100%' }}>
              <Tooltip title="Enter any number of days before expiration (use negative for overdue, e.g. -10)">
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="e.g. 45 days before, or -10 for overdue"
                  value={customDay}
                  onChange={(v) => setCustomDay(v as number | null)}
                  onPressEnter={handleAddCustomDay}
                  addonBefore="Days"
                />
              </Tooltip>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddCustomDay}
                disabled={customDay === null}
                style={{ background: '#1B3A5C' }}
              >
                Add
              </Button>
            </Space.Compact>
            <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
              Type any number and click Add - positive = before expiry, negative = overdue.
            </Text>
          </Form.Item>

          <Form.Item 
            name="recipient_emails" 
            label="Recipient Emails (To)"
            rules={[{ required: true, message: 'At least one recipient is required' }]}
          >
            <Select
              mode="tags"
              placeholder="Type email and press Enter"
              options={getEmailOptions()}
              optionLabelProp="value"
              menuItemSelectedIcon={null}
            />
          </Form.Item>

          <Form.Item 
            name="cc_emails" 
            label="CC Emails (Optional)"
          >
            <Select
              mode="tags"
              placeholder="Type email and press Enter"
              options={getEmailOptions()}
              optionLabelProp="value"
              menuItemSelectedIcon={null}
            />
          </Form.Item>

          <Form.Item 
            name="send_time" 
            label={`Exact Trigger Time (${displayTz})`}
            extra={`Time is saved in the currently selected timezone: ${displayTz}. Change the timezone dropdown above to configure in a different zone.`}
            rules={[{ required: true, message: 'Please select a trigger time' }]}
          >
            <TimePicker format="HH:mm" minuteStep={10} style={{ width: 200 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RemindersPage;
