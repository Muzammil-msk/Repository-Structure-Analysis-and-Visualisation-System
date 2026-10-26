import { useState, useMemo, useCallback, useRef } from "react";
import axios from "axios";

/* ── Backend base URL — change this if you run on a different port ── */
const BACKEND_URL = "http://127.0.0.1:8001";

import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useReactFlow,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import FileNode, { getComplexityTier } from "./components/FileNode";
import GraphToolbar from "./components/GraphToolbar";

/* ── Custom node types ──────────────────────────────────────────────── */
const NODE_TYPES = { fileNode: FileNode };

/* ── Complexity colour for minimap ─────────────────────────────────── */
function minimapNodeColor(node) {
  const tier = getComplexityTier(node.data?.complexity);
  if (tier === "high") return "#f85149";
  if (tier === "med")  return "#d29922";
  if (tier === "low")  return "#3fb950";
  return "#30363d";
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  Inner component — uses useReactFlow hook                           */
/* ═══════════════════════════════════════════════════════════════════ */
function AppInner() {
  const { fitView, setCenter } = useReactFlow();

  /* ── Raw data from backend ────────────────────────────────────────── */
  const [rawNodes, setRawNodes] = useState([]);
  const [rawEdges, setRawEdges] = useState([]);

  /* ── UI state ─────────────────────────────────────────────────────── */
  const [githubUrl, setGithubUrl]       = useState("");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [selectedNode, setSelectedNode] = useState(null);
  const [summary, setSummary]           = useState("Click any file node to generate an AI summary.");
  const [summaryLoading, setSummaryLoading] = useState(false);

  /* ── Filter state ─────────────────────────────────────────────────── */
  const [searchQuery, setSearchQuery]     = useState("");
  const [langFilter, setLangFilter]       = useState("all");
  const [complexFilter, setComplexFilter] = useState("all");
  const [connFilter, setConnFilter]       = useState("all");

  /* ── Pre-compute connected node IDs (for connectivity filter) ──────── */
  const connectedIds = useMemo(() => {
    const ids = new Set();
    rawEdges.forEach((e) => { ids.add(e.source); ids.add(e.target); });
    return ids;
  }, [rawEdges]);

  /* ── Load GitHub repo ─────────────────────────────────────────────── */
  const loadGitHubRepo = async () => {
    if (!githubUrl.trim()) return;
    setLoading(true);
    setError("");
    setSelectedNode(null);
    setSummary("Click any file node to generate an AI summary.");

    try {
      const res = await axios.post(
        `${BACKEND_URL}/analyze-github`,
        null,
        { params: { repo_url: githubUrl } }
      );

      if (res.data.error) {
        setError(res.data.error);
        setRawNodes([]);
        setRawEdges([]);
        return;
      }

      const nodes = res.data.nodes.map((node, index) => ({
        id: node.id,
        type: "fileNode",
        position: {
          x: (index % 8) * 210,
          y: Math.floor(index / 8) * 130,
        },
        data: {
          label:      node.label,
          loc:        node.loc,
          complexity: node.complexity,
          language:   node.language,
        },
      }));

      const edges = res.data.edges.map((edge, index) => ({
        id: `e${index}`,
        source: edge.source,
        target: edge.target,
        animated: false,
      }));

      setRawNodes(nodes);
      setRawEdges(edges);

      // Reset filters when a new repo is loaded
      setSearchQuery("");
      setLangFilter("all");
      setComplexFilter("all");
      setConnFilter("all");

      setTimeout(() => fitView({ padding: 0.1 }), 50);
    } catch (err) {
      console.error(err);
      setError("Failed to reach the backend. Is the server running?");
    } finally {
      setLoading(false);
    }
  };

  /* ── Handle Enter key in URL input ───────────────────────────────── */
  const handleUrlKeyDown = (e) => {
    if (e.key === "Enter") loadGitHubRepo();
  };

  /* ── Node click → AI summary ─────────────────────────────────────── */
  const handleNodeClick = useCallback(
    async (_, node) => {
      setSelectedNode(node);
      setSummaryLoading(true);
      setSummary("");

      try {
        const res = await axios.get(`${BACKEND_URL}/summary`, {
          params: { file_path: node.id },
        });
        setSummary(res.data.summary || "(No summary returned)");
      } catch (err) {
        const serverMsg = err?.response?.data?.summary || err?.response?.data?.detail;
        setSummary(serverMsg || "Failed to reach the backend. Is the server running on port 8001?");
      } finally {
        setSummaryLoading(false);
      }
    },
    []
  );

  /* ── Pane click → clear selection ────────────────────────────────── */
  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  /* ── Filtering + highlighting logic (pure memos) ─────────────────── */
  const selectedId = selectedNode?.id ?? null;

  // IDs of nodes directly connected to the selected node
  const { outgoingIds, incomingIds } = useMemo(() => {
    if (!selectedId) return { outgoingIds: new Set(), incomingIds: new Set() };
    const outgoing = new Set();
    const incoming = new Set();
    rawEdges.forEach((e) => {
      if (e.source === selectedId) outgoing.add(e.target);
      if (e.target === selectedId) incoming.add(e.source);
    });
    return { outgoingIds: outgoing, incomingIds: incoming };
  }, [selectedId, rawEdges]);

  // Which nodes pass the search/lang/complexity/conn filters?
  const passesFilter = useCallback(
    (node) => {
      const label = (node.data.label ?? "").toLowerCase();
      const id    = (node.id ?? "").toLowerCase();
      const q     = searchQuery.toLowerCase();

      if (q && !label.includes(q) && !id.includes(q)) return false;
      if (langFilter !== "all" && node.data.language !== langFilter)  return false;

      if (complexFilter !== "all") {
        const tier = getComplexityTier(node.data.complexity);
        if (tier !== complexFilter) return false;
      }

      if (connFilter === "connected" && !connectedIds.has(node.id)) return false;
      if (connFilter === "isolated"  &&  connectedIds.has(node.id)) return false;

      return true;
    },
    [searchQuery, langFilter, complexFilter, connFilter, connectedIds]
  );

  // Final derived node list with visual state injected into data
  const displayNodes = useMemo(() => {
    const hasSearch = Boolean(searchQuery);
    const hasSelection = Boolean(selectedId);
    const relatedIds = new Set([...outgoingIds, ...incomingIds]);

    return rawNodes.map((node) => {
      const passes = passesFilter(node);

      // Compute visual state flags
      let dimmed            = false;
      let highlightedSource = false; // selected node's direct "imports" (outgoing)
      let highlightedTarget = false; // selected node's direct "importers" (incoming)
      let searchMatch       = false;

      if (!passes) {
        dimmed = true;
      } else if (hasSelection) {
        if (node.id === selectedId) {
          // The selected node itself — keep as selected (no flag needed, ReactFlow handles it via `selected`)
        } else if (outgoingIds.has(node.id)) {
          highlightedTarget = true; // nodes this file imports
        } else if (incomingIds.has(node.id)) {
          highlightedSource = true; // nodes that import this file
        } else {
          dimmed = true;
        }
      } else if (hasSearch && passes) {
        searchMatch = true;
      }

      return {
        ...node,
        selected: node.id === selectedId,
        data: {
          ...node.data,
          dimmed,
          highlightedSource,
          highlightedTarget,
          searchMatch: hasSearch && !hasSelection && passes,
        },
      };
    });
  }, [rawNodes, selectedId, outgoingIds, incomingIds, passesFilter, searchQuery]);

  // Final derived edge list
  const displayEdges = useMemo(() => {
    if (!selectedId) {
      return rawEdges.map((e) => ({ ...e, className: "" }));
    }
    return rawEdges.map((e) => {
      let className = "dimmed";
      if (e.source === selectedId) className = "highlighted-source";
      else if (e.target === selectedId) className = "highlighted-target";
      return { ...e, className };
    });
  }, [rawEdges, selectedId]);

  /* ── Stats ────────────────────────────────────────────────────────── */
  const visibleCount = useMemo(
    () => displayNodes.filter((n) => !n.data.dimmed).length,
    [displayNodes]
  );

  const totalLoc = useMemo(
    () => rawNodes.reduce((s, n) => s + (n.data.loc ?? 0), 0),
    [rawNodes]
  );

  /* ── Reset all filters ────────────────────────────────────────────── */
  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setLangFilter("all");
    setComplexFilter("all");
    setConnFilter("all");
  }, []);

  /* ── Focus selected node ─────────────────────────────────────────── */
  const focusSelected = useCallback(() => {
    if (!selectedNode) return;
    setCenter(
      selectedNode.position.x + 87,
      selectedNode.position.y + 50,
      { zoom: 1.5, duration: 400 }
    );
  }, [selectedNode, setCenter]);

  /* ── Complexity breakdown for stats ──────────────────────────────── */
  const complexityBreakdown = useMemo(() => {
    let low = 0, med = 0, high = 0;
    rawNodes.forEach((n) => {
      const t = getComplexityTier(n.data.complexity);
      if (t === "low")  low++;
      if (t === "med")  med++;
      if (t === "high") high++;
    });
    return { low, med, high };
  }, [rawNodes]);

  /* ── Sidebar helpers ──────────────────────────────────────────────── */
  const selComplexityTier = selectedNode
    ? getComplexityTier(selectedNode.data.complexity)
    : null;

  return (
    <div className="app-shell">

      {/* ═══════════ GRAPH PANE ═══════════ */}
      <div className="graph-pane">

        {/* Toolbar */}
        <GraphToolbar
          nodes={rawNodes}
          edges={rawEdges}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          langFilter={langFilter}
          setLangFilter={setLangFilter}
          complexFilter={complexFilter}
          setComplexFilter={setComplexFilter}
          connFilter={connFilter}
          setConnFilter={setConnFilter}
          visibleCount={visibleCount}
          totalCount={rawNodes.length}
          onResetFilters={resetFilters}
        />

        {/* React Flow */}
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={NODE_TYPES}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          fitView
          minZoom={0.05}
          maxZoom={3}
          nodesDraggable
          nodesConnectable={false}
          edgesFocusable={false}
          style={{ background: "var(--bg-graph)" }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="#21262d"
          />

          <Controls showInteractive={false} />

          <MiniMap
            nodeColor={minimapNodeColor}
            maskColor="rgba(13,17,23,0.7)"
            style={{ bottom: 12, right: 12 }}
          />
        </ReactFlow>

        {/* Loading overlay */}
        {loading && (
          <div className="loading-overlay">
            <div className="loading-spinner-large" />
            <span className="loading-text">Cloning & analyzing repository…</span>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="error-banner">
            ⚠️ {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && rawNodes.length === 0 && !error && (
          <div className="graph-empty" style={{ pointerEvents: "none" }}>
            <div className="graph-empty-icon">🕸️</div>
            <div className="graph-empty-title">No repository loaded</div>
            <div className="graph-empty-sub">
              Enter a GitHub URL in the sidebar to begin analysis
            </div>
          </div>
        )}
      </div>

      {/* ═══════════ SIDEBAR ═══════════ */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title">
            <span className="sidebar-title-icon">🔭</span>
            RepoViz
          </div>
          <div className="sidebar-subtitle">
            Repository Structure Analysis &amp; Visualization
          </div>
        </div>

        <div className="sidebar-body">

          {/* ── GitHub Input ── */}
          <div className="card">
            <div className="card-title">🐙 Analyze Repository</div>
            <input
              id="github-url-input"
              className="github-input"
              type="text"
              placeholder="https://github.com/user/repo"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              onKeyDown={handleUrlKeyDown}
            />
            <button
              id="analyze-btn"
              className="btn-analyze"
              onClick={loadGitHubRepo}
              disabled={loading || !githubUrl.trim()}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Analyzing…
                </>
              ) : (
                "▶ Analyze"
              )}
            </button>
          </div>

          {/* ── Repository Statistics ── */}
          {rawNodes.length > 0 && (
            <div className="card">
              <div className="card-title">📊 Repository Statistics</div>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{rawNodes.length}</div>
                  <div className="stat-label">Files</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{rawEdges.length}</div>
                  <div className="stat-label">Dependencies</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{totalLoc.toLocaleString()}</div>
                  <div className="stat-label">Total LOC</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value" style={{ color: "var(--complexity-high)" }}>
                    {complexityBreakdown.high}
                  </div>
                  <div className="stat-label">High Complexity</div>
                </div>
              </div>
            </div>
          )}

          {/* ── Legend ── */}
          <div className="card">
            <div className="card-title">🗂️ Legend</div>
            <div className="legend-items">
              <div className="legend-item">
                <span className="legend-dot low" />
                Low complexity (≤ 20)
              </div>
              <div className="legend-item">
                <span className="legend-dot med" />
                Medium complexity (21–50)
              </div>
              <div className="legend-item">
                <span className="legend-dot high" />
                High complexity (&gt; 50)
              </div>

              <div className="legend-separator" />

              {selectedId && (
                <>
                  <div className="legend-item">
                    <span className="legend-dot sel" />
                    Selected file
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot" style={{ background: "var(--complexity-low)" }} />
                    Files imported by selected
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot" style={{ background: "var(--accent-blue)" }} />
                    Files that import selected
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot dim" style={{ opacity: 0.35 }} />
                    Unrelated files (dimmed)
                  </div>
                </>
              )}

              {!selectedId && (
                <div className="legend-item" style={{ color: "var(--text-tertiary)", fontSize: "11px" }}>
                  Click a node to see dependency highlighting
                </div>
              )}
            </div>
          </div>

          {/* ── File Details ── */}
          {selectedNode && (
            <div className="card">
              <div className="card-title">📄 File Details</div>

              <div className="file-detail-name">{selectedNode.data.label}</div>
              <div className="file-detail-path">{selectedNode.id}</div>

              <div className="file-metrics">
                <div className="metric-chip">
                  <div className="metric-value">{selectedNode.data.loc ?? "—"}</div>
                  <div className="metric-label">LOC</div>
                </div>
                <div className="metric-chip">
                  <div className="metric-value">{selectedNode.data.language ?? "—"}</div>
                  <div className="metric-label">Lang</div>
                </div>
                <div className={`metric-chip ${selComplexityTier === "none" ? "" : selComplexityTier}`}>
                  <div className="metric-value">{selectedNode.data.complexity ?? "—"}</div>
                  <div className="metric-label">Complexity</div>
                </div>
              </div>

              {/* Focus button */}
              <button
                id="focus-node-btn"
                onClick={focusSelected}
                style={{
                  marginTop: "10px",
                  width: "100%",
                  padding: "6px",
                  background: "var(--accent-blue-dim)",
                  border: "1px solid var(--accent-blue)",
                  borderRadius: "6px",
                  color: "var(--text-accent)",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                  transition: "background 120ms",
                }}
                onMouseEnter={(e) => (e.target.style.background = "rgba(56,139,253,0.25)")}
                onMouseLeave={(e) => (e.target.style.background = "var(--accent-blue-dim)")}
              >
                🎯 Focus node in graph
              </button>
            </div>
          )}

          {/* ── AI Summary ── */}
          <div className="card">
            <div className="card-title">🤖 AI Summary</div>
            {summaryLoading ? (
              <div className="summary-loading">
                <div className="spinner" />
                Generating summary…
              </div>
            ) : (
              <p className="summary-text">
                {summary || "Click any file node to generate an AI summary."}
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  Root — wraps with ReactFlowProvider                               */
/* ═══════════════════════════════════════════════════════════════════ */
export default function App() {
  return (
    <ReactFlowProvider>
      <AppInner />
    </ReactFlowProvider>
  );
}