import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import './ui/styles.css'
import './ui/arcade.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing application root')
createRoot(root).render(<App />)
