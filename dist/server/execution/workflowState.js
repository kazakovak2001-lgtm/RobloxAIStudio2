export class PipelineWorkflowState {
    constructor(pipelineId) {
        this.pipelineId = pipelineId;
        this.status = "idle";
        this.steps = new Map();
        this.startedAt = new Date();
    }
    markStepCompleted(stepId, result) {
        const step = this.steps.get(stepId);
        if (step) {
            step.status = "completed";
            step.result = result;
            step.finishedAt = new Date();
        }
    }
    markStepFailed(stepId, error) {
        const step = this.steps.get(stepId);
        if (step) {
            step.status = "failed";
            step.error = error;
            step.finishedAt = new Date();
        }
    }
    markStepRunning(stepId) {
        const step = this.steps.get(stepId);
        if (step) {
            step.status = "running";
            step.startedAt = new Date();
        }
    }
}
