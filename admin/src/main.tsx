import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/app';
import { Providers } from './app/providers';
import 'antd/dist/reset.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>,
);
