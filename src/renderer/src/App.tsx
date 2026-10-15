import { useEffect } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import CalendarPage from './pages/CalendarPage'
import ErrorBoundary from './components/ErrorBoundary'
import FollowUpPrompt from './components/FollowUpPrompt'
import { applyTheme, storedTheme, type ThemeChoice } from './lib/theme'
import { hasMod, MOD_LABEL } from './lib/platform'
import LayeringPage from './pages/LayeringPage'
import RecommendationsPage from './pages/RecommendationsPage'
import SettingsPage from './pages/SettingsPage'
import StatsPage from './pages/StatsPage'
import WardrobesPage from './pages/WardrobesPage'

const NAV = [
  { to: '/', label: 'Wardrobes', icon: '▥' },
  { to: '/layering', label: 'Layering Lab', icon: '⚗' },
  { to: '/recommendations', label: 'Recommendations', icon: '☼' },
  { to: '/calendar', label: 'Calendar', icon: '▦' },
  { to: '/stats', label: 'Stats', icon: '▤' },
  { to: '/settings', label: 'Settings', icon: '⚙' }
]

export default function App() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // The database holds the real theme choice; localStorage only avoids a flash on start.
  useEffect(() => {
    let undo = applyTheme(storedTheme())
    void window.api.settings.get('ui.theme').then((v) => {
      if (v === 'dark' || v === 'light' || v === 'system') {
        undo()
        undo = applyTheme(v as ThemeChoice)
      }
    })
    return () => undo()
  }, [])

  // Ctrl+N (Command+N on a Mac) adds a fragrance from anywhere; Ctrl+F searches (the Wardrobes page handles it itself when open).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!hasMod(e) || e.altKey || e.shiftKey) return
      const k = e.key.toLowerCase()
      if (k === 'n') {
        e.preventDefault()
        navigate('/?add=1')
      } else if (k === 'f' && pathname !== '/') {
        e.preventDefault()
        navigate('/?search=1')
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [navigate, pathname])

  return (
    <div className="flex h-full">
      <nav className="flex w-56 shrink-0 flex-col border-r border-ink-700 bg-ink-950 px-3 py-5" aria-label="Main">
        <div className="mb-8 px-3 font-display text-xl tracking-wide text-brass-400">Scent Wardrobe</div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              `mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive ? 'bg-ink-700 text-brass-400' : 'text-cream/70 hover:bg-ink-800 hover:text-cream'
              }`
            }
          >
            <span className="w-5 text-center">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
        <div className="mt-auto px-3 text-[11px] leading-relaxed text-cream/35">
          {MOD_LABEL}N add a fragrance
          <br />
          {MOD_LABEL}F search
        </div>
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <ErrorBoundary resetKey={pathname}>
          <Routes>
            <Route path="/" element={<WardrobesPage />} />
            <Route path="/layering" element={<LayeringPage />} />
            <Route path="/recommendations" element={<RecommendationsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/stats" element={<StatsPage onOpen={(id) => navigate(`/?open=${id}`)} />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <FollowUpPrompt onAnswered={() => undefined} />
    </div>
  )
}
