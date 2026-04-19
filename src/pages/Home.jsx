import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles, Package, Cpu, Download, Zap, Layers } from 'lucide-react'

const features = [
  { icon: Sparkles, title: 'Effets prêts à l\'emploi', desc: 'Rotation, flottement, pulsation, orbite, couleurs… sans écrire une ligne de code.' },
  { icon: Package, title: 'Modèle 3D optionnel', desc: 'Attache un .glb ou .vrm à ton app — il sera embarqué directement dans le .hyp.' },
  { icon: Cpu, title: 'Script personnalisé', desc: 'Passe en mode avancé pour écrire ton propre script Hyperfy si besoin.' },
  { icon: Download, title: 'Export .hyp natif', desc: 'Format binaire officiel, prêt à glisser-déposer dans ton monde Hyperfy V2.' },
]

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        <div className="relative max-w-7xl mx-auto px-6 pt-24 pb-20 md:pt-32 md:pb-28">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/60 bg-secondary/40 text-xs tracking-wider uppercase text-muted-foreground mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Hyperfy V2 · compatible apps.hyperfy.xyz
            </div>
            <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.05]">
              Fabrique tes apps
              <br />
              <span className="text-gradient">pour Hyperfy</span>
              <span className="text-muted-foreground">.</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl">
              Choisis un effet, configure ses paramètres, optionnellement attache un modèle 3D —
              et exporte un fichier <code className="text-primary">.hyp</code> prêt à être importé dans ton monde virtuel.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                to="/builder"
                className="group inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-medium hover:shadow-[0_0_40px_-5px_hsl(var(--primary))] transition-shadow"
              >
                Créer une app
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                to="/my-apps"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-border hover:bg-secondary/60 transition-colors"
              >
                <Layers className="w-4 h-4" />
                Voir mes apps
              </Link>
            </div>
          </div>

          {/* Floating 3D-ish cube */}
          <div className="hidden lg:block absolute right-10 top-20 w-80 h-80 pointer-events-none">
            <div className="absolute inset-0 rounded-3xl border border-border/60 rotate-12 bg-gradient-to-br from-primary/5 to-accent/10 backdrop-blur-sm glow-cyan" />
            <div className="absolute inset-8 rounded-2xl border border-border/60 -rotate-6 bg-gradient-to-tl from-accent/5 to-primary/10 glow-magenta" />
            <div className="absolute inset-16 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 rotate-3 grid place-items-center">
              <Zap className="w-16 h-16 text-primary" strokeWidth={1.2} />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <div
              key={i}
              className="group relative rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-6 hover:border-primary/40 transition-colors"
            >
              <f.icon className="w-6 h-6 text-primary mb-4" strokeWidth={1.5} />
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="max-w-2xl mb-12">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-4">
            Trois étapes. Un fichier.
          </h2>
          <p className="text-muted-foreground">
            L'export respecte le format binaire officiel utilisé par <code className="text-foreground">src/core/extras/appTools.js</code> dans Hyperfy.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { n: '01', t: 'Décris ton app', d: 'Nom, description, auteur. Ajoute un modèle .glb si tu veux.' },
            { n: '02', t: 'Choisis un effet', d: 'Rotation, flottement, orbite, regard joueur, téléporteur…' },
            { n: '03', t: 'Exporte en .hyp', d: 'Un binaire prêt à importer dans ton monde Hyperfy.' },
          ].map(s => (
            <div key={s.n} className="rounded-2xl border border-border/60 p-8 bg-card/30">
              <div className="font-mono text-xs text-primary tracking-widest mb-4">{s.n}</div>
              <h3 className="text-xl font-semibold mb-2">{s.t}</h3>
              <p className="text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}