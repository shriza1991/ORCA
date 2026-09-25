import type { ReasoningTimelineStep } from '../../types/contracts';
import { CheckCircle2, AlertCircle, Clock, Zap } from 'lucide-react';

interface ReasoningTimelineViewProps {
  timeline: ReasoningTimelineStep[];
}

export default function ReasoningTimelineView({ timeline }: ReasoningTimelineViewProps) {
  if (!timeline || timeline.length === 0) return null;

  return (
    <div className="reasoning-timeline-card" data-testid="reasoning-timeline-view">
      <div className="timeline-card-header">
        <div className="title-group">
          <Zap size={16} className="text-accent" />
          <h4 className="timeline-title">8-Step Agentic Reasoning Timeline</h4>
        </div>
        <span className="timeline-step-badge">8 Steps Completed</span>
      </div>

      <div className="timeline-stepper-track" role="list">
        {timeline.map((step, idx) => {
          const isConflict = step.status === 'conflict';
          const isWarning = step.status === 'warning';
          const isLast = idx === timeline.length - 1;

          return (
            <div
              key={step.step_number}
              className={`timeline-node-item ${step.status}`}
              role="listitem"
            >
              <div className="node-indicator-column">
                <div className={`node-circle ${isConflict ? 'conflict-dot' : isWarning ? 'warning-dot' : 'success-dot'}`}>
                  {isConflict || isWarning ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}
                </div>
                {!isLast && <div className="node-connector-line" />}
              </div>

              <div className="node-body">
                <div className="node-header-row">
                  <span className="node-step-index">Step {step.step_number}</span>
                  <span className="node-label">{step.label}</span>
                  <span className="node-duration-pill">
                    <Clock size={10} />
                    {step.duration_ms.toFixed(1)}ms
                  </span>
                </div>
                <p className="node-detail-text">{step.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
