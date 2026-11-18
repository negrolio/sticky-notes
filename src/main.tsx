import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { createRepository, parseBackend } from './backend.ts'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

const repository = createRepository(parseBackend(window.location.search))

createRoot(root).render(
  <StrictMode>
    <App repository={repository} />
  </StrictMode>,
)
