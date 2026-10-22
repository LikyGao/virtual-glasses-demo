import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('マウント先の #root 要素が見つかりません');
}

// StrictMode 下 effect 会执行两次：摄像头由用户手动开启 + token 防重，
// 模型加载走模块级 Promise 缓存，因此不会重复初始化。
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
