import type { ProjectDTO } from "../dto";
export interface ValidationError {
    field: string;
    message: string;
}
export declare class ProjectValidator {
    validateCreate(_data: Partial<ProjectDTO>): ValidationError[];
    validateUpdate(_data: Partial<ProjectDTO>): ValidationError[];
    validateQuery(_query: Record<string, unknown>): ValidationError[];
}
