import type { ThresholdComparison } from '../../types/contracts';

interface ThresholdTableProps {
  evidence: (ThresholdComparison | Record<string, any>)[];
  className?: string;
}

export function formatMetricName(metricName: string): string {
  if (!metricName) return '—';
  const clean = metricName.replace(/_/g, ' ');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function getImpactBadgeStyle(impact: string): {
  backgroundColor: string;
  color: string;
  borderColor: string;
} {
  switch (impact) {
    case 'SAFE':
      return {
        backgroundColor: '#dcfce7',
        color: '#166534',
        borderColor: '#86efac',
      };
    case 'CAUTION_TRIGGER':
      return {
        backgroundColor: '#fef3c7',
        color: '#92400e',
        borderColor: '#fcd34d',
      };
    case 'NO_GO_TRIGGER':
      return {
        backgroundColor: '#fee2e2',
        color: '#991b1b',
        borderColor: '#fca5a5',
      };
    case 'UNKNOWN_TRIGGER':
    default:
      return {
        backgroundColor: '#f1f5f9',
        color: '#475569',
        borderColor: '#cbd5e1',
      };
  }
}

export default function ThresholdTable({ evidence, className = '' }: ThresholdTableProps) {
  if (!evidence || evidence.length === 0) {
    return (
      <div
        data-testid="threshold-table-empty"
        style={{
          padding: '16px',
          textAlign: 'center',
          color: '#64748b',
          fontSize: '0.875rem',
        }}
      >
        No threshold comparison evidence recorded for this assessment.
      </div>
    );
  }

  return (
    <div
      className={`threshold-table-container ${className}`}
      data-testid="threshold-matrix-table"
      style={{
        width: '100%',
        overflowX: 'auto',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        background: '#ffffff',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.8125rem',
          textAlign: 'left',
          minWidth: '640px',
        }}
      >
        <thead>
          <tr
            style={{
              backgroundColor: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              color: '#475569',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontSize: '0.75rem',
            }}
          >
            <th style={{ padding: '10px 12px' }}>Metric</th>
            <th style={{ padding: '10px 12px' }}>Observed</th>
            <th style={{ padding: '10px 12px' }}>Operator</th>
            <th style={{ padding: '10px 12px' }}>Threshold</th>
            <th style={{ padding: '10px 12px' }}>Unit</th>
            <th style={{ padding: '10px 12px' }}>Impact</th>
            <th style={{ padding: '10px 12px' }}>Status</th>
            <th style={{ padding: '10px 12px' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          {evidence.map((row, idx) => {
            const metric = row.metric_name || `Metric #${idx + 1}`;
            const observed =
              row.observed_value !== undefined && row.observed_value !== null
                ? String(row.observed_value)
                : '—';
            const operator = row.operator || '—';
            const threshold =
              row.threshold_value !== undefined && row.threshold_value !== null
                ? String(row.threshold_value)
                : '—';
            const unit = row.unit || '—';
            const impact = row.impact || 'UNKNOWN_TRIGGER';
            const isExceeded = Boolean(row.exceeded);
            const statusLabel = isExceeded ? 'Exceeded' : 'Within Bounds';
            const description = row.description || '—';
            const impactStyle = getImpactBadgeStyle(impact);

            return (
              <tr
                key={idx}
                data-testid={`threshold-row-${idx}`}
                style={{
                  borderBottom: idx === evidence.length - 1 ? 'none' : '1px solid #f1f5f9',
                  backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fcfcfd',
                }}
              >
                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>
                  {formatMetricName(metric)}
                </td>
                <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#1e293b' }}>
                  {observed}
                </td>
                <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#64748b' }}>
                  {operator}
                </td>
                <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#1e293b' }}>
                  {threshold}
                </td>
                <td style={{ padding: '10px 12px', color: '#64748b' }}>
                  {unit}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span
                    data-testid={`impact-badge-${impact.toLowerCase()}`}
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      border: `1px solid ${impactStyle.borderColor}`,
                      backgroundColor: impactStyle.backgroundColor,
                      color: impactStyle.color,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {impact}
                  </span>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span
                    style={{
                      fontWeight: 500,
                      color: isExceeded ? '#dc2626' : '#16a34a',
                    }}
                  >
                    {statusLabel}
                  </span>
                </td>
                <td
                  style={{
                    padding: '10px 12px',
                    color: '#475569',
                    maxWidth: '280px',
                    lineHeight: '1.4',
                  }}
                >
                  {description}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
