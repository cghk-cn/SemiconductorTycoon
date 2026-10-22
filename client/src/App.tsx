import { useCallback, useEffect, useMemo, useState } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { engine, type StateSnapshot } from "./GameEngine";
import { Dashboard } from "./components/Dashboard";
import { FabPanel } from "./components/FabPanel";
import { FabFloorView } from "./components/FabFloorView";
import { EquipmentShop } from "./components/EquipmentShop";
import { ContractsPanel } from "./components/ContractsPanel";
import { ResearchPanel } from "./components/ResearchPanel";
import { ResearchTreeView } from "./components/ResearchTreeView";
import { FinancialsPanel } from "./components/FinancialsPanel";
import { StatusBar } from "./components/StatusBar";
import { BottomNav } from "./components/BottomNav";
import { Toast, type ToastMessage } from "./components/Toast";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<StateSnapshot>(() => engine.getState());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Keep React state in sync with the engine.
  useEffect(() => {
    const id = setInterval(() => setState(engine.getState()), 250);
    return () => clearInterval(id);
  }, []);

  const showToast = useCallback((message: string, tone: ToastMessage["tone"] = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }, []);

  const refresh = useCallback(() => setState(engine.getState()), []);

  const advanceMonth = useCallback(() => {
    engine.advanceMonth();
    refresh();
    showToast("📅 已推進至下個月", "success");
  }, [refresh, showToast]);

  const researchNode = useCallback(
    (nodeId: string) => {
      const result = engine.researchNode(nodeId);
      refresh();
      showToast(result.message, result.ok ? "success" : "error");
    },
    [refresh, showToast]
  );

  const buyEquipment = useCallback(
    (eqId: string) => {
      const result = engine.buyEquipment(eqId);
      refresh();
      showToast(result.message, result.ok ? "success" : "error");
    },
    [refresh, showToast]
  );

  const acceptContract = useCallback(
    (contractId: string) => {
      const result = engine.acceptContract(contractId);
      refresh();
      showToast(result.message, result.ok ? "success" : "error");
    },
    [refresh, showToast]
  );

  const completeContract = useCallback(
    (contractId: string) => {
      const result = engine.completeContract(contractId);
      refresh();
      showToast(result.message, result.ok ? "success" : "error");
    },
    [refresh, showToast]
  );

  const financials = useMemo(() => engine.getFinancials(), [state]);

  // Keep the selected tab in sync with the current route.
  const activeTab = useMemo(() => {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    return path;
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-darker text-white antialiased flex flex-col">
      {/* Status Header */}
      <StatusBar state={state} />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto scrollbar-neon px-4 py-4 pb-24">
        <div className="max-w-4xl mx-auto">
          <Routes>
            <Route
              path="/"
              element={
                <Dashboard
                  state={state}
                  onAdvanceMonth={advanceMonth}
                  researchNode={researchNode}
                  buyEquipment={buyEquipment}
                />
              }
            />
            <Route
              path="/fab"
              element={
                <FabPanel
                  state={state}
                  onAdvanceMonth={advanceMonth}
                  onBuyEquipment={buyEquipment}
                />
              }
            />
            <Route
              path="/contracts"
              element={
                <ContractsPanel
                  state={state}
                  onAdvanceMonth={advanceMonth}
                  researchNode={researchNode}
                  onAcceptContract={acceptContract}
                  onCompleteContract={completeContract}
                />
              }
            />
            <Route
              path="/research"
              element={
                <ResearchPanel
                  state={state}
                  onAdvanceMonth={advanceMonth}
                  researchNode={researchNode}
                />
              }
            />
            <Route
              path="/tech-tree"
              element={
                <ResearchTreeView
                  state={state}
                  researchNode={researchNode}
                />
              }
            />
            <Route
              path="/financials"
              element={
                <FinancialsPanel state={financials} onAdvanceMonth={advanceMonth} />
              }
            />
            <Route
              path="/fab-floor"
              element={
                <FabFloorView
                  state={state}
                  onBuyEquipment={buyEquipment}
                />
              }
            />
            <Route
              path="/shop"
              element={
                <EquipmentShop
                  state={state}
                  onBuyEquipment={buyEquipment}
                />
              }
            />
          </Routes>
        </div>
      </main>

      {/* Toasts */}
      <Toast toasts={toasts} />

      {/* Bottom Navigation */}
      <BottomNav activeTab={activeTab} onNavigate={(p) => navigate(p)} />
    </div>
  );
}
