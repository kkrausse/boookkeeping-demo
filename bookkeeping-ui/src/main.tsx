import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// debugging duplicate useEffect() calls
// </StrictMode>,
createRoot(document.getElementById('root')!).render(
    <App />
)
