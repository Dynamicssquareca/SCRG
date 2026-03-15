import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          fontFamily: "'Inter', sans-serif",
          colorPrimary: '#1B3A5C',
          colorInfo: '#006B7B',
          borderRadius: 6,
        },
        components: {
          Layout: {
            headerBg: '#ffffff',
          },
          Menu: {
            itemSelectedBg: '#e6f0f2',
            itemSelectedColor: '#006B7B',
          }
        }
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);
