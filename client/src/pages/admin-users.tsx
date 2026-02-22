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
import { Users, Plus, Mail, Calendar, Loader2, User, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface AdminUser {
  id: number;
  email: string;
  name: string;
  createdAt: string;
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
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Team Members</h1>
          <p className="text-muted-foreground text-sm">Manage who has access to the admin portal</p>
        </div>
        <Button
          onClick={() => setInviteOpen(true)}
          className="bg-[#5599f9] hover:bg-[#4488e8]"
          data-testid="button-invite-user"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add User
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No team members</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Add your first team member to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Name</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Email</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Joined</th>
                <th className="text-center px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors" data-testid={`row-user-${u.id}`}>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{u.name}</div>
                        {u.id === currentUser?.id && (
                          <span className="text-xs text-primary font-medium">You</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail className="w-4 h-4 text-gray-400" />
                      {u.email}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      {format(new Date(u.createdAt), "MMM d, yyyy")}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    {u.id !== currentUser?.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-gray-400 hover:text-red-500 hover:bg-red-50"
                        onClick={() => setDeleteTarget(u)}
                        data-testid={`button-delete-user-${u.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-name">Name</Label>
              <Input
                id="invite-name"
                placeholder="Full name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                data-testid="input-invite-name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                data-testid="input-invite-email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-password">Password</Label>
              <Input
                id="invite-password"
                type="password"
                placeholder="At least 6 characters"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                data-testid="input-invite-password"
                required
                minLength={6}
              />
              <p className="text-xs text-muted-foreground">They can change their password at any time from their profile.</p>
            </div>
            {inviteError && (
              <p className="text-red-500 text-sm" data-testid="text-invite-error">{inviteError}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)} data-testid="button-cancel-invite">
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[#5599f9] hover:bg-[#4488e8]"
                disabled={inviteMutation.isPending}
                data-testid="button-confirm-invite"
              >
                {inviteMutation.isPending ? "Adding..." : "Add User"}
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
