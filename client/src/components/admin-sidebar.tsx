import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileText, Monitor, Users, User, LogOut, ChevronUp, ExternalLink, Search } from "lucide-react";
import logoIcon from "@assets/Motivent_Logo_-_Tertiary_1774297439930.png";

const mainNav = [
  { title: "Audit Submissions", url: "/admin", icon: FileText },
  { title: "SEO Audits", url: "/admin/seo-audits", icon: Search },
  { title: "Monitoring Clients", url: "/admin/monitor/clients", icon: Monitor },
];

const managementNav = [
  { title: "Team Members", url: "/admin/users", icon: Users },
  { title: "My Profile", url: "/admin/profile", icon: User },
];

export function AdminSidebar() {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();

  const isActive = (url: string) => {
    if (url === "/admin") return location === "/admin";
    return location.startsWith(url);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login");
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-2">
          <img src={logoIcon} alt="Motivent Marketing" className="h-6 object-contain" />
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight">Admin Portal</span>
            <span className="text-xs text-muted-foreground">Internal Dashboard</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} data-testid={`nav-${item.url.replace(/\//g, "-").slice(1)}`}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {managementNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} data-testid={`nav-${item.url.replace(/\//g, "-").slice(1)}`}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid="button-user-menu"
                  data-sidebar="menu-button"
                  data-size="default"
                  aria-haspopup="true"
                  aria-label="User menu"
                  className="flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground group-data-[collapsible=icon]:!w-8 group-data-[collapsible=icon]:!h-8 group-data-[collapsible=icon]:!p-2 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0"
                >
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                    {user?.name?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-medium truncate">{user?.name || "Admin"}</span>
                    <span className="text-xs text-muted-foreground truncate">{user?.email || ""}</span>
                  </div>
                  <ChevronUp className="ml-auto" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" className="w-56">
                <DropdownMenuItem asChild>
                  <Link href="/admin/profile" className="cursor-pointer">
                    <User className="w-4 h-4 mr-2" />
                    My Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="/" className="cursor-pointer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Public Site
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer" data-testid="button-logout">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
