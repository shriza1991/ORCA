import { useState, useEffect } from "react";
import Header from "./components/layout/Header";
import PortalPage from "./pages/PortalPage";
import FisherPage from "./pages/FisherPage";
import AuthorityPage from "./pages/AuthorityPage";
import ResearcherPage from "./pages/ResearcherPage";
import SettingsPage from "./pages/SettingsPage";
import EvidenceDrawer from "./components/evidence/EvidenceDrawer";
import CallModal from "./components/call/CallModal";
import { useChat } from "./hooks/useChat";
import { MessageSquare, Map as MapIcon } from "lucide-react";
import ErrorBoundary from "./components/common/ErrorBoundary";

export type PortalMode =
  | "selection"
  | "fisher"
  | "authority"
  | "researcher"
  | "settings";

/**
 * ORCA Main Application Shell
 *
 * Owned by Dev 1 (Frontend & Geospatial UX Lead).
 * Default Theme: Light Mode
 * Features:
 *   - Landing Portal Page (Selection between Fisher Console & Authority Deck)
 *   - Fisher Console Page
 *   - Authority Command Deck Page
 *   - Settings Page (Theme, Language, Mission Context, Voice & Diagnostics)
 *   - Shared Map, Evidence Drawer, and Voice Call Modal
 */
export default function App() {
  const chat = useChat();
  const [portal, setPortal] = useState<PortalMode>("selection");
  const [previousPortal, setPreviousPortal] = useState<PortalMode>("selection");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [voiceProposal, setVoiceProposal] = useState<import("./types/assessment").TripAssessmentResponse | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mobileView, setMobileView] = useState<"chat" | "map">("chat");

  // Synchronize theme on HTML element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const handleOpenSettings = () => {
    if (portal !== "settings") {
      setPreviousPortal(portal);
      setPortal("settings");
    } else {
      setPortal(previousPortal);
    }
  };

  const evidenceItems = chat.activeResponse?.evidence ?? [];
  const traceItems = chat.activeResponse?.trace ?? [];
  const layerCount = chat.activeResponse?.map_layers?.length ?? 0;

  const handleBack = () => {
    if (chat.messages.length > 0) {
      chat.clearChat();
    } else if (mobileView === "chat") {
      setMobileView("map");
    }
  };

  return (
    <div className="app-container">
      {/* Top Navigation & Status Header */}
      <Header
        language={chat.language}
        evidenceCount={evidenceItems.length}
        onOpenEvidence={() => setIsDrawerOpen(true)}
        theme={theme}
        currentPortal={portal}
        onLogout={() => setPortal("selection")}
        onReturnToPortal={() => setPortal("selection")}
        onOpenSettings={handleOpenSettings}
      />

      {/* Mobile Segmented View Tabs (Visible only on <= 768px viewports when in a role console) */}
      {portal === "authority" && (
        <nav
          className="mobile-view-tabs"
          role="tablist"
          aria-label="Mobile viewport selection"
        >
          <button
            className={`mobile-tab-btn ${mobileView === "chat" ? "active" : ""}`}
            onClick={() => setMobileView("chat")}
            role="tab"
            aria-selected={mobileView === "chat"}
          >
            <MessageSquare size={16} />
            <span>Chat</span>
          </button>
          <button
            className={`mobile-tab-btn ${mobileView === "map" ? "active" : ""}`}
            onClick={() => setMobileView("map")}
            role="tab"
            aria-selected={mobileView === "map"}
          >
            <MapIcon size={16} />
            <span>Map</span>
            {layerCount > 0 && (
              <span className="mobile-tab-badge">{layerCount}</span>
            )}
          </button>
        </nav>
      )}

      {/* Pages: Portal Selection vs. Fisher Console vs. Authority Command Deck vs. Settings */}
      {portal === "selection" ? (
        <PortalPage
          onSelectRole={(selected) => setPortal(selected)}
          language={chat.language}
        />
      ) : portal === "fisher" ? (
        <FisherPage
          chat={chat}
          voiceProposal={voiceProposal}
          onVoiceProposalHandled={() => setVoiceProposal(null)}
          theme={theme}
          mobileView={mobileView}
          onStartCall={() => setIsCallModalOpen(true)}
          onOpenEvidence={() => setIsDrawerOpen(true)}
          onBack={handleBack}
          onViewMap={() => setMobileView("map")}
        />
      ) : portal === "authority" ? (
        <ErrorBoundary
          fallbackTitle="Authority Command Deck Unavailable"
          fallbackMessage="An unexpected error occurred in the Authority Command Deck. You can retry or return to the workspace selection."
          resetButtonText="Retry Authority Deck"
        >
          <AuthorityPage
            chat={chat}
            theme={theme}
            mobileView={mobileView}
            onOpenEvidence={() => setIsDrawerOpen(true)}
            onBack={handleBack}
          />
        </ErrorBoundary>
      ) : portal === "researcher" ? (
        <ResearcherPage />
      ) : (
        <SettingsPage
          theme={theme}
          onThemeChange={setTheme}
          language={chat.language}
          onLanguageChange={chat.setLanguage}
          missionContext={chat.missionContext}
          onMissionContextChange={chat.setMissionContext}
          onBack={() => setPortal(previousPortal)}
        />
      )}

      {/* Evidence & Trace Provenance Slide-out Drawer */}
      <EvidenceDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        evidence={evidenceItems}
        trace={traceItems}
        language={chat.language}
        assessmentTime={chat.activeResponse?.mission_assessment?.assessed_at || chat.missionAssessment?.assessed_at}
        departureTime={chat.missionContext.departure_time}
      />

      {/* Dedicated Phone-Style Call ORCA Modal */}
      {(() => {
        const activeBaseline = chat.getActiveBaseline(portal === "fisher" ? undefined : "authority");
        return (
          <CallModal
            isOpen={isCallModalOpen}
            onClose={() => setIsCallModalOpen(false)}
            language={chat.language}
            originHarbor={chat.missionContext.origin_harbor}
            craftProfile={chat.missionContext.craft_profile}
            vesselSize={chat.missionContext.vessel_size}
            coordinates={activeBaseline.coordinates}
            departureTime={chat.missionContext.departure_time}
            returnTime={chat.missionContext.return_time}
            targetPfz={chat.missionContext.target_pfz}
            baselineAssessmentId={activeBaseline.assessmentId}
            evidenceBundleId={activeBaseline.evidenceBundleId}
            dataMode={activeBaseline.dataMode}
            parentAssessmentId={activeBaseline.parentAssessmentId}
            isBaselineApplicable={activeBaseline.isApplicable}
            isBaselineLoading={activeBaseline.isLoading}
            isBaselineExpired={activeBaseline.isExpired}
            onApplyProposal={portal === 'fisher' ? (proposal) => { setVoiceProposal(proposal); setIsCallModalOpen(false); } : undefined}
          />
        );
      })()}
    </div>
  );
}
