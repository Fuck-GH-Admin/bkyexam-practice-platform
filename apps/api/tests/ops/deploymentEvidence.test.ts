import { describe, expect, it, vi } from 'vitest';
import {
  createDeploymentEvidenceTemplate,
  evaluateDeploymentEvidence,
  runDeploymentEvidenceCli,
  type DeploymentEvidenceInput,
} from '../../src/ops/deploymentEvidence';

function completeEvidence(overrides: Partial<DeploymentEvidenceInput> = {}): DeploymentEvidenceInput {
  return {
    release: {
      gitCommit: 'f4c41ab',
      branch: 'codex/practice-platform-stabilization',
      targetEnvironment: 'production',
      checkedAt: '2026-07-15T10:00:00.000Z',
      operator: 'Codex',
    },
    localGates: {
      verifyDocker: 'pass',
      backupRestore: 'pass',
      productionGate: 'pass',
      legacyStudentMigration: 'pass',
      productionGateReport: {
        ok: true,
        generatedAt: '2026-07-15T10:00:00.000Z',
        studentIdentityMigration: { legacyPasswordlessStudents: 0 },
      },
    },
    remoteCi: {
      repository: 'https://github.com/Fuck-GH-Admin/bkyexam-practice-platform',
      workflowFile: '.github/workflows/quality.yml',
      workflowRunUrl: 'https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/actions/runs/1',
      headSha: 'f4c41ab',
      qualityJob: 'pass',
      postgresIntegrationJob: 'pass',
    },
    branchProtection: {
      defaultBranch: 'main',
      protected: true,
      pullRequestRequired: true,
      requiredStatusChecks: ['quality', 'postgres-integration'],
    },
    deployment: {
      rollbackPlan: 'pass',
      smoke: 'pass',
      notes: 'Target smoke passed.',
    },
    ...overrides,
  };
}

describe('deployment evidence evaluation', () => {
  it('creates a pending evidence template', () => {
    const template = createDeploymentEvidenceTemplate(new Date('2026-07-15T10:00:00.000Z'));

    expect(template.release.checkedAt).toBe('2026-07-15T10:00:00.000Z');
    expect(template.localGates.verifyDocker).toBe('pending');
    expect(template.remoteCi.workflowFile).toBe('.github/workflows/quality.yml');
    expect(template.branchProtection.defaultBranch).toBe('main');
  });

  it('marks complete production evidence ready', () => {
    const report = evaluateDeploymentEvidence(
      completeEvidence(),
      new Date('2026-07-15T11:00:00.000Z'),
    );

    expect(report.ready).toBe(true);
    expect(report.summary.fail).toBe(0);
    expect(report.checks.map((check) => check.id)).toEqual(expect.arrayContaining([
      'remote_ci_quality_passed',
      'branch_protection_enabled',
      'legacy_student_migration_closed',
    ]));
  });

  it('fails when remote CI, branch protection, or legacy migration evidence is missing', () => {
    const evidence = completeEvidence({
      localGates: {
        verifyDocker: 'pass',
        backupRestore: 'pass',
        productionGate: 'pass',
        legacyStudentMigration: 'pending',
        productionGateReport: {
          ok: true,
          generatedAt: '2026-07-15T10:00:00.000Z',
          studentIdentityMigration: { legacyPasswordlessStudents: 3 },
        },
      },
      remoteCi: {
        ...completeEvidence().remoteCi,
        workflowRunUrl: null,
        qualityJob: 'pending',
      },
      branchProtection: {
        defaultBranch: 'main',
        protected: false,
        pullRequestRequired: false,
        requiredStatusChecks: [],
      },
    });

    const report = evaluateDeploymentEvidence(evidence);

    expect(report.ready).toBe(false);
    expect(report.checks.filter((check) => check.status === 'fail').map((check) => check.id))
      .toEqual(expect.arrayContaining([
        'legacy_student_migration_closed',
        'remote_ci_quality_passed',
        'remote_ci_run_url_present',
        'branch_protection_enabled',
        'required_status_checks_configured',
      ]));
  });
});

describe('deployment evidence CLI', () => {
  it('prints a template by default', async () => {
    const log = vi.fn();

    await expect(runDeploymentEvidenceCli({
      now: new Date('2026-07-15T10:00:00.000Z'),
      log,
      error: vi.fn(),
    })).resolves.toBe(0);

    expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({
      release: { checkedAt: '2026-07-15T10:00:00.000Z' },
      localGates: { verifyDocker: 'pending' },
    });
  });

  it('evaluates an evidence file and exits 2 when --require-ready fails', async () => {
    const log = vi.fn();

    await expect(runDeploymentEvidenceCli({
      args: ['--evidence=evidence.json', '--require-ready'],
      readText: async () => JSON.stringify(completeEvidence({
        remoteCi: {
          ...completeEvidence().remoteCi,
          postgresIntegrationJob: 'fail',
        },
      })),
      log,
      error: vi.fn(),
    })).resolves.toBe(2);

    expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({
      ready: false,
      summary: { fail: expect.any(Number) },
    });
  });

  it('writes template output when --output is provided', async () => {
    const writes: Array<{ path: string; content: string }> = [];

    await expect(runDeploymentEvidenceCli({
      args: ['--template', '--output=artifacts/evidence/template.json'],
      writeText: async (path, content) => {
        writes.push({ path, content });
      },
      log: vi.fn(),
      error: vi.fn(),
    })).resolves.toBe(0);

    expect(writes[0]?.path).toBe('artifacts/evidence/template.json');
    expect(JSON.parse(writes[0]?.content ?? '{}')).toMatchObject({
      remoteCi: { qualityJob: 'pending' },
    });
  });
});
