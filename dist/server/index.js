import express from "express";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { createProjectsRouter } from "./routes/projects";
import { createGameGenerationRouter } from "./routes/game-generation";
import { GameGenerationService } from "./projects/services/game-generation.service";
import { InMemoryProjectRepository } from "./projects/repository/inMemoryProject.repository";
import { BlueprintCache } from "./projects/cache/blueprint.cache";
import { StreamingUpdateHandler, PipelineEventEmitter } from "./socket/streaming";
const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"],
    },
});
// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// CORS
app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});
// Request logging
app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});
// Health check
app.get("/health", (_req, res) => {
    res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
    });
});
// API Routes
app.use("/api/projects", createProjectsRouter());
app.use("/api/projects", createGameGenerationRouter(new GameGenerationService(new InMemoryProjectRepository(), new BlueprintCache(), new StreamingUpdateHandler(), new PipelineEventEmitter())));
// Root endpoint
app.get("/", (_req, res) => {
    res.json({
        name: "Roblox AI Studio - Game Generation Engine",
        version: "1.0.0",
        status: "running",
    });
});
// Error handling middleware
app.use((err, _req, res, _next) => {
    console.error("Error:", err);
    const statusCode = err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(statusCode).json({
        success: false,
        error: message,
        details: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
});
// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "Not Found",
        path: req.path,
    });
});
// Start server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 Roblox AI Studio - Game Generation Engine`);
    console.log(`📡 Server running on http://0.0.0.0:${PORT}`);
    console.log(`🔌 WebSocket connected via Socket.io`);
    console.log(`✅ Ready for incoming game generation requests\n`);
});
// Graceful shutdown
process.on("SIGTERM", () => {
    console.log("\n📴 SIGTERM received, shutting down gracefully...");
    httpServer.close(() => {
        console.log("✅ Server closed");
        process.exit(0);
    });
});
process.on("SIGINT", () => {
    console.log("\n📴 SIGINT received, shutting down gracefully...");
    httpServer.close(() => {
        console.log("✅ Server closed");
        process.exit(0);
    });
});
export { app, httpServer, io };
