import type { PipelineEvent } from "./pipelineTypes";
export declare class AIPipelineIntegrator {
    integrate(input: unknown): Promise<unknown>;
    emit(event: PipelineEvent): Promise<void>;
}
