import React, { useState, useEffect, useMemo } from 'react';
import { Select, DatePicker, Table, Spin, Empty, Tag } from 'antd';
import {
    EyeOutlined,
    UserOutlined,
    ClockCircleOutlined,
    TeamOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';
import './ClientPortal/ClientPortalDashboard.css';

/* ── Types ─────────────────────────────────────── */
interface ClientOption {
    _id: string;
    client_name: string;
}

interface DashboardData {
    clientInfo: {
        client_name: string;
        account_manager: string;
        customer_success_mgr: string;
        tool_version: string;
        contract_start_date: string | null;
        contract_end_date: string | null;
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
    };
    openCases: any[];
    resolvedCases: any[];
    hasReport: boolean;
}

/* ── Helpers ────────────────────────────────────── */
const formatDate = (d: string | null): string => {
    if (!d) return '-';
    return dayjs(d).format('DD-MM-YYYY');
};

/* ── Summary Card ────────────────────────────────── */
const SummaryCard: React.FC<{
    number: number;
    label: string;
    color: string;
    bg: string;
    border: string;
    index: number;
}> = ({ number, label, color, bg, border, index }) => (
    <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.06, duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        whileHover={{ y: -3 }}
        style={{
            flex: 1,
            minWidth: 170,
            background: bg,
            border: `1.5px solid ${border}`,
            borderRadius: 16,
            padding: '24px 20px',
            textAlign: 'center',
            boxShadow: `0 4px 24px ${color}14`,
            position: 'relative',
            overflow: 'hidden',
        }}
    >
        <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            borderRadius: '16px 16px 0 0', background: color,
        }} />
        <div style={{ fontSize: 38, fontWeight: 800, color, lineHeight: 1, marginBottom: 10, letterSpacing: '-1px' }}>
            {number}
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
            {label}
        </div>
    </motion.div>
);

/* ── Info Row ────────────────────────────────────── */
const InfoRow: React.FC<{ label: string; value: React.ReactNode; highlight?: boolean }> = ({
    label, value, highlight,
}) => (
    <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 0', borderBottom: '1px solid #F0F2F7',
    }}>
        <span style={{
            fontSize: 11.5, fontWeight: 600, color: highlight ? '#15803D' : '#6B7280',
            textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>
            {label}
        </span>
        <span style={{ fontSize: highlight ? 17 : 13.5, fontWeight: highlight ? 800 : 600, color: highlight ? '#16A34A' : '#0F1117' }}>
            {value}
        </span>
    </div>
);

/* ── Glass Card wrapper ───────────────────────────── */
const InfoCard: React.FC<{
    icon: React.ReactNode;
    iconBg: string;
    iconColor: string;
    title: string;
    delay: number;
    children: React.ReactNode;
}> = ({ icon, iconBg, iconColor, title, delay, children }) => (
    <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.35 }}
        style={{
            background: '#fff', borderRadius: 16,
            border: '1.5px solid #E8ECF4', padding: '20px 22px',
            boxShadow: '0 2px 12px rgba(15,17,23,0.06)',
        }}
    >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: iconBg, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 16, color: iconColor,
            }}>
                {icon}
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0F1117' }}>{title}</span>
        </div>
        {children}
    </motion.div>
);

/* ── Table Section wrapper ────────────────────────── */
const TableSection: React.FC<{
    dotColor: string;
    title: string;
    count: number;
    countBg: string;
    countColor: string;
    delay: number;
    children: React.ReactNode;
}> = ({ dotColor, title, count, countBg, countColor, delay, children }) => (
    <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.35 }}
        style={{
            background: '#fff', borderRadius: 16,
            border: '1.5px solid #E8ECF4', padding: '20px 22px',
            marginBottom: 16, boxShadow: '0 2px 12px rgba(15,17,23,0.06)',
        }}
    >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0F1117' }}>{title}</span>
            <span style={{
                marginLeft: 'auto', background: countBg, color: countColor,
                fontSize: 12, fontWeight: 700, borderRadius: 8, padding: '2px 10px',
            }}>
                {count}
            </span>
        </div>
        {children}
    </motion.div>
);

/* ── Main Page ───────────────────────────────────── */
const ClientDashboardPreviewPage: React.FC = () => {
    const [clients, setClients] = useState<ClientOption[]>([]);
    const [clientsLoading, setClientsLoading] = useState(true);
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
    const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs());
    const [data, setData] = useState<DashboardData | null>(null);
    const [dataLoading, setDataLoading] = useState(false);

    /* Fetch all clients for dropdown */
    useEffect(() => {
        (async () => {
            try {
                const res = await api.get('/clients?limit=1000');
                const list: ClientOption[] = res.data.data.clients || [];
                setClients(list);
            } catch {
                // silent
            } finally {
                setClientsLoading(false);
            }
        })();
    }, []);

    /* Fetch dashboard when client or month changes */
    useEffect(() => {
        if (!selectedClientId) { setData(null); return; }
        let cancelled = false;
        setDataLoading(true);
        (async () => {
            try {
                const m = selectedMonth.month() + 1;
                const y = selectedMonth.year();
                const res = await api.get(
                    `/admin/client-dashboard-preview?clientId=${selectedClientId}&month=${m}&year=${y}`
                );
                if (!cancelled) setData(res.data.data);
            } catch {
                if (!cancelled) setData(null);
            } finally {
                if (!cancelled) setDataLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [selectedClientId, selectedMonth]);

    const selectedClientName = useMemo(
        () => clients.find(c => c._id === selectedClientId)?.client_name ?? '',
        [clients, selectedClientId]
    );

    /* Open tickets columns */
    const openColumns = [
        { title: 'S.No.', dataIndex: 'sno', key: 'sno', width: 55, align: 'center' as const },
        {
            title: 'Case Number', dataIndex: 'case_number', key: 'case_number', width: 150,
            render: (v: string) => <span style={{ whiteSpace: 'nowrap', fontWeight: 600, color: '#0F1117' }}>{v}</span>,
        },
        { title: 'Contact', dataIndex: 'contact', key: 'contact', width: 130 },
        { title: 'Subject', dataIndex: 'subject', key: 'subject' },
        {
            title: 'Created On', dataIndex: 'created_on', key: 'created_on', width: 115,
            render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{formatDate(v)}</span>,
        },
        {
            title: 'Hours', dataIndex: 'hours', key: 'hours', width: 75, align: 'right' as const,
            render: (v: number) => v?.toFixed(2),
        },
        { title: 'Consultant', dataIndex: 'consultant', key: 'consultant', width: 140 },
        {
            title: 'Status', dataIndex: 'status', key: 'status', width: 120,
            render: (s: string) => (
                <Tag color="orange" style={{ borderRadius: 6, fontWeight: 600 }}>{s || 'In Progress'}</Tag>
            ),
        },
    ];

    /* Resolved tickets columns */
    const resolvedColumns = [
        { title: 'S.No.', dataIndex: 'sno', key: 'sno', width: 55, align: 'center' as const },
        {
            title: 'Case Number', dataIndex: 'case_number', key: 'case_number', width: 150,
            render: (v: string) => <span style={{ whiteSpace: 'nowrap', fontWeight: 600, color: '#0F1117' }}>{v}</span>,
        },
        { title: 'Contact', dataIndex: 'contact', key: 'contact', width: 130 },
        { title: 'Subject', dataIndex: 'subject', key: 'subject' },
        {
            title: 'Created On', dataIndex: 'created_on', key: 'created_on', width: 115,
            render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{formatDate(v)}</span>,
        },
        {
            title: 'Resolved On', dataIndex: 'resolved_on', key: 'resolved_on', width: 115,
            render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{formatDate(v)}</span>,
        },
        { title: 'Consultant', dataIndex: 'consultant', key: 'consultant', width: 140 },
        {
            title: 'Hours', dataIndex: 'hours', key: 'hours', width: 75, align: 'right' as const,
            render: (v: number) => v?.toFixed(2),
        },
    ];

    return (
        <div>
            {/* ── Page header + controls ── */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                style={{ marginBottom: 24 }}
            >
                <div style={{
                    display: 'flex', alignItems: 'flex-start',
                    justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
                }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0F1117', letterSpacing: '-0.4px' }}>
                            Client Dashboard Preview
                        </h1>
                        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280' }}>
                            Select a client to preview their portal dashboard without logging in as them.
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <Select
                            id="client-preview-select"
                            showSearch
                            loading={clientsLoading}
                            placeholder="Select a client…"
                            optionFilterProp="label"
                            style={{ width: 280 }}
                            value={selectedClientId}
                            onChange={setSelectedClientId}
                            options={clients.map(c => ({ value: c._id, label: c.client_name }))}
                            suffixIcon={<TeamOutlined style={{ color: '#E8363D' }} />}
                            allowClear
                            size="large"
                        />
                        <DatePicker.MonthPicker
                            value={selectedMonth}
                            onChange={(d) => d && setSelectedMonth(d)}
                            allowClear={false}
                            format="MMMM YYYY"
                            size="large"
                        />
                    </div>
                </div>
            </motion.div>

            {/* ── Empty / Prompt state ── */}
            {!selectedClientId && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        minHeight: 420, background: '#F7F8FC', borderRadius: 20, border: '2px dashed #E8ECF4',
                    }}
                >
                    <div style={{
                        width: 72, height: 72, borderRadius: 20,
                        background: 'linear-gradient(135deg, rgba(232,54,61,0.10), rgba(232,54,61,0.04))',
                        border: '1.5px solid rgba(232,54,61,0.18)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 30, color: '#E8363D', marginBottom: 20,
                    }}>
                        <EyeOutlined />
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: '#0F1117', marginBottom: 8 }}>
                        No client selected
                    </div>
                    <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', maxWidth: 320 }}>
                        Use the dropdown above to pick a client and instantly preview their support dashboard.
                    </div>
                </motion.div>
            )}

            {/* ── Loading ── */}
            {selectedClientId && dataLoading && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
                    <Spin size="large" tip="Loading client dashboard…" />
                </div>
            )}

            {/* ── Dashboard Preview ── */}
            <AnimatePresence mode="wait">
                {selectedClientId && !dataLoading && data && (
                    <motion.div
                        key={`${selectedClientId}-${selectedMonth.format('YYYY-MM')}`}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                    >
                        {/* Preview Mode Banner */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.05))',
                            border: '1.5px solid rgba(99,102,241,0.20)',
                            borderRadius: 12, padding: '10px 18px', marginBottom: 20,
                        }}>
                            <EyeOutlined style={{ color: '#6366F1', fontSize: 15 }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#4F46E5' }}>Preview Mode</span>
                            <span style={{ fontSize: 13, color: '#6B7280' }}>
                                - Viewing dashboard as{' '}
                                <strong style={{ color: '#0F1117' }}>{data.clientInfo.client_name}</strong>
                                {' '}for{' '}
                                <strong style={{ color: '#0F1117' }}>{selectedMonth.format('MMMM YYYY')}</strong>
                            </span>
                        </div>

                        {/* ── Ticket Summary ── */}
                        <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
                            <SummaryCard
                                number={data.ticketSummary.totalOpened}
                                label="Tickets Open This Month"
                                color="#2563EB"
                                bg="rgba(37,99,235,0.05)"
                                border="rgba(37,99,235,0.14)"
                                index={0}
                            />
                            <SummaryCard
                                number={data.ticketSummary.totalClosed}
                                label="Tickets Closed This Month"
                                color="#16A34A"
                                bg="rgba(22,163,74,0.05)"
                                border="rgba(22,163,74,0.14)"
                                index={1}
                            />
                            <SummaryCard
                                number={data.ticketSummary.pending}
                                label="All Pending Tickets"
                                color="#D97706"
                                bg="rgba(217,119,6,0.05)"
                                border="rgba(217,119,6,0.14)"
                                index={2}
                            />
                        </div>

                        {/* ── Info Cards ── */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 20 }}>
                            <InfoCard
                                icon={<UserOutlined />}
                                iconBg="rgba(232,54,61,0.08)"
                                iconColor="#E8363D"
                                title="Account Details"
                                delay={0.1}
                            >
                                {data.clientInfo.account_manager && (
                                    <InfoRow label="Account Manager" value={data.clientInfo.account_manager} />
                                )}
                                {data.clientInfo.customer_success_mgr && (
                                    <InfoRow label="Customer Success Mgr" value={data.clientInfo.customer_success_mgr} />
                                )}
                                {data.clientInfo.tool_version && (
                                    <InfoRow label="Solution" value={data.clientInfo.tool_version} />
                                )}
                                {data.clientInfo.contract_start_date && (
                                    <InfoRow label="Start Date" value={formatDate(data.clientInfo.contract_start_date)} />
                                )}
                                {data.clientInfo.contract_end_date && (
                                    <InfoRow label="End Date" value={formatDate(data.clientInfo.contract_end_date)} />
                                )}
                            </InfoCard>

                            <InfoCard
                                icon={<ClockCircleOutlined />}
                                iconBg="rgba(37,99,235,0.08)"
                                iconColor="#2563EB"
                                title="Hours Details"
                                delay={0.16}
                            >
                                <InfoRow label="Total Contracted Hours" value={data.hoursDetails.totalContracted} />
                                <InfoRow label="Previous Balance Hours" value={data.hoursDetails.previousBalance} />
                                <InfoRow label="Hours Consumed This Month" value={data.hoursDetails.hoursConsumed} />
                                <InfoRow label="Hours on Open Tickets" value={data.hoursDetails.hoursOnOpen} />
                                <InfoRow
                                    label="Current Balance Hours"
                                    value={
                                        <span style={{ color: data.hoursDetails.currentBalance >= 0 ? '#16A34A' : '#DC2626' }}>
                                            {data.hoursDetails.currentBalance}
                                        </span>
                                    }
                                    highlight
                                />
                            </InfoCard>
                        </div>

                        {/* ── Open Tickets Table ── */}
                        <TableSection
                            dotColor="#F59E0B"
                            title="Open Tickets Report"
                            count={data.openCases.length}
                            countBg="rgba(245,158,11,0.10)"
                            countColor="#B45309"
                            delay={0.22}
                        >
                            <Table
                                columns={openColumns}
                                dataSource={data.openCases}
                                rowKey="case_number"
                                pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
                                size="small"
                                scroll={{ x: 900 }}
                                locale={{ emptyText: <Empty description="No open tickets for this period" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                            />
                        </TableSection>

                        {/* ── Resolved Tickets Table ── */}
                        <TableSection
                            dotColor="#16A34A"
                            title="Resolved Tickets Report"
                            count={data.resolvedCases.length}
                            countBg="rgba(22,163,74,0.09)"
                            countColor="#15803D"
                            delay={0.28}
                        >
                            <Table
                                columns={resolvedColumns}
                                dataSource={data.resolvedCases}
                                rowKey="case_number"
                                pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
                                size="small"
                                scroll={{ x: 900 }}
                                locale={{ emptyText: <Empty description="No resolved tickets for this period" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                            />
                        </TableSection>
                    </motion.div>
                )}

                {/* Could not load */}
                {selectedClientId && !dataLoading && !data && (
                    <Empty
                        description="Could not load dashboard data for this client."
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        style={{ marginTop: 80 }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default ClientDashboardPreviewPage;
