import React, { useState, useRef } from 'react';
import { Card, Typography, Upload, Button, Form, Select, message, Tabs, Alert, Table, Collapse, Checkbox, Space } from 'antd';
import { UploadOutlined, FileExcelOutlined, FolderOpenOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../services/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const UploadPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [form] = Form.useForm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadResult, setUploadResult] = useState<any>(null);
  const [generateResult, setGenerateResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('1');

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

  // Native file input change handler
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const validExt = selected.name.endsWith('.xlsx') || selected.name.endsWith('.xls') || selected.name.endsWith('.csv');
    if (!validExt) {
      message.error('Only .xlsx, .xls, or .csv files are supported');
      return;
    }
    setFile(selected);
    // Reset input so same file can be re-selected after removal
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!file) {
      message.warning('Please choose your Excel file first using the "Browse File" button');
      return;
    }

    try {
      const values = await form.validateFields();

      setUploading(true);
      setUploadResult(null);
      setGenerateResult(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('month', values.month);
      formData.append('year', values.year);
      formData.append('syncClientMaster', values.syncClientMaster ? 'true' : 'false');

      const { data } = await api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setUploadResult(data.data);
      message.success(`Successfully processed ${data.data.rowCount} rows`);
      setFile(null);
      setActiveTab('2');

    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    if (!uploadResult?.uploadId) return;

    setGenerating(true);
    try {
      const values = await form.validateFields();
      const { data } = await api.post('/reports/generate', {
        uploadId: uploadResult.uploadId,
        month: values.month,
        year: values.year
      });

      setGenerateResult(data.data);
      message.success(`Generated ${data.data.reports.length} reports`);
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Report generation failed');
    } finally {
      setGenerating(false);
    }
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

  const items = [
    {
      key: '1',
      label: '1. Upload Data',
      children: (
        <Card>
          {/* Month / Year / Sync toggle */}
          <Form
            form={form}
            layout="inline"
            style={{ marginBottom: 24 }}
            initialValues={{
              month: dayjs().month() + 1,
              year: dayjs().year()
            }}
          >
            <Form.Item name="month" label="Reporting Month" rules={[{ required: true }]}>
              <Select style={{ width: 130 }} options={months} />
            </Form.Item>
            <Form.Item name="year" label="Year" rules={[{ required: true }]}>
              <Select style={{ width: 100 }}>
                {years.map(y => <Option key={y} value={y}>{y}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="syncClientMaster" valuePropName="checked">
              <Space direction="vertical" style={{ marginLeft: 16 }}>
                <Checkbox style={{ color: '#1B3A5C', fontWeight: 'bold' }}>
                  Update Client Master &amp; Balances
                </Checkbox>
                <Text type="secondary" style={{ display: 'block', maxWidth: 220, fontSize: '11px', marginTop: -6 }}>
                  (Keep off to use existing master data)
                </Text>
              </Space>
            </Form.Item>
          </Form>

          {/* Hidden native file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={handleFileInputChange}
          />

          {/* File selection area */}
          <div
            style={{
              border: '2px dashed #d9d9d9',
              borderRadius: 8,
              padding: '32px 24px',
              textAlign: 'center',
              background: '#fafafa',
              marginBottom: 16,
            }}
          >
            {file ? (
              // File selected — show name + remove button
              <div>
                <FileExcelOutlined style={{ fontSize: 40, color: '#52c41a', marginBottom: 12 }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: '#237804', marginBottom: 8 }}>
                  ✅ File Selected
                </div>
                <div style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </div>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  size="small"
                  onClick={() => setFile(null)}
                >
                  Remove &amp; choose different file
                </Button>
              </div>
            ) : (
              // No file yet — show browse button
              <div>
                <FileExcelOutlined style={{ fontSize: 40, color: '#bfbfbf', marginBottom: 12 }} />
                <div style={{ fontSize: 15, color: '#555', marginBottom: 16 }}>
                  Click the button below to select your Excel file
                </div>
                <Button
                  type="primary"
                  icon={<FolderOpenOutlined />}
                  size="large"
                  style={{ background: '#1B3A5C', borderColor: '#1B3A5C' }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse File (.xlsx / .csv)
                </Button>
                <div style={{ marginTop: 10, color: '#999', fontSize: 12 }}>
                  Max size: 50MB
                </div>
              </div>
            )}
          </div>

          {/* Upload button — only enabled after file is selected */}
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={handleUpload}
            loading={uploading}
            disabled={!file || uploading || generating}
            size="large"
            style={{
              background: file ? '#1B3A5C' : undefined,
              borderColor: file ? '#1B3A5C' : undefined,
            }}
          >
            Upload and Process Data
          </Button>
          {!file && (
            <Text type="secondary" style={{ marginLeft: 12, fontSize: 13 }}>
              ← Select a file first using "Browse File" above
            </Text>
          )}
        </Card>
      ),
    },
    {
      key: '2',
      label: '2. Generate Reports',
      disabled: !uploadResult,
      children: (
        <Card>
          {uploadResult && (
            <Alert
              message="Data Processed Successfully"
              description={`Uploaded "${uploadResult.originalName}". Processed ${uploadResult.rowCount} rows across ${uploadResult.clientsDetected.length} unique clients.`}
              type="success"
              showIcon
              style={{ marginBottom: 24 }}
            />
          )}

          {uploadResult?.warnings?.length > 0 && (
            <Alert
              message={`Warnings detected (${uploadResult.warnings.length})`}
              description={
                <Collapse
                  ghost
                  size="small"
                  items={[{
                    key: '1',
                    label: <Text type="warning">Click to see warnings</Text>,
                    children: (
                      <ul style={{ paddingLeft: 20, margin: 0 }}>
                        {uploadResult.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                      </ul>
                    )
                  }]}
                />
              }
              type="warning"
              showIcon
              style={{ marginBottom: 24 }}
            />
          )}

          <Button
            type="primary"
            icon={<FileExcelOutlined />}
            onClick={handleGenerate}
            loading={generating}
            size="large"
            style={{ background: '#006B7B', borderColor: '#006B7B' }}
          >
            Generate Per-Client Reports
          </Button>

          {generateResult && (
            <div style={{ marginTop: 32 }}>
              <Title level={5}>Generated Reports ({generateResult.reports.length})</Title>
              <Table
                dataSource={generateResult.reports}
                rowKey="reportId"
                pagination={false}
                size="small"
              >
                <Table.Column title="Client" dataIndex="clientName" />
                <Table.Column title="File" dataIndex="fileName" />
                <Table.Column
                  title="Action"
                  render={(record: any) => (
                    <Button type="link" onClick={() => downloadReport(record.reportId, record.fileName)}>
                      Download
                    </Button>
                  )}
                />
              </Table>
            </div>
          )}
        </Card>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>Upload &amp; Generate Reports</Title>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={items}
      />
    </div>
  );
};

export default UploadPage; 