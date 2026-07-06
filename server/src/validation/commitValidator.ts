/**
 * Commit and repository validation layer.
 * Detects sensitive files, validates commit message quality,
 * and enforces repository hygiene rules.
 */

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  file?: string;
  line?: number;
}

export interface ValidationWarning {
  code: string;
  message: string;
  file?: string;
}

const SENSITIVE_PATTERNS: RegExp[] = [
  /\.env$/,
  /\.env\..+$/,
  /\.key$/,
  /\.pem$/,
  /\.secret$/,
  /credentials\.json$/,
  /secrets\.ya?ml$/,
  /\.p12$/,
  /\.pfx$/,
];

const SENSITIVE_CONTENT_PATTERNS: RegExp[] = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]+['"]/i,
  /(?:secret|token|password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/i,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  /(?:mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@/,
  /ghp_[A-Za-z0-9]{36,}/,
  /sk-[A-Za-z0-9]{32,}/,
];

const BLOCKED_DIRECTORIES: string[] = [
  "node_modules",
  "dist",
  "build",
  ".cache",
  "coverage",
  ".next",
  ".nuxt",
];

const VAGUE_MESSAGES: RegExp[] = [
  /^fix(ed)?\s*(stuff|things|it)?$/i,
  /^update(d)?$/i,
  /^wip$/i,
  /^misc(\s+changes)?$/i,
  /^changes?$/i,
  /^temp$/i,
  /^todo$/i,
  /^test$/i,
  /^\.$/,
];

const CONVENTIONAL_COMMIT_REGEX =
  /^(feat|fix|refactor|perf|docs|test|build|ci|chore)(\([a-z0-9-]{1,32}\))?!?:\s.+$/;

export function detectSensitiveFiles(filePaths: string[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  for (const filePath of filePaths) {
    const normalizedPath = filePath.replace(/\\/g, "/");

    for (const dir of BLOCKED_DIRECTORIES) {
      if (
        normalizedPath.includes(`/${dir}/`) ||
        normalizedPath.startsWith(`${dir}/`)
      ) {
        errors.push({
          code: "BLOCKED_DIRECTORY",
          message: `File resides in blocked directory: ${dir}`,
          file: filePath,
        });
      }
    }

    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(normalizedPath)) {
        errors.push({
          code: "SENSITIVE_FILE",
          message: `Sensitive file detected: ${filePath}`,
          file: filePath,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function detectSensitiveContent(
  fileContent: string,
  filePath: string,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const lines = fileContent.split("\n");

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of SENSITIVE_CONTENT_PATTERNS) {
      if (pattern.test(lines[i])) {
        errors.push({
          code: "SENSITIVE_CONTENT",
          message: `Potential secret or credential detected`,
          file: filePath,
          line: i + 1,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateCommitMessage(message: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const lines = message.trim().split("\n");
  const subject = lines[0] ?? "";

  if (subject.length === 0) {
    errors.push({
      code: "EMPTY_SUBJECT",
      message: "Commit subject line is empty",
    });
    return { valid: false, errors, warnings };
  }

  if (subject.length < 10) {
    errors.push({
      code: "SUBJECT_TOO_SHORT",
      message: `Commit subject must be at least 10 characters (got ${subject.length})`,
    });
  }

  if (subject.length > 72) {
    errors.push({
      code: "SUBJECT_TOO_LONG",
      message: `Commit subject exceeds 72 characters (got ${subject.length})`,
    });
  }

  if (!CONVENTIONAL_COMMIT_REGEX.test(subject)) {
    errors.push({
      code: "INVALID_FORMAT",
      message:
        "Commit message does not follow Conventional Commits format: <type>(<scope>): <description>",
    });
  }

  for (const vaguePattern of VAGUE_MESSAGES) {
    const descriptionMatch = subject.match(/^[^:]+:\s*(.+)$/);
    const description = descriptionMatch?.[1] ?? subject;
    if (vaguePattern.test(description)) {
      errors.push({
        code: "VAGUE_MESSAGE",
        message: `Commit description is too vague: "${description}"`,
      });
      break;
    }
  }

  if (subject.endsWith(".")) {
    errors.push({
      code: "TRAILING_PERIOD",
      message: "Commit subject must not end with a period",
    });
  }

  const descriptionMatch = subject.match(/^[^:]+:\s*(.)/);
  if (
    descriptionMatch &&
    descriptionMatch[1] !== descriptionMatch[1].toLowerCase()
  ) {
    errors.push({
      code: "UPPERCASE_START",
      message: "Commit description must start with a lowercase letter",
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateRepositoryHygiene(
  filePaths: string[],
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const generatedPatterns = [/\.d\.ts\.map$/, /\.js\.map$/, /\.tsbuildinfo$/];

  for (const filePath of filePaths) {
    for (const pattern of generatedPatterns) {
      if (pattern.test(filePath)) {
        warnings.push({
          code: "GENERATED_ARTIFACT",
          message: `Generated file should not be committed: ${filePath}`,
          file: filePath,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function runFullValidation(
  filePaths: string[],
  fileContents: Map<string, string>,
  commitMessage?: string,
): ValidationResult {
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationWarning[] = [];

  const sensitiveFileResult = detectSensitiveFiles(filePaths);
  allErrors.push(...sensitiveFileResult.errors);
  allWarnings.push(...sensitiveFileResult.warnings);

  for (const [path, content] of fileContents) {
    const contentResult = detectSensitiveContent(content, path);
    allErrors.push(...contentResult.errors);
    allWarnings.push(...contentResult.warnings);
  }

  const hygieneResult = validateRepositoryHygiene(filePaths);
  allErrors.push(...hygieneResult.errors);
  allWarnings.push(...hygieneResult.warnings);

  if (commitMessage) {
    const messageResult = validateCommitMessage(commitMessage);
    allErrors.push(...messageResult.errors);
    allWarnings.push(...messageResult.warnings);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}
