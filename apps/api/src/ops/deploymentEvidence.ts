import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type EvidenceStatus = 'pass' | 'fail' | 'pending' | 'not_applicable';
export type DeploymentEvidenceCheckStatus = 'pass' | 'fail' | 'warn';

export interface DeploymentEvidenceInput {
  release: {
    gitCommit: string;
    branch: string;
    targetEnvironment: string;
    checkedAt: string;
    operator: string;
  };
  localGates: {
    verifyDocker: EvidenceStatus;
    backupRestore: EvidenceStatus;
    productionGate: EvidenceStatus;
    legacyStudentMigration: EvidenceStatus;
    productionGateReport?: ProductionGateReportEvidence;
  };
  remoteCi: {
    repository: string;
    workflowFile: string;
    workflowRunUrl: string | null;
    headSha: string | null;
    qualityJob: EvidenceStatus;
    postgresIntegrationJob: EvidenceStatus;
  };
  branchProtection: {
    defaultBranch: string;
    protected: boolean | 'unknown';
    pullRequestRequired: boolean | 'unknown';
    requiredStatusChecks: string[];
  };
  deployment: {
    rollbackPlan: EvidenceStatus;
    smoke: EvidenceStatus;
    notes: string;
  };
}

export interface ProductionGateReportEvidence {
  ok: boolean;
  generatedAt: string;
  studentIdentityMigration?: {
    legacyPasswordlessStudents: number;
  };
}

export interface DeploymentEvidenceCheck {
  id: string;
  label: string;
  status: DeploymentEvidenceCheckStatus;
  message: string;
  recommendation?: string;
}

export interface DeploymentEvidenceReport {
  ready: boolean;
  generatedAt: string;
  release: DeploymentEvidenceInput['release'];
  checks: DeploymentEvidenceCheck[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
}

export interface RunDeploymentEvidenceCliOptions {
  args?: readonly string[];
  now?: Date;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, content: string) => Promise<void>;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

export function createDeploymentEvidenceTemplate(now = new Date()): DeploymentEvidenceInput {
  return {
    release: {
      gitCommit: '<current commit>',
      branch: '<release branch>',
      targetEnvironment: '<staging|production>',
      checkedAt: now.toISOString(),
      operator: '<operator>',
    },
    localGates: {
      verifyDocker: 'pending',
      backupRestore: 'pending',
      productionGate: 'pending',
      legacyStudentMigration: 'pending',
      productionGateReport: {
        ok: false,
        generatedAt: now.toISOString(),
        studentIdentityMigration: {
          legacyPasswordlessStudents: -1,
        },
      },
    },
    remoteCi: {
      repository: 'https://github.com/Fuck-GH-Admin/bkyexam-practice-platform',
      workflowFile: '.github/workflows/quality.yml',
      workflowRunUrl: null,
      headSha: null,
      qualityJob: 'pending',
      postgresIntegrationJob: 'pending',
    },
    branchProtection: {
      defaultBranch: 'main',
      protected: 'unknown',
      pullRequestRequired: 'unknown',
      requiredStatusChecks: [],
    },
    deployment: {
      rollbackPlan: 'pending',
      smoke: 'pending',
      notes: '',
    },
  };
}

export function evaluateDeploymentEvidence(
  input: DeploymentEvidenceInput,
  now = new Date(),
): DeploymentEvidenceReport {
  const checks: DeploymentEvidenceCheck[] = [];

  checks.push(requiredTextCheck(
    'git_commit_present',
    'Release commit recorded',
    input.release.gitCommit,
    'Record the exact Git commit being deployed.',
  ));
  checks.push(requiredTextCheck(
    'release_branch_present',
    'Release branch recorded',
    input.release.branch,
    'Record the release branch or tag.',
  ));
  checks.push(requiredTextCheck(
    'target_environment_present',
    'Target environment recorded',
    input.release.targetEnvironment,
    'Record staging or production target environment.',
  ));
  checks.push(requiredStatusCheck(
    'verify_docker_passed',
    'Local verify:docker passed',
    input.localGates.verifyDocker,
    'Run npm run verify:docker and record PASS before release.',
  ));
  checks.push(requiredStatusCheck(
    'backup_restore_passed',
    'Backup/restore drill passed',
    input.localGates.backupRestore,
    'Run npm run ops:backup-restore:docker and record PASS.',
  ));
  checks.push(productionGateCheck(input.localGates.productionGate, input.localGates.productionGateReport));
  checks.push(legacyMigrationCheck(input.localGates.legacyStudentMigration, input.localGates.productionGateReport));
  checks.push(requiredStatusCheck(
    'remote_ci_quality_passed',
    'Remote quality job passed',
    input.remoteCi.qualityJob,
    'Push the branch or PR and record a passing GitHub Actions quality job URL.',
  ));
  checks.push(requiredStatusCheck(
    'remote_ci_postgres_passed',
    'Remote PostgreSQL integration job passed',
    input.remoteCi.postgresIntegrationJob,
    'Push the branch or PR and record a passing postgres-integration job URL.',
  ));
  checks.push(requiredTextCheck(
    'remote_ci_run_url_present',
    'Remote CI run URL recorded',
    input.remoteCi.workflowRunUrl ?? '',
    'Record the GitHub Actions workflow run URL.',
  ));
  checks.push(branchProtectionCheck(input.branchProtection));
  checks.push(requiredChecksConfiguredCheck(input.branchProtection.requiredStatusChecks));
  checks.push(requiredStatusCheck(
    'rollback_plan_confirmed',
    'Rollback plan confirmed',
    input.deployment.rollbackPlan,
    'Record a concrete rollback or forward-fix plan before deployment.',
  ));
  checks.push(requiredStatusCheck(
    'deployment_smoke_passed',
    'Deployment smoke passed',
    input.deployment.smoke,
    'Run health/readiness/metrics/admin login/student login smoke on the target environment.',
  ));

  const summary = {
    pass: checks.filter((check) => check.status === 'pass').length,
    warn: checks.filter((check) => check.status === 'warn').length,
    fail: checks.filter((check) => check.status === 'fail').length,
  };

  return {
    ready: summary.fail === 0,
    generatedAt: now.toISOString(),
    release: input.release,
    checks,
    summary,
  };
}

export async function runDeploymentEvidenceCli({
  args = [],
  now = new Date(),
  readText = (path) => readFile(path, 'utf8'),
  writeText = async (path, content) => {
    const resolved = resolve(path);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, content, 'utf8');
  },
  log = console.log,
  error = console.error,
}: RunDeploymentEvidenceCliOptions = {}): Promise<number> {
  let options: ReturnType<typeof parseArgs>;
  try {
    options = parseArgs(args);
  } catch (caught) {
    error(caught instanceof Error ? caught.message : String(caught));
    return 1;
  }

  try {
    if (options.template || !options.evidencePath) {
      const template = createDeploymentEvidenceTemplate(now);
      const output = JSON.stringify(template, null, 2);
      if (options.outputPath) await writeText(options.outputPath, `${output}\n`);
      else log(output);
      return 0;
    }

    const input = parseEvidenceInput(await readText(options.evidencePath));
    const report = evaluateDeploymentEvidence(input, now);
    const output = JSON.stringify(report, null, 2);
    if (options.outputPath) await writeText(options.outputPath, `${output}\n`);
    else log(output);

    return options.requireReady && !report.ready ? 2 : 0;
  } catch (caught) {
    error(caught instanceof Error ? caught.message : String(caught));
    return 1;
  }
}

function parseArgs(args: readonly string[]) {
  let template = false;
  let requireReady = false;
  let evidencePath: string | null = null;
  let outputPath: string | null = null;

  for (const arg of args) {
    if (arg === '--template') {
      template = true;
    } else if (arg === '--require-ready') {
      requireReady = true;
    } else if (arg.startsWith('--evidence=')) {
      evidencePath = requireValue(arg, '--evidence=');
    } else if (arg.startsWith('--output=')) {
      outputPath = requireValue(arg, '--output=');
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { template, requireReady, evidencePath, outputPath };
}

function parseEvidenceInput(raw: string): DeploymentEvidenceInput {
  const value = JSON.parse(raw) as DeploymentEvidenceInput;
  if (!value || typeof value !== 'object') {
    throw new Error('Deployment evidence must be a JSON object.');
  }
  if (!value.release || !value.localGates || !value.remoteCi || !value.branchProtection || !value.deployment) {
    throw new Error('Deployment evidence is missing one or more required top-level sections.');
  }
  return value;
}

function requiredTextCheck(
  id: string,
  label: string,
  value: string,
  recommendation: string,
): DeploymentEvidenceCheck {
  return {
    id,
    label,
    status: value.trim() ? 'pass' : 'fail',
    message: value.trim() ? value.trim() : 'Missing required evidence.',
    recommendation,
  };
}

function requiredStatusCheck(
  id: string,
  label: string,
  status: EvidenceStatus,
  recommendation: string,
): DeploymentEvidenceCheck {
  if (status === 'pass') {
    return { id, label, status: 'pass', message: 'PASS recorded.', recommendation };
  }

  return {
    id,
    label,
    status: 'fail',
    message: `${status.toUpperCase()} recorded; production-ready evidence requires PASS.`,
    recommendation,
  };
}

function productionGateCheck(
  status: EvidenceStatus,
  report: ProductionGateReportEvidence | undefined,
): DeploymentEvidenceCheck {
  if (status !== 'pass') {
    return requiredStatusCheck(
      'production_gate_passed',
      'Production gate passed',
      status,
      'Run npm run ops:production-gate against the target database.',
    );
  }

  if (!report) {
    return {
      id: 'production_gate_passed',
      label: 'Production gate passed',
      status: 'fail',
      message: 'PASS recorded but no production gate JSON summary was attached.',
      recommendation: 'Attach the JSON output from npm run ops:production-gate.',
    };
  }

  if (!report.ok) {
    return {
      id: 'production_gate_passed',
      label: 'Production gate passed',
      status: 'fail',
      message: 'Attached production gate report has ok=false.',
      recommendation: 'Fix blocking production gate checks before release.',
    };
  }

  return {
    id: 'production_gate_passed',
    label: 'Production gate passed',
    status: 'pass',
    message: `PASS recorded; report generated at ${report.generatedAt}.`,
    recommendation: 'Keep the production gate JSON in the release evidence package.',
  };
}

function legacyMigrationCheck(
  status: EvidenceStatus,
  report: ProductionGateReportEvidence | undefined,
): DeploymentEvidenceCheck {
  const remainingLegacy = report?.studentIdentityMigration?.legacyPasswordlessStudents;
  if (remainingLegacy === 0) {
    return {
      id: 'legacy_student_migration_closed',
      label: 'Legacy student migration closed',
      status: 'pass',
      message: 'Production gate report shows legacyPasswordlessStudents=0.',
      recommendation: 'Keep the production gate JSON in the release evidence package.',
    };
  }

  if (typeof remainingLegacy === 'number' && remainingLegacy > 0) {
    return {
      id: 'legacy_student_migration_closed',
      label: 'Legacy student migration closed',
      status: 'fail',
      message: `Production gate report still shows ${remainingLegacy} legacy passwordless students.`,
      recommendation: 'Run npm run ops:legacy-student-password-migration and rerun production gate.',
    };
  }

  return requiredStatusCheck(
    'legacy_student_migration_closed',
    'Legacy student migration closed',
    status,
    'Record either a passing migration execution or a production gate report with legacyPasswordlessStudents=0.',
  );
}

function branchProtectionCheck(
  branchProtection: DeploymentEvidenceInput['branchProtection'],
): DeploymentEvidenceCheck {
  if (branchProtection.protected === true && branchProtection.pullRequestRequired === true) {
    return {
      id: 'branch_protection_enabled',
      label: 'Branch protection enabled',
      status: 'pass',
      message: `${branchProtection.defaultBranch} is protected and requires pull requests.`,
      recommendation: 'Keep branch protection settings in the release evidence package.',
    };
  }

  return {
    id: 'branch_protection_enabled',
    label: 'Branch protection enabled',
    status: 'fail',
    message: `protected=${String(branchProtection.protected)}, pullRequestRequired=${String(branchProtection.pullRequestRequired)}.`,
    recommendation: 'Enable branch protection with pull request and required status checks before production release.',
  };
}

function requiredChecksConfiguredCheck(requiredStatusChecks: readonly string[]): DeploymentEvidenceCheck {
  const normalized = new Set(requiredStatusChecks.map((check) => check.toLocaleLowerCase()));
  const missing = ['quality', 'postgres-integration'].filter((check) => !normalized.has(check));
  return {
    id: 'required_status_checks_configured',
    label: 'Required status checks configured',
    status: missing.length === 0 ? 'pass' : 'fail',
    message: missing.length === 0
      ? 'quality and postgres-integration are required checks.'
      : `Missing required checks: ${missing.join(', ')}.`,
    recommendation: 'Require quality and postgres-integration in branch protection.',
  };
}

function requireValue(arg: string, prefix: string) {
  const value = arg.slice(prefix.length).trim();
  if (!value) {
    throw new Error(`${prefix.slice(0, -1)} requires a value.`);
  }
  return value;
}

async function main(): Promise<void> {
  process.exitCode = await runDeploymentEvidenceCli({
    args: process.argv.slice(2),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((caught: unknown) => {
    console.error(caught instanceof Error ? caught.message : String(caught));
    process.exitCode = 1;
  });
}
