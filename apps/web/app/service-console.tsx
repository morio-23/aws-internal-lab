"use client";

import { useMemo, useState } from "react";

const REGIONS = [
  { code: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { code: "ap-northeast-3", label: "Asia Pacific (Osaka)" },
] as const;

const SERVICES = [
  {
    code: "s3",
    name: "Amazon S3",
    createOperation: "CreateBucket",
    listOperation: "ListBuckets",
    fieldLabel: "Bucket name",
    fieldName: "bucketName",
  },
  {
    code: "dynamodb",
    name: "Amazon DynamoDB",
    createOperation: "CreateTable",
    listOperation: "ListTables",
    fieldLabel: "Table name",
    fieldName: "tableName",
  },
  {
    code: "sqs",
    name: "Amazon SQS",
    createOperation: "CreateQueue",
    listOperation: "ListQueues",
    fieldLabel: "Queue name",
    fieldName: "queueName",
  },
] as const;

type Service = (typeof SERVICES)[number];
type Region = (typeof REGIONS)[number]["code"];

function summarizeList(service: Service, value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;

  if (service.code === "s3") {
    const buckets = record.Buckets;
    if (!Array.isArray(buckets)) return [];
    return buckets
      .map((item) =>
        item && typeof item === "object"
          ? (item as { Name?: unknown }).Name
          : undefined,
      )
      .filter((item): item is string => typeof item === "string");
  }

  if (service.code === "dynamodb") {
    const tables = record.TableNames;
    return Array.isArray(tables)
      ? tables.filter((item): item is string => typeof item === "string")
      : [];
  }

  const urls = record.QueueUrls;
  return Array.isArray(urls)
    ? urls.filter((item): item is string => typeof item === "string")
    : [];
}

export function ServiceConsole() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [region, setRegion] = useState<Region>("ap-northeast-1");
  const [serviceCode, setServiceCode] = useState<Service["code"]>("s3");
  const [resourceName, setResourceName] = useState("");
  const [resources, setResources] = useState<string[]>([]);
  const [status, setStatus] = useState("Active Workspace IDを入力してください。");
  const [busy, setBusy] = useState(false);

  const service = useMemo(
    () => SERVICES.find((item) => item.code === serviceCode) ?? SERVICES[0],
    [serviceCode],
  );

  const controlPlaneUrl =
    process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ?? "http://localhost:3001";
  const prototypeUser =
    process.env.NEXT_PUBLIC_PROTOTYPE_USER ?? "prototype-learner";

  async function invoke(
    operation: string,
    payload?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!workspaceId) throw new Error("Workspace ID is required");

    const response = await fetch(
      controlPlaneUrl +
        "/api/v1/workspaces/" +
        encodeURIComponent(workspaceId) +
        "/services/" +
        service.code +
        "/" +
        operation,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-prototype-user": prototypeUser,
          "x-prototype-role": "Learner",
        },
        body: JSON.stringify({
          virtualRegion: region,
          ...(payload ? { payload } : {}),
        }),
      },
    );

    const body = (await response.json()) as {
      result?: unknown;
      error?: { code?: string };
    };
    if (!response.ok) {
      throw new Error(body.error?.code ?? "SERVICE_REQUEST_FAILED");
    }
    return body.result;
  }

  async function refresh() {
    setBusy(true);
    try {
      const result = await invoke(service.listOperation);
      setResources(summarizeList(service, result));
      setStatus(service.name + " resources refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function createResource() {
    if (!resourceName.trim()) {
      setStatus(service.fieldLabel + " is required.");
      return;
    }

    setBusy(true);
    try {
      await invoke(service.createOperation, {
        [service.fieldName]: resourceName.trim(),
      });
      setResourceName("");
      setStatus(service.name + " resource created.");
      const result = await invoke(service.listOperation);
      setResources(summarizeList(service, result));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <section aria-labelledby="workspace-context">
        <h2 id="workspace-context">Workspace context</h2>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <label>
            Workspace ID
            <input
              aria-label="Workspace ID"
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
              placeholder="019..."
              style={{ display: "block", minWidth: "22rem" }}
            />
          </label>
          <label>
            Region
            <select
              aria-label="Virtual Region"
              value={region}
              onChange={(event) => setRegion(event.target.value as Region)}
              style={{ display: "block" }}
            >
              {REGIONS.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label} ({item.code})
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "14rem minmax(0, 1fr)",
          gap: "1rem",
        }}
      >
        <nav aria-label="Services">
          <h2>Services</h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {SERVICES.map((item) => (
              <li key={item.code}>
                <button
                  type="button"
                  onClick={() => {
                    setServiceCode(item.code);
                    setResources([]);
                    setResourceName("");
                    setStatus(item.name + " selected.");
                  }}
                  aria-current={item.code === service.code ? "page" : undefined}
                  style={{ width: "100%", textAlign: "left" }}
                >
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main>
          <p>Services / {service.name}</p>
          <h1>{service.name}</h1>
          <p>
            Virtual Region: <strong>{region}</strong>
          </p>

          <section aria-labelledby="resources-heading">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <h2 id="resources-heading">Resources</h2>
              <button type="button" onClick={refresh} disabled={busy}>
                Refresh
              </button>
            </div>

            {resources.length === 0 ? (
              <p>No resources in this Region.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th scope="col">Name / URL</th>
                    <th scope="col">Region</th>
                  </tr>
                </thead>
                <tbody>
                  {resources.map((resource) => (
                    <tr key={resource}>
                      <td>{resource}</td>
                      <td>{region}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section aria-labelledby="create-heading">
            <h2 id="create-heading">Create resource</h2>
            <label>
              {service.fieldLabel}
              <input
                value={resourceName}
                onChange={(event) => setResourceName(event.target.value)}
                style={{ display: "block", minWidth: "20rem" }}
              />
            </label>
            <button
              type="button"
              onClick={createResource}
              disabled={busy}
              style={{ marginTop: "0.5rem" }}
            >
              Create
            </button>
          </section>

          <p role="status">{busy ? "Working..." : status}</p>
        </main>
      </div>
    </div>
  );
}
