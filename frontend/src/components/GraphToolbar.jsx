import { useMemo } from "react";

/**
 * GraphToolbar
 * Props:
 *   nodes         - raw node array (to derive language options)
 *   searchQuery   - string
 *   setSearchQuery
 *   langFilter    - string ("all" | ".py" | etc.)
 *   setLangFilter
 *   complexFilter - string ("all" | "low" | "med" | "high")
 *   setComplexFilter
 *   connFilter    - string ("all" | "connected" | "isolated")
 *   setConnFilter
 *   edges         - raw edge array (for connected/isolated logic)
 *   visibleCount  - number of nodes currently visible
 *   totalCount    - total nodes before filter
 *   onResetFilters
 */
export default function GraphToolbar({
  nodes = [],
  searchQuery,
  setSearchQuery,
  langFilter,
  setLangFilter,
  complexFilter,
  setComplexFilter,
  connFilter,
  setConnFilter,
  edges = [],
  visibleCount,
  totalCount,
  onResetFilters,
}) {
  // Derive unique languages from actual node data
  const languages = useMemo(() => {
    const langs = new Set();
    nodes.forEach((n) => {
      if (n.data?.language) langs.add(n.data.language);
    });
    return Array.from(langs).sort();
  }, [nodes]);

  const hasActiveFilters =
    searchQuery ||
    langFilter !== "all" ||
    complexFilter !== "all" ||
    connFilter !== "all";

  const LANG_LABELS = {
    ".py": "Python",
    ".js": "JavaScript",
    ".jsx": "React JSX",
    ".ts": "TypeScript",
    ".tsx": "React TSX",
    ".java": "Java",
    ".c": "C",
    ".cpp": "C++",
    ".h": "C Header",
    ".hpp": "C++ Header",
    ".ipynb": "Jupyter",
  };

  return (
    <div className="toolbar">
      {/* ── Search ── */}
      <div className="toolbar-section">
        <div className="search-wrapper">
          <span className="search-icon">🔍</span>
          <input
            id="graph-search"
            className="search-input"
            type="text"
            placeholder="Search files…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="search-clear"
              onClick={() => setSearchQuery("")}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="toolbar-divider" />

      {/* ── Language filter ── */}
      <div className="toolbar-section">
        <select
          id="lang-filter"
          className="filter-select"
          value={langFilter}
          onChange={(e) => setLangFilter(e.target.value)}
          title="Filter by language"
        >
          <option value="all">All Languages</option>
          {languages.map((lang) => (
            <option key={lang} value={lang}>
              {LANG_LABELS[lang] || lang}
            </option>
          ))}
        </select>
      </div>

      {/* ── Complexity filter ── */}
      <div className="toolbar-section">
        <select
          id="complexity-filter"
          className="filter-select"
          value={complexFilter}
          onChange={(e) => setComplexFilter(e.target.value)}
          title="Filter by complexity"
        >
          <option value="all">All Complexity</option>
          <option value="low">🟢 Low (≤20)</option>
          <option value="med">🟡 Medium (21-50)</option>
          <option value="high">🔴 High (&gt;50)</option>
        </select>
      </div>

      {/* ── Connected filter ── */}
      <div className="toolbar-section">
        <select
          id="conn-filter"
          className="filter-select"
          value={connFilter}
          onChange={(e) => setConnFilter(e.target.value)}
          title="Filter by connectivity"
        >
          <option value="all">All Files</option>
          <option value="connected">Connected only</option>
          <option value="isolated">Isolated only</option>
        </select>
      </div>

      {/* ── Reset ── */}
      {hasActiveFilters && (
        <div className="toolbar-section">
          <div className="toolbar-divider" />
          <button
            id="reset-filters"
            className="btn-reset"
            onClick={onResetFilters}
          >
            Reset filters
          </button>
        </div>
      )}

      {/* ── Results count ── */}
      {totalCount > 0 && (
        <div style={{ marginLeft: "auto" }}>
          <span className="results-badge">
            {visibleCount}/{totalCount} files
          </span>
        </div>
      )}
    </div>
  );
}
