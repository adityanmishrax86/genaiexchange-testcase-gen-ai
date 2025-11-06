import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import SimplifiedEval from "./SimplifiedEval";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");

createRoot(container).render(
  <BrowserRouter>
    <Routes>
      <Route path="/eval" element={<App />} />
      <Route path="/lazy-eval" element={<SimplifiedEval />} />
      <Route path="*" element={<Navigate to="/eval" replace />} />
    </Routes>
  </BrowserRouter>
);
