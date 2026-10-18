import { useEffect, type ReactNode } from "react";
import { NavLink, useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Activity,
  CreditCard,
  GitBranch,
  Mail,
  RefreshCw,
  Sprout,
} from "lucide-react";
import { Button } from "./Button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./Select";
import OttoChat from "./OttoChat";
import { OttoLogo } from "./OttoLogo";
import { useOttoData } from "../helpers/useOttoData";
import styles from "./OttoShell.module.css";
const nav = [
  { to: "/", name: "Overview", icon: LayoutDashboard },
  { to: "/simulation", name: "Simulation", icon: Activity },
  { to: "/grow", name: "Grow", icon: Sprout },
  { to: "/future-you", name: "Future You", icon: GitBranch },
  { to: "/approvals", name: "Approvals", icon: Mail },
  { to: "/subscriptions", name: "Subscriptions", icon: CreditCard },
  { to: "/chat", name: "Chat", icon: Activity },
];
export function OttoShell({ children }: { children: ReactNode }) {
  const d = useOttoData(),
    location = useLocation(),
    title = nav.find((n) => n.to === location.pathname)?.name || "OTTO";
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = title + " · OTTO";
  }, [location.pathname]);
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/">
          <OttoLogo />
        </Link>
        <div className={styles.headerRight}>
          <Select
            value={d.source}
            disabled={d.loading}
            onValueChange={(v) => void d.setSource(v as "demo" | "nessie")}
          >
            <SelectTrigger className={styles.source} aria-label="Data source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nessie">Bank sandbox</SelectItem>
              <SelectItem value="demo">Sample month</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh banking data"
            disabled={d.loading}
            onClick={() => void d.refresh()}
          >
            <RefreshCw size={15} />
          </Button>
        </div>
      </header>
      <aside className={styles.sidebar}>
        <span className={styles.navLabel}>YOUR MONEY, YOUR PACE</span>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <NavLink
              end={n.to === "/"}
              to={n.to}
              aria-label={n.name}
              key={n.to}
              className={({ isActive }) =>
                isActive ? styles.active : styles.nav
              }
            >
              <n.icon size={19} />
              <span>{n.name}</span>
            </NavLink>
          ))}
        </nav>
        <div className={styles.bottom}>
          <span className={styles.ottoDot}>
            <OttoLogo compact inverse size={25} />
          </span>
          <p>
            Built by Raveena + Vedika
            <br />
            <small>Technica 2026</small>
          </p>
        </div>
      </aside>
      <main className={styles.main}>
        <div className={styles.crumb}>
          OTTO <span>/</span> {title}
        </div>
        {d.notice && (
          <div className={styles.notice} role="status">
            {d.notice}
          </div>
        )}
        {d.initialized ? (
          children
        ) : (
          <section
            role="status"
            aria-live="polite"
            style={{ padding: "40px 0", color: "#607482" }}
          >
            Loading your financial data…
          </section>
        )}
        <footer className={styles.footer}>
          Built at Technica 2026
        </footer>
      </main>
      {!["/simulation", "/chat"].includes(location.pathname) && (
        <OttoChat source={d.source} level={4} day={0} contextLabel={title} />
      )}
    </div>
  );
}
