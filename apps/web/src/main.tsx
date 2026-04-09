import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { queryClient } from "./query-client";
import { resolvePlatformModeFromWebEnv } from "./platform-mode";
import "@xyflow/react/dist/style.css";
import "./styles/tailwind.css";
import "./styles/product.css";

// STACK: React + TypeScript + Vite
// STATE: TanStack Query for server state, Zustand for local UI state
// BUILDER: React Flow / XYFlow
// MODE: Prototype Mode | Live Mode
// SHARED BETWEEN PROTOTYPE AND LIVE
// Web boot mode defaults from VITE_INTEGRATOR_MODE, then API health can override as runtime source of truth.
const initialPlatformMode = resolvePlatformModeFromWebEnv(import.meta.env);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App initialPlatformMode={initialPlatformMode} />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
