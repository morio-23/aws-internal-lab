import {
  getLifecycleOperation,
  setOperationStatus,
} from "../../../packages/db/src/lifecycle-repository.js";
import {
  createStandardSnapshotRecord,
  getAvailableSnapshotForWorkspace,
  listProtectedStandardSnapshotIds,
  markSnapshotFailed,
  markSnapshotRestored,
  markStandardSnapshotAvailable,
} from "../../../packages/db/src/snapshot-repository.js";
import {
  createStartingStandardRuntime,
  finishStandardRuntime,
  getActiveRuntimeForWorkspace,
  listActiveStandardRuntimes,
  markRuntimeHeartbeat,
  markStandardRuntimeReady,
  recordStandardRuntimeTaskStarted,
} from "../../../packages/db/src/runtime-repository.js";
import type {
  SnapshotManifestStore,
} from "../../../packages/runtime-control/src/snapshot-manifest.js";
import type {
  StandardSnapshotManager,
} from "../../../packages/runtime-control/src/standard-snapshot.js";
import type {
  ManagedStandardTask,
  StandardRuntimeProvisioner,
} from "../../../packages/runtime-control/src/standard-runtime.js";
import type { RuntimeGatewayAdmin } from "./runtime-gateway-admin.js";

function errorCode(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 120);
  }
  return "STANDARD_RUNTIME_OPERATION_FAILED";
}

async function waitForRuntimeReady(input: {
  provisioner: StandardRuntimeProvisioner;
  taskArn: string;
  attempts?: number;
  intervalMs?: number;
}): Promise<{ privateIpv4Address: string; stateVolumeId: string }> {
  const attempts = input.attempts ?? 60;
  const intervalMs = input.intervalMs ?? 2_000;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const inspection = await input.provisioner.inspect(input.taskArn);

    if (inspection.state === "stopped" || inspection.state === "missing") {
      throw new Error(
        "STANDARD_RUNTIME_STOPPED_BEFORE_READY:" +
          (inspection.stoppedReason ?? inspection.state),
      );
    }

    if (
      inspection.state === "running" &&
      inspection.privateIpv4Address &&
      inspection.stateVolumeId
    ) {
      return {
        privateIpv4Address: inspection.privateIpv4Address,
        stateVolumeId: inspection.stateVolumeId,
      };
    }

    if (attempt + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error("STANDARD_RUNTIME_READY_TIMEOUT");
}

async function waitForRuntimeStopped(input: {
  provisioner: StandardRuntimeProvisioner;
  taskArn: string;
  attempts?: number;
  intervalMs?: number;
}): Promise<void> {
  const attempts = input.attempts ?? 60;
  const intervalMs = input.intervalMs ?? 2_000;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const inspection = await input.provisioner.inspect(input.taskArn);
    if (inspection.state === "stopped") return;
    if (inspection.state === "missing") {
      throw new Error("STANDARD_RUNTIME_MISSING_DURING_STOP");
    }
    if (attempt + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error("STANDARD_RUNTIME_STOP_TIMEOUT");
}

async function startStandardRuntime(input: {
  databaseUrl: string;
  workspaceId: string;
  provisioner: StandardRuntimeProvisioner;
  restoreSnapshotId?: string;
}) {
  const runtime = await createStartingStandardRuntime({
    databaseUrl: input.databaseUrl,
    workspaceId: input.workspaceId,
  });
  let taskArn: string | undefined;

  try {
    const started = await input.provisioner.start({
      workspaceId: input.workspaceId,
      sessionId: runtime.sessionId,
      virtualAccountId: runtime.virtualAccountId,
      enabledRegions: runtime.enabledRegions,
      ...(input.restoreSnapshotId
        ? { restoreSnapshotId: input.restoreSnapshotId }
        : {}),
    });
    taskArn = started.taskArn;

    await recordStandardRuntimeTaskStarted({
      databaseUrl: input.databaseUrl,
      runtimeId: runtime.runtimeId,
      providerRef: taskArn,
    });

    const ready = await waitForRuntimeReady({
      provisioner: input.provisioner,
      taskArn,
    });

    await markStandardRuntimeReady({
      databaseUrl: input.databaseUrl,
      runtimeId: runtime.runtimeId,
      providerRef: taskArn,
      privateEndpoint: ready.privateIpv4Address + ":8080",
      stateVolumeRef: ready.stateVolumeId,
    });

    return { runtime, taskArn };
  } catch (error) {
    if (taskArn) {
      try {
        await input.provisioner.stop(
          taskArn,
          "rollback failed Standard Runtime start",
        );
      } catch {
        // Reconciler handles an orphan if cleanup cannot complete here.
      }
    }

    await finishStandardRuntime({
      databaseUrl: input.databaseUrl,
      workspaceId: input.workspaceId,
      runtimeId: runtime.runtimeId,
      finalStatus: "failed",
    });
    throw error;
  }
}

export async function executeStandardRuntimeOperation(input: {
  databaseUrl: string;
  operationId: string;
  provisioner: StandardRuntimeProvisioner;
  snapshotManager?: StandardSnapshotManager;
  manifestStore?: SnapshotManifestStore;
  gatewayAdmin?: RuntimeGatewayAdmin;
  now?: () => Date;
}): Promise<void> {
  const operation = await getLifecycleOperation({
    databaseUrl: input.databaseUrl,
    operationId: input.operationId,
  });

  if (!operation) throw new Error("OPERATION_NOT_FOUND");
  if (
    operation.status === "succeeded" ||
    operation.status === "failed" ||
    operation.status === "cancelled" ||
    operation.status === "timedOut"
  ) {
    return;
  }

  await setOperationStatus({
    databaseUrl: input.databaseUrl,
    operationId: operation.id,
    status: "running",
  });

  if (operation.operationType === "start") {
    try {
      await startStandardRuntime({
        databaseUrl: input.databaseUrl,
        workspaceId: operation.workspaceId,
        provisioner: input.provisioner,
      });
      await setOperationStatus({
        databaseUrl: input.databaseUrl,
        operationId: operation.id,
        status: "succeeded",
      });
      return;
    } catch (error) {
      await setOperationStatus({
        databaseUrl: input.databaseUrl,
        operationId: operation.id,
        status: "failed",
        errorCode: errorCode(error),
      });
      throw error;
    }
  }

  if (operation.operationType === "stop") {
    try {
      const runtime = await getActiveRuntimeForWorkspace({
        databaseUrl: input.databaseUrl,
        workspaceId: operation.workspaceId,
      });

      if (runtime) {
        if (runtime.runtimeType !== "standard") {
          throw new Error("ACTIVE_RUNTIME_NOT_STANDARD");
        }
        if (runtime.providerRef) {
          await input.provisioner.stop(
            runtime.providerRef,
            "Workspace Standard Runtime stop",
          );
          await waitForRuntimeStopped({
            provisioner: input.provisioner,
            taskArn: runtime.providerRef,
          });
        }
        if (runtime.stateVolumeRef && input.snapshotManager) {
          try {
            await input.snapshotManager.deleteVolume(runtime.stateVolumeRef);
          } catch {
            // Task stop is authoritative. Managed-volume reconciliation will
            // retry cleanup once ECS has detached the preserved EBS volume.
          }
        }
        await finishStandardRuntime({
          databaseUrl: input.databaseUrl,
          workspaceId: operation.workspaceId,
          runtimeId: runtime.runtimeId,
          finalStatus: "stopped",
        });
      }

      await setOperationStatus({
        databaseUrl: input.databaseUrl,
        operationId: operation.id,
        status: "succeeded",
      });
      return;
    } catch (error) {
      await setOperationStatus({
        databaseUrl: input.databaseUrl,
        operationId: operation.id,
        status: "failed",
        errorCode: errorCode(error),
      });
      throw error;
    }
  }

  if (operation.operationType === "suspend") {
    if (!input.snapshotManager || !input.manifestStore || !input.gatewayAdmin) {
      const error = new Error("SNAPSHOT_DEPENDENCY_UNAVAILABLE");
      await setOperationStatus({
        databaseUrl: input.databaseUrl,
        operationId: operation.id,
        status: "failed",
        errorCode: error.message,
      });
      throw error;
    }

    const runtime = await getActiveRuntimeForWorkspace({
      databaseUrl: input.databaseUrl,
      workspaceId: operation.workspaceId,
    });
    if (
      !runtime ||
      runtime.runtimeType !== "standard" ||
      !runtime.providerRef ||
      !runtime.stateVolumeRef ||
      !runtime.privateEndpoint
    ) {
      const error = new Error("STANDARD_RUNTIME_NOT_SNAPSHOT_READY");
      await setOperationStatus({
        databaseUrl: input.databaseUrl,
        operationId: operation.id,
        status: "failed",
        errorCode: error.message,
      });
      throw error;
    }

    const snapshot = await createStandardSnapshotRecord({
      databaseUrl: input.databaseUrl,
      workspaceId: operation.workspaceId,
      sourceSessionId: runtime.sessionId,
    });
    const gatewayIdentity = {
      endpoint: runtime.privateEndpoint,
      workspaceId: operation.workspaceId,
      sessionId: runtime.sessionId,
      virtualAccountId: runtime.virtualAccountId,
    };

    let gatewayQuiesced = false;
    let createdSnapshotId: string | undefined;
    let manifestKey: string | undefined;
    let stopRequested = false;
    let taskStopped = false;

    try {
      // Non-destructive Suspend protocol:
      // 1. stop new learner mutations and drain in-flight work,
      // 2. persist MiniStack state while the source Task is still alive,
      // 3. take the EBS snapshot,
      // 4. only after the durable copy exists, stop the source Task.
      await input.gatewayAdmin.quiesce(gatewayIdentity);
      gatewayQuiesced = true;
      await input.gatewayAdmin.persist(gatewayIdentity);

      const created = await input.snapshotManager.createSnapshot({
        volumeId: runtime.stateVolumeRef,
        workspaceId: operation.workspaceId,
        snapshotId: snapshot.id,
      });
      createdSnapshotId = created.snapshotId;

      const manifest = await input.manifestStore.putManifest({
        snapshotFormatVersion: 1,
        runtimeType: "standard",
        payloadType: "ebs-snapshot",
        snapshotId: snapshot.id,
        workspaceId: operation.workspaceId,
        sourceSessionId: runtime.sessionId,
        ebsSnapshotId: created.snapshotId,
        consistencyLevel: "application-consistent",
        virtualRegions: runtime.enabledRegions,
        createdAt: (input.now?.() ?? new Date()).toISOString(),
      });
      manifestKey = manifest.key;

      stopRequested = true;
      await input.provisioner.stop(
        runtime.providerRef,
        "Workspace Standard Runtime suspend",
      );
      await waitForRuntimeStopped({
        provisioner: input.provisioner,
        taskArn: runtime.providerRef,
      });
      taskStopped = true;

      await finishStandardRuntime({
        databaseUrl: input.databaseUrl,
        workspaceId: operation.workspaceId,
        runtimeId: runtime.runtimeId,
        finalStatus: "stopped",
      });

      await markStandardSnapshotAvailable({
        databaseUrl: input.databaseUrl,
        snapshotId: snapshot.id,
        providerSnapshotRef: created.snapshotId,
        manifestKey: manifest.key,
      });

      try {
        await input.snapshotManager.deleteVolume(runtime.stateVolumeRef);
      } catch {
        // Snapshot is already durable. Reconciler/cleanup handles orphan volume.
      }

      await setOperationStatus({
        databaseUrl: input.databaseUrl,
        operationId: operation.id,
        status: "succeeded",
      });
      return;
    } catch (error) {
      // Before StopTask is requested the source Runtime is still intact.
      // Roll it back to ready and discard any partial durable copy.
      if (!stopRequested && gatewayQuiesced) {
        let unquiesced = false;
        try {
          await input.gatewayAdmin.unquiesce(gatewayIdentity);
          unquiesced = true;
        } catch {
          // Fail closed: leave the Runtime quiesced for operator recovery.
        }

        if (unquiesced) {
          if (manifestKey) {
            try {
              await input.manifestStore.deleteManifest(manifestKey);
            } catch {
              // Snapshot cleanup can be retried out of band.
            }
          }
          if (createdSnapshotId) {
            try {
              await input.snapshotManager.deleteSnapshot(createdSnapshotId);
            } catch {
              // Managed snapshot tags allow later cleanup.
            }
          }
        }
      }

      await markSnapshotFailed({
        databaseUrl: input.databaseUrl,
        snapshotId: snapshot.id,
        errorCode: errorCode(error),
      });

      if (taskStopped) {
        await finishStandardRuntime({
          databaseUrl: input.databaseUrl,
          workspaceId: operation.workspaceId,
          runtimeId: runtime.runtimeId,
          finalStatus: "failed",
        });
      }

      await setOperationStatus({
        databaseUrl: input.databaseUrl,
        operationId: operation.id,
        status: "failed",
        errorCode: errorCode(error),
      });
      throw error;
    }
  }

  if (operation.operationType === "resume") {
    if (!input.manifestStore) {
      const error = new Error("SNAPSHOT_DEPENDENCY_UNAVAILABLE");
      await setOperationStatus({
        databaseUrl: input.databaseUrl,
        operationId: operation.id,
        status: "failed",
        errorCode: error.message,
      });
      throw error;
    }

    try {
      const snapshot = await getAvailableSnapshotForWorkspace({
        databaseUrl: input.databaseUrl,
        workspaceId: operation.workspaceId,
      });
      if (
        !snapshot ||
        !snapshot.providerSnapshotRef ||
        !snapshot.manifestKey
      ) {
        throw new Error("AVAILABLE_SNAPSHOT_NOT_FOUND");
      }

      const manifest = await input.manifestStore.getManifest(
        snapshot.manifestKey,
      );
      if (
        manifest.workspaceId !== operation.workspaceId ||
        manifest.snapshotId !== snapshot.id ||
        manifest.ebsSnapshotId !== snapshot.providerSnapshotRef
      ) {
        throw new Error("SNAPSHOT_MANIFEST_MISMATCH");
      }

      await startStandardRuntime({
        databaseUrl: input.databaseUrl,
        workspaceId: operation.workspaceId,
        provisioner: input.provisioner,
        restoreSnapshotId: snapshot.providerSnapshotRef,
      });

      await markSnapshotRestored({
        databaseUrl: input.databaseUrl,
        snapshotId: snapshot.id,
      });

      await setOperationStatus({
        databaseUrl: input.databaseUrl,
        operationId: operation.id,
        status: "succeeded",
      });
      return;
    } catch (error) {
      await setOperationStatus({
        databaseUrl: input.databaseUrl,
        operationId: operation.id,
        status: "failed",
        errorCode: errorCode(error),
      });
      throw error;
    }
  }

  await setOperationStatus({
    databaseUrl: input.databaseUrl,
    operationId: operation.id,
    status: "failed",
    errorCode: "UNSUPPORTED_STANDARD_RUNTIME_OPERATION",
  });
  throw new Error("UNSUPPORTED_STANDARD_RUNTIME_OPERATION");
}

export async function cleanupOrphanStandardTasks(input: {
  provisioner: StandardRuntimeProvisioner;
  activeTaskArns: readonly string[];
  now?: Date;
  graceMs?: number;
}): Promise<{ inspected: number; stopped: number }> {
  const tasks: ManagedStandardTask[] = await input.provisioner.listManagedTasks();
  const active = new Set(input.activeTaskArns);
  const now = input.now ?? new Date();
  const graceMs = input.graceMs ?? 10 * 60_000;
  let stopped = 0;

  for (const task of tasks) {
    if (active.has(task.taskArn)) continue;
    if (now.getTime() - task.createdAt.getTime() < graceMs) continue;
    await input.provisioner.stop(task.taskArn, "Orphan Standard Runtime cleanup");
    stopped += 1;
  }

  return { inspected: tasks.length, stopped };
}

export async function cleanupOrphanStandardVolumes(input: {
  snapshotManager: StandardSnapshotManager;
  activeVolumeIds: readonly string[];
  now?: Date;
  graceMs?: number;
}): Promise<{ inspected: number; deleted: number }> {
  const volumes = await input.snapshotManager.listManagedVolumes();
  const active = new Set(input.activeVolumeIds);
  const now = input.now ?? new Date();
  const graceMs = input.graceMs ?? 10 * 60_000;
  let deleted = 0;

  for (const volume of volumes) {
    if (active.has(volume.volumeId)) continue;
    if (now.getTime() - volume.createTime.getTime() < graceMs) continue;
    await input.snapshotManager.deleteVolume(volume.volumeId);
    deleted += 1;
  }

  return { inspected: volumes.length, deleted };
}

export async function cleanupOrphanStandardSnapshots(input: {
  snapshotManager: StandardSnapshotManager;
  protectedLabSnapshotIds: readonly string[];
  now?: Date;
  graceMs?: number;
}): Promise<{ inspected: number; deleted: number }> {
  const snapshots = await input.snapshotManager.listManagedSnapshots();
  const protectedIds = new Set(input.protectedLabSnapshotIds);
  const now = input.now ?? new Date();
  const graceMs = input.graceMs ?? 60 * 60_000;
  let deleted = 0;

  for (const snapshot of snapshots) {
    if (protectedIds.has(snapshot.labSnapshotId)) continue;
    if (now.getTime() - snapshot.startTime.getTime() < graceMs) continue;
    try {
      await input.snapshotManager.deleteSnapshot(snapshot.snapshotId);
      deleted += 1;
    } catch {
      // Reconciliation is best effort. A later cycle retries managed snapshots.
    }
  }

  return { inspected: snapshots.length, deleted };
}

export async function reconcileStandardRuntimes(input: {
  databaseUrl: string;
  provisioner: StandardRuntimeProvisioner;
  snapshotManager?: StandardSnapshotManager;
}): Promise<{
  checked: number;
  failed: number;
  orphanTasksStopped: number;
  orphanVolumesDeleted: number;
  orphanSnapshotsDeleted: number;
}> {
  const runtimes = await listActiveStandardRuntimes({
    databaseUrl: input.databaseUrl,
  });

  let failed = 0;

  for (const runtime of runtimes) {
    if (!runtime.providerRef) continue;

    const inspection = await input.provisioner.inspect(runtime.providerRef);
    if (inspection.state === "missing" || inspection.state === "stopped") {
      await finishStandardRuntime({
        databaseUrl: input.databaseUrl,
        workspaceId: runtime.workspaceId,
        runtimeId: runtime.runtimeId,
        finalStatus: "failed",
      });
      failed += 1;
      continue;
    }

    await markRuntimeHeartbeat({
      databaseUrl: input.databaseUrl,
      runtimeId: runtime.runtimeId,
      ...(inspection.privateIpv4Address
        ? { privateEndpoint: inspection.privateIpv4Address + ":8080" }
        : {}),
    });
  }

  const cleanup = await cleanupOrphanStandardTasks({
    provisioner: input.provisioner,
    activeTaskArns: runtimes
      .map((runtime) => runtime.providerRef)
      .filter((value): value is string => Boolean(value)),
  });

  const volumeCleanup = input.snapshotManager
    ? await cleanupOrphanStandardVolumes({
        snapshotManager: input.snapshotManager,
        activeVolumeIds: runtimes
          .map((runtime) => runtime.stateVolumeRef)
          .filter((value): value is string => Boolean(value)),
      })
    : { inspected: 0, deleted: 0 };

  const snapshotCleanup = input.snapshotManager
    ? await cleanupOrphanStandardSnapshots({
        snapshotManager: input.snapshotManager,
        protectedLabSnapshotIds: await listProtectedStandardSnapshotIds({
          databaseUrl: input.databaseUrl,
          creatingNewerThan: new Date(Date.now() - 60 * 60_000),
        }),
      })
    : { inspected: 0, deleted: 0 };

  return {
    checked: runtimes.length,
    failed,
    orphanTasksStopped: cleanup.stopped,
    orphanVolumesDeleted: volumeCleanup.deleted,
    orphanSnapshotsDeleted: snapshotCleanup.deleted,
  };
}
