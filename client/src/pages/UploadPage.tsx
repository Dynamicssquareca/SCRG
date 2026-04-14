import React, { useState } from 'react';
import { Card, Typography, Upload, Button, Form, Select, message, Tabs, Alert, Space, Table, Collapse, Checkbox } from 'antd';
import { InboxOutlined, UploadOutlined, FileExcelOutlined, WarningOutlined } from '@ant-design/icons';
import api from '../services/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Dragger } = Upload;
const { Option } = Select;

const UploadPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [form] = Form.useForm();
  
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [generateResult, setGenerateResult] = useState<any>(null);

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

  const handleUpload = async () => {
    try {
      const values = await form.validateFields();
      if (!file) {
        return message.error('Please select an Excel file first');
      }

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
      setFile(null); // Reset file after successful upload

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

  const uploadProps = {
    onRemove: () => { setFile(null); },
    beforeUpload: (f: File) => {
      const isExcelOrCsv = f.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                           f.type === 'application/vnd.ms-excel' || 
                           f.type === 'text/csv' || 
                           f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv');
      
      if (!isExcelOrCsv) {
        message.error('You can only upload Excel or CSV files!');
        return Upload.LIST_IGNORE;
      }
      setFile(f);
      return false;
    },
    fileList: file ? [file as any] : [],
    maxCount: 1,
  };

  const items = [
    {
      key: '1',
      label: '1. Upload Data',
      children: (
        <Card>
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
              <Select style={{ width: 120 }} options={months} />
            </Form.Item>
            <Form.Item name="year" label="Year" rules={[{ required: true }]}>
              <Select style={{ width: 100 }}>
                {years.map(y => <Option key={y} value={y}>{y}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="syncClientMaster" valuePropName="checked">
              <Space direction="vertical" style={{ marginLeft: 16 }}>
                <Checkbox style={{ color: '#1B3A5C', fontWeight: 'bold' }}>
                  Update Client Master & Balances
                </Checkbox>
                <Typography.Text type="secondary" style={{ display: 'block', maxWidth: 200, fontSize: '11px', marginTop: -8 }}>
                  (Keep off to use existing master data)
                </Typography.Text>
              </Space>
            </Form.Item>
          </Form>

          <Dragger {...uploadProps} disabled={uploading || generating} style={{ padding: '32px 0' }}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined style={{ color: '#1B3A5C' }} />
            </p>
            <p className="ant-upload-text">Click or drag file to this area to upload</p>
            <p className="ant-upload-hint">Support for a single .xlsx or .csv upload. Max size 50MB.</p>
          </Dragger>

          <Button 
            type="primary" 
            icon={<UploadOutlined />} 
            onClick={handleUpload} 
            loading={uploading}
            disabled={!file || uploading || generating}
            style={{ marginTop: 24, background: '#1B3A5C' }}
          >
            Upload and Process Data
          </Button>
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
                    label: <Text type="warning">Click to expand and see row-specific warnings</Text>,
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
            style={{ background: '#006B7B' }}
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
                    <Button type="link" onClick={() => downloadReport(record.reportId, record.fileName)}>Download</Button>
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
      <Title level={4} style={{ marginTop: 0 }}>Upload & Generate Reports</Title>
      <Tabs defaultActiveKey="1" items={items} activeKey={uploadResult ? (generateResult ? '2' : '2') : '1'} />
    </div>
  );
};

export default UploadPage;
