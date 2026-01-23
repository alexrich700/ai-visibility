import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";

export default function MonitorClientAccess() {
  const [, params] = useRoute("/monitor/client-access/:token");
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [businessName, setBusinessName] = useState<string>("");

  useEffect(() => {
    const token = params?.token;
    if (!token) {
      setStatus("error");
      setErrorMessage("Invalid access link");
      return;
    }

    fetch(`/api/monitoring/client-access/${token}`, {
      credentials: "include"
    })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to authenticate");
        }
        return response.json();
      })
      .then((data) => {
        setStatus("success");
        setBusinessName(data.businessName || "your dashboard");
        setTimeout(() => {
          setLocation(data.redirectTo);
        }, 1500);
      })
      .catch((error) => {
        setStatus("error");
        setErrorMessage(error.message || "Invalid or expired access link");
      });
  }, [params?.token, setLocation]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            {status === "loading" && "Authenticating..."}
            {status === "success" && "Access Granted"}
            {status === "error" && "Access Denied"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {status === "loading" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-muted-foreground text-center">
                Verifying your access link...
              </p>
            </>
          )}
          
          {status === "success" && (
            <>
              <CheckCircle className="h-12 w-12 text-green-500" />
              <p className="text-muted-foreground text-center">
                Welcome! Redirecting to {businessName}...
              </p>
            </>
          )}
          
          {status === "error" && (
            <>
              <AlertCircle className="h-12 w-12 text-destructive" />
              <p className="text-muted-foreground text-center">
                {errorMessage}
              </p>
              <p className="text-sm text-muted-foreground text-center">
                Please contact your account manager if you believe this is an error.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
