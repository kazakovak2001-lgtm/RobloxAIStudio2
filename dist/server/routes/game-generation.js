import { Router } from "express";
export function createGameGenerationRouter(gameService) {
    const router = Router();
    router.post("/generate", async (req, res) => {
        try {
            const { projectId, userId } = req.body;
            const result = await gameService.startGeneration(projectId, userId);
            res.json({ success: true, data: result });
        }
        catch (error) {
            res.status(500).json({ success: false, error: "Generation failed" });
        }
    });
    return router;
}
