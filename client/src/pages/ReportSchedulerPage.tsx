import React, { useEffect, useState } from 'react';
import { Card, Button, Switch, Form, Select, TimePicker, InputNumber, Space, Typography, message, Modal, Row, Col, Alert } from 'antd';
import { MailOutlined, SettingOutlined, EyeOutlined, SendOutlined, SaveOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import api from '../services/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

// ── Timezone helpers (same as RemindersPage) ──────────────────────────────────
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
    const wallMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    return Math.round((wallMs - now.getTime()) / 60000);
  } catch {
    return 0;
  }
}

function tzHHmmToUtcHHmm(hhMm: string, tz: string): string {
  const [h, m] = hhMm.split(':').map(Number);
  const offset = tzOffsetMinutes(tz);
  const utcMin = ((h * 60 + m - offset) % 1440 + 1440) % 1440;
  return `${String(Math.floor(utcMin / 60)).padStart(2, '0')}:${String(utcMin % 60).padStart(2, '0')}`;
}

function utcHHmmToTzHHmm(utcHHmm: string, tz: string): string {
  const [h, m] = utcHHmm.split(':').map(Number);
  const offset = tzOffsetMinutes(tz);
  const tzMin = ((h * 60 + m + offset) % 1440 + 1440) % 1440;
  return `${String(Math.floor(tzMin / 60)).padStart(2, '0')}:${String(tzMin % 60).padStart(2, '0')}`;
}
// ─────────────────────────────────────────────────────────────────────────────

const ReportSchedulerPage: React.FC = () => {
  const [form] = Form.useForm();
  const [testForm] = Form.useForm();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [displayTz, setDisplayTz] = useState<string>('Asia/Kolkata');
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  
  // Preview / Test States
  const [previewMonth, setPreviewMonth] = useState<number>(new Date().getMonth() + 1);
  const [previewYear, setPreviewYear] = useState<number>(new Date().getFullYear());
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  const [isTestModalVisible, setIsTestModalVisible] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' },
    { value: 3, label: 'March' }, { value: 4, label: 'April' },
    { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' },
    { value: 9, label: 'September' }, { value: 10, label: 'October' },
    { value: 11, label: 'November' }, { value: 12, label: 'December' },
  ];
  
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/dashboard/report/settings');
      const settings = data.data;

      try {
        const suggRes = await api.get('/dashboard/report/recipient-suggestions');
        setEmailSuggestions(suggRes.data.data || []);
      } catch (err) {
        console.error('Failed to load email suggestions', err);
      }
      
      setIsEnabled(settings.is_enabled);
      if (settings.send_timezone) {
        setDisplayTz(settings.send_timezone);
      }

      const storedUtcTime = settings.send_time || '09:00';
      const localHHmm = utcHHmmToTzHHmm(storedUtcTime, settings.send_timezone || 'Asia/Kolkata');
      const [lh, lm] = localHHmm.split(':').map(Number);

      form.setFieldsValue({
        recipient_emails: settings.recipient_emails || [],
        cc_emails: settings.cc_emails || [],
        send_day: settings.send_day || 1,
        send_timezone: settings.send_timezone || 'Asia/Kolkata',
        send_time: dayjs().hour(lh).minute(lm).second(0),
      });
    } catch (err) {
      message.error('Failed to load scheduler settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const values = await form.validateFields();
      
      const localHHmm = values.send_time.format('HH:mm');
      const utcTime = tzHHmmToUtcHHmm(localHHmm, values.send_timezone);

      await api.post('/dashboard/report/settings', {
        is_enabled: isEnabled,
        recipient_emails: values.recipient_emails,
        cc_emails: values.cc_emails,
        send_day: values.send_day,
        send_timezone: values.send_timezone,
        send_time: utcTime,
      });

      // Refresh suggestions
      try {
        const suggRes = await api.get('/dashboard/report/recipient-suggestions');
        setEmailSuggestions(suggRes.data.data || []);
      } catch (err) {
        console.error('Failed to load email suggestions', err);
      }

      message.success('Scheduler settings saved successfully.');
    } catch (err) {
      message.error('Failed to save scheduler settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleTimezoneChange = (tz: string) => {
    // Recalculate time display based on new timezone
    const values = form.getFieldsValue();
    if (values.send_time) {
      const oldLocalHHmm = values.send_time.format('HH:mm');
      const utcTime = tzHHmmToUtcHHmm(oldLocalHHmm, displayTz);
      const newLocalHHmm = utcHHmmToTzHHmm(utcTime, tz);
      
      const [nh, nm] = newLocalHHmm.split(':').map(Number);
      form.setFieldValue('send_time', dayjs().hour(nh).minute(nm).second(0));
    }
    setDisplayTz(tz);
  };

  const handlePreviewReport = async () => {
    setPreviewLoading(true);
    try {
      const response = await api.get(`/dashboard/report/preview?month=${previewMonth}&year=${previewYear}`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      // Revoke old URL if any to prevent memory leak
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      
      setPreviewUrl(url);
      setIsPreviewVisible(true);
    } catch (err) {
      message.error('Failed to generate PDF preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleOpenTestModal = () => {
    const recipients = form.getFieldValue('recipient_emails') || [];
    const cc = form.getFieldValue('cc_emails') || [];
    testForm.setFieldsValue({
      recipient_emails: recipients,
      cc_emails: cc,
    });
    setIsTestModalVisible(true);
  };

  const handleSendTestReport = async () => {
    setSendingTest(true);
    try {
      const values = await testForm.validateFields();
      await api.post('/dashboard/report/test-send', {
        recipient_emails: values.recipient_emails,
        cc_emails: values.cc_emails,
        month: previewMonth,
        year: previewYear,
      });

      // Refresh suggestions
      try {
        const suggRes = await api.get('/dashboard/report/recipient-suggestions');
        setEmailSuggestions(suggRes.data.data || []);
      } catch (err) {
        console.error('Failed to load email suggestions', err);
      }

      message.success('Test email successfully dispatched!');
      setIsTestModalVisible(false);
    } catch (err) {
      message.error('Failed to send test email.');
    } finally {
      setSendingTest(false);
    }
  };

  const handleRemoveSuggestion = async (email: string) => {
    try {
      await api.post('/dashboard/report/recipient-suggestions/remove', { email });
      message.success(`Removed '${email}' from suggestions.`);
      
      // Refresh suggestions
      const suggRes = await api.get('/dashboard/report/recipient-suggestions');
      setEmailSuggestions(suggRes.data.data || []);
    } catch (err) {
      message.error('Failed to remove email suggestion.');
    }
  };

  const getEmailOptions = () => {
    return emailSuggestions.map(email => ({
      value: email,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span>{email}</span>
          <span 
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleRemoveSuggestion(email);
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
        </div>
      )
    }));
  };

  return (
    <div>
      <Row gutter={[24, 24]}>
        {/* Left Side: Schedule configuration */}
        <Col xs={24} lg={14}>
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
            <Card
              title={
                <Space>
                  <SettingOutlined style={{ color: '#1B3A5C' }} />
                  <span>Report Scheduler Settings</span>
                </Space>
              }
              extra={
                <Switch
                  checkedChildren="Active"
                  unCheckedChildren="Inactive"
                  checked={isEnabled}
                  onChange={setIsEnabled}
                  disabled={loading}
                />
              }
              styles={{ body: { padding: '24px' } }}
              loading={loading}
            >
              <Form form={form} layout="vertical" onFinish={handleSaveSettings}>
                <Form.Item
                  name="recipient_emails"
                  label="Recipient Emails (TO)"
                  rules={[{ required: isEnabled, message: 'Please provide at least one recipient email.' }]}
                  extra="Enter emails to receive the monthly operations PDF report automatically."
                >
                  <Select
                    mode="tags"
                    placeholder="Press Enter to add email addresses"
                    style={{ width: '100%' }}
                    options={getEmailOptions()}
                  />
                </Form.Item>

                <Form.Item
                  name="cc_emails"
                  label="CC Emails (Optional)"
                >
                  <Select
                    mode="tags"
                    placeholder="Press Enter to add CC email addresses"
                    style={{ width: '100%' }}
                    options={getEmailOptions()}
                  />
                </Form.Item>

                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item
                      name="send_day"
                      label="Day of Month"
                      rules={[{ required: true, message: 'Select Day.' }]}
                      extra="Day (1-28)"
                    >
                      <InputNumber min={1} max={28} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>

                  <Col span={16}>
                    <Form.Item
                      name="send_timezone"
                      label="Scheduler Timezone"
                      rules={[{ required: true, message: 'Select Timezone.' }]}
                    >
                      <Select
                        onChange={handleTimezoneChange}
                        options={[
                          { value: 'Asia/Kolkata', label: 'India Standard Time (IST)' },
                          { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
                          { value: 'Europe/London', label: 'London Time (GMT/BST)' },
                          { value: 'America/New_York', label: 'Eastern Time (EST/EDT)' },
                          { value: 'America/Los_Angeles', label: 'Pacific Time (PST/PDT)' },
                          { value: 'Australia/Sydney', label: 'Sydney Time (AEST/AEDT)' },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item
                  name="send_time"
                  label="Execution Time"
                  rules={[{ required: true, message: 'Select Send Time.' }]}
                >
                  <TimePicker format="HH:mm" minuteStep={10} style={{ width: '100%' }} />
                </Form.Item>

                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={saving}
                  style={{ background: '#1B3A5C', borderColor: '#1B3A5C', width: '100%', marginTop: 8 }}
                >
                  Save Scheduler Settings
                </Button>
              </Form>
            </Card>
          </motion.div>
        </Col>

        {/* Right Side: Manual preview & immediate test send */}
        <Col xs={24} lg={10}>
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card
              title={
                <Space>
                  <EyeOutlined style={{ color: '#006B7B' }} />
                  <span>Preview & Test Transmission</span>
                </Space>
              }
              styles={{ body: { padding: '24px' } }}
            >
              <Alert
                message="Monthly operations reports compile stats from the selected month and send automatically on the scheduled schedule."
                type="info"
                showIcon
                style={{ marginBottom: 20 }}
              />

              <div style={{ marginBottom: 24 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>Select Target Report Month</Text>
                <Space>
                  <Select
                    value={previewMonth}
                    onChange={setPreviewMonth}
                    style={{ width: 140 }}
                    options={months}
                  />
                  <Select
                    value={previewYear}
                    onChange={setPreviewYear}
                    style={{ width: 100 }}
                    options={years.map(y => ({ value: y, label: String(y) }))}
                  />
                </Space>
              </div>

              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <Button
                  type="default"
                  icon={<EyeOutlined />}
                  onClick={handlePreviewReport}
                  loading={previewLoading}
                  style={{ width: '100%' }}
                >
                  Preview PDF in Browser
                </Button>

                <Button
                  type="dashed"
                  icon={<SendOutlined />}
                  onClick={handleOpenTestModal}
                  style={{ width: '100%' }}
                >
                  Send Test Copy Now
                </Button>
              </Space>
            </Card>
          </motion.div>
        </Col>
      </Row>

      {/* PDF Preview Modal */}
      <Modal
        title={`PDF Report Preview: ${months.find(m => m.value === previewMonth)?.label} ${previewYear}`}
        open={isPreviewVisible}
        onCancel={() => setIsPreviewVisible(false)}
        footer={null}
        width={850}
        styles={{ body: { padding: 0 } }}
        destroyOnClose
      >
        {previewUrl && (
          <iframe
            src={`${previewUrl}#view=FitH`}
            title="PDF Preview"
            style={{ width: '100%', height: '75vh', border: 'none' }}
          />
        )}
      </Modal>

      {/* Test Send Modal */}
      <Modal
        title="Send Test Monthly Report Email"
        open={isTestModalVisible}
        onOk={handleSendTestReport}
        onCancel={() => setIsTestModalVisible(false)}
        okText="Send Test Email"
        confirmLoading={sendingTest}
      >
        <Form form={testForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="recipient_emails"
            label="Recipient Emails (TO)"
            rules={[{ required: true, message: 'Please specify target recipients.' }]}
          >
            <Select
              mode="tags"
              placeholder="Enter target email addresses"
              style={{ width: '100%' }}
              options={getEmailOptions()}
            />
          </Form.Item>
          
          <Form.Item
            name="cc_emails"
            label="CC Emails (Optional)"
          >
            <Select
              mode="tags"
              placeholder="Enter target CC email addresses"
              style={{ width: '100%' }}
              options={getEmailOptions()}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ReportSchedulerPage;
