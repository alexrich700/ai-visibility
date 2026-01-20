import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Lock, Check, ArrowLeft, X } from "lucide-react";
import { useLocation } from "wouter";

export default function AdminResetPassword() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    if (tokenParam) {
      setToken(tokenParam);
    }
  }, []);

  const resetMutation = useMutation({
    mutationFn: async ({ token, password }: { token: string; password: string }) => {
      const response = await apiRequest("POST", "/api/admin/reset-password", { token, password });
      return response.json();
    },
    onSuccess: () => {
      setSuccess(true);
      setError("");
    },
    onError: (error: Error) => {
      if (error.message.includes("expired")) {
        setError("This reset link has expired. Please request a new one.");
      } else if (error.message.includes("Invalid")) {
        setError("This reset link is invalid. Please request a new one.");
      } else {
        setError("Failed to reset password. Please try again.");
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    resetMutation.mutate({ token, password });
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 bg-white rounded-xl border border-gray-200 shadow-2xl shadow-blue-900/5">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-red-500 rounded-xl flex items-center justify-center mx-auto mb-4">
              <X className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Invalid Link</h1>
            <p className="text-gray-500 mt-2">This password reset link is invalid or has expired.</p>
          </div>

          <Button 
            onClick={() => setLocation("/admin")}
            className="w-full bg-[#5599f9] hover:bg-[#4488e8] text-white font-bold rounded-xl py-4"
            data-testid="button-go-login"
          >
            Go to Login
          </Button>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 bg-white rounded-xl border border-gray-200 shadow-2xl shadow-blue-900/5">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-green-500 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Password Reset!</h1>
            <p className="text-gray-500 mt-2">Your password has been successfully reset.</p>
          </div>

          <Button 
            onClick={() => setLocation("/admin")}
            className="w-full bg-[#5599f9] hover:bg-[#4488e8] text-white font-bold rounded-xl py-4"
            data-testid="button-go-login"
          >
            Sign In
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 bg-white rounded-xl border border-gray-200 shadow-2xl shadow-blue-900/5">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#5599f9] rounded-xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Set New Password</h1>
          <p className="text-gray-500 mt-2">Enter your new password below</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-gray-50 border-gray-200 focus:border-[#5599f9] focus:ring-[#5599f9]"
              data-testid="input-new-password"
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="bg-gray-50 border-gray-200 focus:border-[#5599f9] focus:ring-[#5599f9]"
              data-testid="input-confirm-password"
              required
            />
          </div>
          {error && (
            <p className="text-red-500 text-sm" data-testid="text-reset-error">{error}</p>
          )}
          <Button 
            type="submit" 
            className="w-full bg-[#5599f9] hover:bg-[#4488e8] text-white font-bold rounded-xl py-4"
            disabled={resetMutation.isPending}
            data-testid="button-reset-password"
          >
            {resetMutation.isPending ? "Resetting..." : "Reset Password"}
          </Button>
        </form>

        <a 
          href="/admin" 
          className="flex items-center justify-center gap-2 mt-6 text-gray-500 hover:text-gray-700 transition-colors"
          data-testid="link-back-login"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sign In
        </a>
      </Card>
    </div>
  );
}
