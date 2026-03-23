import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Lock, Check, ArrowLeft, KeyRound } from "lucide-react";

type AuthView = "login" | "forgot-password" | "reset-sent";

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { login, isAuthenticated } = useAuth();
  const [authView, setAuthView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const redirect = new URLSearchParams(searchString).get("redirect") || "/admin";

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const response = await apiRequest("POST", "/api/admin/login", { email, password });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.token && data.user) {
        login(data.token, data.user);
        navigate(redirect);
      }
    },
    onError: (error: Error) => {
      if (error.message.includes("429")) {
        setLoginError("Too many login attempts. Please try again later.");
      } else {
        setLoginError("Invalid email or password");
      }
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/admin/forgot-password", { email });
      return response.json();
    },
    onSuccess: () => {
      setAuthView("reset-sent");
      setLoginError("");
    },
    onError: () => {
      setLoginError("Failed to send reset email. Please try again.");
    },
  });

  if (isAuthenticated) {
    navigate(redirect);
    return null;
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    loginMutation.mutate({ email, password });
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    forgotPasswordMutation.mutate(email);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 bg-white rounded-xl border border-gray-200 shadow-2xl shadow-orange-900/5">
        {authView === "login" && (
          <>
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-[#ff5800] rounded-xl flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Admin Portal</h1>
              <p className="text-gray-500 mt-2">Sign in to access the dashboard</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-gray-50 border-gray-200 focus:border-[#ff5800] focus:ring-[#ff5800]"
                  data-testid="input-admin-email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-gray-50 border-gray-200 focus:border-[#ff5800] focus:ring-[#ff5800]"
                  data-testid="input-admin-password"
                  required
                />
              </div>
              {loginError && (
                <p className="text-red-500 text-sm" data-testid="text-login-error">{loginError}</p>
              )}
              <Button
                type="submit"
                className="w-full bg-[#ff5800] hover:bg-[#e04f00] text-white font-bold rounded-xl py-4"
                disabled={loginMutation.isPending}
                data-testid="button-admin-login"
              >
                {loginMutation.isPending ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            <button
              type="button"
              onClick={() => {
                setAuthView("forgot-password");
                setLoginError("");
              }}
              className="w-full mt-4 text-sm text-[#ff5800] hover:text-[#e04f00] transition-colors"
              data-testid="link-forgot-password"
            >
              Forgot your password?
            </button>
          </>
        )}

        {authView === "forgot-password" && (
          <>
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-[#ff5800] rounded-xl flex items-center justify-center mx-auto mb-4">
                <KeyRound className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Reset Password</h1>
              <p className="text-gray-500 mt-2">Enter your email to receive a reset link</p>
            </div>

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-gray-50 border-gray-200 focus:border-[#ff5800] focus:ring-[#ff5800]"
                  data-testid="input-reset-email"
                  required
                />
              </div>
              {loginError && (
                <p className="text-red-500 text-sm">{loginError}</p>
              )}
              <Button
                type="submit"
                className="w-full bg-[#ff5800] hover:bg-[#e04f00] text-white font-bold rounded-xl py-4"
                disabled={forgotPasswordMutation.isPending}
                data-testid="button-send-reset"
              >
                {forgotPasswordMutation.isPending ? "Sending..." : "Send Reset Link"}
              </Button>
            </form>

            <button
              type="button"
              onClick={() => {
                setAuthView("login");
                setLoginError("");
              }}
              className="w-full mt-4 text-sm text-gray-500 hover:text-gray-700 transition-colors flex items-center justify-center gap-2"
              data-testid="link-back-login"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Sign In
            </button>
          </>
        )}

        {authView === "reset-sent" && (
          <>
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-green-500 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Check Your Email</h1>
              <p className="text-gray-500 mt-2">
                If an account exists for {email}, we've sent a password reset link.
              </p>
            </div>

            <Button
              onClick={() => {
                setAuthView("login");
                setEmail("");
              }}
              className="w-full bg-[#ff5800] hover:bg-[#e04f00] text-white font-bold rounded-xl py-4"
              data-testid="button-back-login"
            >
              Back to Sign In
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
