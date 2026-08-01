from pathlib import Path

route = Path("server/src/socket/index.ts")
text = route.read_text()

old = '''      socket.on("project:leave", ({ projectId }: { projectId: ProjectId }) => {\n        socket.leave(`project:${projectId}`);\n        this.untrackProjectRoom(projectId, socket.id);\n        socket\n          .to(`project:${projectId}`)\n          .emit("player:left", { userId: player.userId, projectId });\n      });\n'''
new = '''      socket.on("project:leave", ({ projectId }: { projectId: ProjectId }) => {\n        if (\n          typeof projectId !== "string" ||\n          !projectId.trim() ||\n          player.projectId !== projectId.trim() ||\n          (canJoinProject &&\n            !canJoinProject(projectId.trim(), authenticatedUserId))\n        ) {\n          socket.emit("project:error", {\n            projectId,\n            error: "Project access denied",\n          });\n          return;\n        }\n\n        projectId = projectId.trim();\n        socket.leave(`project:${projectId}`);\n        this.untrackProjectRoom(projectId, socket.id);\n        player.projectId = undefined;\n        socket\n          .to(`project:${projectId}`)\n          .emit("player:left", { userId: player.userId, projectId });\n      });\n'''
if old not in text:
    raise SystemExit("socket leave anchor missing")
text = text.replace(old, new, 1)
route.write_text(text)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const socketLeaveParityEvidence =" not in matrix:
    anchor = '''const gameGenerationFinalScopeEvidence =\n  "server/src/__tests__/security2gE.game-generation-final-scope.test.ts";\n'''
    addition = '''const socketLeaveParityEvidence =\n  "server/src/__tests__/security2gE.socket-leave-parity.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("socket leave evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

block = '''  [\n    "socket|server/src/socket/index.ts|project:leave",\n    classified(\n      "authenticated",\n      "user-session",\n      "project.room.leave",\n      "joined-project",\n      socketLeaveParityEvidence,\n      socketLeaveParityEvidence,\n    ),\n  ],\n'''
if "socketLeaveParityEvidence," not in matrix.split("const overrides", 1)[1]:
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("socket leave classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
