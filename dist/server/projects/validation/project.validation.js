export class ProjectValidator {
    validateCreate(_data) {
        const errors = [];
        // Add validation logic as needed
        return errors;
    }
    validateUpdate(_data) {
        return this.validateCreate(_data);
    }
    validateQuery(_query) {
        return [];
    }
}
