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
  ClockCircleOutlined as ClockIcon,
  DeleteOutlined,
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

  // Support Reachout Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalCaseNumber, setModalCaseNumber] = useState('');
  const [modalAgent, setModalAgent] = useState<'Gopal' | 'Arish'>('Gopal');
  const [modalComment, setModalComment] = useState('');
  const [submittingModal, setSubmittingModal] = useState(false);

  // Common Support Reachout Card State
  const [commonCaseNumber, setCommonCaseNumber] = useState<string | undefined>(undefined);
  const [commonAgent, setCommonAgent] = useState<'Gopal' | 'Arish'>('Gopal');
  const [commonComment, setCommonComment] = useState('');
  const [submittingCommon, setSubmittingCommon] = useState(false);

  // My submitted reachout requests
  const [myReachouts, setMyReachouts] = useState<any[]>([]);
  const [reachoutsLoading, setReachoutsLoading] = useState(false);

  const fetchMyReachouts = async () => {
    setReachoutsLoading(true);
    try {
      const res = await api.get('/client-portal/reachouts');
      setMyReachouts(res.data.data);
    } catch {
      // silent
    } finally {
      setReachoutsLoading(false);
    }
  };

  const handleOpenReachoutModal = (caseNumber: string) => {
    setModalCaseNumber(caseNumber);
    setModalAgent('Gopal');
    setModalComment('');
    setIsModalOpen(true);
  };

  const handleModalSubmit = async () => {
    if (!modalComment.trim()) {
      message.error('Please enter your comment/message.');
      return;
    }
    setSubmittingModal(true);
    try {
      await api.post('/client-portal/reachout', {
        case_number: modalCaseNumber,
        assigned_to: modalAgent,
        comment: modalComment,
      });
      message.success(`Reachout request sent to ${modalAgent} for ticket ${modalCaseNumber}`);
      setIsModalOpen(false);
      fetchMyReachouts();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to submit reachout request');
    } finally {
      setSubmittingModal(false);
    }
  };

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
      message.success(`Reachout request sent to ${commonAgent} for ticket ${commonCaseNumber}`);
      setCommonCaseNumber(undefined);
      setCommonComment('');
      fetchMyReachouts();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to submit reachout request');
    } finally {
      setSubmittingCommon(false);
    }
  };

  const handleDeleteReachout = async (id: string) => {
    try {
      await api.delete(`/client-portal/reachouts/${id}`);
      message.success('Support request deleted successfully');
      fetchMyReachouts();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to delete support request');
    }
  };

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
    fetchMyReachouts();
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
                  <Radio value="Gopal">Gopal</Radio>
                  <Radio value="Arish">Arish</Radio>
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

        {/* My Support Requests */}
        <div className="cp-table-section cp-fade-in cp-fade-in-delay-4" style={{ marginTop: 8 }}>
          <div className="cp-table-header">
            <div className="cp-table-title">
              <span className="cp-table-title-dot" style={{ background: 'var(--cp-accent)', boxShadow: '0 0 8px var(--cp-accent-glow)' }} />
              <span className="cp-table-title-text">My Support Requests</span>
            </div>
          </div>
          <div className="cp-dark-table">
            <Table
              loading={reachoutsLoading}
              columns={[
                {
                  title: 'Ticket No.',
                  dataIndex: 'case_number',
                  key: 'case_number',
                  width: 180,
                  render: (v: string) => (
                    <span style={{ color: 'var(--cp-accent-2)', fontWeight: 700, fontFamily: 'monospace', fontSize: 13 }}>{v}</span>
                  ),
                },
                {
                  title: 'Assigned To',
                  dataIndex: 'assigned_to',
                  key: 'assigned_to',
                  width: 120,
                  render: (v: string) => (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                      background: v === 'Gopal' ? 'rgba(124,58,237,0.15)' : 'rgba(251,146,60,0.15)',
                      color: v === 'Gopal' ? '#A78BFA' : '#FB923C',
                      border: `1px solid ${v === 'Gopal' ? 'rgba(124,58,237,0.3)' : 'rgba(251,146,60,0.3)'}`,
                    }}>{v}</span>
                  ),
                },
                {
                  title: 'Comment / Message',
                  dataIndex: 'comment',
                  key: 'comment',
                  width: 350,
                  render: (v: string) => (
                    <div style={{
                      color: 'var(--cp-text-primary)',
                      fontSize: 13,
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                      lineHeight: '1.4',
                      maxWidth: 350,
                    }}>
                      {v}
                    </div>
                  ),
                },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  key: 'status',
                  width: 140,
                  render: (v: string) => (
                    v === 'resolved'
                      ? <span className="cp-status-badge resolved"><span className="cp-status-dot" /><CheckCircleOutlined style={{ marginRight: 4 }} />Handled</span>
                      : <span className="cp-status-badge in-progress"><span className="cp-status-dot" /><ClockIcon style={{ marginRight: 4 }} />Pending</span>
                  ),
                },
                {
                  title: 'Submitted On',
                  dataIndex: 'createdAt',
                  key: 'createdAt',
                  width: 150,
                  render: (v: string) => (
                    <span style={{ color: 'var(--cp-text-secondary)', fontSize: 12 }}>
                      {dayjs(v).format('DD MMM YYYY, HH:mm')}
                    </span>
                  ),
                },
                {
                  title: 'Action',
                  key: 'action',
                  width: 90,
                  align: 'center' as const,
                  render: (_: any, record: any) => (
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => {
                        Modal.confirm({
                          title: 'Delete Support Request',
                          content: 'Are you sure you want to delete this support request?',
                          okText: 'Yes, Delete',
                          okType: 'danger',
                          cancelText: 'No',
                          centered: true,
                          className: 'cp-modal-dark',
                          onOk: () => handleDeleteReachout(record._id),
                        });
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 4,
                        height: 'auto',
                      }}
                    />
                  ),
                },
              ]}
              dataSource={myReachouts}
              rowKey="_id"
              pagination={{ pageSize: 5, size: 'small' }}
              scroll={{ x: 'max-content' }}
              size="small"
              locale={{ emptyText: <span style={{ color: 'rgba(241,245,249,0.35)' }}>No support requests submitted yet</span> }}
            />
          </div>
        </div>
      </main>

      {/* Reachout Modal */}
      <Modal
        title={<span className="cp-modal-title">Reach Out to Support</span>}
        open={isModalOpen}
        onOk={handleModalSubmit}
        onCancel={() => setIsModalOpen(false)}
        confirmLoading={submittingModal}
        okText="Send Request"
        cancelText="Cancel"
        className="cp-modal-dark"
        centered
      >
        <div style={{ padding: '12px 0 0' }}>
          <div style={{ marginBottom: 16 }}>
            <span className="cp-modal-field-label">Ticket Number:</span>
            <span className="cp-modal-field-value"> {modalCaseNumber}</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div className="cp-modal-field-label" style={{ marginBottom: 8 }}>Who to contact:</div>
            <Radio.Group value={modalAgent} onChange={(e) => setModalAgent(e.target.value)} className="cp-radio-dark">
              <Radio value="Gopal">Gopal</Radio>
              <Radio value="Arish">Arish</Radio>
            </Radio.Group>
          </div>
          <div>
            <div className="cp-modal-field-label" style={{ marginBottom: 8 }}>Comment / Message:</div>
            <Input.TextArea
              rows={4}
              placeholder="Enter your comment or support request..."
              value={modalComment}
              onChange={(e) => setModalComment(e.target.value)}
              className="cp-textarea-dark"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ClientPortalDashboard;
