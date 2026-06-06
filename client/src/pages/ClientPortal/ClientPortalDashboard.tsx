import React, { useState, useEffect, useMemo } from 'react';
import { DatePicker, Table, Button, message, Modal, Select, Input, Radio, Form } from 'antd';
import {
  DownloadOutlined,
  LogoutOutlined,
  UserOutlined,
  ClockCircleOutlined,
  MessageOutlined,
  SendOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import './ClientPortalDashboard.css';

interface DashboardData {
  clientInfo: {
    client_name: string;
    account_manager: string;
    customer_success_mgr: string;
    tool_version: string;
    contract_start_date: string;
    contract_end_date: string;
  };
  hoursDetails: {
    totalContracted: number;
    previousBalance: number;
    hoursConsumed: number;
    hoursOnOpen: number;
    currentBalance: number;
  };
  ticketSummary: {
    totalOpened: number;
    totalClosed: number;
    pending: number;
    reopened: number;
    highPriority: number;
  };
  openCases: any[];
  resolvedCases: any[];
  hasReport: boolean;
  reportId: string | null;
}

const ClientPortalDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(dayjs());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  // Common Support Reachout Card State
  const [commonCaseNumber, setCommonCaseNumber] = useState<string | undefined>(undefined);
  const [commonAgent, setCommonAgent] = useState<'Gopal' | 'Arish'>('Gopal');
  const [commonComment, setCommonComment] = useState('');
  const [submittingCommon, setSubmittingCommon] = useState(false);

  // Success popup state
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [successAgent, setSuccessAgent] = useState('');
  const [successCaseNumber, setSuccessCaseNumber] = useState('');

  const allCaseOptions = useMemo(() => {
    if (!data) return [];
    const optionsMap = new Map();
    data.openCases.forEach((c) => {
      optionsMap.set(c.case_number, {
        value: c.case_number,
        label: `${c.case_number} - ${c.subject || 'No Subject'}`,
      });
    });
    data.resolvedCases.forEach((c) => {
      optionsMap.set(c.case_number, {
        value: c.case_number,
        label: `${c.case_number} - ${c.subject || 'No Subject'} (Resolved)`,
      });
    });
    return Array.from(optionsMap.values());
  }, [data]);

  const handleCommonSubmit = async () => {
    if (!commonCaseNumber) {
      message.error('Please select a ticket.');
      return;
    }
    if (!commonComment.trim()) {
      message.error('Please enter your comment/message.');
      return;
    }
    setSubmittingCommon(true);
    try {
      await api.post('/client-portal/reachout', {
        case_number: commonCaseNumber,
        assigned_to: commonAgent,
        comment: commonComment,
      });

      // Show success popup
      const agentLabel = commonAgent === 'Gopal' ? 'Customer Success Manager' : 'Account Manager';
      setSuccessAgent(agentLabel);
      setSuccessCaseNumber(commonCaseNumber);
      setSuccessModalOpen(true);

      // Reset form
      setCommonCaseNumber(undefined);
      setCommonComment('');
      setCommonAgent('Gopal');
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to submit reachout request');
    } finally {
      setSubmittingCommon(false);
    }
  };

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const month = selectedMonth.month() + 1;
      const year = selectedMonth.year();
      const res = await api.get(`/client-portal/dashboard?month=${month}&year=${year}`);
      setData(res.data.data);
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [selectedMonth]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const month = selectedMonth.month() + 1;
      const year = selectedMonth.year();
      const res = await api.get(`/client-portal/report/download?month=${month}&year=${year}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const disposition = res.headers['content-disposition'];
      const filename = disposition
        ? disposition.split('filename=')[1]?.replace(/"/g, '')
        : `Report_${month}_${year}.xlsx`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success('Report downloaded successfully!');
    } catch {
      message.error('Report not available for this period yet.');
    } finally {
      setDownloading(false);
    }
  };

  const formatDate = (d: any) => {
    if (!d) return '—';
    return dayjs(d).format('DD-MM-YYYY');
  };

  // Open tickets table columns
  const openColumns = [
    { title: 'S.No.', dataIndex: 'sno', key: 'sno', width: 60, align: 'center' as const },
    { title: 'Case Number', dataIndex: 'case_number', key: 'case_number', width: 160 },
    { title: 'Contact', dataIndex: 'contact', key: 'contact', width: 140 },
    { title: 'Subject', dataIndex: 'subject', key: 'subject', width: 380 },
    { title: 'Created On', dataIndex: 'created_on', key: 'created_on', width: 120, render: formatDate },
    { title: 'Hours', dataIndex: 'hours', key: 'hours', width: 80, align: 'center' as const, render: (v: number) => v.toFixed(2) },
    { title: 'Consultant Ass.', dataIndex: 'consultant', key: 'consultant', width: 160 },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 140,
      render: (s: string) => (
        <span className="cp-status-badge in-progress">
          <span className="cp-status-dot" />
          {s || 'In Progress'}
        </span>
      ),
    }
  ];

  // Resolved tickets table columns
  const resolvedColumns = [
    { title: 'S.No.', dataIndex: 'sno', key: 'sno', width: 60, align: 'center' as const },
    { title: 'Case Number', dataIndex: 'case_number', key: 'case_number', width: 160 },
    { title: 'Contact', dataIndex: 'contact', key: 'contact', width: 140 },
    { title: 'Subject', dataIndex: 'subject', key: 'subject', width: 380 },
    { title: 'Created On', dataIndex: 'created_on', key: 'created_on', width: 120, render: formatDate },
    { title: 'Resolved On', dataIndex: 'resolved_on', key: 'resolved_on', width: 120, render: formatDate },
    { title: 'Consultant Ass.', dataIndex: 'consultant', key: 'consultant', width: 160 },
    { title: 'Hours', dataIndex: 'hours', key: 'hours', width: 80, align: 'center' as const, render: (v: number) => v.toFixed(2) }
  ];

  if (loading) {
    return (
      <div className="cp-root">
        <div className="cp-loading">
          <div className="cp-spinner" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { clientInfo, hoursDetails, ticketSummary, openCases, resolvedCases } = data;

  return (
    <div className="cp-root">
      {/* ── Header ── */}
      <header className="cp-header">
        <div className="cp-header-brand">
          <div className="cp-header-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="2" width="9" height="9" rx="2" fill="white" />
              <rect x="13" y="2" width="9" height="9" rx="2" fill="rgba(255,255,255,0.5)" />
              <rect x="2" y="13" width="9" height="9" rx="2" fill="rgba(255,255,255,0.5)" />
              <rect x="13" y="13" width="9" height="9" rx="2" fill="white" />
            </svg>
          </div>
          <div>
            <div className="cp-header-title">Client Portal</div>
            <div className="cp-header-subtitle">Dynamics Square™</div>
          </div>
        </div>
        <div className="cp-header-right">
          <div className="cp-month-picker">
            <DatePicker
              picker="month"
              value={selectedMonth}
              onChange={(val) => val && setSelectedMonth(val)}
              allowClear={false}
              format="MMMM YYYY"
            />
          </div>
          <button className="cp-logout-btn" onClick={logout}>
            <LogoutOutlined /> Logout
          </button>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="cp-content">
        {/* Welcome Banner */}
        <div className="cp-welcome-banner cp-fade-in">
          <h1 className="cp-welcome-title">{clientInfo.client_name}</h1>
          <p className="cp-welcome-sub">
            Showing data for {selectedMonth.format('MMMM YYYY')} · Welcome back, {user?.fullName}
          </p>
        </div>

        {/* Account Details + Hours Details + Support Reachout */}
        <div className="cp-info-grid three-cols cp-fade-in cp-fade-in-delay-1">
          {/* Account Details */}
          <div className="cp-glass-card">
            <div className="cp-info-card-header">
              <div className="cp-info-card-icon account">
                <UserOutlined />
              </div>
              <div className="cp-info-card-title">Account Details</div>
            </div>
            <div className="cp-info-row">
              <span className="cp-info-label highlight">Client Name</span>
              <span className="cp-info-value">{clientInfo.client_name}</span>
            </div>
            <div className="cp-info-row">
              <span className="cp-info-label">Account Manager</span>
              <span className="cp-info-value">{clientInfo.account_manager || '—'}</span>
            </div>
            <div className="cp-info-row">
              <span className="cp-info-label">Customer Success Manager</span>
              <span className="cp-info-value">{clientInfo.customer_success_mgr || '—'}</span>
            </div>
            <div className="cp-info-row">
              <span className="cp-info-label">Tool Version (ERP / CRM)</span>
              <span className="cp-info-value">{clientInfo.tool_version || '—'}</span>
            </div>
            <div className="cp-info-row">
              <span className="cp-info-label">Start Date</span>
              <span className="cp-info-value">{formatDate(clientInfo.contract_start_date)}</span>
            </div>
            <div className="cp-info-row">
              <span className="cp-info-label">End Date</span>
              <span className="cp-info-value">{formatDate(clientInfo.contract_end_date)}</span>
            </div>
          </div>

          {/* Hours Details */}
          <div className="cp-glass-card">
            <div className="cp-info-card-header">
              <div className="cp-info-card-icon hours">
                <ClockCircleOutlined />
              </div>
              <div className="cp-info-card-title">Hours Details</div>
            </div>
            <div className="cp-info-row">
              <span className="cp-info-label">Total Contracted Hours</span>
              <span className="cp-info-value number">{hoursDetails.totalContracted}</span>
            </div>
            <div className="cp-info-row">
              <span className="cp-info-label">Previous Balance Hours</span>
              <span className="cp-info-value number">{hoursDetails.previousBalance}</span>
            </div>
            <div className="cp-info-row">
              <span className="cp-info-label">Hours Consumed This Month</span>
              <span className="cp-info-value number">{hoursDetails.hoursConsumed}</span>
            </div>
            <div className="cp-info-row">
              <span className="cp-info-label">Hours Allotted to Open Tickets</span>
              <span className="cp-info-value number">{hoursDetails.hoursOnOpen}</span>
            </div>
            <div className="cp-info-row">
              <span className="cp-info-label" style={{ fontWeight: 700, color: '#34D399' }}>Current Balance Hours</span>
              <span className="cp-info-value number" style={{ color: '#34D399', fontSize: 18 }}>{hoursDetails.currentBalance}</span>
            </div>
          </div>

          {/* Quick Support Reachout Common Box */}
          <div className="cp-glass-card cp-reachout-card">
            <div className="cp-info-card-header">
              <div className="cp-info-card-icon reachout">
                <MessageOutlined style={{ color: 'var(--cp-accent)' }} />
              </div>
              <div className="cp-info-card-title">Quick Support Reachout</div>
            </div>
            <Form layout="vertical" onFinish={handleCommonSubmit} style={{ marginTop: 8 }}>
              <Form.Item label={<span className="cp-form-label">Select Ticket</span>} required style={{ marginBottom: 10 }}>
                <Select
                  showSearch
                  placeholder="Choose ticket number..."
                  optionFilterProp="label"
                  options={allCaseOptions}
                  value={commonCaseNumber}
                  onChange={setCommonCaseNumber}
                  popupClassName="cp-select-dropdown-dark"
                  className="cp-select-dark"
                />
              </Form.Item>
              <Form.Item label={<span className="cp-form-label">Who to Contact</span>} required style={{ marginBottom: 10 }}>
                <Radio.Group value={commonAgent} onChange={(e) => setCommonAgent(e.target.value)} className="cp-radio-dark">
                  <Radio value="Gopal">Customer Success Manager</Radio>
                  <Radio value="Arish">Account Manager</Radio>
                </Radio.Group>
              </Form.Item>
              <Form.Item label={<span className="cp-form-label">Comment / Message</span>} required style={{ marginBottom: 12 }}>
                <Input.TextArea
                  rows={2}
                  placeholder="Enter comment or query..."
                  value={commonComment}
                  onChange={(e) => setCommonComment(e.target.value)}
                  className="cp-textarea-dark"
                />
              </Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={submittingCommon}
                icon={<SendOutlined />}
                className="cp-submit-btn-dark"
                block
              >
                Send Request
              </Button>
            </Form>
          </div>
        </div>

        {/* Ticket Summary */}
        <div className="cp-summary-grid cp-fade-in cp-fade-in-delay-2">
          <div className="cp-summary-card opened">
            <div className="cp-summary-number">{ticketSummary.totalOpened}</div>
            <div className="cp-summary-label">Tickets Open This Month</div>
          </div>
          <div className="cp-summary-card closed">
            <div className="cp-summary-number">{ticketSummary.totalClosed}</div>
            <div className="cp-summary-label">Tickets Closed This Month</div>
          </div>
          <div className="cp-summary-card pending">
            <div className="cp-summary-number">{ticketSummary.pending}</div>
            <div className="cp-summary-label">All Pending Tickets</div>
          </div>
          <div className="cp-summary-card reopened">
            <div className="cp-summary-number">{ticketSummary.reopened}</div>
            <div className="cp-summary-label">Reopened</div>
          </div>
          <div className="cp-summary-card high">
            <div className="cp-summary-number">{ticketSummary.highPriority}</div>
            <div className="cp-summary-label">High Priority</div>
          </div>
        </div>

        {/* Open Tickets Report */}
        <div className="cp-table-section cp-fade-in cp-fade-in-delay-3">
          <div className="cp-table-header">
            <div className="cp-table-title">
              <span className="cp-table-title-dot open" />
              <span className="cp-table-title-text">Open Tickets Report</span>
            </div>
            {data.hasReport && (
              <Button
                className="cp-download-btn"
                icon={<DownloadOutlined />}
                onClick={handleDownload}
                loading={downloading}
              >
                Download Excel Report
              </Button>
            )}
          </div>
          <div className="cp-dark-table">
            <Table
              columns={openColumns}
              dataSource={openCases}
              rowKey="case_number"
              pagination={false}
              scroll={{ x: 'max-content' }}
              size="small"
              locale={{ emptyText: 'No open tickets for this period' }}
            />
          </div>
        </div>

        {/* Resolved Tickets Report */}
        <div className="cp-table-section cp-fade-in cp-fade-in-delay-4">
          <div className="cp-table-header">
            <div className="cp-table-title">
              <span className="cp-table-title-dot resolved" />
              <span className="cp-table-title-text">Resolved Tickets Report</span>
            </div>
          </div>
          <div className="cp-dark-table resolved-table">
            <Table
              columns={resolvedColumns}
              dataSource={resolvedCases}
              rowKey="case_number"
              pagination={false}
              scroll={{ x: 'max-content' }}
              size="small"
              locale={{ emptyText: <span style={{ color: 'rgba(241,245,249,0.35)' }}>No resolved tickets for this period</span> }}
              style={{ background: 'transparent' }}
            />
          </div>
        </div>
      </main>

      {/* ── Request Submitted Success Modal ── */}
      <Modal
        open={successModalOpen}
        onOk={() => setSuccessModalOpen(false)}
        onCancel={() => setSuccessModalOpen(false)}
        okText="Close"
        cancelButtonProps={{ style: { display: 'none' } }}
        centered
        className="cp-modal-dark"
        footer={null}
        width={420}
      >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '32px 16px 24px',
          textAlign: 'center',
        }}>
          {/* Animated success icon */}
          <div style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(52,211,153,0.2), rgba(16,185,129,0.1))',
            border: '2px solid rgba(52,211,153,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            boxShadow: '0 0 24px rgba(52,211,153,0.2)',
          }}>
            <CheckCircleOutlined style={{ fontSize: 36, color: '#34D399' }} />
          </div>

          <h2 style={{
            margin: '0 0 8px',
            color: '#f1f5f9',
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '-0.3px',
          }}>
            Request Submitted Successfully!
          </h2>

          <p style={{
            margin: '0 0 6px',
            color: 'rgba(241,245,249,0.65)',
            fontSize: 14,
            lineHeight: 1.6,
          }}>
            Your support request for ticket
          </p>
          <span style={{
            display: 'inline-block',
            background: 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 8,
            padding: '4px 14px',
            color: '#818CF8',
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: 15,
            marginBottom: 12,
          }}>
            {successCaseNumber}
          </span>
          <p style={{
            margin: '0 0 24px',
            color: 'rgba(241,245,249,0.65)',
            fontSize: 14,
            lineHeight: 1.6,
          }}>
            has been sent to your <strong style={{ color: '#FB923C' }}>{successAgent}</strong>.<br />
            They will get back to you shortly.
          </p>

          <button
            onClick={() => setSuccessModalOpen(false)}
            style={{
              background: 'linear-gradient(135deg, #6366F1, #818CF8)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '10px 32px',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
              transition: 'opacity 0.2s',
            }}
          >
            Got it, thanks!
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default ClientPortalDashboard;
