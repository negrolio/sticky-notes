import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { App } from './App.tsx'

afterEach(cleanup)

test('renders the app shell', () => {
  render(<App />)
  expect(screen.getByRole('main')).toBeTruthy()
})
