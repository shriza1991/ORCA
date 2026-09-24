import type { AgentTraceItem } from '../../types/contracts';
import { CheckCircle, XCircle, Loader, Bot } from 'lucide-react';

interface AgentTimelineProps {
  trace: AgentTraceItem[];
}

export default function AgentTimeline({ trace }: AgentTimelineProps) {
  if (!trace.length) return null;

  return (
    <div className="agent-timeline" role="list" aria-label="Agent activity timeline">
      <h4 className="timeline-title">Agent Activity</h4>
      {trace.map((item, i) => (
        <TraceStep key={i} item={item} isLast={i === trace.length - 1} />
      ))}
    </div>
  );
}

function TraceStep({ item, isLast }: { item: AgentTraceItem; isLast: boolean }) {
  const normStatus = (item.status || '').toLowerCase();
  const StatusIcon = normStatus === 'completed' || normStatus === 'ok' || normStatus === 'success'
    ? CheckCircle
    : normStatus === 'failed' || normStatus === 'error'
    ? XCircle
    : Loader;

  return (
    <div className={`trace-step ${item.status}`} role="listitem">
      <div className="trace-step-connector">
        <div className={`trace-step-dot status-dot-${item.status}`}>
          <StatusIcon size={12} />
        </div>
        {!isLast && <div className="trace-step-line" />}
      </div>
      <div className="trace-step-content">
        <div className="trace-step-header">
          <span className="trace-node-name">
            <Bot size={12} />
            {formatNodeName(item.node)}
          </span>
          <span className="trace-step-number">Step {item.step}</span>
        </div>
        <p className="trace-step-action">{item.action}</p>
        <span className="trace-step-time">{formatTraceTime(item.timestamp)}</span>
      </div>
    </div>
  );
}

function formatNodeName(node: string): string {
  return node.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatTraceTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}
