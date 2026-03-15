import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message, Layout } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const { Title, Text } = Typography;

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', values);
      login(data.data);
      message.success('Login successful');
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <Card style={{ width: 400, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={3} style={{ color: '#006B7B', margin: 0 }}>MPG</Title>
          <Title level={4} style={{ marginTop: 8 }}>Support Report Generator</Title>
          <Text type="secondary">Sign in to continue</Text>
        </div>

        <Form name="login" onFinish={onFinish} layout="vertical" size="large">
          <Form.Item name="email" rules={[{ required: true, message: 'Please input your email!' }, { type: 'email', message: 'Valid email required!' }]}>
            <Input prefix={<UserOutlined />} placeholder="Email" autoFocus />
          </Form.Item>

          <Form.Item name="password" rules={[{ required: true, message: 'Please input your password!' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Password" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ background: '#1B3A5C' }}>
              Log in
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </Layout>
  );
};

export default LoginPage;
