import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
  size?: number;
}

export default function LoadingSpinner({
  message = 'Processing request...',
  size = 20,
}: LoadingSpinnerProps) {
  return (
    <div className="loading-spinner-container" role="status">
      <Loader2 size={size} className="spinner-icon" />
      {message && <span className="spinner-message">{message}</span>}
    </div>
  );
}
