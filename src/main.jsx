import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthWrapper } from './components/Auth.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthWrapper>
      <App />
    </AuthWrapper>
  </React.StrictMode>,
)