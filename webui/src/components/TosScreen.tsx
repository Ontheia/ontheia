/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Wolfgang Brangl <https://ontheia.ai>
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface TosScreenProps {
  onAccept: () => Promise<void>;
  onLogout: () => void;
}

export function TosScreen({ onAccept, onLogout }: TosScreenProps) {
  const { t } = useTranslation('auth');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    if (!accepted || loading) return;
    setLoading(true);
    try {
      await onAccept();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tos-overlay">
      <div className="tos-card">
        <div className="tos-header">
          <span className="tos-logo">⬡</span>
          <h1 className="tos-title">{t('tos.title')}</h1>
        </div>

        <p className="tos-intro">{t('tos.intro')}</p>

        <div className="tos-section">
          <h2 className="tos-section-title">{t('tos.agplHeading')}</h2>
          <p className="tos-section-text">{t('tos.agplText')}</p>
          <a
            className="tos-link"
            href="https://github.com/Ontheia/ontheia/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer"
          >
            {t('tos.fullLicense')} ↗
          </a>
        </div>

        <div className="tos-section">
          <h2 className="tos-section-title">{t('tos.commercialHeading')}</h2>
          <p className="tos-section-text">{t('tos.commercialText')}</p>
          <a
            className="tos-link"
            href="https://github.com/Ontheia/ontheia/blob/main/LICENSE-COMMERCIAL.md"
            target="_blank"
            rel="noreferrer"
          >
            {t('tos.commercialLicense')} ↗
          </a>
        </div>

        <label className="tos-checkbox-label">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="tos-checkbox"
          />
          <span>{t('tos.checkbox')}</span>
        </label>

        <div className="tos-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={handleAccept}
            disabled={!accepted || loading}
          >
            {loading ? '…' : t('tos.accept')}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={onLogout}
          >
            {t('tos.logout')}
          </button>
        </div>
      </div>
    </div>
  );
}
