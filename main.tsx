import { ErrorBoundary } from "./src/components/ErrorBoundary";
import Approvals from "./src/pages/approvals";
import ChatPage from "./src/pages/chat";
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { OttoProvider } from "./src/helpers/OttoProvider";
import { OttoShell } from "./src/components/OttoShell";
import Overview from "./src/pages/_index";
import Simulation from "./src/pages/simulation";
import Subscriptions from "./src/pages/subscriptions";
import Grow from "./src/pages/grow";
import FutureYou from "./src/pages/future-you";
import "./theme.css";
import "./mock";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <OttoProvider>
        <OttoShell>
          <ErrorBoundary>
            <Routes>
              <Route
                path="*"
                element={
                  <section>
                    <h1>Page not found</h1>
                    <p>This OTTO page doesn’t exist.</p>
                    <Link to="/">Back to Overview</Link>
                  </section>
                }
              />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/" element={<Overview />} />
              <Route path="/simulation" element={<Simulation />} />
              <Route path="/subscriptions" element={<Subscriptions />} />
              <Route path="/grow" element={<Grow />} />
              <Route path="/future-you" element={<FutureYou />} />
              <Route path="/approvals" element={<Approvals />} />
            </Routes>
          </ErrorBoundary>
        </OttoShell>
      </OttoProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
