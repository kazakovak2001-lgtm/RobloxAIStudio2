import { Router, type Response } from "express";
import {
  ChatPersistenceService,
  ChatValidationError,
  type ConversationRole,
} from "../services/ChatPersistenceService";
import { requireProjectAccess } from "./projects";

const chatPersistence = new ChatPersistenceService();

export function createChatPersistenceRouter(): Router {
  const router = Router();

  router.get("/:projectId/history", (req, res) => {
    try {
      if (!requireProjectAccess(req, res, req.params.projectId)) return;
      const limit =
        typeof req.query.limit === "string"
          ? Number.parseInt(req.query.limit, 10)
          : undefined;
      res.json({
        success: true,
        data: chatPersistence.getHistory(req.params.projectId, limit),
      });
    } catch (error) {
      handleChatError(error, res);
    }
  });

  router.get("/conversation/:id", (req, res) => {
    try {
      const conversation = chatPersistence.getConversation(req.params.id);
      if (!conversation) {
        res
          .status(404)
          .json({ success: false, error: "Conversation not found" });
        return;
      }
      if (!requireProjectAccess(req, res, conversation.projectId)) return;
      res.json({ success: true, data: conversation });
    } catch (error) {
      handleChatError(error, res);
    }
  });

  router.post("/message", (req, res) => {
    try {
      const { conversationId, projectId, role, content, metadata } = req.body;
      if (conversationId) {
        const conversation = chatPersistence.getConversation(conversationId);
        if (!conversation) {
          res
            .status(404)
            .json({ success: false, error: "Conversation not found" });
          return;
        }
        if (!requireProjectAccess(req, res, conversation.projectId)) return;
      } else if (!requireProjectAccess(req, res, projectId)) {
        return;
      }
      const message = chatPersistence.createMessage({
        conversationId,
        projectId,
        role: role as ConversationRole,
        content,
        metadata,
      });
      res.status(201).json({ success: true, data: message });
    } catch (error) {
      handleChatError(error, res);
    }
  });

  router.delete("/conversation/:id", (req, res) => {
    try {
      const conversation = chatPersistence.getConversation(req.params.id);
      if (!conversation) {
        res
          .status(404)
          .json({ success: false, error: "Conversation not found" });
        return;
      }
      if (!requireProjectAccess(req, res, conversation.projectId)) return;
      const deleted = chatPersistence.deleteConversation(req.params.id);
      res.json({ success: true, data: { deleted } });
    } catch (error) {
      handleChatError(error, res);
    }
  });

  return router;
}

function handleChatError(error: unknown, res: Response): void {
  if (error instanceof ChatValidationError) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }
  console.error("[chat-persistence]", error);
  res.status(500).json({ success: false, error: "Chat persistence failed" });
}
