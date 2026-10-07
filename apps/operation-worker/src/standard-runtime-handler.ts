import {
  getLifecycleOperation,
  setOperationStatus,
} from "../../../packages/db/src/lifecycle-repository.js";
import {
  createStartingStandardRuntime,
  finishStandardRuntime,
  getActiveRuntimeForWorkspace,
  listActiveStandardRuntimes,
  markRuntimeHeartbeat,
  markStandardRuntimeReady,
} from "../../../packages/db/src/runtime-repository.js";
import type {
  StandardRuntimeProvisioner,
} from "../../../packages/runtime-control/src/standard-runtime.js";

function errorCode(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 120);
  }
  return "STANDARD_RUNTIME_OPERATION_FAILED";
}

export async function executeStandardRuntimeOperation(input: {
  databaseUrl: string;
  operationId: string;
  provisioner: StandardRuntimeProvisioner;
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
    let runtime:
      | Awaited<ReturnType<typeof createStartingStandardRuntime>>
      | undefined;
    let taskArn: string | undefined;

    try {
      runtime = await createStartingStandardRuntime({
        databaseUrl: input.databaseUrl,
        workspaceId: operation.workspaceId,
      });

      const started = await input.provisioner.start({
        workspaceId: operation.workspaceId,
        sessionId: runtime.sessionId,
        virtualAccountId: runtime.virtualAccountId,
        enabledRegions: runtime.enabledRegions,
      });
      taskArn = started.taskArn;

      const inspection = await input.provisioner.inspect(taskArn);
      const privateEndpoint = inspection.privateIpv4Address
        ? inspection.privateIpv4Address + ":8080"
        : undefined;

      await markStandardRuntimeReady({
        databaseUrl: input.databaseUrl,
        runtimeId: runtime.runtimeId,
        providerRef: taskArn,
        ...(privateEndpoint ? { privateEndpoint } : {}),
      });

      await setOperationStatus({
        databaseUrl: input.databaseUrl,
        operationId: operation.id,
        status: "succeeded",
      });
      return;
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

      if (runtime) {
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

  await setOperationStatus({
    databaseUrl: input.databaseUrl,
    operationId: operation.id,
    status: "failed",
    errorCode: "UNSUPPORTED_STANDARD_RUNTIME_OPERATION",
  });
  throw new Error("UNSUPPORTED_STANDARD_RUNTIME_OPERATION");
}

export async function reconcileStandardRuntimes(input: {
  databaseUrl: string;
  provisioner: StandardRuntimeProvisioner;
}): Promise<{ checked: number; failed: number }> {
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

  return { checked: runtimes.length, failed };
}
