// // src/App.tsx
// import React, { JSX, useEffect, useState } from "react";

// // --- TYPE DEFINITIONS ---
// type Doc = {
//   id: number;
//   filename: string;
//   uploaded_by?: string;
//   upload_session_id?: string;
// };

// type Requirement = {
//   id: number;
//   requirement_id?: string;
//   raw_text: string;
//   structured: any;
//   field_confidences: Record<string, number>;
//   overall_confidence: number;
//   status: string;
//   doc_id?: number;
//   error_message?: string;
// };

// type Preview = {
//   id: number; 
//   test_case_id: string;
//   gherkin: string;
//   code_scaffold_str: string;
//   automated_steps_json: string;
// };

// type TestCaseRow = {
//   id: number;
//   test_case_id: string;
//   requirement_id: number;
//   status: string;
//   generated_at: string;
// };



// // --- API SETUP ---
// const API_BASE = (import.meta.env.VITE_API_BASE as string) || "/api";

// async function fetchJson(path: string, opts: RequestInit = {}) {
//   const resp = await fetch(`${API_BASE}${path}`, opts);
//   const text = await resp.text();
//   try {
//     const json = text ? JSON.parse(text) : null;
//     return { ok: resp.ok, status: resp.status, json, text };
//   } catch {
//     return { ok: resp.ok, status: resp.status, json: null, text };
//   }
// }

// // --- MAIN APP COMPONENT ---
// export default function App(): JSX.Element {
//   // --- STATE MANAGEMENT ---
//   const [docs, setDocs] = useState<Doc[]>([]);
//   const [file, setFile] = useState<File | null>(null);
//   const [sessionId, setSessionId] = useState<string | null>(localStorage.getItem("upload_session_id") || null);
//   const [message, setMessage] = useState<string>("");
//   const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
//   const [requirements, setRequirements] = useState<Requirement[]>([]);
//   const [reviewConfidence, setReviewConfidence] = useState<number>(0.9);
//   const [previews, setPreviews] = useState<Preview[]>([]);
//   const [selectedPreviews, setSelectedPreviews] = useState<Set<number>>(new Set());
//   const [testcases, setTestcases] = useState<TestCaseRow[]>([]);
//   const [tcStatusFilter, setTcStatusFilter] = useState<string>("generated");
//   const [currentStep, setCurrentStep] = useState<number>(1);
//   const [selectedTestTypes, setSelectedTestTypes] = useState<Set<string>>(new Set(["positive"]));
//   const [isJiraModalOpen, setIsJiraModalOpen] = useState<boolean>(false);
//   const [jiraUrl, setJiraUrl] = useState<string>("");
//   const [jiraProjectKey, setJiraProjectKey] = useState<string>("");
//   const [jiraApiToken, setJiraApiToken] = useState<string>("");
//   const [loadingAction, setLoadingAction] = useState<string | null>(null);
//   const [editingReqId, setEditingReqId] = useState<number | null>(null);
//   const [editText, setEditText] = useState<string>("");
//   const [activeViewFormat, setActiveViewFormat] = useState<'gherkin' | 'pytest' | 'text'>('gherkin');
//   const [batchConfidence, setBatchConfidence] = useState<number>(1.0);
//   const [editingPreview, setEditingPreview] = useState<Preview | null>(null);
//   const [editTextGherkin, setEditTextGherkin] = useState<string>("");


//   useEffect(() => {
//     if (sessionId) {
//       localStorage.setItem("upload_session_id", sessionId);
//       loadDocs(sessionId);
//     } else {
//       localStorage.removeItem("upload_session_id");
//     }
//   }, [sessionId]);

//   useEffect(() => {
//     if (message) {
//       const timer = setTimeout(() => setMessage(""), 5000); 
//       return () => clearTimeout(timer);
//     }
//   }, [message]);

//   // --- API FUNCTIONS ---

//   async function downloadTraceabilityMatrix() {
//     if (!selectedDoc) return setMessage("No document selected.");
//     setLoadingAction("export-matrix");
//     try {
//       const url = `${API_BASE}/export/traceability_matrix?doc_id=${selectedDoc.id}`;
//       const resp = await fetch(url);

//       if (!resp.ok) {
//         const txt = await resp.text();
//         setMessage(`Export failed: ${resp.status} ${txt}`);
//         return;
//       }
//       // Standard file download logic
//       const blob = await resp.blob();
//       const dlUrl = URL.createObjectURL(blob);
//       const a = document.createElement("a");
//       a.href = dlUrl;
//       a.download = `traceability_matrix_${selectedDoc.filename}.csv`;
//       document.body.appendChild(a);
//       a.click();
//       a.remove();
//       URL.revokeObjectURL(dlUrl);
//       setMessage("Traceability Matrix download started.");

//     } catch (err: any) {
//       setMessage(String(err));
//     } finally {
//       setLoadingAction(null);
//     }
//   }

//   async function uploadFile(e?: React.FormEvent) {
//     e?.preventDefault?.();
//     if (!file) {
//       setMessage("Choose a file to upload");
//       return;
//     }
//     setLoadingAction("upload");
//     setMessage("Uploading...");
//     const controller = new AbortController();
//     const timeout = setTimeout(() => controller.abort(), 30000);
//     try {
//       const fd = new FormData();
//       fd.append("file", file, file.name);
//       if (sessionId) {
//         fd.append("upload_session_id", sessionId);
//       }
//       const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: fd, signal: controller.signal });
//       clearTimeout(timeout);
//       const text = await res.text();
//       let json = null;
//       try {
//         json = text ? JSON.parse(text) : null;
//       } catch { }
//       if (res.ok && json) {
//         setMessage(`Uploaded: ${json.filename}`);
//         if (json.upload_session_id) setSessionId(json.upload_session_id);
//         await loadDocs(json.upload_session_id || sessionId);
//       } else {
//         setMessage(`Upload failed: ${res.status} ${text}`);
//       }
//     } catch (err: any) {
//       if (err?.name === "AbortError") setMessage("Upload timed out (30s) and was cancelled.");
//       else setMessage(`Upload error: ${err?.message ?? String(err)}`);
//     } finally {
//       setLoadingAction(null);
//     }
//   }

//   async function loadDocs(upload_session_id?: string | null) {
//     setLoadingAction("load-docs");
//     try {
//       const q = upload_session_id ? `?upload_session_id=${encodeURIComponent(upload_session_id)}` : "";
//       const r = await fetchJson(`/documents${q}`);
//       if (r.ok) setDocs(r.json || []);
//       else setMessage(`Docs load failed: ${r.status}`);
//     } catch (err: any) {
//       setMessage(String(err));
//     } finally {
//       setLoadingAction(null);
//     }
//   }

//   async function triggerExtract(doc: Doc) {
//     setLoadingAction(`extract-${doc.id}`);
//     try {
//       const url = sessionId ? `/extract/${doc.id}?upload_session_id=${encodeURIComponent(sessionId)}` : `/extract/${doc.id}`;
//       const r = await fetchJson(url, { method: "POST" });
//       if (r.ok) {
//         setMessage(`Extraction created ${r.json.created_requirements.length} requirements`);
//         await loadDocs(sessionId);
//         handleAnalyzeDoc(doc);
//       } else {
//         setMessage(`Extract failed: ${r.status} ${r.text}`);
//       }
//     } catch (err: any) {
//       setMessage(String(err));
//     } finally {
//       setLoadingAction(null);
//     }
//   }

//   async function loadRequirements(docId: number) {
//     setLoadingAction("load-reqs");
//     try {
//       const r = await fetchJson(`/requirements?doc_id=${docId}`);
//       if (r.ok) {
//         const items = (r.json || []).map((it: any) => ({ ...it, field_confidences: it.field_confidences || {} }));
//         setRequirements(items);
//       } else {
//         setMessage(`Requirements load failed: ${r.status}`);
//       }
//     } catch (err: any) {
//       setMessage(String(err));
//     } finally {
//       setLoadingAction(null);
//     }
//   }

//   async function regenerateRequirement(reqId: number, confidence: number) {
//     setLoadingAction(`regen-req-${reqId}`);
//     setMessage(`Regenerating requirement ${reqId}...`);
//     try {
//       const r = await fetchJson(`/requirements/regenerate/${reqId}`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ reviewer_confidence: confidence }),
//       });
//       if (r.ok) {
//         setMessage("Requirement regenerated successfully.");
//         if (selectedDoc) await loadRequirements(selectedDoc.id);
//       } else {
//         setMessage(`Regeneration failed: ${r.status} ${r.text}`);
//       }
//     } catch (err: any) {
//       setMessage(String(err));
//     } finally {
//       setLoadingAction(null);
//     }
//   }

//   async function approveRequirement(req: Requirement, confidence: number) {
//     setLoadingAction(`approve-${req.id}`);
//     try {
//       const payload = { edits: {}, review_confidence: confidence, note: "Approved via UI" };
//       const r = await fetchJson(`/review/${req.id}`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });
//       if (r.ok) {
//         setMessage(`Requirement ${req.id} reviewed: ${r.json.status}`);
//         if (selectedDoc) await loadRequirements(selectedDoc.id);
//       } else {
//         setMessage(`Approve failed: ${r.status} ${r.text}`);
//       }
//     } catch (err: any) {
//       setMessage(String(err));
//     } finally {
//       setLoadingAction(null);
//     }
//   }

//   async function generatePreviewForDoc() {
//     if (!selectedDoc) return setMessage("Select a document first");
//     if (selectedTestTypes.size === 0) return setMessage("Please select at least one test type to generate.");
//     setLoadingAction("generate-previews");
//     try {
//       const body = JSON.stringify({
//         doc_id: selectedDoc.id,
//         test_types: Array.from(selectedTestTypes),
//       });
//       const r = await fetchJson(`/generate/preview`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body,
//       });
//       if (r.ok) {
//         setPreviews(r.json.previews || []);
//         setMessage(`Preview generated: ${r.json.preview_count}`);
//         if (selectedDoc) await loadTestcases(sessionId, selectedDoc.id, "preview");
//       } else {
//         setMessage(`Preview failed: ${r.status} ${r.text}`);
//       }
//     } catch (err: any) {
//       setMessage(String(err));
//     } finally {
//       setLoadingAction(null);
//     }
//   }

//   async function regeneratePreview(previewId: number) {
//     setLoadingAction(`regen-preview-${previewId}`);
//     setMessage(`Regenerating test case ${previewId}...`);
//     try {
//       const r = await fetchJson(`/generate/regenerate/${previewId}`, { method: "POST" });
//       if (r.ok) {
//         setMessage("Test case regenerated. Refreshing previews.");
//         await generatePreviewForDoc();
//       } else {
//         setMessage(`Regeneration failed: ${r.status} ${r.text}`);
//       }
//     } catch (err: any) {
//       setMessage(String(err));
//     } finally {
//       setLoadingAction(null);
//     }
//   }

//   function togglePreview(id: number) {
//     setSelectedPreviews((s) => {
//       const ns = new Set(s);
//       if (ns.has(id)) ns.delete(id);
//       else ns.add(id);
//       return ns;
//     });
//   }

//   async function confirmSelectedPreviews() {
//     if (selectedPreviews.size === 0) return setMessage("Select preview items to confirm");
//     setLoadingAction("confirm-previews");
//     try {
//       const ids = Array.from(selectedPreviews);
//       const r = await fetchJson(`/generate/confirm`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ preview_ids: ids, reviewer_confidence: batchConfidence }),
//       });
//       if (r.ok) {
//         setMessage(`Confirmed ${r.json.confirmed} preview(s)`);
//         setSelectedPreviews(new Set());
//         if (selectedDoc) await loadTestcases(sessionId, selectedDoc.id, "generated");
//         setPreviews([]);
//         setCurrentStep(4);
//       } else {
//         setMessage(`Confirm failed: ${r.status} ${r.text}`);
//       }
//     } catch (err: any) {
//       setMessage(String(err));
//     } finally {
//       setLoadingAction(null);
//     }
//   }

//   async function regenerateSelectedPreviews() {
//     if (selectedPreviews.size === 0) return setMessage("Select at least one test case to regenerate.");
//     setLoadingAction("regenerate-selected");
//     try {
//       const ids = Array.from(selectedPreviews);
//       const r = await fetchJson(`/generate/regenerate-batch`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ preview_ids: ids }),
//       });

//       if (r.ok) {
//         setMessage(`${r.json.regenerated_count} test case(s) regenerated successfully.`);
//         await generatePreviewForDoc();
//       } else {
//         setMessage(`Regeneration failed: ${r.status} ${r.text}`);
//       }
//     } catch (err: any) {
//       setMessage(String(err));
//     } finally {
//       setLoadingAction(null);
//     }
//   }

//   async function saveEditedPreview() {
//     if (!editingPreview) return;
//     setLoadingAction(`save-preview-${editingPreview.id}`);
//     try {
//       const r = await fetchJson(`/testcase/${editingPreview.id}`, {
//         method: "PUT",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ gherkin: editTextGherkin }),
//       });
//       if (r.ok) {
//         setMessage("Test case updated successfully.");
//         setEditingPreview(null);
//         await generatePreviewForDoc(); 
//       } else {
//         setMessage(`Save failed: ${r.status} ${r.text}`);
//       }
//     } catch (err: any) {
//       setMessage(String(err));
//     } finally {
//       setLoadingAction(null);
//     }
//   }

//   function startEditingPreview(p: Preview) {
//     setEditingPreview(p);
//     setEditTextGherkin(p.gherkin);
//   }


//   async function loadTestcases(upload_session_id?: string | null, doc_id?: number | null, status?: string | null) {
//     setLoadingAction("load-tcs");
//     try {
//       const params = new URLSearchParams();
//       if (upload_session_id) params.append("upload_session_id", upload_session_id);
//       if (doc_id) params.append("doc_id", String(doc_id));
//       if (status) params.append("status", status);
//       const path = `/testcases${params.toString() ? "?" + params.toString() : ""}`;
//       const r = await fetchJson(path);
//       if (r.ok) setTestcases(r.json || []);
//       else setMessage(`Load testcases failed: ${r.status}`);
//     } catch (err: any) {
//       setMessage(String(err));
//     } finally {
//       setLoadingAction(null);
//     }
//   }

//   async function downloadExportCSV() {
//     if (!selectedDoc || !sessionId) return setMessage("Select a document and ensure session exists");
//     const url = `${API_BASE}/export/testcases/download?upload_session_id=${encodeURIComponent(sessionId)}&doc_id=${selectedDoc.id}`;
//     setLoadingAction("export-csv");
//     try {
//       const resp = await fetch(url);
//       if (!resp.ok) {
//         const txt = await resp.text();
//         setMessage(`Export failed: ${resp.status} ${txt}`);
//         return;
//       }
//       const blob = await resp.blob();
//       const dlUrl = URL.createObjectURL(blob);
//       const a = document.createElement("a");
//       a.href = dlUrl;
//       const cd = resp.headers.get("content-disposition");
//       let filename = `test_cases_${Date.now()}.csv`;
//       if (cd) {
//         const m = cd.match(/filename="?(.+)"?/);
//         if (m) filename = m[1];
//       }
//       a.download = filename;
//       document.body.appendChild(a);
//       a.click();
//       a.remove();
//       URL.revokeObjectURL(dlUrl);
//       setMessage("Download started");
//     } catch (err: any) {
//       setMessage(String(err));
//     } finally {
//       setLoadingAction(null);
//     }
//   }

//   async function pushToJira() {
//      // For simplicity, hardcoding email. In a real app, this would come from user auth.
//      if (selectedPreviews.size === 0) {
//       return setMessage("Please select at least one test case to push to JIRA.");
//     }
//     const userEmail = "dtmishra43@gmail.com"; 

//     if (!jiraUrl || !jiraProjectKey || !jiraApiToken || !userEmail) {
//       return setMessage("JIRA configuration is incomplete.");
//     }
//     setLoadingAction("push-jira");
//     setMessage("Pushing selected test cases to JIRA...");
//     try {
//       const r = await fetchJson('/export/jira', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           jira_config: { 
//             url: jiraUrl, 
//             project_key: jiraProjectKey, 
//             api_token: jiraApiToken,
//             username: userEmail 
//           },
//           test_case_ids: Array.from(selectedPreviews),
//         })
//       });

//       if (r.ok) {
//         setMessage(`Successfully pushed ${r.json.created_issues_count} test cases to JIRA.`);
//         setIsJiraModalOpen(false);
//       } else {
//         setMessage(`JIRA push failed: ${r.status} ${r.json.detail}`);
//       }
//     } catch (err: any) {
//       setMessage(String(err));
//     } finally {
//       setLoadingAction(null);
//     }

//   }

//   // --- UI HELPER FUNCTIONS ---
//   function canGenerate(): boolean {
//     return requirements.some((r) => r.status === "approved");
//   }

//   function handleAnalyzeDoc(doc: Doc) {
//     setSelectedDoc(doc);
//     setPreviews([]);
//     loadRequirements(doc.id);
//     if (sessionId) loadTestcases(sessionId, doc.id, tcStatusFilter);
//     setCurrentStep(2);
//   }

//   function handleTestTypeChange(type: string) {
//     const newSelection = new Set(selectedTestTypes);
//     if (newSelection.has(type)) {
//       newSelection.delete(type);
//     } else {
//       newSelection.add(type);
//     }
//     setSelectedTestTypes(newSelection);
//   }

//   function startNewSession() {
//     setSessionId(null);
//     setDocs([]);
//     setSelectedDoc(null);
//     setRequirements([]);
//     setPreviews([]);
//     setTestcases([]);
//     setCurrentStep(1);
//     setMessage("New session started.");
//   }

//   function startEditing(req: Requirement) {
//     setEditingReqId(req.id);
//     setEditText(req.raw_text);
//   }

//   async function saveEditedRequirement(reqId: number) {
//     setLoadingAction(`save-req-${reqId}`);
//     try {
//       const r = await fetchJson(`/requirements/${reqId}`, {
//         method: "PUT",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ raw_text: editText }),
//       });
//       if (r.ok) {
//         setMessage("Requirement updated and re-analyzed.");
//         setEditingReqId(null); // Exit edit mode
//         if (selectedDoc) await loadRequirements(selectedDoc.id); 
//       } else {
//         setMessage(`Save failed: ${r.status} ${r.text}`);
//       }
//     } catch (err: any) {
//       setMessage(String(err));
//     } finally {
//       setLoadingAction(null);
//     }
//   }

//   // --- RENDER ---
//   return (
//     <div style={{ maxWidth: 1000, margin: "24px auto" }}>
//       <h1>AI Test Case Generator</h1>
//       <p className="muted">Follow the steps below to turn requirements into test cases.</p>

//       <div className="stepper">
//         <div className={`step ${currentStep >= 1 ? 'active' : ''}`}>1. Upload & Select</div>
//         <div className={`step ${currentStep >= 2 ? 'active' : ''}`}>2. Review Requirements</div>
//         <div className={`step ${currentStep >= 3 ? 'active' : ''}`}>3. Generate Test Cases</div>
//         <div className={`step ${currentStep >= 4 ? 'active' : ''}`}>4. Export</div>
//       </div>

//       {currentStep === 1 && (
//         <section>
//           <h3>Upload Requirement File</h3>
//           <div className="card">
//             <input type="file" accept=".txt,.csv,.xlsx,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ display: "block", marginBottom: 10 }} />
//             <div className="btn-row">
//               <button className="btn" onClick={uploadFile} disabled={!!loadingAction} title="Upload the selected file to start">
//                 {loadingAction === 'upload' ? 'Uploading...' : 'Upload'}
//               </button>
//               <button className="btn" onClick={() => loadDocs(sessionId)} disabled={!!loadingAction} title="Refresh the list of documents">
//                 {loadingAction === 'load-docs' ? 'Refreshing...' : 'Refresh Docs'}
//               </button>
//               <button className="btn" onClick={startNewSession} disabled={!sessionId || !!loadingAction} title="Clear all data from this session and start over">
//                 Start New Session
//               </button>
//             </div>
//           </div>
//           <div style={{ marginTop: 24 }}>
//             <h3>Select a Document to Process</h3>
//             <div className="grid">
//               {docs.length === 0 && (
//                 <div className="empty-state">
//                   <h4>No Documents Found</h4>
//                   <p className="muted">Upload a requirement file to get started.</p>
//                 </div>
//               )}
//               {docs.map((d) => (
//                 <div key={d.id} className={`doc ${selectedDoc?.id === d.id ? 'selected' : ''}`}>
//                   <div className="doc-name">{d.filename}</div>
//                   <div className="doc-meta">By: {d.uploaded_by}</div>
//                   <div className="doc-actions">
//                     <button className="btn" onClick={() => triggerExtract(d)} disabled={!!loadingAction} title="Extract requirements from this document using AI">
//                       {loadingAction === `extract-${d.id}` ? 'Extracting...' : 'Extract'}
//                     </button>
//                     <button className="btn" onClick={() => handleAnalyzeDoc(d)} disabled={!!loadingAction} title="Load this document's requirements into the next step">Analyze</button>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </section>
//       )}

//       {currentStep === 2 && (
//         <section>
//           <h3>Review Extracted Requirements for "{selectedDoc?.filename}"</h3>
//           <div className="muted" style={{ marginBottom: '8px' }}>Approve requirements or adjust confidence to regenerate.</div>
//           {!selectedDoc && (
//             <div className="empty-state">
//               <h4>No Document Selected</h4>
//               <p className="muted">Please go back to Step 1 and select a document to analyze.</p>
//             </div>
//           )}
//           {requirements.length === 0 && selectedDoc && (
//             <div className="empty-state">
//               <h4>No Requirements Found</h4>
//               <p className="muted">Click <strong>Extract</strong> on the document in the previous step to run the AI analysis.</p>
//             </div>
//           )}
//           {requirements.map((req) => (
//             <div key={req.id}
//               className={`card ${req.status === 'needs_manual_fix' || req.overall_confidence < 0.75 ? 'warning' : ''}`}
//               style={{ marginBottom: '8px' }}>
//               {editingReqId === req.id ? (
//                 // --- EDIT MODE ---
//                 <div>
//                   <textarea
//                     value={editText}
//                     onChange={(e) => setEditText(e.target.value)}
//                     style={{ width: '100%', minHeight: '80px', fontFamily: 'monospace' }}
//                   />
//                   <div className="btn-row">
//                     <button className="btn primary" onClick={() => saveEditedRequirement(req.id)} disabled={!!loadingAction}>
//                       {loadingAction === `save-req-${req.id}` ? 'Saving...' : 'Save & Re-Analyze'}
//                     </button>
//                     <button className="btn" onClick={() => setEditingReqId(null)}>Cancel</button>
//                   </div>
//                 </div>
//               ) : (
//                 // --- NORMAL DISPLAY MODE ---
//                 <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: 'center' }}>
//                   <div style={{ flex: 1 }}>
//                     <div className="req-id">{req.requirement_id ?? `Req-${req.id}`}</div>
//                     <div className="req-raw">{req.raw_text}</div>
//                     <div className="muted" style={{ marginTop: '8px' }}>
//                       Status: <strong>{req.status}</strong> • AI Confidence: <strong>{(req.overall_confidence ?? 0).toFixed(2)}</strong>
//                     </div>
//                     {req.status === 'needs_manual_fix' && req.error_message && (
//                       <div style={{ marginTop: '10px', padding: '8px', background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: '4px', color: '#a8071a' }}>
//                         <strong>Validation Error:</strong> {req.error_message}
//                       </div>
//                     )}
//                   </div>
//                   <div style={{ display: "flex", gap: 8, alignItems: 'center' }}>
//                     <div style={{ borderLeft: '1px solid #eee', paddingLeft: '8px', alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px' }}>
//                       <button className="btn" onClick={() => startEditing(req)} disabled={!!loadingAction}>Edit</button>
//                       <button className="btn" onClick={() => approveRequirement(req, reviewConfidence)} disabled={!!loadingAction} title="Approve this requirement as is">
//                         {loadingAction === `approve-${req.id}` ? '...' : 'Approve'}
//                       </button>
//                     </div>
//                   </div>
//                 </div>
//               )}
//             </div>
//           ))}
//           <div className="step-navigation">
//             <button className="btn" onClick={() => setCurrentStep(1)}>Back to Upload</button>
//             <button className="btn primary" onClick={() => setCurrentStep(3)} disabled={!canGenerate()} title="Proceed to the next step">Continue to Generation</button>
//           </div>
//         </section>
//       )}

//       {currentStep === 3 && (
//         <section>
//           <h3>Generate Test Cases</h3>
//           <div className="muted" style={{ marginBottom: '8px' }}>Select the types of test cases you want to generate.</div>
//           <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #eee' }}>
//             <label style={{ cursor: 'pointer' }}><input type="checkbox" checked={selectedTestTypes.has("positive")} onChange={() => handleTestTypeChange("positive")} /> Positive (Happy Path)</label>
//             <label style={{ cursor: 'pointer' }}><input type="checkbox" checked={selectedTestTypes.has("negative")} onChange={() => handleTestTypeChange("negative")} /> Negative (Error Cases)</label>
//             <label style={{ cursor: 'pointer' }}><input type="checkbox" checked={selectedTestTypes.has("boundary")} onChange={() => handleTestTypeChange("boundary")} /> Boundary (Edge Cases)</label>
//           </div>
//           <div className="btn-row">
//             <button className="btn primary" onClick={generatePreviewForDoc} disabled={!selectedDoc || !canGenerate() || !!loadingAction}>
//               {loadingAction === 'generate-previews' ? 'Generating...' : 'Generate Test Cases'}
//             </button>
//             <button
//               className="btn"
//               onClick={regenerateSelectedPreviews}
//               disabled={selectedPreviews.size === 0 || !!loadingAction}
//               title="Regenerate the AI output for all selected test cases"
//             >
//               {loadingAction === 'regenerate-selected' ? 'Regenerating...' : `Regenerate Selected (${selectedPreviews.size})`}
//             </button>
//             <button 
//                   className="btn" 
//                   onClick={() => { 
//                     setPreviews([]); 
//                     setSelectedPreviews(new Set()); 
//                   }} 
//                   disabled={!!loadingAction}
//                 >
//                   Clear Previews
//                 </button>
//           </div>
//           {previews.length > 0 && (
//             <>
//               <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
//                 <strong style={{ marginRight: '8px' }}>View As:</strong>
//                 <button className={`btn ${activeViewFormat === 'gherkin' ? 'primary' : ''}`} onClick={() => setActiveViewFormat('gherkin')}>Gherkin</button>
//                 <button className={`btn ${activeViewFormat === 'pytest' ? 'primary' : ''}`} onClick={() => setActiveViewFormat('pytest')}>Pytest</button>
//                 <button className={`btn ${activeViewFormat === 'text' ? 'primary' : ''}`} onClick={() => setActiveViewFormat('text')}>Plain Text</button>
//               </div>

//               <div className="card" style={{ marginTop: '12px', background: '#f6f8fa' }}>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
//                   <label htmlFor="batchConfidence" style={{ fontWeight: 600 }}>Your Overall Confidence:</label>
//                   <input
//                     type="number"
//                     id="batchConfidence"
//                     step="0.1" max={1.0} min={0.1}
//                     value={batchConfidence}
//                     onChange={(e) => setBatchConfidence(Number(e.target.value))}
//                     style={{ width: 100 }}
//                     title="Rate your confidence in this batch of generated test cases."
//                   />
//                   {batchConfidence < 0.9 && (
//                     <div style={{ color: '#d97706' }}>
//                       Review required. Please use "Regenerate Selected" (coming next) or "Edit" to improve test cases before confirming.
//                     </div>
//                   )}
//                 </div>
//               </div>
//             </>

//           )}
//           <div style={{ marginTop: 12 }}>
//             {previews.length === 0 && (
//               <div className="empty-state">
//                 <h4>No Test Cases Generated</h4>
//                 <p className="muted">Click "Generate Test Cases" to create previews from your approved requirements.</p>
//               </div>
//             )}
//             {previews.map((p) => (
//               <div key={p.id} className="card" style={{ marginBottom: '8px', display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
//                 <div>
//                   <div className="req-id">{p.test_case_id}</div>
//                   <pre style={{ whiteSpace: "pre-wrap", margin: '6px 0', background: '#f9f9f9', padding: '8px', borderRadius: '4px', fontFamily: 'monospace' }}>
//                     {activeViewFormat === 'gherkin' && p.gherkin}
//                     {activeViewFormat === 'pytest' && (p.code_scaffold_str || "No Pytest code generated.")}
//                     {activeViewFormat === 'text' &&
//                       `SCENARIO: ${p.test_case_id}
//                         ---
//                         ${p.gherkin}
//                         ---
//                         STEPS:
//                         ${JSON.parse(p.automated_steps_json || "[]").join("\n")}`
//                     }
//                   </pre>
//                 </div>
//                 <div style={{display: 'flex', gap: '8px', alignItems: 'center', minWidth: '120px', justifyContent: 'flex-end'}}>
//                             <button className="btn" onClick={() => startEditingPreview(p)} disabled={!!loadingAction} title="Manually edit this test case">Edit</button>
//                             <label><input type="checkbox" checked={selectedPreviews.has(p.id)} onChange={() => togglePreview(p.id)} /> Select</label>
//                         </div>
//               </div>
//             ))}
//             {previews.length > 0 &&
//               <div style={{ marginTop: 8 }}>
//                 <button
//                   className="btn primary"
//                   onClick={confirmSelectedPreviews}
//                   disabled={!!loadingAction || selectedPreviews.size === 0 || batchConfidence < 0.9}
//                   title={batchConfidence < 0.9 ? "Confidence must be 0.9 or higher to confirm" : "Confirm selected test cases and proceed"}
//                 >
//                   {loadingAction === 'confirm-previews' ? 'Confirming...' : `Approve & Continue (${selectedPreviews.size} selected)`}
//                 </button>
//               </div>
//             }
//           </div>
//           <div className="step-navigation">
//             <button className="btn" onClick={() => setCurrentStep(2)}>Back to Review</button>
//           </div>
//         </section>
//       )}

//       {currentStep === 4 && (
//         <section>
//           <h3>Export Test Cases for "{selectedDoc?.filename}"</h3>
//           <div className="btn-row" style={{ marginBottom: '8px' }}>
//             <select value={tcStatusFilter} onChange={(e) => { setTcStatusFilter(e.target.value); if (selectedDoc) loadTestcases(sessionId, selectedDoc.id, e.target.value); }}>
//               <option value="generated">Generated</option>
//               <option value="preview">Preview</option>
//               <option value="stale">Stale</option>
//               <option value="pushed">Pushed</option>
//               <option value="">All</option>
//             </select>
//             <button className="btn" onClick={() => { if (selectedDoc) loadTestcases(sessionId, selectedDoc.id, tcStatusFilter || undefined); }} disabled={!!loadingAction}>
//               {loadingAction === 'load-tcs' ? '...' : 'Refresh'}
//             </button>
//             <button className="btn primary" onClick={downloadExportCSV} disabled={!!loadingAction} title="Download the generated test cases as a CSV file">
//               {loadingAction === 'export-csv' ? '...' : 'Export CSV'}
//             </button>
//             <button className="btn" onClick={downloadTraceabilityMatrix} disabled={!!loadingAction} title="Download a requirement-to-test-case traceability matrix">
//                   {loadingAction === 'export-matrix' ? '...' : 'Export Traceability Matrix'}
//                 </button>
//            <button 
//                   className="btn" 
//                   onClick={() => setIsJiraModalOpen(true)} 
//                   disabled={!!loadingAction || selectedPreviews.size === 0} 
//                   title="Push selected test cases to JIRA"
//                 >
//                   {`Push to JIRA (${selectedPreviews.size})`}
//                 </button>
//           </div>
//           <div style={{ marginTop: 12 }}>
//                 {testcases.length === 0 && <div className="muted" style={{padding: '20px', textAlign: 'center'}}>No confirmed test cases to display.</div>}
//                 {testcases.map((t) => (
//                     <div key={t.id} className="card" style={{marginBottom: '8px', display: "flex", justifyContent: "space-between", alignItems: "center" }}>
//                         <div>
//                           <div className="req-id">{t.test_case_id}</div>
//                           <div className="doc-meta">Req: {t.requirement_id} • Status: {t.status} • {new Date(t.generated_at).toLocaleString()}</div>
//                         </div>
//                         <div>
//                           <label><input type="checkbox" checked={selectedPreviews.has(t.id)} onChange={() => togglePreview(t.id)} /> Select</label>
//                         </div>
//                     </div>
//                 ))}
//             </div>
//           <div className="step-navigation">
//             <button className="btn" onClick={() => setCurrentStep(3)}>Back to Generation</button>
//           </div>
//         </section>
//       )}

//       {isJiraModalOpen && (
//         <div className="modal">
//           <div className="modal-inner">
//             <h3>Push to JIRA</h3>
//             <p className="muted">Enter your JIRA details to create issues from the selected test cases.</p>
//             <div>
//               <label>JIRA URL (e.g., https://your-domain.atlassian.net)</label>
//               <input type="text" value={jiraUrl} onChange={e => setJiraUrl(e.target.value)} />
//             </div>
//             <div style={{ marginTop: '8px' }}>
//               <label>JIRA Project Key (e.g., PROJ)</label>
//               <input type="text" value={jiraProjectKey} onChange={e => setJiraProjectKey(e.target.value)} />
//             </div>
//             <div style={{ marginTop: '8px' }}>
//               <label>JIRA API Token</label>
//               <input type="password" value={jiraApiToken} onChange={e => setJiraApiToken(e.target.value)} />
//             </div>
//             <div className="btn-row" style={{ marginTop: '16px' }}>
//               <button className="btn primary" onClick={pushToJira} disabled={!!loadingAction}>
//                 {loadingAction === 'push-jira' ? 'Pushing...' : 'Push to JIRA'}
//               </button>
//               <button className="btn" onClick={() => setIsJiraModalOpen(false)}>Cancel</button>
//             </div>
//           </div>
//         </div>
//       )}

//       {editingPreview && (
//         <div className="modal">
//           <div className="modal-inner">
//               <h3>Edit Test Case: {editingPreview.test_case_id}</h3>
//               <p className="muted">Manually refine the generated Gherkin script.</p>
//               <textarea 
//                 value={editTextGherkin}
//                 onChange={e => setEditTextGherkin(e.target.value)}
//                 style={{width: '100%', minHeight: '200px', fontFamily: 'monospace'}}
//               />
//               <div className="btn-row" style={{marginTop: '16px'}}>
//                   <button className="btn primary" onClick={saveEditedPreview} disabled={!!loadingAction}>
//                     {loadingAction === `save-preview-${editingPreview.id}` ? 'Saving...' : 'Save Changes'}
//                   </button>
//                   <button className="btn" onClick={() => setEditingPreview(null)}>Cancel</button>
//               </div>
//           </div>
//         </div>
//       )}

//       {message && (
//         <div className="toast">
//           <span>{message}</span>
//           <button className="toast-close" onClick={() => setMessage("")}>&times;</button>
//         </div>
//       )}
//     </div>
//   );
// }

import React, { useState, useCallback, useRef, useMemo  } from 'react';
import {
 MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
  ConnectionMode,
  Panel,
  ReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';


// Custom Node Components
const UploadNode = ({ data, isConnectable }) => {
  const [files, setFiles] = useState({ requirements: null, knowledge: null });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef();
  const knowledgeInputRef = useRef();

  const handleFileUpload = (type) => {
    setUploading(true);
    setTimeout(() => {
      const input = type === 'requirements' ? fileInputRef.current : knowledgeInputRef.current;
      if (input?.files?.[0]) {
        setFiles(prev => ({ ...prev, [type]: input.files[0].name }));
        if (data.onProcessed) data.onProcessed({ type, file: input.files[0].name });
      }
      setUploading(false);
    }, 1000);
  };

  return (
    <div className={`bg-blue-50 border-2 border-blue-300 rounded-lg p-4 min-w-[250px] shadow-lg ${data.processing ? 'animate-pulse' : ''}`}>
      <div className="font-bold text-blue-900 mb-2">📤 Document Upload</div>
      <div className="text-xs text-gray-600 mb-2">{data.label}</div>
      
      <div className="space-y-2">
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.csv,.xlsx"
            onChange={() => handleFileUpload('requirements')}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full text-xs bg-blue-500 text-white p-2 rounded hover:bg-blue-600 transition-colors"
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : files.requirements || 'Upload Requirements'}
          </button>
        </div>
        
        <div>
          <input
            ref={knowledgeInputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={() => handleFileUpload('knowledge')}
            className="hidden"
          />
          <button
            onClick={() => knowledgeInputRef.current?.click()}
            className="w-full text-xs bg-blue-400 text-white p-2 rounded hover:bg-blue-500 transition-colors"
            disabled={uploading}
          >
            {files.knowledge || 'Upload Knowledge (Optional)'}
          </button>
        </div>
      </div>

      {files.requirements && (
        <div className="text-xs text-green-600 mt-2">✓ Ready to process</div>
      )}
      
      <Handle
        type="source"
        position={Position.Right}
        id="requirements"
        style={{ top: '30%', background: '#3b82f6' }}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="knowledge"
        style={{ top: '70%', background: '#3b82f6' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

const ProcessorNode = ({ data, isConnectable }) => {
  const [processing, setProcessing] = useState(false);
  const [settings, setSettings] = useState({
    temperature: 0.3,
    model: data.model || 'gemini-1.5-pro'
  });
  const [output, setOutput] = useState(null);

  const iconMap = {
    parser: '🔍',
    generator: '🤖',
    rag: '📚'
  };

  const handleProcess = () => {
    setProcessing(true);
    setTimeout(() => {
      const outputs = {
        parser: '24 requirements extracted',
        generator: '156 test cases generated',
        rag: '5 knowledge sources integrated'
      };
      setOutput(outputs[data.processorType]);
      if (data.onProcessed) data.onProcessed(outputs[data.processorType]);
      setProcessing(false);
    }, 2000);
  };
  
  return (
    <div className={`bg-green-50 border-2 border-green-300 rounded-lg p-4 min-w-[250px] shadow-lg ${data.optional ? 'border-dashed' : ''} ${data.processing ? 'animate-pulse' : ''}`}>
      <div className="font-bold text-green-900 mb-2">
        {iconMap[data.processorType] || '⚙️'} {data.name}
      </div>
      <div className="text-xs text-gray-600 mb-2">{data.label}</div>
      
      <div className="space-y-2">
        <select 
          value={settings.model}
          onChange={(e) => setSettings(prev => ({ ...prev, model: e.target.value }))}
          className="w-full text-xs p-1 border rounded"
        >
          <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
          <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
          <option value="vertex-ai">Vertex AI</option>
        </select>
        
        <div className="flex items-center gap-2">
          <label className="text-xs">Temp:</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={settings.temperature}
            onChange={(e) => setSettings(prev => ({ ...prev, temperature: e.target.value }))}
            className="flex-1"
          />
          <span className="text-xs">{settings.temperature}</span>
        </div>

        {data.runnable && (
          <button
            onClick={handleProcess}
            disabled={processing}
            className="w-full text-xs bg-green-500 text-white p-1 rounded hover:bg-green-600 disabled:bg-gray-400"
          >
            {processing ? 'Processing...' : 'Process'}
          </button>
        )}
      </div>

      {output && (
        <div className="text-xs bg-green-100 p-1 rounded mt-2">
          ✓ {output}
        </div>
      )}
      
      {data.optional && (
        <div className="text-xs text-orange-600 font-semibold mt-2">Optional</div>
      )}
      
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#10b981' }}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#10b981' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

const ValidatorNode = ({ data, isConnectable }) => {
  const [validating, setValidating] = useState(false);
  const [score, setScore] = useState(null);
  const [threshold, setThreshold] = useState(80);

  const handleValidate = () => {
    setValidating(true);
    setTimeout(() => {
      const newScore = Math.floor(Math.random() * 30) + 70; // 70-100
      setScore(newScore);
      if (data.onProcessed) data.onProcessed({ score: newScore, passed: newScore >= threshold });
      setValidating(false);
    }, 1500);
  };

  return (
    <div className={`bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4 min-w-[250px] shadow-lg border-dashed ${data.processing ? 'animate-pulse' : ''}`}>
      <div className="font-bold text-yellow-900 mb-2">⚖️ {data.name}</div>
      <div className="text-xs text-gray-600 mb-2">{data.label}</div>
      
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-xs">Pass Threshold:</label>
          <input
            type="number"
            min="0"
            max="100"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="w-20 text-xs p-1 border rounded"
          />
          <span className="text-xs">%</span>
        </div>

        {data.runnable && (
          <button
            onClick={handleValidate}
            disabled={validating}
            className="w-full text-xs bg-yellow-500 text-white p-1 rounded hover:bg-yellow-600 disabled:bg-gray-400"
          >
            {validating ? 'Validating...' : 'Validate Quality'}
          </button>
        )}

        {score !== null && (
          <div className={`text-xs p-2 rounded ${score >= threshold ? 'bg-green-100' : 'bg-red-100'}`}>
            Score: {score}/100 - {score >= threshold ? '✓ PASSED' : '✗ FAILED'}
          </div>
        )}
      </div>

      <div className="text-xs text-orange-600 font-semibold mt-2">Optional</div>
      
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#eab308' }}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="approved"
        style={{ top: '30%', background: '#10b981' }}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="rejected"
        style={{ top: '70%', background: '#ef4444' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

const ManualNode = ({ data, isConnectable }) => {
  const [reviewing, setReviewing] = useState(false);
  const [testCases, setTestCases] = useState([]);
  const [selectedTests, setSelectedTests] = useState(new Set());

  const generateDummyTests = () => {
    return Array(5).fill(0).map((_, i) => ({
      id: `TC-${1000 + i}`,
      title: `Test Case ${i + 1}`,
      status: i < 3 ? 'approved' : 'pending',
      risk: ['high', 'medium', 'low'][i % 3]
    }));
  };

  const handleReview = () => {
    setReviewing(true);
    setTimeout(() => {
      setTestCases(generateDummyTests());
      setReviewing(false);
    }, 1000);
  };

  const handleApprove = () => {
    if (data.onProcessed) data.onProcessed({ approved: testCases.length, rejected: 0 });
  };

  return (
    <div className={`bg-purple-50 border-2 border-purple-300 rounded-lg p-4 min-w-[280px] shadow-lg ${data.processing ? 'animate-pulse' : ''}`}>
      <div className="font-bold text-purple-900 mb-2">👤 {data.name}</div>
      <div className="text-xs text-gray-600 mb-2">{data.label}</div>
      
      <div className="space-y-2">
        {data.runnable && (
          <button
            onClick={handleReview}
            disabled={reviewing}
            className="w-full text-xs bg-purple-500 text-white p-1 rounded hover:bg-purple-600 disabled:bg-gray-400"
          >
            {reviewing ? 'Loading...' : 'Load Test Cases'}
          </button>
        )}

        {testCases.length > 0 && (
          <>
            <div className="max-h-32 overflow-y-auto border rounded p-1">
              {testCases.map(test => (
                <div key={test.id} className="flex items-center gap-2 p-1 hover:bg-purple-100 rounded">
                  <input
                    type="checkbox"
                    checked={selectedTests.has(test.id)}
                    onChange={() => {
                      const newSelected = new Set(selectedTests);
                      if (newSelected.has(test.id)) {
                        newSelected.delete(test.id);
                      } else {
                        newSelected.add(test.id);
                      }
                      setSelectedTests(newSelected);
                    }}
                  />
                  <span className="text-xs flex-1">{test.title}</span>
                  <span className={`text-xs px-1 rounded ${
                    test.risk === 'high' ? 'bg-red-200' :
                    test.risk === 'medium' ? 'bg-yellow-200' :
                    'bg-green-200'
                  }`}>
                    {test.risk}
                  </span>
                </div>
              ))}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                className="flex-1 text-xs bg-green-500 text-white p-1 rounded hover:bg-green-600"
              >
                Approve Selected
              </button>
              <button className="flex-1 text-xs bg-red-500 text-white p-1 rounded hover:bg-red-600">
                Reject
              </button>
            </div>
          </>
        )}
      </div>
      
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#9333ea' }}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#9333ea' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

const IntegrationNode = ({ data, isConnectable }) => {
  const [pushing, setPushing] = useState(false);
  const [config, setConfig] = useState({
    system: 'jira',
    project: 'TEST',
    issueType: 'Test'
  });
  const [result, setResult] = useState(null);

  const handlePush = () => {
    setPushing(true);
    setTimeout(() => {
      setResult({ success: true, count: 156, url: 'https://jira.example.com/TEST' });
      if (data.onProcessed) data.onProcessed({ pushed: 156 });
      setPushing(false);
    }, 2000);
  };

  return (
    <div className={`bg-red-50 border-2 border-red-300 rounded-lg p-4 min-w-[250px] shadow-lg ${data.processing ? 'animate-pulse' : ''}`}>
      <div className="font-bold text-red-900 mb-2">🔌 {data.name}</div>
      <div className="text-xs text-gray-600 mb-2">{data.label}</div>
      
      <div className="space-y-2">
        <select 
          value={config.system}
          onChange={(e) => setConfig(prev => ({ ...prev, system: e.target.value }))}
          className="w-full text-xs p-1 border rounded"
        >
          <option value="jira">JIRA</option>
          <option value="azure">Azure DevOps</option>
          <option value="testrail">TestRail</option>
          <option value="polarion">Polarion</option>
        </select>
        
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Project Key"
            value={config.project}
            onChange={(e) => setConfig(prev => ({ ...prev, project: e.target.value }))}
            className="flex-1 text-xs p-1 border rounded"
          />
          <select 
            value={config.issueType}
            onChange={(e) => setConfig(prev => ({ ...prev, issueType: e.target.value }))}
            className="flex-1 text-xs p-1 border rounded"
          >
            <option value="Test">Test</option>
            <option value="Bug">Bug</option>
            <option value="Task">Task</option>
          </select>
        </div>

        {data.runnable && (
          <button
            onClick={handlePush}
            disabled={pushing}
            className="w-full text-xs bg-red-500 text-white p-1 rounded hover:bg-red-600 disabled:bg-gray-400"
          >
            {pushing ? 'Pushing...' : `Push to ${config.system.toUpperCase()}`}
          </button>
        )}

        {result && (
          <div className="text-xs bg-green-100 p-1 rounded">
            ✓ Pushed {result.count} test cases
            <a href={result.url} className="text-blue-600 underline ml-1">View</a>
          </div>
        )}
      </div>
      
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#ef4444' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

const nodeTypes = {
  uploadNode: UploadNode,
  processorNode: ProcessorNode,
  validatorNode: ValidatorNode,
  manualNode: ManualNode,
  integrationNode: IntegrationNode,
};

// Sidebar for dragging new nodes
const Sidebar = () => {
  const onDragStart = (event, nodeType, nodeData) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify({ nodeType, nodeData }));
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="bg-white p-4 border-r border-gray-200 w-64">
      <h3 className="font-bold mb-4 text-gray-800">Node Library</h3>
      <div className="space-y-2">
        <div
          className="bg-blue-100 p-3 rounded cursor-move hover:bg-blue-200 transition-colors"
          onDragStart={(e) => onDragStart(e, 'uploadNode', { 
            name: 'Document Upload',
            label: 'Upload requirements'
          })}
          draggable
        >
          📤 Document Upload
        </div>
        
        <div
          className="bg-green-100 p-3 rounded cursor-move hover:bg-green-200 transition-colors"
          onDragStart={(e) => onDragStart(e, 'processorNode', { 
            name: 'Document Parser',
            label: 'Extract requirements',
            processorType: 'parser'
          })}
          draggable
        >
          🔍 Document Parser
        </div>
        
        <div
          className="bg-green-100 p-3 rounded cursor-move hover:bg-green-200 transition-colors"
          onDragStart={(e) => onDragStart(e, 'processorNode', { 
            name: 'Test Generator',
            label: 'Generate test cases',
            processorType: 'generator'
          })}
          draggable
        >
          🤖 Test Generator
        </div>
        
        <div
          className="bg-green-100 p-3 rounded cursor-move hover:bg-green-200 transition-colors border-2 border-dashed border-green-300"
          onDragStart={(e) => onDragStart(e, 'processorNode', { 
            name: 'Knowledge RAG',
            label: 'Enhance with knowledge',
            processorType: 'rag',
            optional: true
          })}
          draggable
        >
          📚 Knowledge RAG (Optional)
        </div>
        
        <div
          className="bg-yellow-100 p-3 rounded cursor-move hover:bg-yellow-200 transition-colors border-2 border-dashed border-yellow-300"
          onDragStart={(e) => onDragStart(e, 'validatorNode', { 
            name: 'Quality Judge',
            label: 'Validate quality'
          })}
          draggable
        >
          ⚖️ Quality Judge (Optional)
        </div>
        
        <div
          className="bg-purple-100 p-3 rounded cursor-move hover:bg-purple-200 transition-colors"
          onDragStart={(e) => onDragStart(e, 'manualNode', { 
            name: 'Human Review',
            label: 'Manual verification'
          })}
          draggable
        >
          👤 Human Review
        </div>
        
        <div
          className="bg-red-100 p-3 rounded cursor-move hover:bg-red-200 transition-colors"
          onDragStart={(e) => onDragStart(e, 'integrationNode', { 
            name: 'JIRA Export',
            label: 'Push to ALM'
          })}
          draggable
        >
          🔌 Integration Export
        </div>
      </div>
      
      <div className="mt-6 text-xs text-gray-600">
        <p className="font-semibold mb-2">Instructions:</p>
        <ul className="space-y-1">
          <li>• Drag nodes to canvas</li>
          <li>• Connect nodes by dragging handles</li>
          <li>• Configure each node</li>
          <li>• Run workflow with play button</li>
        </ul>
      </div>
    </div>
  );
};

// Main Component
function HealthcareTestGenerator() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [workflowStatus, setWorkflowStatus] = useState('idle');
  const [currentStep, setCurrentStep] = useState(null);
  const [metrics, setMetrics] = useState({
    requirements: 0,
    testCases: 0,
    coverage: 0,
    approvalRate: 0,
    complianceScore: 0
  });
  const reactFlowWrapper = useRef(null);
  const { screenToFlowPosition  } = useReactFlow();

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({
      ...params,
      animated: true,
      style: { stroke: '#6b7280', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed }
    }, eds));
  }, [setEdges]);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const data = event.dataTransfer.getData('application/reactflow');

      if (!data) return;

      const { nodeType, nodeData } = JSON.parse(data);
      const position = screenToFlowPosition({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const newNode = {
        id: `${nodeType}_${Date.now()}`,
        type: nodeType,
        position,
        data: { ...nodeData, runnable: false },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const runWorkflow = () => {
    setWorkflowStatus('running');
    
    // Find connected nodes in order
    const startNode = nodes.find(n => n.type === 'uploadNode');
    if (!startNode) {
      alert('Please add an Upload node to start the workflow');
      setWorkflowStatus('idle');
      return;
    }

    // Enable nodes sequentially for processing
    let nodeSequence = [startNode.id];
    let currentId = startNode.id;
    
    // Build sequence based on connections
    const findNextNode = (sourceId) => {
      const edge = edges.find(e => e.source === sourceId);
      if (edge) {
        nodeSequence.push(edge.target);
        findNextNode(edge.target);
      }
    };
    
    findNextNode(currentId);

    // Process nodes sequentially
    let stepIndex = 0;
    const processNextNode = () => {
      if (stepIndex < nodeSequence.length) {
        const nodeId = nodeSequence[stepIndex];
        setCurrentStep(nodeId);
        
        // Update node to show it's processing
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === nodeId) {
              return {
                ...node,
                data: { ...node.data, processing: true, runnable: true }
              };
            }
            return {
              ...node,
              data: { ...node.data, processing: false, runnable: false }
            };
          })
        );

        // Update metrics progressively
        setTimeout(() => {
          if (stepIndex === 0) setMetrics(prev => ({ ...prev, requirements: 24 }));
          if (stepIndex === 1) setMetrics(prev => ({ ...prev, testCases: 156 }));
          if (stepIndex === 2) setMetrics(prev => ({ ...prev, coverage: 92, complianceScore: 88 }));
          if (stepIndex === 3) setMetrics(prev => ({ ...prev, approvalRate: 95 }));
          
          stepIndex++;
          processNextNode();
        }, 2000);
      } else {
        // Workflow complete
        setWorkflowStatus('completed');
        setCurrentStep(null);
        setNodes((nds) =>
          nds.map((node) => ({
            ...node,
            data: { ...node.data, processing: false, runnable: false }
          }))
        );
      }
    };

    processNextNode();
  };

  const resetWorkflow = () => {
    setWorkflowStatus('idle');
    setCurrentStep(null);
    setNodes([]);
    setEdges([]);
    setMetrics({
      requirements: 0,
      testCases: 0,
      coverage: 0,
      approvalRate: 0,
      complianceScore: 0
    });
  };

  return (
    <div className="w-full h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-md p-4 z-10">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Healthcare Test Case Generator</h1>
            <p className="text-sm text-gray-600">AI-Powered Test Automation with FDA & IEC-62304 Compliance</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Status:</span>
              <span className={`text-sm font-bold ${
                workflowStatus === 'idle' ? 'text-gray-600' :
                workflowStatus === 'running' ? 'text-blue-600 animate-pulse' :
                'text-green-600'
              }`}>
                {workflowStatus.toUpperCase()}
              </span>
            </div>
            <button
              onClick={runWorkflow}
              disabled={workflowStatus === 'running'}
              className="p-3 bg-green-600 text-white rounded-full hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all transform hover:scale-110"
              title="Run Workflow"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            </button>
            <button
              onClick={resetWorkflow}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Dashboard */}
      <div className="bg-white m-4 p-4 rounded-lg shadow-md">
        <h2 className="text-lg font-semibold mb-3 text-gray-800">Metrics Dashboard</h2>
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-blue-50 p-3 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{metrics.requirements}</div>
            <div className="text-xs text-gray-600">Requirements</div>
          </div>
          <div className="bg-green-50 p-3 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{metrics.testCases}</div>
            <div className="text-xs text-gray-600">Test Cases</div>
          </div>
          <div className="bg-yellow-50 p-3 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{metrics.coverage}%</div>
            <div className="text-xs text-gray-600">Coverage</div>
          </div>
          <div className="bg-purple-50 p-3 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">{metrics.approvalRate}%</div>
            <div className="text-xs text-gray-600">Approval Rate</div>
          </div>
          <div className="bg-red-50 p-3 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{metrics.complianceScore}%</div>
            <div className="text-xs text-gray-600">Compliance</div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        
        {/* Workflow Canvas */}
        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            connectionMode={ConnectionMode.Loose}
            fitView
            attributionPosition="bottom-left"
          >
            <Controls />
            <MiniMap 
              nodeColor={node => {
                if (node.id === currentStep) return '#ef4444';
                if (node.type === 'uploadNode') return '#3b82f6';
                if (node.type === 'processorNode') return '#10b981';
                if (node.type === 'validatorNode') return '#eab308';
                if (node.type === 'manualNode') return '#9333ea';
                if (node.type === 'integrationNode') return '#ef4444';
                return '#6b7280';
              }}
            />
            <Background variant="dots" gap={12} size={1} />
            
            {nodes.length === 0 && (
              <Panel position="top-center" className="bg-blue-100 p-4 rounded-lg mt-4">
                <div className="text-center">
                  <p className="text-lg font-semibold text-blue-900">Start Building Your Workflow</p>
                  <p className="text-sm text-blue-700 mt-1">Drag nodes from the left sidebar to begin</p>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>
      </div>

      {/* Status Bar */}
      <div className="bg-white border-t p-2">
        <div className="flex items-center justify-between px-4">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              Input
            </span>
            <span className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              Processor
            </span>
            <span className="flex items-center gap-1">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              Validator
            </span>
            <span className="flex items-center gap-1">
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
              Manual
            </span>
            <span className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              Integration
            </span>
          </div>
          <div className="text-sm text-gray-600">
            Nodes: {nodes.length} | Connections: {edges.length}
          </div>
        </div>
      </div>
    </div>
  );
}

// Wrapper component with ReactFlowProvider
export default function App() {
  return (
    <ReactFlowProvider>
      <HealthcareTestGenerator />
    </ReactFlowProvider>
  );
}