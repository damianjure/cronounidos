"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  Clock3,
  Home,
  LayoutList,
  Monitor,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  Smartphone,
  Users,
} from "lucide-react";
import { Button } from "./ui/button";
const navigation = [
  { href: "/inicio", label: "Inicio", icon: Home },
  { href: "/cronograma", label: "Cronograma", icon: LayoutList },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/personas", label: "Personas y equipos", icon: Users },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [mobile, setMobile] = useState(false);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const query = matchMedia(
      "(min-width:1024px) and (hover:hover) and (pointer:fine)",
    );
    const sync = () => {
      setDesktop(
        query.matches && !matchMedia("(display-mode: standalone)").matches,
      );
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const active = (href: string) =>
    path === href ? ("page" as const) : undefined;
  return (
    <div
      className="shell"
      data-preview={desktop && mobile ? "mobile" : "desktop"}
    >
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <aside className="sidebar">
        <Link href="/" className="logo">
          <span className="brand-mark">
            <Clock3 size={25} />
          </span>
          <span>
            Chrono Unidos<small>Unidos para Servir</small>
          </span>
        </Link>
        <nav aria-label="Navegación principal">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={active(href)}>
              <Icon size={20} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <ShieldCheck size={22} />
          <p>
            Un mismo plan.
            <br />
            Cada equipo en su lugar.
          </p>
          <Link href="/">Ver agenda pública</Link>
        </div>
      </aside>
      <header className="topbar">
        <Link href="/" className="logo">
          <span className="brand-mark">
            <Clock3 size={23} />
          </span>
          <span>Chrono Unidos</span>
        </Link>
        <span className="muted">Unidos para Servir</span>
        <div className="desktop-tools">
          {desktop && (
            <button
              className="preview-toggle"
              aria-pressed={mobile}
              onClick={() => setMobile(!mobile)}
            >
              {mobile ? <Smartphone size={18} /> : <Monitor size={18} />}Vista{" "}
              {mobile ? "Mobile" : "Desktop"}
            </button>
          )}
        </div>
        <Button asChild variant="outline">
          <Link href="/ingresar">Mi cuenta</Link>
        </Button>
      </header>
      <main id="contenido" className="main">
        {children}
      </main>
      <nav className="bottom-nav" aria-label="Navegación móvil">
        {[
          ...navigation.slice(0, 3),
          { href: "/mas", label: "Más", icon: MoreHorizontal },
        ].map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={active(href)}>
            <Icon size={22} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
