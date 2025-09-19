// src/App.tsx
import React, { JSX, useEffect, useState } from "react";

// --- TYPE DEFINITIONS ---
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
  error_message?: string;
};

type Preview = {
  id: number; 
  test_case_id: string;
  gherkin: string;
  code_scaffold_str: string;
  automated_steps_json: string;
};

type TestCaseRow = {
  id: number;
  test_case_id: string;
  requirement_id: number;
  status: string;
  generated_at: string;
};



// --- API SETUP ---
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

// --- MAIN APP COMPONENT ---
export default function App(): JSX.Element {
  // --- STATE MANAGEMENT ---
  const [docs, setDocs] = useState<Doc[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(localStorage.getItem("upload_session_id") || null);
  const [message, setMessage] = useState<string>("");
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [reviewConfidence, setReviewConfidence] = useState<number>(0.9);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [selectedPreviews, setSelectedPreviews] = useState<Set<number>>(new Set());
  const [testcases, setTestcases] = useState<TestCaseRow[]>([]);
  const [tcStatusFilter, setTcStatusFilter] = useState<string>("generated");
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedTestTypes, setSelectedTestTypes] = useState<Set<string>>(new Set(["positive"]));
  const [isJiraModalOpen, setIsJiraModalOpen] = useState<boolean>(false);
  const [jiraUrl, setJiraUrl] = useState<string>("");
  const [jiraProjectKey, setJiraProjectKey] = useState<string>("");
  const [jiraApiToken, setJiraApiToken] = useState<string>("");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [editingReqId, setEditingReqId] = useState<number | null>(null);
  const [editText, setEditText] = useState<string>("");
  const [activeViewFormat, setActiveViewFormat] = useState<'gherkin' | 'pytest' | 'text'>('gherkin');
  const [batchConfidence, setBatchConfidence] = useState<number>(1.0);
  const [editingPreview, setEditingPreview] = useState<Preview | null>(null);
  const [editTextGherkin, setEditTextGherkin] = useState<string>("");


  useEffect(() => {
    if (sessionId) {
      localStorage.setItem("upload_session_id", sessionId);
      loadDocs(sessionId);
    } else {
      localStorage.removeItem("upload_session_id");
    }
  }, [sessionId]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(""), 5000); 
      return () => clearTimeout(timer);
    }
  }, [message]);

  // --- API FUNCTIONS ---

  async function downloadTraceabilityMatrix() {
    if (!selectedDoc) return setMessage("No document selected.");
    setLoadingAction("export-matrix");
    try {
      const url = `${API_BASE}/export/traceability_matrix?doc_id=${selectedDoc.id}`;
      const resp = await fetch(url);

      if (!resp.ok) {
        const txt = await resp.text();
        setMessage(`Export failed: ${resp.status} ${txt}`);
        return;
      }
      // Standard file download logic
      const blob = await resp.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `traceability_matrix_${selectedDoc.filename}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dlUrl);
      setMessage("Traceability Matrix download started.");

    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoadingAction(null);
    }
  }

  async function uploadFile(e?: React.FormEvent) {
    e?.preventDefault?.();
    if (!file) {
      setMessage("Choose a file to upload");
      return;
    }
    setLoadingAction("upload");
    setMessage("Uploading...");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      if (sessionId) {
        fd.append("upload_session_id", sessionId);
      }
      const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: fd, signal: controller.signal });
      clearTimeout(timeout);
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch { }
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
      setLoadingAction(null);
    }
  }

  async function loadDocs(upload_session_id?: string | null) {
    setLoadingAction("load-docs");
    try {
      const q = upload_session_id ? `?upload_session_id=${encodeURIComponent(upload_session_id)}` : "";
      const r = await fetchJson(`/documents${q}`);
      if (r.ok) setDocs(r.json || []);
      else setMessage(`Docs load failed: ${r.status}`);
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoadingAction(null);
    }
  }

  async function triggerExtract(doc: Doc) {
    setLoadingAction(`extract-${doc.id}`);
    try {
      const url = sessionId ? `/extract/${doc.id}?upload_session_id=${encodeURIComponent(sessionId)}` : `/extract/${doc.id}`;
      const r = await fetchJson(url, { method: "POST" });
      if (r.ok) {
        setMessage(`Extraction created ${r.json.created_requirements.length} requirements`);
        await loadDocs(sessionId);
        handleAnalyzeDoc(doc);
      } else {
        setMessage(`Extract failed: ${r.status} ${r.text}`);
      }
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoadingAction(null);
    }
  }

  async function loadRequirements(docId: number) {
    setLoadingAction("load-reqs");
    try {
      const r = await fetchJson(`/requirements?doc_id=${docId}`);
      if (r.ok) {
        const items = (r.json || []).map((it: any) => ({ ...it, field_confidences: it.field_confidences || {} }));
        setRequirements(items);
      } else {
        setMessage(`Requirements load failed: ${r.status}`);
      }
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoadingAction(null);
    }
  }

  async function regenerateRequirement(reqId: number, confidence: number) {
    setLoadingAction(`regen-req-${reqId}`);
    setMessage(`Regenerating requirement ${reqId}...`);
    try {
      const r = await fetchJson(`/requirements/regenerate/${reqId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewer_confidence: confidence }),
      });
      if (r.ok) {
        setMessage("Requirement regenerated successfully.");
        if (selectedDoc) await loadRequirements(selectedDoc.id);
      } else {
        setMessage(`Regeneration failed: ${r.status} ${r.text}`);
      }
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoadingAction(null);
    }
  }

  async function approveRequirement(req: Requirement, confidence: number) {
    setLoadingAction(`approve-${req.id}`);
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
      setLoadingAction(null);
    }
  }

  async function generatePreviewForDoc() {
    if (!selectedDoc) return setMessage("Select a document first");
    if (selectedTestTypes.size === 0) return setMessage("Please select at least one test type to generate.");
    setLoadingAction("generate-previews");
    try {
      const body = JSON.stringify({
        doc_id: selectedDoc.id,
        test_types: Array.from(selectedTestTypes),
      });
      const r = await fetchJson(`/generate/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (r.ok) {
        setPreviews(r.json.previews || []);
        setMessage(`Preview generated: ${r.json.preview_count}`);
        if (selectedDoc) await loadTestcases(sessionId, selectedDoc.id, "preview");
      } else {
        setMessage(`Preview failed: ${r.status} ${r.text}`);
      }
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoadingAction(null);
    }
  }

  async function regeneratePreview(previewId: number) {
    setLoadingAction(`regen-preview-${previewId}`);
    setMessage(`Regenerating test case ${previewId}...`);
    try {
      const r = await fetchJson(`/generate/regenerate/${previewId}`, { method: "POST" });
      if (r.ok) {
        setMessage("Test case regenerated. Refreshing previews.");
        await generatePreviewForDoc();
      } else {
        setMessage(`Regeneration failed: ${r.status} ${r.text}`);
      }
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoadingAction(null);
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
    setLoadingAction("confirm-previews");
    try {
      const ids = Array.from(selectedPreviews);
      const r = await fetchJson(`/generate/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview_ids: ids, reviewer_confidence: batchConfidence }),
      });
      if (r.ok) {
        setMessage(`Confirmed ${r.json.confirmed} preview(s)`);
        setSelectedPreviews(new Set());
        if (selectedDoc) await loadTestcases(sessionId, selectedDoc.id, "generated");
        setPreviews([]);
        setCurrentStep(4);
      } else {
        setMessage(`Confirm failed: ${r.status} ${r.text}`);
      }
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoadingAction(null);
    }
  }

  async function regenerateSelectedPreviews() {
    if (selectedPreviews.size === 0) return setMessage("Select at least one test case to regenerate.");
    setLoadingAction("regenerate-selected");
    try {
      const ids = Array.from(selectedPreviews);
      const r = await fetchJson(`/generate/regenerate-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview_ids: ids }),
      });

      if (r.ok) {
        setMessage(`${r.json.regenerated_count} test case(s) regenerated successfully.`);
        await generatePreviewForDoc();
      } else {
        setMessage(`Regeneration failed: ${r.status} ${r.text}`);
      }
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoadingAction(null);
    }
  }

  async function saveEditedPreview() {
    if (!editingPreview) return;
    setLoadingAction(`save-preview-${editingPreview.id}`);
    try {
      const r = await fetchJson(`/testcase/${editingPreview.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gherkin: editTextGherkin }),
      });
      if (r.ok) {
        setMessage("Test case updated successfully.");
        setEditingPreview(null);
        await generatePreviewForDoc(); 
      } else {
        setMessage(`Save failed: ${r.status} ${r.text}`);
      }
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoadingAction(null);
    }
  }

  function startEditingPreview(p: Preview) {
    setEditingPreview(p);
    setEditTextGherkin(p.gherkin);
  }


  async function loadTestcases(upload_session_id?: string | null, doc_id?: number | null, status?: string | null) {
    setLoadingAction("load-tcs");
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
      setLoadingAction(null);
    }
  }

  async function downloadExportCSV() {
    if (!selectedDoc || !sessionId) return setMessage("Select a document and ensure session exists");
    const url = `${API_BASE}/export/testcases/download?upload_session_id=${encodeURIComponent(sessionId)}&doc_id=${selectedDoc.id}`;
    setLoadingAction("export-csv");
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        const txt = await resp.text();
        setMessage(`Export failed: ${resp.status} ${txt}`);
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
      setLoadingAction(null);
    }
  }

  async function pushToJira() {
     // For simplicity, hardcoding email. In a real app, this would come from user auth.
     if (selectedPreviews.size === 0) {
      return setMessage("Please select at least one test case to push to JIRA.");
    }
    const userEmail = "dtmishra43@gmail.com"; 

    if (!jiraUrl || !jiraProjectKey || !jiraApiToken || !userEmail) {
      return setMessage("JIRA configuration is incomplete.");
    }
    setLoadingAction("push-jira");
    setMessage("Pushing selected test cases to JIRA...");
    try {
      const r = await fetchJson('/export/jira', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jira_config: { 
            url: jiraUrl, 
            project_key: jiraProjectKey, 
            api_token: jiraApiToken,
            username: userEmail 
          },
          test_case_ids: Array.from(selectedPreviews),
        })
      });

      if (r.ok) {
        setMessage(`Successfully pushed ${r.json.created_issues_count} test cases to JIRA.`);
        setIsJiraModalOpen(false);
      } else {
        setMessage(`JIRA push failed: ${r.status} ${r.json.detail}`);
      }
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoadingAction(null);
    }

  }

  // --- UI HELPER FUNCTIONS ---
  function canGenerate(): boolean {
    return requirements.some((r) => r.status === "approved");
  }

  function handleAnalyzeDoc(doc: Doc) {
    setSelectedDoc(doc);
    setPreviews([]);
    loadRequirements(doc.id);
    if (sessionId) loadTestcases(sessionId, doc.id, tcStatusFilter);
    setCurrentStep(2);
  }

  function handleTestTypeChange(type: string) {
    const newSelection = new Set(selectedTestTypes);
    if (newSelection.has(type)) {
      newSelection.delete(type);
    } else {
      newSelection.add(type);
    }
    setSelectedTestTypes(newSelection);
  }

  function startNewSession() {
    setSessionId(null);
    setDocs([]);
    setSelectedDoc(null);
    setRequirements([]);
    setPreviews([]);
    setTestcases([]);
    setCurrentStep(1);
    setMessage("New session started.");
  }

  function startEditing(req: Requirement) {
    setEditingReqId(req.id);
    setEditText(req.raw_text);
  }

  async function saveEditedRequirement(reqId: number) {
    setLoadingAction(`save-req-${reqId}`);
    try {
      const r = await fetchJson(`/requirements/${reqId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: editText }),
      });
      if (r.ok) {
        setMessage("Requirement updated and re-analyzed.");
        setEditingReqId(null); // Exit edit mode
        if (selectedDoc) await loadRequirements(selectedDoc.id); 
      } else {
        setMessage(`Save failed: ${r.status} ${r.text}`);
      }
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoadingAction(null);
    }
  }

  // --- RENDER ---
  return (
    <div style={{ maxWidth: 1000, margin: "24px auto" }}>
      <h1>AI Test Case Generator</h1>
      <p className="muted">Follow the steps below to turn requirements into test cases.</p>

      <div className="stepper">
        <div className={`step ${currentStep >= 1 ? 'active' : ''}`}>1. Upload & Select</div>
        <div className={`step ${currentStep >= 2 ? 'active' : ''}`}>2. Review Requirements</div>
        <div className={`step ${currentStep >= 3 ? 'active' : ''}`}>3. Generate Test Cases</div>
        <div className={`step ${currentStep >= 4 ? 'active' : ''}`}>4. Export</div>
      </div>

      {currentStep === 1 && (
        <section>
          <h3>Upload Requirement File</h3>
          <div className="card">
            <input type="file" accept=".txt,.csv,.xlsx,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ display: "block", marginBottom: 10 }} />
            <div className="btn-row">
              <button className="btn" onClick={uploadFile} disabled={!!loadingAction} title="Upload the selected file to start">
                {loadingAction === 'upload' ? 'Uploading...' : 'Upload'}
              </button>
              <button className="btn" onClick={() => loadDocs(sessionId)} disabled={!!loadingAction} title="Refresh the list of documents">
                {loadingAction === 'load-docs' ? 'Refreshing...' : 'Refresh Docs'}
              </button>
              <button className="btn" onClick={startNewSession} disabled={!sessionId || !!loadingAction} title="Clear all data from this session and start over">
                Start New Session
              </button>
            </div>
          </div>
          <div style={{ marginTop: 24 }}>
            <h3>Select a Document to Process</h3>
            <div className="grid">
              {docs.length === 0 && (
                <div className="empty-state">
                  <h4>No Documents Found</h4>
                  <p className="muted">Upload a requirement file to get started.</p>
                </div>
              )}
              {docs.map((d) => (
                <div key={d.id} className={`doc ${selectedDoc?.id === d.id ? 'selected' : ''}`}>
                  <div className="doc-name">{d.filename}</div>
                  <div className="doc-meta">By: {d.uploaded_by}</div>
                  <div className="doc-actions">
                    <button className="btn" onClick={() => triggerExtract(d)} disabled={!!loadingAction} title="Extract requirements from this document using AI">
                      {loadingAction === `extract-${d.id}` ? 'Extracting...' : 'Extract'}
                    </button>
                    <button className="btn" onClick={() => handleAnalyzeDoc(d)} disabled={!!loadingAction} title="Load this document's requirements into the next step">Analyze</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {currentStep === 2 && (
        <section>
          <h3>Review Extracted Requirements for "{selectedDoc?.filename}"</h3>
          <div className="muted" style={{ marginBottom: '8px' }}>Approve requirements or adjust confidence to regenerate.</div>
          {!selectedDoc && (
            <div className="empty-state">
              <h4>No Document Selected</h4>
              <p className="muted">Please go back to Step 1 and select a document to analyze.</p>
            </div>
          )}
          {requirements.length === 0 && selectedDoc && (
            <div className="empty-state">
              <h4>No Requirements Found</h4>
              <p className="muted">Click <strong>Extract</strong> on the document in the previous step to run the AI analysis.</p>
            </div>
          )}
          {requirements.map((req) => (
            <div key={req.id}
              className={`card ${req.status === 'needs_manual_fix' || req.overall_confidence < 0.75 ? 'warning' : ''}`}
              style={{ marginBottom: '8px' }}>
              {editingReqId === req.id ? (
                // --- EDIT MODE ---
                <div>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    style={{ width: '100%', minHeight: '80px', fontFamily: 'monospace' }}
                  />
                  <div className="btn-row">
                    <button className="btn primary" onClick={() => saveEditedRequirement(req.id)} disabled={!!loadingAction}>
                      {loadingAction === `save-req-${req.id}` ? 'Saving...' : 'Save & Re-Analyze'}
                    </button>
                    <button className="btn" onClick={() => setEditingReqId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                // --- NORMAL DISPLAY MODE ---
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div className="req-id">{req.requirement_id ?? `Req-${req.id}`}</div>
                    <div className="req-raw">{req.raw_text}</div>
                    <div className="muted" style={{ marginTop: '8px' }}>
                      Status: <strong>{req.status}</strong> • AI Confidence: <strong>{(req.overall_confidence ?? 0).toFixed(2)}</strong>
                    </div>
                    {req.status === 'needs_manual_fix' && req.error_message && (
                      <div style={{ marginTop: '10px', padding: '8px', background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: '4px', color: '#a8071a' }}>
                        <strong>Validation Error:</strong> {req.error_message}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: 'center' }}>
                    <div style={{ borderLeft: '1px solid #eee', paddingLeft: '8px', alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px' }}>
                      <button className="btn" onClick={() => startEditing(req)} disabled={!!loadingAction}>Edit</button>
                      <button className="btn" onClick={() => approveRequirement(req, reviewConfidence)} disabled={!!loadingAction} title="Approve this requirement as is">
                        {loadingAction === `approve-${req.id}` ? '...' : 'Approve'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div className="step-navigation">
            <button className="btn" onClick={() => setCurrentStep(1)}>Back to Upload</button>
            <button className="btn primary" onClick={() => setCurrentStep(3)} disabled={!canGenerate()} title="Proceed to the next step">Continue to Generation</button>
          </div>
        </section>
      )}

      {currentStep === 3 && (
        <section>
          <h3>Generate Test Cases</h3>
          <div className="muted" style={{ marginBottom: '8px' }}>Select the types of test cases you want to generate.</div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #eee' }}>
            <label style={{ cursor: 'pointer' }}><input type="checkbox" checked={selectedTestTypes.has("positive")} onChange={() => handleTestTypeChange("positive")} /> Positive (Happy Path)</label>
            <label style={{ cursor: 'pointer' }}><input type="checkbox" checked={selectedTestTypes.has("negative")} onChange={() => handleTestTypeChange("negative")} /> Negative (Error Cases)</label>
            <label style={{ cursor: 'pointer' }}><input type="checkbox" checked={selectedTestTypes.has("boundary")} onChange={() => handleTestTypeChange("boundary")} /> Boundary (Edge Cases)</label>
          </div>
          <div className="btn-row">
            <button className="btn primary" onClick={generatePreviewForDoc} disabled={!selectedDoc || !canGenerate() || !!loadingAction}>
              {loadingAction === 'generate-previews' ? 'Generating...' : 'Generate Test Cases'}
            </button>
            <button
              className="btn"
              onClick={regenerateSelectedPreviews}
              disabled={selectedPreviews.size === 0 || !!loadingAction}
              title="Regenerate the AI output for all selected test cases"
            >
              {loadingAction === 'regenerate-selected' ? 'Regenerating...' : `Regenerate Selected (${selectedPreviews.size})`}
            </button>
            <button 
                  className="btn" 
                  onClick={() => { 
                    setPreviews([]); 
                    setSelectedPreviews(new Set()); 
                  }} 
                  disabled={!!loadingAction}
                >
                  Clear Previews
                </button>
          </div>
          {previews.length > 0 && (
            <>
              <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
                <strong style={{ marginRight: '8px' }}>View As:</strong>
                <button className={`btn ${activeViewFormat === 'gherkin' ? 'primary' : ''}`} onClick={() => setActiveViewFormat('gherkin')}>Gherkin</button>
                <button className={`btn ${activeViewFormat === 'pytest' ? 'primary' : ''}`} onClick={() => setActiveViewFormat('pytest')}>Pytest</button>
                <button className={`btn ${activeViewFormat === 'text' ? 'primary' : ''}`} onClick={() => setActiveViewFormat('text')}>Plain Text</button>
              </div>

              <div className="card" style={{ marginTop: '12px', background: '#f6f8fa' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <label htmlFor="batchConfidence" style={{ fontWeight: 600 }}>Your Overall Confidence:</label>
                  <input
                    type="number"
                    id="batchConfidence"
                    step="0.1" max={1.0} min={0.1}
                    value={batchConfidence}
                    onChange={(e) => setBatchConfidence(Number(e.target.value))}
                    style={{ width: 100 }}
                    title="Rate your confidence in this batch of generated test cases."
                  />
                  {batchConfidence < 0.9 && (
                    <div style={{ color: '#d97706' }}>
                      Review required. Please use "Regenerate Selected" (coming next) or "Edit" to improve test cases before confirming.
                    </div>
                  )}
                </div>
              </div>
            </>

          )}
          <div style={{ marginTop: 12 }}>
            {previews.length === 0 && (
              <div className="empty-state">
                <h4>No Test Cases Generated</h4>
                <p className="muted">Click "Generate Test Cases" to create previews from your approved requirements.</p>
              </div>
            )}
            {previews.map((p) => (
              <div key={p.id} className="card" style={{ marginBottom: '8px', display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div className="req-id">{p.test_case_id}</div>
                  <pre style={{ whiteSpace: "pre-wrap", margin: '6px 0', background: '#f9f9f9', padding: '8px', borderRadius: '4px', fontFamily: 'monospace' }}>
                    {activeViewFormat === 'gherkin' && p.gherkin}
                    {activeViewFormat === 'pytest' && (p.code_scaffold_str || "No Pytest code generated.")}
                    {activeViewFormat === 'text' &&
                      `SCENARIO: ${p.test_case_id}
                        ---
                        ${p.gherkin}
                        ---
                        STEPS:
                        ${JSON.parse(p.automated_steps_json || "[]").join("\n")}`
                    }
                  </pre>
                </div>
                <div style={{display: 'flex', gap: '8px', alignItems: 'center', minWidth: '120px', justifyContent: 'flex-end'}}>
                            <button className="btn" onClick={() => startEditingPreview(p)} disabled={!!loadingAction} title="Manually edit this test case">Edit</button>
                            <label><input type="checkbox" checked={selectedPreviews.has(p.id)} onChange={() => togglePreview(p.id)} /> Select</label>
                        </div>
              </div>
            ))}
            {previews.length > 0 &&
              <div style={{ marginTop: 8 }}>
                <button
                  className="btn primary"
                  onClick={confirmSelectedPreviews}
                  disabled={!!loadingAction || selectedPreviews.size === 0 || batchConfidence < 0.9}
                  title={batchConfidence < 0.9 ? "Confidence must be 0.9 or higher to confirm" : "Confirm selected test cases and proceed"}
                >
                  {loadingAction === 'confirm-previews' ? 'Confirming...' : `Approve & Continue (${selectedPreviews.size} selected)`}
                </button>
              </div>
            }
          </div>
          <div className="step-navigation">
            <button className="btn" onClick={() => setCurrentStep(2)}>Back to Review</button>
          </div>
        </section>
      )}

      {currentStep === 4 && (
        <section>
          <h3>Export Test Cases for "{selectedDoc?.filename}"</h3>
          <div className="btn-row" style={{ marginBottom: '8px' }}>
            <select value={tcStatusFilter} onChange={(e) => { setTcStatusFilter(e.target.value); if (selectedDoc) loadTestcases(sessionId, selectedDoc.id, e.target.value); }}>
              <option value="generated">Generated</option>
              <option value="preview">Preview</option>
              <option value="stale">Stale</option>
              <option value="pushed">Pushed</option>
              <option value="">All</option>
            </select>
            <button className="btn" onClick={() => { if (selectedDoc) loadTestcases(sessionId, selectedDoc.id, tcStatusFilter || undefined); }} disabled={!!loadingAction}>
              {loadingAction === 'load-tcs' ? '...' : 'Refresh'}
            </button>
            <button className="btn primary" onClick={downloadExportCSV} disabled={!!loadingAction} title="Download the generated test cases as a CSV file">
              {loadingAction === 'export-csv' ? '...' : 'Export CSV'}
            </button>
            <button className="btn" onClick={downloadTraceabilityMatrix} disabled={!!loadingAction} title="Download a requirement-to-test-case traceability matrix">
                  {loadingAction === 'export-matrix' ? '...' : 'Export Traceability Matrix'}
                </button>
           <button 
                  className="btn" 
                  onClick={() => setIsJiraModalOpen(true)} 
                  disabled={!!loadingAction || selectedPreviews.size === 0} 
                  title="Push selected test cases to JIRA"
                >
                  {`Push to JIRA (${selectedPreviews.size})`}
                </button>
          </div>
          <div style={{ marginTop: 12 }}>
                {testcases.length === 0 && <div className="muted" style={{padding: '20px', textAlign: 'center'}}>No confirmed test cases to display.</div>}
                {testcases.map((t) => (
                    <div key={t.id} className="card" style={{marginBottom: '8px', display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div className="req-id">{t.test_case_id}</div>
                          <div className="doc-meta">Req: {t.requirement_id} • Status: {t.status} • {new Date(t.generated_at).toLocaleString()}</div>
                        </div>
                        <div>
                          <label><input type="checkbox" checked={selectedPreviews.has(t.id)} onChange={() => togglePreview(t.id)} /> Select</label>
                        </div>
                    </div>
                ))}
            </div>
          <div className="step-navigation">
            <button className="btn" onClick={() => setCurrentStep(3)}>Back to Generation</button>
          </div>
        </section>
      )}

      {isJiraModalOpen && (
        <div className="modal">
          <div className="modal-inner">
            <h3>Push to JIRA</h3>
            <p className="muted">Enter your JIRA details to create issues from the selected test cases.</p>
            <div>
              <label>JIRA URL (e.g., https://your-domain.atlassian.net)</label>
              <input type="text" value={jiraUrl} onChange={e => setJiraUrl(e.target.value)} />
            </div>
            <div style={{ marginTop: '8px' }}>
              <label>JIRA Project Key (e.g., PROJ)</label>
              <input type="text" value={jiraProjectKey} onChange={e => setJiraProjectKey(e.target.value)} />
            </div>
            <div style={{ marginTop: '8px' }}>
              <label>JIRA API Token</label>
              <input type="password" value={jiraApiToken} onChange={e => setJiraApiToken(e.target.value)} />
            </div>
            <div className="btn-row" style={{ marginTop: '16px' }}>
              <button className="btn primary" onClick={pushToJira} disabled={!!loadingAction}>
                {loadingAction === 'push-jira' ? 'Pushing...' : 'Push to JIRA'}
              </button>
              <button className="btn" onClick={() => setIsJiraModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editingPreview && (
        <div className="modal">
          <div className="modal-inner">
              <h3>Edit Test Case: {editingPreview.test_case_id}</h3>
              <p className="muted">Manually refine the generated Gherkin script.</p>
              <textarea 
                value={editTextGherkin}
                onChange={e => setEditTextGherkin(e.target.value)}
                style={{width: '100%', minHeight: '200px', fontFamily: 'monospace'}}
              />
              <div className="btn-row" style={{marginTop: '16px'}}>
                  <button className="btn primary" onClick={saveEditedPreview} disabled={!!loadingAction}>
                    {loadingAction === `save-preview-${editingPreview.id}` ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button className="btn" onClick={() => setEditingPreview(null)}>Cancel</button>
              </div>
          </div>
        </div>
      )}

      {message && (
        <div className="toast">
          <span>{message}</span>
          <button className="toast-close" onClick={() => setMessage("")}>&times;</button>
        </div>
      )}
    </div>
  );
}