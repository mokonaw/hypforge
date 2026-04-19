import React from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Boxes, Hammer, Home as HomeIcon, Github } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Accueil', icon: HomeIcon, end: true },
  { to: '/builder', label: 'Créer', icon: Hammer },
  { to: '/my-apps', label: 'Mes apps', icon: Boxes },
]

export default function AppShell() {
  const loc = useLocation()
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/60 border-b border-border/60">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center">
              <div className="absolute inset-0 rounded-lg blur-md bg-gradient-to-br from-primary to-accent opacity-50 group-hover:opacity-80 transition-opacity" />
              <span className="relative text-background font-bold text-sm">H</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-semibold tracking-tight">Hyperfy Forge</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">.hyp builder</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-full text-sm flex items-center gap-2 transition-all ${
                    isActive
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`
                }
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <a
            href="https://github.com/hyperfy-xyz/hyperfy-apps"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="GitHub"
          >
            <Github className="w-5 h-5" />
          </a>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden border-t border-border/60">
          <div className="max-w-7xl mx-auto px-2 flex">
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex-1 py-2.5 text-xs flex flex-col items-center gap-1 ${
                    isActive ? 'text-foreground' : 'text-muted-foreground'
                  }`
                }
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet key={loc.pathname} />
      </main>

      <footer className="border-t border-border/60 mt-20">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>Hyperfy Forge — outil indépendant pour créer des fichiers .hyp.</p>
          <div className="flex items-center gap-6">
            <a href="https://hyperfy.xyz" target="_blank" rel="noreferrer" className="hover:text-foreground transition">hyperfy.xyz</a>
            <a href="https://apps.hyperfy.xyz" target="_blank" rel="noreferrer" className="hover:text-foreground transition">Catalogue d'apps</a>
          </div>
        </div>
      </footer>
    </div>
  )
}