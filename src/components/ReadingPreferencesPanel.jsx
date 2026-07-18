/**
 * ReadingPreferencesPanel
 * ─────────────────────────────────
 * User settings for personalized reading experience:
 * - WPM calibration (reading speed)
 * - Audio playback preferences
 * - Display settings (font size, line height)
 */

import { useState, useEffect } from 'react';
import {
  getUserReadingPreferences,
  saveUserReadingPreferences,
  calibrateUserWPM,
  recordReadingCalibration,
} from '../utils/readingTime';
import './ReadingPreferencesPanel.css';

export default function ReadingPreferencesPanel({ user, onClose, showToast }) {
  const [prefs, setPrefs] = useState(() =>
    user ? getUserReadingPreferences(user.email) : {}
  );
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationData, setCalibrationData] = useState({
    wordCount: '',
    timeMinutes: '',
  });
  const [saving, setSaving] = useState(false);

  // Calculate estimated WPM from calibration input
  const calibratedWPM =
    calibrationData.wordCount && calibrationData.timeMinutes
      ? calibrateUserWPM(
          Number(calibrationData.wordCount),
          Number(calibrationData.timeMinutes)
        )
      : null;

  const updatePref = (key, value) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      saveUserReadingPreferences(user.email, prefs);
      showToast?.('✅ Reading preferences saved');
      setTimeout(() => onClose?.(), 500);
    } catch (e) {
      showToast?.('❌ Failed to save preferences: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApplyCalibration = () => {
    if (!calibratedWPM) return;
    const updated = recordReadingCalibration(
      user.email,
      Number(calibrationData.wordCount),
      Number(calibrationData.timeMinutes)
    );
    if (updated) {
      setPrefs(updated);
      showToast?.(
        `✅ Reading speed calibrated to ${updated.wpm} WPM (${updated.calibrationCount} sample${
          updated.calibrationCount > 1 ? 's' : ''
        })`
      );
      setCalibrating(false);
      setCalibrationData({ wordCount: '', timeMinutes: '' });
    }
  };

  if (!user) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
        <p>Please log in to customize your reading preferences.</p>
      </div>
    );
  }

  const audioSpeedPresets = [
    { key: 'slow', label: 'Slow (0.75x)', rate: 0.75 },
    { key: 'normal', label: 'Normal (1.0x)', rate: 1.0 },
    { key: 'fast', label: 'Fast (1.25x)', rate: 1.25 },
    { key: 'faster', label: 'Faster (1.5x)', rate: 1.5 },
  ];

  return (
    <div className="reading-prefs-panel">
      <div className="rpp-header">
        <h2>📖 Reading Preferences</h2>
        <p>Personalize your reading experience</p>
      </div>

      {/* ── READING SPEED SECTION ── */}
      <div className="rpp-section">
        <h3>⚡ Reading Speed (WPM)</h3>
        <p className="rpp-note">
          Current: <strong>{prefs.wpm || 250} WPM</strong>
          {prefs.calibrationCount > 0 && (
            <span style={{ marginLeft: 12, color: 'var(--ok)' }}>
              · Calibrated {prefs.calibrationCount} time{prefs.calibrationCount > 1 ? 's' : ''}
            </span>
          )}
        </p>

        {!calibrating ? (
          <div>
            <div className="rpp-field">
              <label>WPM Slider</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input
                  type="range"
                  min={100}
                  max={400}
                  step={10}
                  value={prefs.wpm || 250}
                  onChange={e => updatePref('wpm', Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ minWidth: 50, textAlign: 'right', fontWeight: 600 }}>
                  {prefs.wpm || 250}
                </span>
              </div>
              <small style={{ color: 'var(--muted)', marginTop: 6, display: 'block' }}>
                Slow reader: 100–150 · Average: 200–300 · Fast reader: 350–400
              </small>
            </div>

            <button
              className="btn btn-outline btn-sm"
              onClick={() => setCalibrating(true)}
              style={{ marginTop: 12 }}
            >
              📊 Calibrate from Reading Session
            </button>
          </div>
        ) : (
          <div className="rpp-calibration-form">
            <h4>📊 Calibrate Your Reading Speed</h4>
            <p className="rpp-note">
              Read a sample passage and record how many words you read in how many minutes.
            </p>

            <div className="rpp-field">
              <label>Words in Sample</label>
              <input
                type="number"
                placeholder="e.g., 500"
                value={calibrationData.wordCount}
                onChange={e =>
                  setCalibrationData({ ...calibrationData, wordCount: e.target.value })
                }
                min={50}
                max={10000}
              />
            </div>

            <div className="rpp-field">
              <label>Minutes Spent</label>
              <input
                type="number"
                placeholder="e.g., 2.5"
                value={calibrationData.timeMinutes}
                onChange={e =>
                  setCalibrationData({ ...calibrationData, timeMinutes: e.target.value })
                }
                min={0.5}
                max={60}
                step={0.5}
              />
            </div>

            {calibratedWPM && (
              <div
                style={{
                  background: 'rgba(46,204,113,0.1)',
                  border: '1px solid rgba(46,204,113,0.3)',
                  borderRadius: 'var(--r-sm)',
                  padding: 12,
                  marginBottom: 12,
                  fontSize: '0.9rem',
                }}
              >
                <strong style={{ color: 'var(--ok)' }}>Estimated WPM: {calibratedWPM}</strong>
                <p style={{ margin: '6px 0 0 0', color: 'var(--muted)', fontSize: '0.8rem' }}>
                  This is your reading speed based on the sample. We'll average this with
                  previous calibrations for accuracy.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleApplyCalibration}
                disabled={!calibratedWPM}
              >
                ✅ Apply Calibration
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setCalibrating(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── AUDIO SETTINGS ── */}
      <div className="rpp-section">
        <h3>🎙️ Audio Playback</h3>

        <div className="rpp-field">
          <label>Playback Speed Preset</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {audioSpeedPresets.map(preset => (
              <button
                key={preset.key}
                onClick={() => updatePref('audioSpeedPreset', preset.key)}
                style={{
                  padding: '8px 12px',
                  border:
                    prefs.audioSpeedPreset === preset.key
                      ? '1px solid var(--gold)'
                      : '1px solid var(--border)',
                  background:
                    prefs.audioSpeedPreset === preset.key
                      ? 'rgba(201,168,76,0.1)'
                      : 'transparent',
                  borderRadius: 'var(--r-sm)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  fontSize: '0.85rem',
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
          <div className="rpp-field">
            <label>
              Pitch{' '}
              <span
                style={{
                  marginLeft: 'auto',
                  fontWeight: 600,
                  color: 'var(--gold)',
                }}
              >
                {(prefs.audioPitch || 1.0).toFixed(1)}
              </span>
            </label>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={prefs.audioPitch || 1.0}
              onChange={e => updatePref('audioPitch', Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* ── DISPLAY SETTINGS ── */}
      <div className="rpp-section">
        <h3>👁️ Display</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="rpp-field">
            <label>
              Font Size{' '}
              <span
                style={{
                  marginLeft: 'auto',
                  fontWeight: 600,
                  color: 'var(--gold)',
                }}
              >
                {prefs.fontSize || '1rem'}
              </span>
            </label>
            <select
              value={prefs.fontSize || '1rem'}
              onChange={e => updatePref('fontSize', e.target.value)}
            >
              <option value="0.85rem">Small</option>
              <option value="1rem">Normal</option>
              <option value="1.15rem">Large</option>
              <option value="1.3rem">Extra Large</option>
            </select>
          </div>

          <div className="rpp-field">
            <label>
              Line Height{' '}
              <span
                style={{
                  marginLeft: 'auto',
                  fontWeight: 600,
                  color: 'var(--gold)',
                }}
              >
                {prefs.lineHeight || 1.6}
              </span>
            </label>
            <select
              value={prefs.lineHeight || 1.6}
              onChange={e => updatePref('lineHeight', Number(e.target.value))}
            >
              <option value={1.4}>Compact</option>
              <option value={1.6}>Normal</option>
              <option value={1.8}>Loose</option>
              <option value={2}>Very Loose</option>
            </select>
          </div>
        </div>

        <div className="rpp-field">
          <label>Theme</label>
          <select
            value={prefs.theme || 'auto'}
            onChange={e => updatePref('theme', e.target.value)}
          >
            <option value="auto">Auto (System Setting)</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>

      {/* ── ACTIONS ── */}
      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={saving}
          style={{ flex: 1 }}
        >
          {saving ? '⏳ Saving...' : '💾 Save Preferences'}
        </button>
        <button className="btn btn-outline btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
