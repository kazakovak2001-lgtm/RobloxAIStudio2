import { Router, type Response } from "express";
import { DurableStorageError } from "../platform/storage/StorageProvider";
import {
  ChatPersistenceService,
  ChatValidationError,
  type ConversationRole,
} from "../services/ChatPersistenceService";
import type { ConcealingProjectAccess } from "./projects";
import { createResourceAuthorizer } from "./resourceAuthorization";

export function createChatPersistenceRouter(
  // These routes conceal resource existence, and the bare-boolean check is what
  // makes that possible, so the router asks for a control that provides it.
  access: ConcealingProjectAccess,
  chatPersistence: ChatPersistenceService = new ChatPersistenceService(),
): Router {
  const router = Router();

  /**
   * MAR-001. These routes already resolved correctly — they loaded the
   * conversation and authorized its own project — but the two refusals differed:
   * a missing conversation answered "Conversation not found" while another
   * tenant's answered "Project not found", which told a caller which
   * conversation ids were real. Going through the canonical helper makes the
   * project come from the loaded conversation and both refusals identical.
   */
  const requireOwned = createResourceAuthorizer(access.hasProjectAccess);
  const requireOwnedConversation = (
    req: Parameters<typeof requireOwned>[0],
    res: Response,
    id: string,
  ) =>
    requireOwned(req, res, {
      resource: "Conversation",
      id,
      load: (conversationId: string) =>
        chatPersistence.getConversation(conversationId),
      projectOf: (conversation) => conversation.projectId,
    });

  router.get("/:projectId/history", async (req, res) => {
    try {
      if (!(await access.requireProjectAccess(req, res, req.params.projectId)))
        return;
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

  router.get("/conversation/:id", async (req, res) => {
    try {
      const conversation = await requireOwnedConversation(
        req,
        res,
        req.params.id,
      );
      if (!conversation) return;
      res.json({ success: true, data: conversation });
    } catch (error) {
      handleChatError(error, res);
    }
  });

  router.post("/message", async (req, res) => {
    try {
      const { conversationId, projectId, role, content, metadata } = req.body;
      if (conversationId) {
        // Two identifiers arrive together here. The conversation is what the
        // write lands in, so it is what decides authority; the projectId beside
        // it is not consulted. The service agrees — it ignores the body's
        // projectId whenever a conversation is named — and the regression test
        // pins that rather than trusting it.
        if (!(await requireOwnedConversation(req, res, conversationId))) return;
      } else if (!(await access.requireProjectAccess(req, res, projectId))) {
        // No conversation yet, so the project the caller names is the resource
        // being acted on rather than a claim about some other object.
        return;
      }
      const message = await chatPersistence.createMessage({
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

  router.delete("/conversation/:id", async (req, res) => {
    try {
      if (!(await requireOwnedConversation(req, res, req.params.id))) return;
      const deleted = await chatPersistence.deleteConversation(req.params.id);
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
  if (error instanceof DurableStorageError) {
    res.status(503).json({
      success: false,
      error: "Chat persistence temporarily unavailable",
    });
    return;
  }
  console.error("[chat-persistence]", error);
  res.status(500).json({ success: false, error: "Chat persistence failed" });
}
