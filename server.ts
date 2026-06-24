import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, GenerateVideosOperation } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Increase request size limit for base64 image uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", apiKeyConfigured: !!apiKey });
});

// 1. Start Video Generation
app.post("/api/generate-video", async (req, res) => {
  try {
    const { prompt, image, resolution, aspectRatio, previousVideo } = req.body;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured on the server.",
      });
    }

    console.log("Starting video generation with prompt:", prompt);

    // Build the payload
    const payload: any = {
      model: "veo-3.1-fast-generate-preview",
      config: {
        numberOfVideos: 1,
        resolution: resolution || "720p",
        aspectRatio: aspectRatio || "16:9",
      },
    };

    if (prompt) {
      payload.prompt = prompt;
    }

    // Check if it's an extension of a previous video
    if (previousVideo) {
      console.log("Extending previous video...");
      payload.video = previousVideo;
      // We must use 'veo-3.1-generate-preview' for extensions as veo-3.1-lite doesn't support extension,
      // and let's check if the specified fast model supports it. Using veo-3.1-fast-generate-preview is requested,
      // let's stick to the requested model.
      payload.model = "veo-3.1-fast-generate-preview";
    } else if (image) {
      console.log("Using image input for generation...");
      // Clean base64 string
      const base64Data = image.data.replace(/^data:image\/\w+;base64,/, "");
      payload.image = {
        imageBytes: base64Data,
        mimeType: image.mimeType || "image/png",
      };
    }

    const operation = await ai.models.generateVideos(payload);
    console.log("Operation created:", operation.name);

    res.json({ operationName: operation.name });
  } catch (error: any) {
    console.error("Error starting video generation:", error);
    res.status(500).json({ error: error.message || "Failed to start video generation" });
  }
});

// 2. Poll Video Operation Status
app.post("/api/video-status", async (req, res) => {
  try {
    const { operationName } = req.body;
    if (!operationName) {
      return res.status(400).json({ error: "operationName is required" });
    }

    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    }

    const op = new GenerateVideosOperation();
    op.name = operationName;

    const updated = await ai.operations.getVideosOperation({ operation: op });
    
    // If completed, let's extract the video metadata so we can return it
    let videoMetadata = null;
    if (updated.done && updated.response?.generatedVideos?.[0]) {
      videoMetadata = updated.response.generatedVideos[0].video;
    }

    res.json({
      done: updated.done,
      error: updated.error,
      videoMetadata,
    });
  } catch (error: any) {
    console.error("Error polling video status:", error);
    res.status(500).json({ error: error.message || "Failed to check video status" });
  }
});

// 3. Download and Stream Video
app.post("/api/video-download", async (req, res) => {
  try {
    const { operationName } = req.body;
    if (!operationName) {
      return res.status(400).json({ error: "operationName is required" });
    }

    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    }

    const op = new GenerateVideosOperation();
    op.name = operationName;

    const updated = await ai.operations.getVideosOperation({ operation: op });
    const uri = updated.response?.generatedVideos?.[0]?.video?.uri;

    if (!uri) {
      return res.status(404).json({ error: "Video URI not found in operation" });
    }

    console.log("Streaming video from URI:", uri);

    const videoRes = await fetch(uri, {
      headers: { "x-goog-api-key": apiKey },
    });

    if (!videoRes.ok) {
      throw new Error(`Failed to fetch video from upstream: ${videoRes.statusText}`);
    }

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", "attachment; filename=veo_generation.mp4");

    if (videoRes.body) {
      const reader = videoRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } else {
      res.status(500).json({ error: "Upstream video response has no body" });
    }
  } catch (error: any) {
    console.error("Error streaming video:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Failed to stream video" });
    }
  }
});

// Integrate Vite Dev Server in Development, otherwise Serve Static Files in Production
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite dev middleware loaded.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving static production files from /dist.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

setupVite().catch((err) => {
  console.error("Error setting up server:", err);
});
