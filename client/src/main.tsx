import React from 'react';
import './index.css';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import { SpeedInsights } from "@vercel/speed-insights/react";
import App from './App';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          fontFamily: "'Inter', sans-serif",
          colorPrimary: '#E8363D',
          colorInfo: '#E8363D',
          borderRadius: 8,
          colorBgContainer: '#FFFFFF',
          colorBorder: '#E8ECF4',
        },
        components: {
          Layout: { headerBg: '#ffffff', siderBg: '#111318' },
          Menu: {
            darkItemBg: '#111318',
            darkItemSelectedBg: '#E8363D',
            darkItemColor: 'rgba(255,255,255,0.48)',
            darkItemHoverBg: 'rgba(255,255,255,0.07)',
            darkItemSelectedColor: '#ffffff',
          },
        },
      }}
    >
      <App />
      <SpeedInsights />
    </ConfigProvider>
  </React.StrictMode>,
);
