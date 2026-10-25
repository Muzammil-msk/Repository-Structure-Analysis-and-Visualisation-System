import { useState } from "react";
import axios from "axios";

import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

function App() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);

  const [summary, setSummary] = useState(
    "Click any file node to generate an AI summary."
  );

  const [selectedNode, setSelectedNode] = useState(null);

  // Local repository path
  const [repoPath, setRepoPath] = useState("");

  // Github repository URL
  const [githubUrl, setGithubUrl] = useState("");

  const loadGitHubRepo = async () => {
  try {

    const res = await axios.post(
      "http://127.0.0.1:8000/analyze-github",
      null,
      {
        params: {
          repo_url: githubUrl,
        },
      }
    );

    const backendNodes = res.data.nodes.map((node, index) => ({
      id: node.id,

      position: {
        x: (index % 10) * 250,
        y: Math.floor(index / 10) * 150,
      },

      data: {
        label: node.label,
        loc: node.loc,
        complexity: node.complexity,
        language: node.language,
      },

      style: {
        background:
          node.complexity > 50
            ? "#ffcccc"
            : node.complexity > 20
            ? "#fff0b3"
            : "#ccffcc",

        border: "1px solid #444",
        borderRadius: "10px",
        padding: "5px",
        width: 180,
      },
    }));

    const backendEdges = res.data.edges.map((edge, index) => ({
      id: `e${index}`,
      source: edge.source,
      target: edge.target,
    }));

    setNodes(backendNodes);
    setEdges(backendEdges);

  } catch (err) {
    console.error(err);
  }
};

  const handleNodeClick = async (_, node) => {
    setSelectedNode(node);

    setSummary("Generating AI summary...");

    try {
      const response = await axios.get(
        "http://127.0.0.1:8000/summary",
        {
          params: {
            file_path: node.id,
          },
        }
      );

      setSummary(response.data.summary);
    } catch (err) {
      console.error(err);
      setSummary("Failed to generate summary.");
    }
  };

  return (
    <ReactFlowProvider>
      <div
        style={{
          display: "flex",
          width: "100vw",
          height: "100vh",
        }}
      >
        {/* Graph Section */}
        <div
          style={{
            width: "75%",
            height: "100%",
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            onNodeClick={handleNodeClick}
          >
            <MiniMap />
            <Controls />
            <Background />
          </ReactFlow>
        </div>

        {/* Sidebar */}
        <div
          style={{
            width: "25%",
            padding: "20px",
            borderLeft: "1px solid #ccc",
            overflowY: "auto",
            backgroundColor: "#fafafa",
          }}
        >
          <h2>Repository Structure Analysis & Visualization System</h2>

          <div
          style={{
            padding: "12px",
            marginBottom: "15px",
            border: "1px solid #ddd",
            borderRadius: "10px",
            backgroundColor: "white",
          }}
        >
          <h3>Analyze GitHub Repository</h3>

          <input
            type="text"
            placeholder="Paste GitHub URL"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            style={{
              width: "100%",
              padding: "8px",
              marginBottom: "10px",
            }}
          />

          <button
            onClick={loadGitHubRepo}
            style={{
              width: "100%",
              padding: "10px",
              cursor: "pointer",
            }}
          >
            Analyze GitHub Repo
        </button>
        </div> 

        {/* Repository Statistics */}
           <div
             style={{
               padding: "12px",
               marginBottom: "15px",
               border: "1px solid #ddd",
               borderRadius: "10px",
               backgroundColor: "white",
             }}
           >
             <h3>Repository Statistics</h3>

             <p>
               <strong>Total Files:</strong> {nodes.length}
             </p>

             <p>
               <strong>Total Dependencies:</strong> {edges.length}
             </p>
           </div>          



          {/* Legend */}
          <div
            style={{
              padding: "12px",
              marginBottom: "15px",
              border: "1px solid #ddd",
              borderRadius: "10px",
              backgroundColor: "white",
            }}
          >
            <h3>Graph Legend</h3>

            <p>🟢 Low Complexity</p>
            <p>🟡 Medium Complexity</p>
            <p>🔴 High Complexity</p>

            <hr />

            <p>
              Click any node to view:
            </p>

            <ul>
              <li>AI Summary</li>
              <li>Lines of Code (LOC)</li>
              <li>Complexity Score</li>
              <li>File Path</li>
            </ul>
          </div>

          {/* File Details */}
          {selectedNode && (
            <div
              style={{
                padding: "12px",
                marginBottom: "15px",
                border: "1px solid #ddd",
                borderRadius: "10px",
                backgroundColor: "white",
              }}
            >
              <h3>{selectedNode.data.label}</h3>

              <p>
                <strong>Path:</strong>
                <br />
                {selectedNode.id}
              </p>

              <p>
                <strong>Lines of Code:</strong>{" "}
                {selectedNode.data.loc}
              </p>

              <p>
                <strong>Language:</strong>{" "}
                {selectedNode.data.language}
              </p>

                

              <p>
                <strong>Complexity:</strong>{" "}
                {selectedNode.data.complexity}
              </p>
            </div>
          )}

          {/* AI Summary */}
          <div
            style={{
              padding: "12px",
              border: "1px solid #ddd",
              borderRadius: "10px",
              backgroundColor: "white",
            }}
          >
            <h3>AI Summary</h3>

            <p>{summary}</p>
          </div>
        </div>
      </div>
    </ReactFlowProvider>
  );
}

export default App;