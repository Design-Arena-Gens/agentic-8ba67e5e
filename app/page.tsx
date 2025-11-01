"use client";

import { useMemo, useState } from "react";
import { v4 as uuid } from "uuid";
import * as XLSX from "xlsx";

type DataRow = Record<string, string>;

type UploadResult = {
  columns: string[];
  rows: DataRow[];
  fileName: string;
};

type FilterOperator = "equals" | "contains" | "startsWith" | "endsWith";

type AgentFilter = {
  column: string;
  operator: FilterOperator;
  value: string;
};

type AgentDefinition = {
  id: string;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  filter?: AgentFilter;
};

type SendResult = {
  ok: boolean;
  message: string;
};

const DEFAULT_SUBJECT = "Hello {{Name}}";
const DEFAULT_BODY = `Hi {{Name}},

I hope this message finds you well. We wanted to reach out about {{Topic}}.

Thanks,
{{Account Manager}}`;

const filterOperators: { value: FilterOperator; label: string }[] = [
  { value: "equals", label: "Equals" },
  { value: "contains", label: "Contains" },
  { value: "startsWith", label: "Starts with" },
  { value: "endsWith", label: "Ends with" }
];

function normalizeValue(value: string | undefined | null) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

function renderTemplate(template: string, row: DataRow) {
  const loweredMap = new Map(
    Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value])
  );

  return template.replace(/{{\s*([^}]+)\s*}}/g, (_match, rawKey: string): string => {
    const key = rawKey.trim();
    const direct = row[key];
    if (direct !== undefined) {
      return direct;
    }

    const fallback = loweredMap.get(key.toLowerCase());
    return fallback ?? "";
  });
}

function applyFilter(row: DataRow, filter?: AgentFilter) {
  if (!filter || !filter.column || !filter.value) {
    return true;
  }

  const targetValue = row[filter.column] ?? "";
  const needle = filter.value.toLowerCase();
  const haystack = targetValue.toLowerCase();

  switch (filter.operator) {
    case "equals":
      return haystack === needle;
    case "contains":
      return haystack.includes(needle);
    case "startsWith":
      return haystack.startsWith(needle);
    case "endsWith":
      return haystack.endsWith(needle);
    default:
      return true;
  }
}

export default function HomePage() {
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [emailColumn, setEmailColumn] = useState<string>("");
  const [nameColumn, setNameColumn] = useState<string>("");
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");

  const availableColumns = uploadResult?.columns ?? [];

  const totalRecipients = useMemo(() => {
    if (!uploadResult || !emailColumn) return 0;
    const emailSet = new Set<string>();
    agents.forEach((agent) => {
      uploadResult.rows.forEach((row) => {
        if (!applyFilter(row, agent.filter)) return;
        const email = normalizeValue(row[emailColumn]);
        if (email) {
          emailSet.add(email);
        }
      });
    });
    return emailSet.size;
  }, [agents, emailColumn, uploadResult]);

  function handleReset() {
    setUploadResult(null);
    setEmailColumn("");
    setNameColumn("");
    setAgents([]);
    setSendResult(null);
  }

  async function handleUpload(file: File) {
    setSendResult(null);
    try {
      const data = await file.arrayBuffer();
      const workBook = XLSX.read(data, { type: "array" });
      const sheetName = workBook.SheetNames[0];
      const worksheet = workBook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        defval: "",
        raw: false
      });

      if (!json.length) {
        throw new Error("No data detected in the first sheet.");
      }

      const columnSet = new Set<string>();
      json.forEach((row) => {
        Object.keys(row).forEach((key) => columnSet.add(key.trim()));
      });
      const columns = Array.from(columnSet);

      const rows: DataRow[] = json.map((row) => {
        const mapped: DataRow = {};
        columns.forEach((column) => {
          const raw = row[column] ?? row[column.trim()];
          mapped[column] = normalizeValue(raw as string | null | undefined);
        });
        return mapped;
      });

      const defaultEmailColumn =
        columns.find((column) => column.toLowerCase().includes("email")) ?? "";
      const defaultNameColumn =
        columns.find((column) => column.toLowerCase().includes("name")) ?? "";

      setUploadResult({
        fileName: file.name,
        columns,
        rows
      });
      setEmailColumn(defaultEmailColumn);
      setNameColumn(defaultNameColumn);
      setAgents([
        {
          id: uuid(),
          name: "General Outreach",
          subjectTemplate: DEFAULT_SUBJECT,
          bodyTemplate: DEFAULT_BODY
        }
      ]);
    } catch (error) {
      console.error(error);
      setSendResult({
        ok: false,
        message:
          error instanceof Error ? error.message : "Failed to read Excel file."
      });
    }
  }

  function handleAgentChange(id: string, patch: Partial<AgentDefinition>) {
    setAgents((prev) =>
      prev.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent))
    );
  }

  function handleCreateAgent() {
    setAgents((prev) => [
      ...prev,
      {
        id: uuid(),
        name: `Agent ${prev.length + 1}`,
        subjectTemplate: DEFAULT_SUBJECT,
        bodyTemplate: DEFAULT_BODY
      }
    ]);
  }

  function handleDuplicateAgent(id: string) {
    const agent = agents.find((item) => item.id === id);
    if (!agent) return;
    setAgents((prev) => [
      ...prev,
      {
        ...agent,
        id: uuid(),
        name: `${agent.name} Copy`
      }
    ]);
  }

  function handleRemoveAgent(id: string) {
    setAgents((prev) => prev.filter((agent) => agent.id !== id));
  }

  async function handleSend() {
    if (!uploadResult) return;
    if (!emailColumn) {
      setSendResult({
        ok: false,
        message: "Please select which column contains email addresses."
      });
      return;
    }

    const preparedAgents = agents
      .map((agent) => {
        const recipients = uploadResult.rows
          .filter((row) => applyFilter(row, agent.filter))
          .map((row) => {
            const email = normalizeValue(row[emailColumn]);
            if (!email) {
              return null;
            }
            return {
              to: email,
              subject: renderTemplate(agent.subjectTemplate, row),
              body: renderTemplate(agent.bodyTemplate, row),
              variables: row,
              name: nameColumn ? row[nameColumn] : undefined
            };
          })
          .filter((value): value is NonNullable<typeof value> => value !== null);
        return {
          id: agent.id,
          name: agent.name,
          recipients
        };
      })
      .filter((agent) => agent.recipients.length);

    if (!preparedAgents.length) {
      setSendResult({
        ok: false,
        message:
          "No recipients were identified. Adjust your filters or verify the email column."
      });
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          agents: preparedAgents,
          from: {
            email: fromEmail,
            name: fromName
          }
        })
      });

      const payload = (await response.json()) as {
        ok: boolean;
        message: string;
      };

      setSendResult({
        ok: payload.ok,
        message: payload.message
      });
    } catch (error) {
      console.error(error);
      setSendResult({
        ok: false,
        message:
          "An unexpected error occurred while sending emails. Check server logs for details."
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <main>
      <div className="container grid" style={{ gap: "2rem" }}>
        <header className="glass">
          <div className="grid" style={{ gap: "1.2rem" }}>
            <div>
              <h1 className="section-title">Agentic Mailing Orchestrator</h1>
              <p className="section-subtitle">
                Upload a spreadsheet, define specialized mailing agents, and let
                the system craft personalized outreach at scale.
              </p>
            </div>
            <div className="list-inline">
              <span className="pill">Excel & CSV ingestion</span>
              <span className="pill">Dynamic templating</span>
              <span className="pill">Multi-agent flows</span>
            </div>
          </div>
        </header>

        <section className="glass grid" style={{ gap: "1.5rem" }}>
          <div className="grid" style={{ gap: "1rem" }}>
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">1. Upload contact data</h2>
                  <p className="muted">
                    Provide an Excel (.xlsx, .xls) or CSV file. The first sheet
                    will be processed automatically.
                  </p>
                </div>
                {uploadResult ? (
                  <button
                    className="btn btn-outline"
                    onClick={handleReset}
                    type="button"
                  >
                    Reset wizard
                  </button>
                ) : null}
              </div>
              <div className="grid" style={{ gap: "1rem" }}>
                <label className="btn btn-primary" htmlFor="file-input">
                  {uploadResult ? "Replace spreadsheet" : "Select spreadsheet"}
                </label>
                <input
                  id="file-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleUpload(file);
                    }
                  }}
                  style={{ display: "none" }}
                />
                {uploadResult ? (
                  <div className="card">
                    <div className="grid" style={{ gap: "0.75rem" }}>
                      <div className="list-inline">
                        <span className="badge">
                          Loaded: {uploadResult.fileName}
                        </span>
                        <span className="chip">
                          Rows: {uploadResult.rows.length}
                        </span>
                        <span className="chip">
                          Columns: {uploadResult.columns.length}
                        </span>
                      </div>
                      <div className="row">
                        <div className="field">
                          <label htmlFor="email-column">Email column</label>
                          <select
                            id="email-column"
                            className="select"
                            value={emailColumn}
                            onChange={(event) =>
                              setEmailColumn(event.target.value)
                            }
                          >
                            <option value="">Select column…</option>
                            {uploadResult.columns.map((column) => (
                              <option key={column} value={column}>
                                {column}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label htmlFor="name-column">
                            Recipient name column
                          </label>
                          <select
                            id="name-column"
                            className="select"
                            value={nameColumn}
                            onChange={(event) =>
                              setNameColumn(event.target.value)
                            }
                          >
                            <option value="">Optional</option>
                            {uploadResult.columns.map((column) => (
                              <option key={column} value={column}>
                                {column}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <h3 style={{ margin: "0 0 0.6rem" }}>Sample rows</h3>
                        <div className="table-container fade">
                          <table>
                            <thead>
                              <tr>
                                {uploadResult.columns.map((column) => (
                                  <th key={column}>{column}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {uploadResult.rows.slice(0, 5).map((row, index) => (
                                <tr key={index}>
                                  {uploadResult.columns.map((column) => (
                                    <td key={column}>{row[column]}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="hint" style={{ marginTop: "0.6rem" }}>
                          Ensure an email column is selected before continuing.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {uploadResult ? (
          <section className="glass grid" style={{ gap: "1.5rem" }}>
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">2. Configure sender identity</h2>
                  <p className="muted">
                    Provide the visible email identity. If left empty, the
                    backend will use the default configured in environment
                    variables.
                  </p>
                </div>
              </div>
              <div className="row">
                <div className="field">
                  <label htmlFor="from-name">From name</label>
                  <input
                    id="from-name"
                    className="input"
                    placeholder="e.g. Growth Team"
                    value={fromName}
                    onChange={(event) => setFromName(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="from-email">From email</label>
                  <input
                    id="from-email"
                    className="input"
                    placeholder="Optional override"
                    value={fromEmail}
                    onChange={(event) => setFromEmail(event.target.value)}
                  />
                </div>
              </div>
              <p className="hint">
                Tip: templates understand placeholders like{" "}
                <code>{"{{Company}}"}</code> or <code>{"{{First Name}}"}</code>.
                The placeholder must match the column heading exactly.
              </p>
            </div>

            <div className="card grid" style={{ gap: "1rem" }}>
              <div className="card-header">
                <div>
                  <h2 className="card-title">3. Design mailing agents</h2>
                  <p className="muted">
                    Each agent can focus on a different audience segment with
                    bespoke subject lines and messaging.
                  </p>
                </div>
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={handleCreateAgent}
                >
                  Add agent
                </button>
              </div>

              <div className="grid" style={{ gap: "1.1rem" }}>
                {agents.map((agent) => {
                  const matchingRows = uploadResult.rows.filter((row) =>
                    applyFilter(row, agent.filter)
                  );
                  const previewRow = matchingRows[0];
                  const previewSubject = previewRow
                    ? renderTemplate(agent.subjectTemplate, previewRow)
                    : "No recipients match the current filters.";
                  const previewBody = previewRow
                    ? renderTemplate(agent.bodyTemplate, previewRow)
                    : "Adjust your filters or templates to preview the email.";

                  return (
                    <div className="card agent-card" key={agent.id}>
                      <div className="agent-actions">
                        <div>
                          <input
                            className="input"
                            value={agent.name}
                            onChange={(event) =>
                              handleAgentChange(agent.id, {
                                name: event.target.value
                              })
                            }
                          />
                          <p className="hint" style={{ marginTop: "0.35rem" }}>
                            Matches {matchingRows.length} recipients
                          </p>
                        </div>
                        <div className="list-inline">
                          <button
                            className="btn btn-outline"
                            type="button"
                            onClick={() => handleDuplicateAgent(agent.id)}
                          >
                            Duplicate
                          </button>
                          <button
                            className="btn btn-outline"
                            type="button"
                            onClick={() => handleRemoveAgent(agent.id)}
                            disabled={agents.length === 1}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="row">
                        <div className="field">
                          <label htmlFor={`subject-${agent.id}`}>
                            Subject template
                          </label>
                          <input
                            id={`subject-${agent.id}`}
                            className="input"
                            value={agent.subjectTemplate}
                            onChange={(event) =>
                              handleAgentChange(agent.id, {
                                subjectTemplate: event.target.value
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="field">
                        <label htmlFor={`body-${agent.id}`}>
                          Body template
                        </label>
                        <textarea
                          id={`body-${agent.id}`}
                          className="textarea"
                          value={agent.bodyTemplate}
                          onChange={(event) =>
                            handleAgentChange(agent.id, {
                              bodyTemplate: event.target.value
                            })
                          }
                        />
                      </div>
                      <div className="row">
                        <div className="field">
                          <label>Filter column</label>
                          <select
                            className="select"
                            value={agent.filter?.column ?? ""}
                            onChange={(event) =>
                              handleAgentChange(agent.id, {
                                filter: {
                                  column: event.target.value,
                                  operator:
                                    agent.filter?.operator ?? "equals",
                                  value: agent.filter?.value ?? ""
                                }
                              })
                            }
                          >
                            <option value="">All recipients</option>
                            {availableColumns.map((column) => (
                              <option key={column} value={column}>
                                {column}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label>Operator</label>
                          <select
                            className="select"
                            value={agent.filter?.operator ?? "equals"}
                            onChange={(event) =>
                              handleAgentChange(agent.id, {
                                filter: {
                                  column: agent.filter?.column ?? "",
                                  operator: event.target
                                    .value as FilterOperator,
                                  value: agent.filter?.value ?? ""
                                }
                              })
                            }
                            disabled={!agent.filter?.column}
                          >
                            {filterOperators.map((operator) => (
                              <option
                                key={operator.value}
                                value={operator.value}
                              >
                                {operator.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label>Filter value</label>
                          <input
                            className="input"
                            placeholder="Type to narrow recipients"
                            value={agent.filter?.value ?? ""}
                            onChange={(event) =>
                              handleAgentChange(agent.id, {
                                filter: {
                                  column: agent.filter?.column ?? "",
                                  operator: agent.filter?.operator ?? "equals",
                                  value: event.target.value
                                }
                              })
                            }
                            disabled={!agent.filter?.column}
                          />
                        </div>
                      </div>
                      <div>
                        <p className="hint" style={{ marginBottom: "0.5rem" }}>
                          Preview (first matching row)
                        </p>
                        <div className="agent-preview">
                          <strong>Subject:</strong> {previewSubject}
                          <br />
                          <br />
                          {previewBody}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card grid" style={{ gap: "1rem" }}>
              <div className="card-header">
                <div>
                  <h2 className="card-title">4. Launch outbound run</h2>
                  <p className="muted">
                    Review the total recipients, then dispatch the campaign.
                  </p>
                </div>
              </div>

              <div className="status-banner">
                <div>
                  <strong>Total distinct recipients:</strong> {totalRecipients}
                  <br />
                  <span className="hint">
                    Agents share the same spreadsheet, but each applies its own
                    filters and templates.
                  </span>
                </div>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={sending || !totalRecipients}
                  onClick={() => void handleSend()}
                >
                  {sending ? "Sending…" : "Send campaign"}
                </button>
              </div>

              {sendResult ? (
                <div
                  className={`status-banner ${
                    sendResult.ok ? "" : "error"
                  }`.trim()}
                >
                  <div>
                    <strong>{sendResult.ok ? "Success" : "Error"}</strong>
                    <br />
                    {sendResult.message}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
