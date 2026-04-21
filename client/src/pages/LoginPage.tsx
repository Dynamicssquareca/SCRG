import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Typography, message, Divider } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const { Text } = Typography;

const item = (i: number) => ({
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { delay: i * 0.08 + 0.15, duration: 0.45, ease: [0.4, 0, 0.2, 1] } },
});

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'login' | 'totp'>('login');
  const [tempToken, setTempToken] = useState('');
  const { login, isAuthenticated } = useAuth();

  // If user navigates to /login while already logged in, clear session so they can switch accounts
  useEffect(() => {
    if (isAuthenticated) {
      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.reload();
    }
  }, []);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', values);
      if (data.data.requiresSetup) {
        localStorage.setItem('tempToken', data.data.tempToken);
        window.location.href = '/setup-2fa';
      } else if (data.data.requiresTOTP) {
        setTempToken(data.data.tempToken);
        setStep('totp');
      } else {
        login(data.data);
        message.success('Welcome back!');
      }
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const onTotpFinish = async (values: any) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/verify-totp', { code: values.code }, {
        headers: { Authorization: `Bearer ${tempToken}` }
      });
      login(data.data);
      message.success('Welcome back!');
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Invalid authentication code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg">
      {/* Decorative red blobs */}
      <motion.div
        style={{
          position: 'absolute', width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(232,54,61,0.13) 0%, transparent 65%)',
          top: '-15%', right: '-10%', pointerEvents: 'none',
        }}
        animate={{ scale: [1, 1.1, 1], rotate: [0, 15, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        style={{
          position: 'absolute', width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(232,54,61,0.08) 0%, transparent 65%)',
          bottom: '-5%', left: '-8%', pointerEvents: 'none',
        }}
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
      />

      <div className="login-panel">
        {/* Brand header */}
        <motion.div
          style={{ textAlign: 'center', marginBottom: 36 }}
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* DS Icon */}
          <motion.div
            style={{
              width: 64, height: 64, borderRadius: 18,
              background: '#E8363D',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
              boxShadow: '0 8px 32px rgba(232,54,61,0.45)',
            }}
            whileHover={{ scale: 1.05, rotate: 3 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="2" width="9" height="9" rx="2" fill="white"/>
              <rect x="13" y="2" width="9" height="9" rx="2" fill="rgba(255,255,255,0.5)"/>
              <rect x="2" y="13" width="9" height="9" rx="2" fill="rgba(255,255,255,0.5)"/>
              <rect x="13" y="13" width="9" height="9" rx="2" fill="white"/>
            </svg>
          </motion.div>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', letterSpacing: '2px', textTransform: 'uppercase', lineHeight: 1 }}>
              Dynamics
            </span>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#E8363D', letterSpacing: '2px', textTransform: 'uppercase', lineHeight: 1 }}>
              Square<sup style={{ fontSize: 10, color: '#E8363D' }}>™</sup>
            </span>
          </div>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 500 }}>
            Support Report Generator
          </Text>
        </motion.div>

        {/* Login Card */}
        <motion.div
          style={{
            background: '#ffffff',
            borderRadius: 20,
            padding: 40,
            boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
        >
          <motion.div variants={item(0)} initial="hidden" animate="visible">
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0F1117', letterSpacing: '-0.4px' }}>
                {step === 'login' ? 'Sign in' : 'Two-Factor Authentication'}
              </h2>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {step === 'login' ? 'Enter your credentials to access the dashboard' : 'Enter the 6-digit code from your authenticator app'}
              </Text>
            </div>
          </motion.div>

          {step === 'login' ? (
            <Form name="login" onFinish={onFinish} layout="vertical" requiredMark={false}>
              <motion.div variants={item(1)} initial="hidden" animate="visible">
                <Form.Item
                  name="email"
                  label={<span style={{ fontWeight: 600, fontSize: 13, color: '#374151' }}>Email address</span>}
                  rules={[
                    { required: true, message: 'Email is required' },
                    { type: 'email', message: 'Please enter a valid email' },
                  ]}
                >
                  <Input
                    prefix={<UserOutlined style={{ color: '#9CA3AF' }} />}
                    placeholder="you@dynamicssquare.com"
                    size="large"
                    style={{ borderRadius: 10, height: 48, fontSize: 14 }}
                    autoFocus
                  />
                </Form.Item>
              </motion.div>

              <motion.div variants={item(2)} initial="hidden" animate="visible">
                <Form.Item
                  name="password"
                  label={<span style={{ fontWeight: 600, fontSize: 13, color: '#374151' }}>Password</span>}
                  rules={[{ required: true, message: 'Password is required' }]}
                  style={{ marginBottom: 28 }}
                >
                  <Input.Password
                    prefix={<LockOutlined style={{ color: '#9CA3AF' }} />}
                    placeholder="••••••••"
                    size="large"
                    style={{ borderRadius: 10, height: 48, fontSize: 14 }}
                  />
                </Form.Item>
              </motion.div>

              <motion.div variants={item(3)} initial="hidden" animate="visible">
                <motion.div whileTap={{ scale: 0.98 }}>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={loading}
                    block
                    size="large"
                    style={{
                      background: '#E8363D',
                      border: 'none',
                      height: 50,
                      borderRadius: 12,
                      fontSize: 15,
                      fontWeight: 700,
                      letterSpacing: '0.2px',
                      boxShadow: '0 6px 24px rgba(232,54,61,0.38)',
                    }}
                  >
                    {loading ? 'Signing in…' : 'Sign In →'}
                  </Button>
                </motion.div>
              </motion.div>
            </Form>
          ) : (
            <Form name="totp" onFinish={onTotpFinish} layout="vertical" requiredMark={false}>
              <motion.div variants={item(1)} initial="hidden" animate="visible">
                <Form.Item
                  name="code"
                  label={<span style={{ fontWeight: 600, fontSize: 13, color: '#374151' }}>Authentication Code</span>}
                  rules={[{ required: true, message: 'Code is required' }]}
                  style={{ marginBottom: 28 }}
                >
                  <Input
                    prefix={<LockOutlined style={{ color: '#9CA3AF' }} />}
                    placeholder="123456"
                    size="large"
                    maxLength={10}
                    style={{ borderRadius: 10, height: 48, fontSize: 18, letterSpacing: '2px', textAlign: 'center' }}
                    autoFocus
                  />
                </Form.Item>
              </motion.div>

              <motion.div variants={item(2)} initial="hidden" animate="visible">
                <motion.div whileTap={{ scale: 0.98 }}>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={loading}
                    block
                    size="large"
                    style={{
                      background: '#E8363D',
                      border: 'none',
                      height: 50,
                      borderRadius: 12,
                      fontSize: 15,
                      fontWeight: 700,
                      letterSpacing: '0.2px',
                      boxShadow: '0 6px 24px rgba(232,54,61,0.38)',
                    }}
                  >
                    {loading ? 'Verifying…' : 'Verify Code'}
                  </Button>
                </motion.div>
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <Button type="link" onClick={() => setStep('login')} style={{ color: '#6B7280' }}>
                    Back to login
                  </Button>
                </div>
              </motion.div>
            </Form>
          )}
        </motion.div>

        <motion.p
          style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 12, marginTop: 24 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          © {new Date().getFullYear()} Dynamics Square™. All rights reserved.
        </motion.p>
      </div>
    </div>
  );
};

export default LoginPage;
