import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { RosterApp } from "../../src/components/roster-app";
import { makeSnapshot, makeProjectionSnapshot } from "./fixture";
import "./styles.css";
import { ProjectionStudy } from './projection-study';
import { TradeProjectionStudy } from './trade-projection-study';

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    {new URLSearchParams(location.search).has('trade-projections') ? <TradeProjectionStudy /> : new URLSearchParams(location.search).has('projection-study') ? <ProjectionStudy /> : <>
      <aside className="bg-muted px-4 py-2 text-sm text-foreground">Private test preview · fictional data · no live transactions</aside>
      <RosterApp initialSnapshot={new URLSearchParams(location.search).has("projection-verdict") ? makeProjectionSnapshot() : makeSnapshot()} />
    </>}
    <Toaster />
  </QueryClientProvider>,
);
