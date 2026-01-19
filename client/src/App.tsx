import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import Admin from "@/pages/admin";
import AdminAuditView from "@/pages/admin-audit-view";
import AuditView from "@/pages/audit-view";
import MonitorClients from "@/pages/monitor-clients";
import MonitorSetup from "@/pages/monitor-setup";
import MonitorDashboard from "@/pages/monitor-dashboard";
import MonitorSettings from "@/pages/monitor-settings";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/audit/share/:token">{() => <AuditView isSharedView={true} />}</Route>
      <Route path="/audit/:id">{() => <AuditView />}</Route>
      <Route path="/admin" component={Admin} />
      <Route path="/admin/audit/:id" component={AdminAuditView} />
      <Route path="/monitor/clients" component={MonitorClients} />
      <Route path="/monitor/setup" component={MonitorSetup} />
      <Route path="/monitor/dashboard/:id" component={MonitorDashboard} />
      <Route path="/monitor/settings/:id" component={MonitorSettings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
