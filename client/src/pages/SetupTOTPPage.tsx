import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Typography, message, Card, Alert } from 'antd';
import { LockOutlined, CheckCircleFilled } from '@ant-design/icons';
import { motion } from 'framer-motion';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;

const SetupTOTPPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [setupData, setSetupData] = useState<{ qrCodeUrl: string; secret: string } | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const tempToken = localStorage.getItem('tempToken');

  useEffect(() => {
    if (!tempToken) {
      navigate('/login');
      return;
    }
    
    // Fetch setup data (QR code)
    const fetchSetup = async () => {
      try {
        const { data } = await api.post('/auth/setup-totp', {}, {
          headers: { Authorization: `Bearer ${tempToken}` }
        });
        setSetupData(data.data);
      } catch (err: any) {
        message.error('Failed to initialize 2FA setup.');
        navigate('/login');
      }
    };
    fetchSetup();
  }, [tempToken, navigate]);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/verify-totp-setup', { code: values.code }, {
        headers: { Authorization: `Bearer ${tempToken}` }
      });
      setRecoveryCode(data.data.recoveryCode);
      message.success('2FA successfully enabled!');
      
      // Optionally pre-authenticate them so they don't have to put code in again right away?
      // For now we just tell them to log in again or we auto login if the server returned it
      // Actually, since we need full tokens, we should log them in via verify-totp with the same code or require re-login.
      // Let's just ask them to click continue.
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Invalid code.');
      setLoading(false);
    }
  };

  const finishSetup = async () => {
    localStorage.removeItem('tempToken');
    navigate('/login');
    message.info('Please log in again using your new 2FA code.');
  };

  return (
    <div className="login-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 20 }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Card style={{ width: '100%', maxWidth: 500, borderRadius: 16, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
          
          {!recoveryCode ? (
            <>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <Title level={3}>Set Up 2-Factor Authentication</Title>
                <Text type="secondary">
                  Scan the QR code below with your authenticator app (e.g., Google Authenticator, Authy).
                </Text>
              </div>

              {setupData ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
                  <img src={setupData.qrCodeUrl} alt="QR Code" style={{ width: 200, height: 200, marginBottom: 16, borderRadius: 8, border: '1px solid #eee' }} />
                  <Text type="secondary" style={{ fontSize: 13 }}>Or enter code manually: <strong style={{color: '#000'}}>{setupData.secret}</strong></Text>
                </div>
              ) : (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  Loading...
                </div>
              )}

              <Form layout="vertical" onFinish={onFinish}>
                <Form.Item
                  name="code"
                  label="Enter the 6-digit code from your app"
                  rules={[{ required: true, message: 'Please enter the verification code' }]}
                >
                  <Input 
                    prefix={<LockOutlined />} 
                    placeholder="123456" 
                    size="large" 
                    maxLength={6} 
                    style={{ textAlign: 'center', letterSpacing: '2px', fontSize: 18 }} 
                  />
                </Form.Item>
                <Button type="primary" htmlType="submit" size="large" block loading={loading} style={{ background: '#E8363D', borderColor: '#E8363D', height: 48, borderRadius: 8 }}>
                  Verify & Enable
                </Button>
              </Form>
            </>
          ) : (
             <div style={{ textAlign: 'center' }}>
                <CheckCircleFilled style={{ fontSize: 64, color: '#52c41a', marginBottom: 24 }} />
                <Title level={3}>2FA Enabled Successfully!</Title>
                
                <Alert
                  type="warning"
                  showIcon
                  message="Save Your Recovery Code"
                  description={
                    <div style={{ marginTop: 8 }}>
                      <Paragraph>If you lose access to your authenticator app, you can use this recovery code to log in.</Paragraph>
                      <div style={{ padding: 12, background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6, fontSize: 18, fontWeight: 'bold', letterSpacing: '1px' }}>
                        {recoveryCode}
                      </div>
                      <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>This code can only be used ONCE.</Paragraph>
                    </div>
                  }
                  style={{ textAlign: 'left', marginBottom: 24 }}
                />

                <Button type="primary" size="large" block onClick={finishSetup} style={{ height: 48, borderRadius: 8, background: '#0F1117', borderColor: '#0F1117' }}>
                  Back to Login
                </Button>
             </div>
          )}

        </Card>
      </motion.div>
    </div>
  );
};

export default SetupTOTPPage;
