import type { ProjectDTO } from "../dto";

export interface ValidationError {
  field: string;
  message: string;
}

export class ProjectValidator {
  validateCreate(_data: Partial<ProjectDTO>): ValidationError[] {
    const errors: ValidationError[] = [];

    // Add validation logic as needed

    return errors;
  }

  validateUpdate(_data: Partial<ProjectDTO>): ValidationError[] {
    return this.validateCreate(_data);
  }

  validateQuery(_query: Record<string, unknown>): ValidationError[] {
    return [];
  }
}
