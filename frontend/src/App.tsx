// src/App.tsx
import React, { JSX, useEffect, useState } from "react";

type Doc = {
  id: number;
  filename: string;
  uploaded_by?: string;
  upload_session_id?: string;
};

type Requirement = {
  id: number;
  requirement_id?: string;
  raw_text: string;
  structured: any;
  field_confidences: Record<string, number>;
  overall_confidence: number;
  status: string;
  doc_id?: number;
};

type Preview = {
  preview_id: number;
  test_case_id: string;
  gherkin: string;
};

type TestCaseRow = {
  id: number;
  test_case_id: string;
  requirement_id: number;
  status: string;
  generated_at: string;
};

const API_BASE = (import.meta.env.VITE_API_BASE as string) || "/api";

async function fetchJson(path: string, opts: RequestInit = {}) {
  const resp = await fetch(`${API_BASE}${path}`, opts);
  const text = await resp.text();
  try {
    const json = text ? JSON.parse(text) : null;
    return { ok: resp.ok, status: resp.status, json, text };
  } catch {
    return { ok: resp.ok, status: resp.status, json: null, text };
  }
}

export default function App(): JSX.Element {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(localStorage.getItem("upload_session_id") || null);
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  // selection state
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [editingReqId, setEditingReqId] = useState<number | null>(null);
  const [editStructuredValue, setEditStructuredValue] = useState<string>(""); // JSON string for edit
  const [reviewConfidence, setReviewConfidence] = useState<number>(0.9);

  // preview/testcases
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [selectedPreviews, setSelectedPreviews] = useState<Set<number>>(new Set());
  const [testcases, setTestcases] = useState<TestCaseRow[]>([]);
  const [tcStatusFilter, setTcStatusFilter] = useState<string>("generated");

  useEffect(() => {
    if (sessionId) {
      localStorage.setItem("upload_session_id", sessionId);
      loadDocs(sessionId);
      if (selectedDoc) {
        loadRequirements(selectedDoc.id);
        loadTestcases(sessionId, selectedDoc.id, tcStatusFilter);
      }
    } else {
      localStorage.removeItem("upload_session_id");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (selectedDoc) {
      loadRequirements(selectedDoc.id);
      loadTestcases(sessionId, selectedDoc.id, tcStatusFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDoc]);

  // Upload with AbortController watchdog
  async function uploadFile(e?: React.FormEvent) {
    e?.preventDefault?.();
    if (!file) {
      setMessage("Choose a file to upload");
      return;
    }

    setLoading(true);
    setMessage("Uploading...");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const fd = new FormData();
      fd.append("file", file, file.name);

      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: fd,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        // ignore parse error; we'll show raw text
      }

      if (res.ok && json) {
        setMessage(`Uploaded: ${json.filename}`);
        if (json.upload_session_id) setSessionId(json.upload_session_id);
        await loadDocs(json.upload_session_id || sessionId);
      } else {
        setMessage(`Upload failed: ${res.status} ${text}`);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") setMessage("Upload timed out (30s) and was cancelled.");
      else setMessage(`Upload error: ${err?.message ?? String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadDocs(upload_session_id?: string | null) {
    setLoading(true);
    try {
      const q = upload_session_id ? `?upload_session_id=${encodeURIComponent(upload_session_id)}` : "";
      const r = await fetchJson(`/documents${q}`);
      if (r.ok) setDocs(r.json || []);
      else setMessage(`Docs load failed: ${r.status}`);
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function triggerExtract(doc: Doc) {
    setLoading(true);
    try {
      const url = sessionId ? `/extract/${doc.id}?upload_session_id=${encodeURIComponent(sessionId)}` : `/extract/${doc.id}`;
      const r = await fetchJson(url, { method: "POST" });
      if (r.ok) {
        setMessage(`Extraction created ${r.json.created_requirements.length} requirements`);
        await loadDocs(sessionId);
        setSelectedDoc(doc);
        await loadRequirements(doc.id);
      } else {
        setMessage(`Extract failed: ${r.status} ${r.text}`);
      }
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadRequirements(docId: number) {
    setLoading(true);
    try {
      const r = await fetchJson(`/requirements?doc_id=${docId}`);
      if (r.ok) {
        // Ensure decoded field_confidences is object (backend returns proper object)
        const items = (r.json || []).map((it: any) => {
          const fc = it.field_confidences || {};
          return { ...it, field_confidences: fc };
        });
        setRequirements(items);
      } else {
        setMessage(`Requirements load failed: ${r.status}`);
      }
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoading(false);
    }
  }

  function startEditRequirement(req: Requirement) {
    setEditingReqId(req.id);
    setEditStructuredValue(JSON.stringify(req.structured || {}, null, 2));
  }

  async function saveEditedRequirement(req: Requirement) {
    try {
      const parsed = JSON.parse(editStructuredValue);
      const payload = {
        edits: parsed,
        review_confidence: reviewConfidence,
        note: "Edited via UI",
      };
      const r = await fetchJson(`/review/${req.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        setMessage(`Saved review for requirement ${req.id}`);
        setEditingReqId(null);
        if (selectedDoc) await loadRequirements(selectedDoc.id);
      } else {
        setMessage(`Save failed: ${r.status} ${r.text}`);
      }
    } catch (e: any) {
      setMessage(`Invalid JSON: ${e?.message ?? String(e)}`);
    }
  }

  async function approveRequirement(req: Requirement, confidence: number = 0.9) {
    setLoading(true);
    try {
      const payload = { edits: {}, review_confidence: confidence, note: "Approved via UI" };
      const r = await fetchJson(`/review/${req.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        setMessage(`Requirement ${req.id} reviewed: ${r.json.status}`);
        if (selectedDoc) await loadRequirements(selectedDoc.id);
      } else {
        setMessage(`Approve failed: ${r.status} ${r.text}`);
      }
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoading(false);
    }
  }

  // GENERATION
  async function generatePreviewForDoc() {
    if (!selectedDoc) return setMessage("Select a document first");
    setLoading(true);
    try {
      const body = JSON.stringify({ doc_id: selectedDoc.id });
      const r = await fetchJson(`/generate/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (r.ok) {
        setPreviews(r.json.previews || []);
        setMessage(`Preview generated: ${r.json.preview_count}`);
        await loadTestcases(sessionId, selectedDoc.id, "preview");
      } else {
        setMessage(`Preview failed: ${r.status} ${r.text}`);
      }
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoading(false);
    }
  }

  function togglePreview(id: number) {
    setSelectedPreviews((s) => {
      const ns = new Set(s);
      if (ns.has(id)) ns.delete(id);
      else ns.add(id);
      return ns;
    });
  }

  async function confirmSelectedPreviews() {
    if (selectedPreviews.size === 0) return setMessage("Select preview items to confirm");
    setLoading(true);
    try {
      const ids = Array.from(selectedPreviews);
      const r = await fetchJson(`/generate/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview_ids: ids }),
      });
      if (r.ok) {
        setMessage(`Confirmed ${r.json.confirmed} preview(s)`);
        setSelectedPreviews(new Set());
        if (selectedDoc) await loadTestcases(sessionId, selectedDoc.id, "generated");
        setPreviews([]);
      } else {
        setMessage(`Confirm failed: ${r.status} ${r.text}`);
      }
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadTestcases(upload_session_id?: string | null, doc_id?: number | null, status?: string | null) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (upload_session_id) params.append("upload_session_id", upload_session_id);
      if (doc_id) params.append("doc_id", String(doc_id));
      if (status) params.append("status", status);
      const path = `/testcases${params.toString() ? "?" + params.toString() : ""}`;
      const r = await fetchJson(path);
      if (r.ok) setTestcases(r.json || []);
      else setMessage(`Load testcases failed: ${r.status}`);
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function downloadExportCSV() {
    if (!selectedDoc || !sessionId) return setMessage("Select a document and ensure session exists");
    const url = `${API_BASE}/export/testcases/download?upload_session_id=${encodeURIComponent(sessionId)}&doc_id=${selectedDoc.id}`;
    setLoading(true);
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        const txt = await resp.text();
        setMessage(`Export failed: ${resp.status} ${txt}`);
        setLoading(false);
        return;
      }
      const blob = await resp.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      const cd = resp.headers.get("content-disposition");
      let filename = `test_cases_${Date.now()}.csv`;
      if (cd) {
        const m = cd.match(/filename="?(.+)"?/);
        if (m) filename = m[1];
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dlUrl);
      setMessage("Download started");
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoading(false);
    }
  }

  // UI helpers
  function canGenerate(): boolean {
    return requirements.some((r) => r.status === "approved");
  }

  return (
    <div style={{ maxWidth: 1000, margin: 18 }}>
      <h1>AI TestGen — Reviewer</h1>
      <p style={{ color: "#555" }}>Flow: Upload → Extract → Review requirements → Generate previews → Confirm → Export / Push</p>

      <section style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1, padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Upload requirement file</div>

          <input
            type="file"
            accept=".txt,.md,.docx,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ display: "block", marginBottom: 10 }}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" onClick={() => uploadFile()} disabled={loading}>
              Upload
            </button>

            <button type="button" className="btn" onClick={() => loadDocs(sessionId)}>
              Refresh Docs
            </button>
          </div>

          <div style={{ marginTop: 8, color: "#666", fontSize: 13 }}>Uploaded files in your current session are shown below.</div>
        </div>
      </section>

      <section style={{ marginTop: 8 }}>
        <h3>Documents (session scoped)</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {docs.map((d) => (
            <div key={d.id} style={{ width: 260, border: "1px solid #eee", padding: 10, borderRadius: 6 }}>
              <div style={{ fontWeight: 700 }}>{d.filename}</div>
              <div style={{ color: "#666", fontSize: 12 }}>By: {d.uploaded_by}</div>
              <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                <button className="btn" onClick={() => triggerExtract(d)}>
                  Extract
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setSelectedDoc(d);
                    setPreviews([]);
                  }}
                >
                  Select
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setSelectedDoc(d);
                    loadRequirements(d.id);
                  }}
                >
                  Open
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Requirements Review {selectedDoc ? `— ${selectedDoc.filename}` : ""}</h3>
        <div style={{ color: "#666", marginBottom: 8 }}>Review extracted requirements, edit structured JSON if needed and Approve with a reviewer confidence.</div>

        {!selectedDoc && <div style={{ color: "#888" }}>Select a document to load requirements.</div>}

        {selectedDoc && requirements.length === 0 && <div style={{ color: "#888" }}>No requirements yet. Click Extract on the document to run Vertex extraction.</div>}

        {requirements.map((req) => (
          <div key={req.id} style={{ border: "1px solid #f0f0f0", padding: 12, borderRadius: 6, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{req.requirement_id ?? `Req-${req.id}`}</div>
                <div style={{ color: "#333", whiteSpace: "pre-wrap", marginTop: 6 }}>{req.raw_text}</div>
                <div style={{ marginTop: 8, color: "#666", fontSize: 13 }}>
                  Status: <strong>{req.status}</strong> • Overall confidence: <strong>{(req.overall_confidence ?? 0).toFixed(2)}</strong>
                </div>
              </div>
              <div style={{ minWidth: 220 }}>
                <div style={{ fontSize: 13, color: "#444", marginBottom: 6 }}>Field confidences</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 60px", gap: 6 }}>
                  {Object.entries(req.field_confidences || {}).map(([k, v]) => (
                    <React.Fragment key={k}>
                      <div style={{ fontSize: 13 }}>{k}</div>
                      <div style={{ textAlign: "right", color: "#333" }}>{Number(v).toFixed(2)}</div>
                    </React.Fragment>
                  ))}
                  {Object.keys(req.field_confidences || {}).length === 0 && <div style={{ color: "#888" }}>No confidences reported</div>}
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <input type="number" step="0.01" max={0.99} min={0} value={reviewConfidence} onChange={(e) => setReviewConfidence(Number(e.target.value))} style={{ width: 80 }} />
                  <button className="btn" onClick={() => approveRequirement(req, reviewConfidence)}>
                    Approve
                  </button>
                  <button className="btn" onClick={() => startEditRequirement(req)}>
                    Edit
                  </button>
                </div>
              </div>
            </div>

            {editingReqId === req.id && (
              <div style={{ marginTop: 10 }}>
                <div style={{ marginBottom: 6, fontWeight: 600 }}>Edit structured JSON (fields)</div>
                <textarea value={editStructuredValue} onChange={(e) => setEditStructuredValue(e.target.value)} style={{ width: "100%", height: 160, fontFamily: "monospace", fontSize: 13 }} />
                <div style={{ marginTop: 8 }}>
                  <button className="btn" onClick={() => saveEditedRequirement(req)}>
                    Save & Review
                  </button>
                  <button className="btn" onClick={() => setEditingReqId(null)} style={{ marginLeft: 6 }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Generate Previews</h3>
        <div style={{ color: "#666", marginBottom: 8 }}>Generate preview test cases using Vertex (LLM). Only run when you have approved requirements.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={generatePreviewForDoc} disabled={!selectedDoc || !canGenerate()}>
            Generate Preview
          </button>
          <button className="btn" onClick={() => { setPreviews([]); setSelectedPreviews(new Set()); }}>
            Clear Previews
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          {previews.length === 0 && <div style={{ color: "#888" }}>No previews generated yet.</div>}
          {previews.map((p) => (
            <div key={p.preview_id} style={{ borderBottom: "1px solid #eee", padding: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700 }}>{p.test_case_id}</div>
                <pre style={{ whiteSpace: "pre-wrap", margin: 6 }}>{p.gherkin}</pre>
              </div>
              <div>
                <label>
                  <input type="checkbox" checked={selectedPreviews.has(p.preview_id)} onChange={() => togglePreview(p.preview_id)} />
                  Select
                </label>
              </div>
            </div>
          ))}
          {previews.length > 0 && <div style={{ marginTop: 8 }}><button className="btn primary" onClick={confirmSelectedPreviews}>Confirm Selected</button></div>}
        </div>
      </section>

      <section style={{ marginTop: 18 }}>
        <h3>Test Cases (session scoped)</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={tcStatusFilter} onChange={(e) => { setTcStatusFilter(e.target.value); if (selectedDoc) loadTestcases(sessionId, selectedDoc.id, e.target.value); }}>
            <option value="generated">Generated</option>
            <option value="preview">Preview</option>
            <option value="stale">Stale</option>
            <option value="pushed">Pushed</option>
            <option value="">All</option>
          </select>
          <button className="btn" onClick={() => { if (selectedDoc) loadTestcases(sessionId, selectedDoc.id, tcStatusFilter || undefined); }}>Refresh</button>
          <button className="btn" onClick={downloadExportCSV}>Export CSV</button>
        </div>

        <div style={{ marginTop: 8 }}>
          {testcases.length === 0 && <div style={{ color: "#888" }}>No test cases for selected session/doc.</div>}
          {testcases.map((t) => (
            <div key={t.id} style={{ borderBottom: "1px solid #f6f6f6", padding: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 700 }}>{t.test_case_id}</div>
                <div style={{ color: "#666" }}>{t.status}</div>
              </div>
              <div style={{ fontSize: 13, color: "#666" }}>Req: {t.requirement_id} • {new Date(t.generated_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </section>

      {message && <div style={{ position: "fixed", right: 14, bottom: 14, background: "#222", color: "#fff", padding: "10px 12px", borderRadius: 6 }}>{message}</div>}
      {loading && <div style={{ position: "fixed", left: 14, bottom: 14, background: "#fff", border: "1px solid #ddd", padding: 8, borderRadius: 6 }}>Loading...</div>}
    </div>
  );
}
