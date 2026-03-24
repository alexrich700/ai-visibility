import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import { AdminLayout } from "@/components/admin-layout";
import { Loader2 } from "lucide-react";
import Home from "@/pages/home";
import AdminLogin from "@/pages/admin-login";
import AdminResetPassword from "@/pages/admin-reset-password";
import NotFound from "@/pages/not-found";

// Lazy-load heavy pages to reduce initial bundle size
const AdminAuditView = lazy(() => import("@/pages/admin-audit-view"));
const Admin = lazy(() => import("@/pages/admin"));
const AdminUsers = lazy(() => import("@/pages/admin-users"));
const AdminProfile = lazy(() => import("@/pages/admin-profile"));
const AuditView = lazy(() => import("@/pages/audit-view"));
const MonitorClients = lazy(() => import("@/pages/monitor-clients"));
const MonitorSetup = lazy(() => import("@/pages/monitor-setup"));
const MonitorDashboard = lazy(() => import("@/pages/monitor-dashboard"));
const MonitorSettings = lazy(() => import("@/pages/monitor-settings"));
const MonitorClientAccess = lazy(() => import("@/pages/monitor-client-access"));
const SeoAuditList = lazy(() => import("@/pages/seo-audit-list"));
const SeoAuditWizard = lazy(() => import("@/pages/seo-audit-wizard"));
const SeoAuditProgress = lazy(() => import("@/pages/seo-audit-progress"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/audit/share/:token">{() => <AuditView isSharedView={true} />}</Route>
        <Route path="/audit/:id">{() => <AuditView />}</Route>

        <Route path="/admin/login" component={AdminLogin} />
        <Route path="/admin/reset-password" component={AdminResetPassword} />

        <Route path="/admin/seo-audits/new">{() => <AdminLayout><SeoAuditWizard /></AdminLayout>}</Route>
        <Route path="/admin/seo-audits/:id/progress">{() => <AdminLayout><SeoAuditProgress /></AdminLayout>}</Route>
        <Route path="/admin/seo-audits/:id/dashboard">{() => <AdminLayout><div>Dashboard placeholder</div></AdminLayout>}</Route>
        <Route path="/admin/seo-audits">{() => <AdminLayout><SeoAuditList /></AdminLayout>}</Route>

        <Route path="/admin">{() => <AdminLayout><Admin /></AdminLayout>}</Route>
        <Route path="/admin/audit/:id">{() => <AdminLayout><AdminAuditView /></AdminLayout>}</Route>
        <Route path="/admin/users">{() => <AdminLayout><AdminUsers /></AdminLayout>}</Route>
        <Route path="/admin/profile">{() => <AdminLayout><AdminProfile /></AdminLayout>}</Route>
        <Route path="/admin/monitor/clients">{() => <AdminLayout><MonitorClients /></AdminLayout>}</Route>

        <Route path="/monitor/clients">{() => <AdminLayout><MonitorClients /></AdminLayout>}</Route>
        <Route path="/monitor/setup">{() => <AdminLayout><MonitorSetup /></AdminLayout>}</Route>
        <Route path="/monitor/dashboard/:id" component={MonitorDashboard} />
        <Route path="/monitor/settings/:id">{() => <AdminLayout><MonitorSettings /></AdminLayout>}</Route>
        <Route path="/monitor/client-access/:token" component={MonitorClientAccess} />

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
