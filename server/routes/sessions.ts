import type { Express } from "express";
import { storage } from "../storage";
import { logError, getSafeErrorResponse } from "../utils/error-sanitizer";
import {
  requireAdminAuth,
  generateClientAccessToken,
  createClientSession,
  getClientIdFromRequest,
  isAdminRequest,
} from "../middleware/auth";

export function registerSessionRoutes(app: Express): void {

  // Generate or regenerate client access token (admin only)
  app.post("/api/monitoring/clients/:id/access-token", requireAdminAuth, async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      
      // Generate new access token
      const accessToken = generateClientAccessToken();
      
      // Update client with new token
      const client = await storage.updateMonitoringClient(clientId, {
        clientAccessToken: accessToken
      });
      
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      res.json({ 
        accessToken, 
        accessUrl: `/monitor/client-access/${accessToken}` 
      });
    } catch (error) {
      logError("GENERATE CLIENT ACCESS TOKEN ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to generate access token"));
    }
  });

  // Get client access token (admin only) - returns existing token without regenerating
  app.get("/api/monitoring/clients/:id/access-token", requireAdminAuth, async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      
      const client = await storage.getMonitoringClientById(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      if (!client.clientAccessToken) {
        return res.json({ accessToken: null, accessUrl: null });
      }
      
      res.json({ 
        accessToken: client.clientAccessToken, 
        accessUrl: `/monitor/client-access/${client.clientAccessToken}` 
      });
    } catch (error) {
      logError("GET CLIENT ACCESS TOKEN ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to get access token"));
    }
  });

  // Client access authentication - validates token and creates session
  app.get("/api/monitoring/client-access/:token", async (req, res) => {
    try {
      const { token } = req.params;
      
      if (!token || token.length !== 64) {
        return res.status(400).json({ error: "Invalid access token" });
      }
      
      // Find client by access token
      const client = await storage.getMonitoringClientByAccessToken(token);
      if (!client) {
        return res.status(401).json({ error: "Invalid or expired access token" });
      }
      
      // Create client session (stored in database for persistence across restarts)
      const sessionToken = await createClientSession(client.id);
      
      // Set session cookie (90 days)
      res.cookie("clientSession", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
        path: "/"
      });
      
      res.json({ 
        success: true, 
        clientId: client.id,
        businessName: client.businessName,
        redirectTo: `/monitor/dashboard/${client.id}`
      });
    } catch (error) {
      logError("CLIENT ACCESS AUTH ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to authenticate"));
    }
  });

  // Client session status check - for frontend to know if user is logged in as client
  app.get("/api/monitoring/client-session", async (req, res) => {
    try {
      const clientId = await getClientIdFromRequest(req);
      const isAdmin = await isAdminRequest(req);
      
      if (clientId !== null) {
        const client = await storage.getMonitoringClientById(clientId);
        res.json({ 
          authenticated: true, 
          isAdmin: false,
          clientId,
          businessName: client?.businessName || null
        });
      } else if (isAdmin) {
        res.json({ 
          authenticated: true, 
          isAdmin: true,
          clientId: null,
          businessName: null
        });
      } else {
        res.json({ 
          authenticated: false, 
          isAdmin: false,
          clientId: null,
          businessName: null
        });
      }
    } catch (error) {
      logError("CLIENT SESSION CHECK ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to check session"));
    }
  });
}
