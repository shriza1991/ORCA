import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export default function ErrorState({
  title = 'Service Interruption',
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="error-state-card" role="alert">
      <div className="error-state-icon">
        <AlertTriangle size={24} />
      </div>
      <div className="error-state-details">
        <h4 className="error-state-title">{title}</h4>
        <p className="error-state-message">{message}</p>
        {onRetry && (
          <button className="error-retry-btn" onClick={onRetry}>
            <RefreshCw size={14} />
            <span>Retry Query</span>
          </button>
        )}
      </div>
    </div>
  );
}
