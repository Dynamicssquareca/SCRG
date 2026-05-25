import React, { useEffect, useState } from 'react';
import { Card, Button, Switch, Form, Select, TimePicker, InputNumber, Space, Typography, message, Modal, Row, Col, Alert, Tabs } from 'antd';
import { MailOutlined, SettingOutlined, EyeOutlined, SendOutlined, SaveOutlined, CalendarOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import api from '../services/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

// ── Timezone helpers ──────────────────────────────────────────────────────────
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
  const [monthlyForm] = Form.useForm();
  const [biweeklyForm] = Form.useForm();
  const [testForm] = Form.useForm();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [monthlyEnabled, setMonthlyEnabled] = useState(false);
  const [biweeklyEnabled, setBiweeklyEnabled] = useState(false);
  
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  
  // Preview / Test States
  const [previewReportType, setPreviewReportType] = useState<'monthly' | 'bi-weekly'>('monthly');
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
      const { monthly, biweekly } = data.data;

      try {
        const suggRes = await api.get('/dashboard/report/recipient-suggestions');
        setEmailSuggestions(suggRes.data.data || []);
      } catch (err) {
        console.error('Failed to load email suggestions', err);
      }
      
      // Load Monthly configs
      if (monthly) {
        setMonthlyEnabled(monthly.is_enabled);
        const storedUtcTime = monthly.send_time || '09:00';
        const localHHmm = utcHHmmToTzHHmm(storedUtcTime, monthly.send_timezone || 'Asia/Kolkata');
        const [lh, lm] = localHHmm.split(':').map(Number);

        monthlyForm.setFieldsValue({
          recipient_emails: monthly.recipient_emails || [],
          cc_emails: monthly.cc_emails || [],
          send_timezone: monthly.send_timezone || 'Asia/Kolkata',
          send_time: dayjs().hour(lh).minute(lm).second(0),
        });
      }

      // Load Bi-Weekly configs
      if (biweekly) {
        setBiweeklyEnabled(biweekly.is_enabled);
        const storedUtcTime = biweekly.send_time || '09:00';
        const localHHmm = utcHHmmToTzHHmm(storedUtcTime, biweekly.send_timezone || 'Asia/Kolkata');
        const [lh, lm] = localHHmm.split(':').map(Number);

        biweeklyForm.setFieldsValue({
          recipient_emails: biweekly.recipient_emails || [],
          cc_emails: biweekly.cc_emails || [],
          send_timezone: biweekly.send_timezone || 'Asia/Kolkata',
          send_time: dayjs().hour(lh).minute(lm).second(0),
        });
      }
    } catch (err) {
      message.error('Failed to load scheduler settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveSettings = async (type: 'monthly' | 'bi-weekly') => {
    setSaving(true);
    const activeForm = type === 'monthly' ? monthlyForm : biweeklyForm;
    const isEnabled = type === 'monthly' ? monthlyEnabled : biweeklyEnabled;

    try {
      const values = await activeForm.validateFields();
      
      const localHHmm = values.send_time.format('HH:mm');
      const utcTime = tzHHmmToUtcHHmm(localHHmm, values.send_timezone);

      await api.post('/dashboard/report/settings', {
        report_type: type,
        is_enabled: isEnabled,
        recipient_emails: values.recipient_emails,
        cc_emails: values.cc_emails,
        send_day: type === 'monthly' ? 1 : 15,
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

      message.success(`${type === 'monthly' ? 'Monthly' : 'Bi-Weekly'} scheduler settings saved successfully.`);
    } catch (err) {
      message.error('Failed to save scheduler settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleTimezoneChange = (tz: string, type: 'monthly' | 'bi-weekly') => {
    const activeForm = type === 'monthly' ? monthlyForm : biweeklyForm;
    const values = activeForm.getFieldsValue();
    if (values.send_time) {
      // Note: simple conversion placeholder, for premium UX we just shift the visual time-picker display
      const currentLocalHHmm = values.send_time.format('HH:mm');
      const utcTime = tzHHmmToUtcHHmm(currentLocalHHmm, tz); 
      const [nh, nm] = currentLocalHHmm.split(':').map(Number); // Visual anchor
      activeForm.setFieldValue('send_time', dayjs().hour(nh).minute(nm).second(0));
    }
  };

  const handlePreviewReport = async () => {
    setPreviewLoading(true);
    try {
      const response = await api.get(`/dashboard/report/preview?month=${previewMonth}&year=${previewYear}&reportType=${previewReportType}`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
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
    const activeForm = previewReportType === 'monthly' ? monthlyForm : biweeklyForm;
    const recipients = activeForm.getFieldValue('recipient_emails') || [];
    const cc = activeForm.getFieldValue('cc_emails') || [];
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
        report_type: previewReportType,
        recipient_emails: values.recipient_emails,
        cc_emails: values.cc_emails,
        month: previewMonth,
        year: previewYear,
      });

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
        {/* Left Side: Tabs for Monthly & Bi-Weekly configuration */}
        <Col xs={24} lg={14}>
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
            <Card
              title={
                <Space>
                  <SettingOutlined style={{ color: '#1B3A5C' }} />
                  <span style={{ fontWeight: 600 }}>Report Scheduler Settings</span>
                </Space>
              }
              styles={{ body: { padding: '12px 24px 24px 24px' } }}
              loading={loading}
            >
              <Tabs defaultActiveKey="monthly" type="line" size="large">
                {/* MONTHLY REPORT SCHEDULER TAB */}
                <Tabs.TabPane 
                  tab={
                    <span>
                      <CalendarOutlined />
                      Monthly Report
                    </span>
                  }
                  key="monthly"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingTop: 10 }}>
                    <Text type="secondary">Automatically sends a report of the full previous calendar month on the 1st day.</Text>
                    <Switch
                      checkedChildren="Active"
                      unCheckedChildren="Inactive"
                      checked={monthlyEnabled}
                      onChange={setMonthlyEnabled}
                    />
                  </div>

                  <Form form={monthlyForm} layout="vertical" onFinish={() => handleSaveSettings('monthly')}>
                    <Form.Item
                      name="recipient_emails"
                      label="Recipient Emails (TO)"
                      rules={[{ required: monthlyEnabled, message: 'Please provide at least one recipient email.' }]}
                      extra="Enter emails to receive the monthly support report automatically."
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

                    <Form.Item
                      name="send_timezone"
                      label="Scheduler Timezone"
                      rules={[{ required: true, message: 'Select Timezone.' }]}
                    >
                      <Select
                        onChange={(tz) => handleTimezoneChange(tz, 'monthly')}
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

                    <Form.Item
                      name="send_time"
                      label="Execution Time"
                      rules={[{ required: true, message: 'Select Send Time.' }]}
                    >
                      <TimePicker format="HH:00" showNow={false} style={{ width: '100%' }} />
                    </Form.Item>

                    <Button
                      type="primary"
                      htmlType="submit"
                      icon={<SaveOutlined />}
                      loading={saving}
                      style={{ background: '#1B3A5C', borderColor: '#1B3A5C', width: '100%', marginTop: 8 }}
                    >
                      Save Monthly Settings
                    </Button>
                  </Form>
                </Tabs.TabPane>

                {/* BI-WEEKLY REPORT SCHEDULER TAB */}
                <Tabs.TabPane 
                  tab={
                    <span>
                      <CalendarOutlined />
                      Bi-Weekly Report
                    </span>
                  }
                  key="bi-weekly"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingTop: 10 }}>
                    <Text type="secondary">Automatically sends a report of the first half (1st - 14th day) on the 15th day.</Text>
                    <Switch
                      checkedChildren="Active"
                      unCheckedChildren="Inactive"
                      checked={biweeklyEnabled}
                      onChange={setBiweeklyEnabled}
                    />
                  </div>

                  <Form form={biweeklyForm} layout="vertical" onFinish={() => handleSaveSettings('bi-weekly')}>
                    <Form.Item
                      name="recipient_emails"
                      label="Recipient Emails (TO)"
                      rules={[{ required: biweeklyEnabled, message: 'Please provide at least one recipient email.' }]}
                      extra="Enter emails to receive the bi-weekly support report automatically."
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

                    <Form.Item
                      name="send_timezone"
                      label="Scheduler Timezone"
                      rules={[{ required: true, message: 'Select Timezone.' }]}
                    >
                      <Select
                        onChange={(tz) => handleTimezoneChange(tz, 'bi-weekly')}
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

                    <Form.Item
                      name="send_time"
                      label="Execution Time"
                      rules={[{ required: true, message: 'Select Send Time.' }]}
                    >
                      <TimePicker format="HH:00" showNow={false} style={{ width: '100%' }} />
                    </Form.Item>

                    <Button
                      type="primary"
                      htmlType="submit"
                      icon={<SaveOutlined />}
                      loading={saving}
                      style={{ background: '#1B3A5C', borderColor: '#1B3A5C', width: '100%', marginTop: 8 }}
                    >
                      Save Bi-Weekly Settings
                    </Button>
                  </Form>
                </Tabs.TabPane>
              </Tabs>
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
                  <span style={{ fontWeight: 600 }}>Preview & Test Transmission</span>
                </Space>
              }
              styles={{ body: { padding: '24px' } }}
            >
              <Alert
                message="Compile performance stats on-demand for manual review or testing."
                type="info"
                showIcon
                style={{ marginBottom: 20 }}
              />

              <div style={{ marginBottom: 18 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>Select Report Type</Text>
                <Select
                  value={previewReportType}
                  onChange={setPreviewReportType}
                  style={{ width: '100%' }}
                  options={[
                    { value: 'monthly', label: 'Monthly Report (Full Calendar Month)' },
                    { value: 'bi-weekly', label: 'Bi-Weekly Report (1st - 14th day)' },
                  ]}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>Select Target Period</Text>
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
        title={`PDF Report Preview: ${previewReportType === 'bi-weekly' ? 'Bi-Weekly' : 'Monthly'} - ${months.find(m => m.value === previewMonth)?.label} ${previewYear}`}
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
        title={`Send Test ${previewReportType === 'bi-weekly' ? 'Bi-Weekly' : 'Monthly'} Support Report`}
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
