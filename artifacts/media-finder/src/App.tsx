import { Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Settings as SettingsIcon } from "lucide-react";
import { useEffect } from "react";

import SearchTab from "@/pages/SearchTab";
import BatchTab from "@/pages/BatchTab";
import ProjectsTab from "@/pages/ProjectsTab";
import HistoryTab from "@/pages/HistoryTab";
import SettingsPage from "@/pages/SettingsPage";

// All top-level pages are mounted once and kept alive permanently — we only
// toggle visibility with CSS instead of unmounting via <Switch>/<Route>. This
// preserves each tab's in-memory state (search results, parsed topic lists,
// scroll position, etc.) when the user switches tabs and comes back.
const PAGES = [
  { path: "/", Component: SearchTab },
  { path: "/batch", Component: BatchTab },
  { path: "/projects", Component: ProjectsTab },
  { path: "/history", Component: HistoryTab },
  { path: "/settings", Component: SettingsPage },
] as const;

function KeepAliveRoutes() {
  const [location] = useLocation();
  return (
    <>
      {PAGES.map(({ path, Component }) => (
        <div key={path} style={{ display: location === path ? "block" : "none" }}>
          <Component />
        </div>
      ))}
    </>
  );
}

const queryClient = new QueryClient();

function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    const handler = () => setLocation("/settings");
    window.addEventListener("navigate-to-settings", handler);
    return () => window.removeEventListener("navigate-to-settings", handler);
  }, [setLocation]);

  const navClass = (path: string) =>
    `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
      location === path
        ? "bg-[#e85d04] text-white"
        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
    }`;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-foreground flex flex-col">
      <header className="border-b border-[#2a2a2a] sticky top-0 bg-[#0a0a0a]/95 backdrop-blur z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold text-[#e85d04] tracking-tight">MEDIA FINDER</h1>
            <nav className="flex items-center gap-1">
              <Link href="/" className={navClass("/")}>Search</Link>
              <Link href="/batch" className={navClass("/batch")}>Batch</Link>
              <Link href="/projects" className={navClass("/projects")}>Projects</Link>
              <Link href="/history" className={navClass("/history")}>History</Link>
            </nav>
          </div>
          <Link
            href="/settings"
            className={`p-2 rounded-md transition-colors ${
              location === "/settings"
                ? "text-[#e85d04]"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="link-settings"
          >
            <SettingsIcon className="w-5 h-5" />
          </Link>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Layout>
            <KeepAliveRoutes />
          </Layout>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
