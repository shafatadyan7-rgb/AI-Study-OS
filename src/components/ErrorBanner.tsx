'use client';

import { useState } from 'react';
import { toFriendlyError } from '@/lib/errors/friendly';

export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const [showTechnical, setShowTechnical] = useState(false);
  const friendly = toFriendlyError(error);

  return (
    <div className="error-banner" role="alert">
      <div className="error-banner-row">
        <div>
          <div className="error-banner-headline">{friendly.headline}</div>
          <p className="dim" style={{ fontSize: 12 }}>{friendly.detail}</p>
        </div>
        {friendly.retryable && onRetry && (
          <button className="btn small" onClick={onRetry}>Retry</button>
        )}
      </div>
      <button
        className="error-banner-toggle"
        onClick={() => setShowTechnical((v) => !v)}
        aria-expanded={showTechnical}
      >
        {showTechnical ? 'Hide technical details' : 'Technical details'}
      </button>
      {showTechnical && <pre className="error-banner-technical">{friendly.technical}</pre>}
    </div>
  );
}
