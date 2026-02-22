import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import { AdminLayout } from "@/components/admin-layout";
import Home from "@/pages/home";
import AdminLogin from "@/pages/admin-login";
import AdminResetPassword from "@/pages/admin-reset-password";
import AdminAuditView from "@/pages/admin-audit-view";
import Admin from "@/pages/admin";
import AdminUsers from "@/pages/admin-users";
import AdminProfile from "@/pages/admin-profile";
import AuditView from "@/pages/audit-view";
import MonitorClients from "@/pages/monitor-clients";
import MonitorSetup from "@/pages/monitor-setup";
import MonitorDashboard from "@/pages/monitor-dashboard";
import MonitorSettings from "@/pages/monitor-settings";
import MonitorClientAccess from "@/pages/monitor-client-access";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/audit/share/:token">{() => <AuditView isSharedView={true} />}</Route>
      <Route path="/audit/:id">{() => <AuditView />}</Route>

      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/reset-password" component={AdminResetPassword} />

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
