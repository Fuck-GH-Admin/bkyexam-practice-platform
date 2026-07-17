#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (process.platform !== 'linux') {
    throw new Error('Import maintenance monitoring requires Linux /proc. Run this command on the target server.');
  }

  const startedAt = new Date();
  const apiPid = options.pid ?? await resolveSystemdPid(options.service);
  const samples = [];
  let previous = null;
  const iterations = Math.max(1, Math.ceil(options.durationSeconds / options.intervalSeconds));

  for (let index = 0; index < iterations; index += 1) {
    const captured = await captureSnapshot(options, apiPid, previous);
    samples.push(captured.sample);
    previous = captured.raw;
    console.log(JSON.stringify({
      timestamp: captured.sample.timestamp,
      phase: options.phase,
      load1: captured.sample.load.load1,
      cpuIowaitPct: captured.sample.cpu.iowaitPct,
      diskUtilizationPct: captured.sample.disk.utilizationPct,
      diskQueueDepth: captured.sample.disk.ioInProgress,
      readinessMs: captured.sample.probes.readiness.durationMs,
      readinessStatus: captured.sample.probes.readiness.status,
    }));

    if (index < iterations - 1) {
      await sleep(options.intervalSeconds * 1000);
    }
  }

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    startedAt: startedAt.toISOString(),
    phase: options.phase,
    host: {
      cpuCount: cpus().length,
      apiPid,
      service: options.service,
    },
    options: {
      baseUrl: options.baseUrl,
      durationSeconds: options.durationSeconds,
      intervalSeconds: options.intervalSeconds,
      includeBanks: options.includeBanks,
    },
    summary: summarize(samples),
    samples,
  };

  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Import maintenance monitor report written to ${options.output}`);
}

function parseArgs(argv) {
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const options = {
    help: false,
    baseUrl: 'https://exam.acgbot.cc.cd',
    durationSeconds: 60,
    intervalSeconds: 5,
    includeBanks: false,
    output: resolve(`artifacts/ops/import-maintenance-monitor/${timestamp}.json`),
    phase: 'during',
    pid: null,
    service: 'bkyexam-practice-api',
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--include-banks') options.includeBanks = true;
    else if (arg.startsWith('--base-url=')) options.baseUrl = value(arg, '--base-url=').replace(/\/+$/u, '');
    else if (arg.startsWith('--duration-seconds=')) options.durationSeconds = integer(value(arg, '--duration-seconds='), 1, 86_400);
    else if (arg.startsWith('--interval-seconds=')) options.intervalSeconds = integer(value(arg, '--interval-seconds='), 1, 3_600);
    else if (arg.startsWith('--output=')) options.output = resolve(value(arg, '--output='));
    else if (arg.startsWith('--phase=')) {
      const phase = value(arg, '--phase=');
      if (!['before', 'during', 'after'].includes(phase)) throw new Error('--phase must be before, during, or after.');
      options.phase = phase;
    } else if (arg.startsWith('--pid=')) options.pid = integer(value(arg, '--pid='), 1, Number.MAX_SAFE_INTEGER);
    else if (arg.startsWith('--service=')) options.service = value(arg, '--service=');
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function usage() {
  return `Usage:
  npm run ops:import-maintenance-monitor -- \\
    --phase=during \\
    --duration-seconds=300 \\
    --interval-seconds=5 \\
    --output=/srv/bkyexam-backups/<window>/import-monitor-during.json

Options:
  --phase=before|during|after       Label the maintenance-window phase.
  --service=<systemd-unit>          Resolve the API MainPID from systemd.
  --pid=<pid>                       Monitor an explicit API process instead.
  --base-url=<url>                  Probe health/readiness; default is staging.
  --include-banks                   Also probe GET /api/banks.

The report records load, CPU iowait, memory/swap, aggregate block-device rates,
queue depth/utilization, network rates, API process RSS/CPU counters, and HTTP latency.`;
}

async function captureSnapshot(options, apiPid, previous) {
  const capturedAt = Date.now();
  const [stat, meminfo, diskstats, netdev, processStatus, processStat, probes] = await Promise.all([
    readFile('/proc/stat', 'utf8'),
    readFile('/proc/meminfo', 'utf8'),
    readFile('/proc/diskstats', 'utf8'),
    readFile('/proc/net/dev', 'utf8'),
    readOptional(`/proc/${apiPid}/status`),
    readOptional(`/proc/${apiPid}/stat`),
    captureProbes(options),
  ]);
  const raw = {
    capturedAt,
    cpu: parseCpu(stat),
    disk: parseDiskstats(diskstats),
    network: parseNetdev(netdev),
    process: parseProcessStat(processStat),
  };
  const elapsedSeconds = previous ? Math.max((capturedAt - previous.capturedAt) / 1000, 0.001) : null;

  return {
    raw,
    sample: {
      timestamp: new Date(capturedAt).toISOString(),
      load: await readLoad(),
      cpu: cpuRates(raw.cpu, previous?.cpu),
      memory: parseMeminfo(meminfo),
      disk: diskRates(raw.disk, previous?.disk, elapsedSeconds),
      network: networkRates(raw.network, previous?.network, elapsedSeconds),
      process: {
        pid: apiPid,
        ...parseProcessStatus(processStatus),
        cpuTicksPerSecond: rate(raw.process.cpuTicks, previous?.process.cpuTicks, elapsedSeconds),
      },
      probes,
    },
  };
}

async function captureProbes(options) {
  const entries = [
    ['health', '/api/health'],
    ['readiness', '/api/health/readiness'],
    ...(options.includeBanks ? [['banks', '/api/banks']] : []),
  ];
  return Object.fromEntries(await Promise.all(entries.map(async ([name, path]) => {
    const started = performance.now();
    try {
      const response = await fetch(`${options.baseUrl}${path}`, {
        headers: { 'user-agent': 'bkyexam-import-maintenance-monitor/1.0' },
        signal: AbortSignal.timeout(30_000),
      });
      return [name, {
        status: response.status,
        ok: response.ok,
        durationMs: round(performance.now() - started),
      }];
    } catch (error) {
      return [name, {
        status: null,
        ok: false,
        durationMs: round(performance.now() - started),
        error: error instanceof Error ? error.message : String(error),
      }];
    }
  })));
}

async function resolveSystemdPid(service) {
  const { stdout } = await execFileAsync('systemctl', ['show', service, '--property=MainPID', '--value']);
  const pid = Number.parseInt(stdout.trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`Unable to resolve an active MainPID for systemd service ${service}.`);
  }
  return pid;
}

async function readLoad() {
  const values = (await readFile('/proc/loadavg', 'utf8')).trim().split(/\s+/u);
  return {
    load1: Number(values[0]),
    load5: Number(values[1]),
    load15: Number(values[2]),
    runnable: values[3] ?? null,
  };
}

function parseCpu(source) {
  const values = source.split(/\r?\n/u)[0].trim().split(/\s+/u).slice(1).map(Number);
  return {
    total: values.reduce((sum, current) => sum + current, 0),
    idle: (values[3] ?? 0) + (values[4] ?? 0),
    iowait: values[4] ?? 0,
    user: (values[0] ?? 0) + (values[1] ?? 0),
    system: (values[2] ?? 0) + (values[5] ?? 0) + (values[6] ?? 0),
  };
}

function cpuRates(current, previous) {
  if (!previous) return { userPct: null, systemPct: null, idlePct: null, iowaitPct: null };
  const total = Math.max(current.total - previous.total, 1);
  return {
    userPct: percent(current.user - previous.user, total),
    systemPct: percent(current.system - previous.system, total),
    idlePct: percent(current.idle - previous.idle, total),
    iowaitPct: percent(current.iowait - previous.iowait, total),
  };
}

function parseMeminfo(source) {
  const values = Object.fromEntries(source.split(/\r?\n/u).map((line) => {
    const match = line.match(/^([^:]+):\s+(\d+)/u);
    return match ? [match[1], Number(match[2]) * 1024] : null;
  }).filter(Boolean));
  return {
    totalBytes: values.MemTotal ?? 0,
    availableBytes: values.MemAvailable ?? 0,
    usedPct: values.MemTotal ? round((1 - (values.MemAvailable ?? 0) / values.MemTotal) * 100) : null,
    swapTotalBytes: values.SwapTotal ?? 0,
    swapFreeBytes: values.SwapFree ?? 0,
  };
}

function parseDiskstats(source) {
  const aggregate = {
    sectorsRead: 0,
    sectorsWritten: 0,
    ioInProgress: 0,
    msDoingIo: 0,
    weightedMsDoingIo: 0,
  };
  for (const line of source.split(/\r?\n/u)) {
    const fields = line.trim().split(/\s+/u);
    const name = fields[2];
    if (!/^(?:sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/u.test(name ?? '')) continue;
    aggregate.sectorsRead += Number(fields[5] ?? 0);
    aggregate.sectorsWritten += Number(fields[9] ?? 0);
    aggregate.ioInProgress += Number(fields[11] ?? 0);
    aggregate.msDoingIo += Number(fields[12] ?? 0);
    aggregate.weightedMsDoingIo += Number(fields[13] ?? 0);
  }
  return aggregate;
}

function diskRates(current, previous, elapsedSeconds) {
  return {
    readBytesPerSecond: rateDelta(current.sectorsRead, previous?.sectorsRead, elapsedSeconds, 512),
    writeBytesPerSecond: rateDelta(current.sectorsWritten, previous?.sectorsWritten, elapsedSeconds, 512),
    utilizationPct: previous && elapsedSeconds
      ? round((current.msDoingIo - previous.msDoingIo) / (elapsedSeconds * 10))
      : null,
    weightedIoMsPerSecond: rateDelta(current.weightedMsDoingIo, previous?.weightedMsDoingIo, elapsedSeconds),
    ioInProgress: current.ioInProgress,
  };
}

function parseNetdev(source) {
  let receivedBytes = 0;
  let transmittedBytes = 0;
  for (const line of source.split(/\r?\n/u).slice(2)) {
    const [rawName, rawValues] = line.split(':');
    if (!rawValues || rawName.trim() === 'lo') continue;
    const values = rawValues.trim().split(/\s+/u).map(Number);
    receivedBytes += values[0] ?? 0;
    transmittedBytes += values[8] ?? 0;
  }
  return { receivedBytes, transmittedBytes };
}

function networkRates(current, previous, elapsedSeconds) {
  return {
    receivedBytesPerSecond: rateDelta(current.receivedBytes, previous?.receivedBytes, elapsedSeconds),
    transmittedBytesPerSecond: rateDelta(current.transmittedBytes, previous?.transmittedBytes, elapsedSeconds),
  };
}

function parseProcessStatus(source) {
  const rss = source.match(/^VmRSS:\s+(\d+)/mu);
  const threads = source.match(/^Threads:\s+(\d+)/mu);
  return {
    rssBytes: rss ? Number(rss[1]) * 1024 : null,
    threads: threads ? Number(threads[1]) : null,
  };
}

function parseProcessStat(source) {
  if (!source) return { cpuTicks: 0 };
  const afterCommand = source.slice(source.lastIndexOf(')') + 2).trim().split(/\s+/u);
  return {
    cpuTicks: Number(afterCommand[11] ?? 0) + Number(afterCommand[12] ?? 0),
  };
}

function summarize(samples) {
  const cpuCount = cpus().length;
  const values = {
    maxLoad1: maximum(samples.map((sample) => sample.load.load1)),
    maxCpuIowaitPct: maximum(samples.map((sample) => sample.cpu.iowaitPct)),
    maxMemoryUsedPct: maximum(samples.map((sample) => sample.memory.usedPct)),
    maxDiskUtilizationPct: maximum(samples.map((sample) => sample.disk.utilizationPct)),
    maxDiskQueueDepth: maximum(samples.map((sample) => sample.disk.ioInProgress)),
    maxReadinessMs: maximum(samples.map((sample) => sample.probes.readiness.durationMs)),
    readinessFailures: samples.filter((sample) => !sample.probes.readiness.ok).length,
  };
  return {
    ...values,
    saturationSignals: {
      load: values.maxLoad1 !== null && values.maxLoad1 >= cpuCount * 2,
      iowait: values.maxCpuIowaitPct !== null && values.maxCpuIowaitPct >= 25,
      disk: values.maxDiskUtilizationPct !== null && values.maxDiskUtilizationPct >= 90,
      readiness: values.readinessFailures > 0 || (values.maxReadinessMs ?? 0) >= 5000,
    },
  };
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

function rateDelta(current, previous, elapsedSeconds, multiplier = 1) {
  if (previous === undefined || !elapsedSeconds) return null;
  return round(((current - previous) * multiplier) / elapsedSeconds);
}

function rate(current, previous, elapsedSeconds) {
  if (previous === undefined || !elapsedSeconds) return null;
  return round((current - previous) / elapsedSeconds);
}

function maximum(values) {
  const filtered = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  return filtered.length > 0 ? Math.max(...filtered) : null;
}

function percent(value, total) {
  return round((value / total) * 100);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function value(arg, prefix) {
  const result = arg.slice(prefix.length);
  if (!result) throw new Error(`${prefix.slice(0, -1)} requires a value.`);
  return result;
}

function integer(raw, min, max) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected integer ${min}..${max}, received ${raw}.`);
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
