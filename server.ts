import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  // --- Tesla API Configuration ---
  const CLIENT_ID = process.env.TESLA_CLIENT_ID;
  const CLIENT_SECRET = process.env.TESLA_CLIENT_SECRET;
  const AUDIENCE = process.env.TESLA_AUDIENCE || "https://fleet-api.prd.na.vn.cloud.tesla.com";
  const REDIRECT_URI = `${process.env.APP_URL}/auth/callback`;

  // --- API Routes ---

  // Get Auth URL
  app.get("/api/auth/url", (req, res) => {
    const params = new URLSearchParams({
      client_id: CLIENT_ID || "",
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "openid vehicle_device_data vehicle_cmds vehicle_charging_cmds",
      state: "random_state_string",
    });
    const authUrl = `https://auth.tesla.com/oauth2/v3/authorize?${params.toString()}`;
    res.json({ url: authUrl });
  });

  // Get MapKit Token
  app.get("/api/mapkit/token", (req, res) => {
    res.json({ token: process.env.APPLE_MAPKIT_TOKEN || "" });
  });

  // Callback handler
  app.get("/auth/callback", async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).send("No code provided");
    }

    try {
      // In a real app, you'd exchange the code for tokens here
      // const response = await axios.post("https://auth.tesla.com/oauth2/v3/token", {
      //   grant_type: "authorization_code",
      //   client_id: CLIENT_ID,
      //   client_secret: CLIENT_SECRET,
      //   code,
      //   redirect_uri: REDIRECT_URI,
      // });
      // const { access_token, refresh_token } = response.data;
      
      // For this demo, we'll just simulate success
      res.send(`
        <html>
          <body style="background: #000; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif;">
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <div style="text-align: center;">
              <h2>Authentication Successful</h2>
              <p>Closing window...</p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Token exchange error:", error);
      res.status(500).send("Authentication failed");
    }
  });

  // Proxy Vehicle Data (Mocked if no token)
  app.get("/api/vehicle/data", async (req, res) => {
    // If no real token, return mock data
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return res.json({
        display_name: "Model 3 Performance",
        state: "online",
        drive_state: {
          speed: Math.floor(Math.random() * 120),
          shift_state: "D",
          latitude: 37.7749,
          longitude: -122.4194,
        },
        charge_state: {
          battery_level: 85,
          minutes_to_full_charge: 45,
          charging_state: "Charging",
        },
        climate_state: {
          inside_temp: 22.5,
          outside_temp: 18.0,
          is_climate_on: true,
        },
        vehicle_state: {
          locked: true,
          odometer: 12345.6,
        }
      });
    }

    // Real API call would go here
    res.status(501).json({ error: "Real API integration requires valid Tesla Developer credentials." });
  });

  // Command Proxy
  app.post("/api/vehicle/command", async (req, res) => {
    const { command } = req.body;
    console.log(`Executing command: ${command}`);
    res.json({ result: true, message: `Command ${command} sent successfully (Mock)` });
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
