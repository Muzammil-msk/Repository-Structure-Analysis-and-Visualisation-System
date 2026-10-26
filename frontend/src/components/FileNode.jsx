import { memo } from "react";
import { Handle, Position } from "@xyflow/react";

/* ── Complexity helpers ───────────────────────────────────────────── */
export function getComplexityTier(complexity) {
  if (complexity == null || complexity === 0) return "none";
  if (complexity > 50) return "high";
  if (complexity > 20) return "med";
  return "low";
}

const BADGE_LABEL = { low: "Low", med: "Med", high: "High", none: null };

/* ── Language → icon mapping ──────────────────────────────────────── */
const LANG_ICONS = {
  ".py":   "🐍",
  ".js":   "🟨",
  ".jsx":  "⚛️",
  ".ts":   "🔷",
  ".tsx":  "⚛️",
  ".java": "☕",
  ".c":    "🔵",
  ".cpp":  "🔵",
  ".h":    "📄",
  ".hpp":  "📄",
  ".ipynb":"📓",
};

function getIcon(ext) {
  return LANG_ICONS[ext?.toLowerCase()] ?? "📄";
}

/* ── Trim long filenames ──────────────────────────────────────────── */
function trimName(name, max = 22) {
  if (!name || name.length <= max) return name;
  return name.slice(0, max - 1) + "…";
}

/* ── FileNode component ───────────────────────────────────────────── */
function FileNode({ data, selected }) {
  const { label = "", loc, complexity, language } = data;
  const tier   = getComplexityTier(complexity);
  const icon   = getIcon(language);
  const ext    = language ? language.replace(".", "").toUpperCase() : "?";
  const badge  = BADGE_LABEL[tier];

  // Build CSS class string
  const stateClass = data.dimmed
    ? "dimmed"
    : data.highlightedSource
    ? "highlighted-source"
    : data.highlightedTarget
    ? "highlighted-target"
    : data.searchMatch
    ? "search-match"
    : selected
    ? "selected"
    : "";

  return (
    <div className={`file-node ${stateClass}`}>
      {/* Handles — preserve all connections */}
      <Handle type="target" position={Position.Top}    style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      {/* Complexity colour stripe */}
      <div className={`file-node-stripe ${tier}`} />

      {/* Body */}
      <div className="file-node-body">
        <div className="file-node-header">
          <span className="file-node-icon">{icon}</span>
          <span className="file-node-name" title={label}>
            {trimName(label)}
          </span>
          <span className="file-node-ext">{ext}</span>
        </div>

        <div className="file-node-metrics">
          {loc != null && (
            <span className="file-node-metric">
              <span className="file-node-metric-icon">📏</span>
              {loc}L
            </span>
          )}
          {complexity != null && (
            <span className="file-node-metric">
              <span className="file-node-metric-icon">⚡</span>
              {complexity}
            </span>
          )}
          {badge && (
            <span className={`complexity-badge ${tier}`}>{badge}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(FileNode);
