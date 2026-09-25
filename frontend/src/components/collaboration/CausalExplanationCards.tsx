import type { CausalReasoningExplanation } from '../../types/contracts';
import { FileText, Compass, AlertOctagon, CheckSquare, ArrowRightCircle } from 'lucide-react';

interface CausalExplanationCardsProps {
  explanation: CausalReasoningExplanation;
}

export default function CausalExplanationCards({ explanation }: CausalExplanationCardsProps) {
  const { facts, inferences, constraints, decision, recommendation } = explanation;

  return (
    <div className="causal-explanation-container" data-testid="causal-explanation-cards">
      <div className="causal-header-row">
        <h4 className="causal-main-title">5-Stage Grounded Causal Explainability</h4>
        <span className="causal-framework-badge">FACT → INFERENCE → CONSTRAINT → DECISION → ACTION</span>
      </div>

      <div className="causal-stages-grid">
        {/* Stage 1: Facts */}
        <div className="causal-stage-card stage-facts">
          <div className="stage-card-header">
            <span className="stage-step-tag">1. FACTS</span>
            <FileText size={14} className="stage-icon text-cyan" />
          </div>
          <div className="stage-card-body">
            <div className="facts-chips-wrap">
              {facts.map((f, i) => (
                <div key={i} className="fact-item-chip">
                  <span className="fact-metric">{f.metric}:</span>
                  <span className="fact-value">{f.value}</span>
                  {f.source && <span className="fact-source">({f.source})</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Stage 2: Inferences */}
        <div className="causal-stage-card stage-inferences">
          <div className="stage-card-header">
            <span className="stage-step-tag">2. INFERENCES</span>
            <Compass size={14} className="stage-icon text-amber" />
          </div>
          <div className="stage-card-body">
            <ul className="stage-bullet-list">
              {inferences.map((inf, i) => (
                <li key={i}>{inf}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Stage 3: Constraints */}
        <div className="causal-stage-card stage-constraints">
          <div className="stage-card-header">
            <span className="stage-step-tag">3. CONSTRAINTS</span>
            <AlertOctagon size={14} className="stage-icon text-purple" />
          </div>
          <div className="stage-card-body">
            <ul className="stage-bullet-list">
              {constraints.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Stage 4: Decision */}
        <div className="causal-stage-card stage-decision">
          <div className="stage-card-header">
            <span className="stage-step-tag">4. DECISION</span>
            <CheckSquare size={14} className="stage-icon text-emerald" />
          </div>
          <div className="stage-card-body">
            <p className="decision-lead-text">{decision}</p>
          </div>
        </div>

        {/* Stage 5: Actionable Recommendation */}
        <div className="causal-stage-card stage-recommendation">
          <div className="stage-card-header">
            <span className="stage-step-tag">5. ACTIONABLE DIRECTIVE</span>
            <ArrowRightCircle size={14} className="stage-icon text-blue" />
          </div>
          <div className="stage-card-body">
            <p className="recommendation-lead-text">{recommendation}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
