import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAdminQueryFn, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Mail, Calendar, Loader2, Trash2, UserPlus, Shield } from "lucide-react";
import { format } from "date-fns";

interface AdminUser {
  id: number;
  email: string;
  name: string;
  createdAt: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const avatarColors = [
  "bg-orange-100 text-orange-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-purple-100 text-purple-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-cyan-100 text-cyan-700",
  "bg-indigo-100 text-indigo-700",
];

function getAvatarColor(id: number): string {
  return avatarColors[id % avatarColors.length];
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: getAdminQueryFn({ on401: "throw" }),
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/admin/invite-user", data, { useAdminAuth: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User invited", description: "The new team member has been added." });
      setInviteOpen(false);
      setInviteName("");
      setInviteEmail("");
      setInvitePassword("");
      setInviteError("");
    },
    onError: (error: Error) => {
      const msg = error.message;
      if (msg.includes("already exists")) {
        setInviteError("An account with this email already exists.");
      } else {
        setInviteError("Failed to invite user. Please try again.");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${id}`, undefined, { useAdminAuth: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User deleted", description: "The team member has been removed." });
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete user. Please try again.", variant: "destructive" });
      setDeleteTarget(null);
    },
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError("");
    inviteMutation.mutate({ name: inviteName, email: inviteEmail, password: invitePassword });
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900" data-testid="text-page-title">Team Members</h1>
            {!isLoading && users.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-[#ff5800] border border-orange-200" data-testid="text-user-count">
                {users.length} {users.length === 1 ? "member" : "members"}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm">Manage who has access to the admin portal</p>
        </div>
        <Button
          onClick={() => setInviteOpen(true)}
          className="bg-[#ff5800] hover:bg-[#e04f00] shadow-sm hover:shadow-md transition-all duration-200"
          data-testid="button-invite-user"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add User
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#ff5800]" />
        </div>
      ) : users.length === 0 ? (
        <Card className="border-dashed border-2 border-gray-200 bg-gray-50/50 shadow-none">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mb-5">
              <UserPlus className="w-8 h-8 text-[#ff5800]" />
            </div>
            <h3 className="text-lg font-semibold mb-2 text-gray-900">No team members yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-6">
              Invite your first team member to collaborate on the admin portal.
            </p>
            <Button
              onClick={() => setInviteOpen(true)}
              className="bg-[#ff5800] hover:bg-[#e04f00]"
              data-testid="button-invite-user-empty"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Member
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <div
              key={u.id}
              className="group bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4 hover:border-gray-300 hover:shadow-md transition-all duration-200 cursor-default"
              data-testid={`row-user-${u.id}`}
            >
              <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${getAvatarColor(u.id)}`}>
                {getInitials(u.name)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 truncate">{u.name}</span>
                  {u.id === currentUser?.id && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#ff5800]/10 px-2 py-0.5 text-[10px] font-semibold text-[#ff5800] uppercase tracking-wide">
                      <Shield className="w-3 h-3" />
                      You
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-500 truncate">{u.email}</span>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 text-sm text-gray-400 shrink-0">
                <Calendar className="w-3.5 h-3.5" />
                <span>{format(new Date(u.createdAt), "MMM d, yyyy")}</span>
              </div>

              <div className="shrink-0 w-9">
                {u.id !== currentUser?.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all duration-200 h-9 w-9 rounded-lg"
                    onClick={() => setDeleteTarget(u)}
                    data-testid={`button-delete-user-${u.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center mb-2">
              <UserPlus className="w-6 h-6 text-[#ff5800]" />
            </div>
            <DialogTitle className="text-xl">Add Team Member</DialogTitle>
            <DialogDescription>
              They'll receive access to the admin portal immediately.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="invite-name" className="text-sm font-medium">Name</Label>
              <Input
                id="invite-name"
                placeholder="Full name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                data-testid="input-invite-name"
                required
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email" className="text-sm font-medium">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                data-testid="input-invite-email"
                required
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-password" className="text-sm font-medium">Password</Label>
              <Input
                id="invite-password"
                type="password"
                placeholder="At least 6 characters"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                data-testid="input-invite-password"
                required
                minLength={6}
                className="h-10"
              />
              <p className="text-xs text-muted-foreground">They can change their password at any time from their profile.</p>
            </div>
            {inviteError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-red-600 text-sm" data-testid="text-invite-error">{inviteError}</p>
              </div>
            )}
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)} data-testid="button-cancel-invite">
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[#ff5800] hover:bg-[#e04f00] shadow-sm"
                disabled={inviteMutation.isPending}
                data-testid="button-confirm-invite"
              >
                {inviteMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add User"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <span className="font-semibold">{deleteTarget?.name}</span> ({deleteTarget?.email})? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
