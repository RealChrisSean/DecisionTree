"use client";

import { useCallback, useState, useEffect, useMemo } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
} from "@xyflow/react";
import dagre from "dagre";
import "@xyflow/react/dist/style.css";

type TimeFrame = "Now" | "1yr" | "3yr" | "5yr" | "10yr" | "20yr" | "30yr";
type Sentiment = "positive" | "neutral" | "negative";

interface LifeNodeData {
  id: string;
  title: string;
  description: string;
  timeframe: TimeFrame;
  sentiment: Sentiment;
  probability?: number;
  children?: LifeNodeData[];
}

interface Timeline {
  id: string;
  name: string;
  branch_id: string | null;
  branch_host: string | null;
  branched_from_node: string | null;
  created_at: string;
  alternative_tree_data?: LifeNodeData | null;
}

// Simple plain colors
const sentimentColors: Record<Sentiment, { border: string; bg: string }> = {
  positive: { border: "#4ade80", bg: "#f0fdf4" },
  neutral: { border: "#a1a1aa", bg: "#fafafa" },
  negative: { border: "#f87171", bg: "#fef2f2" },
};

const timeframeBadgeColors: Record<TimeFrame, { bg: string; text: string }> = {
  Now: { bg: "#fef3c7", text: "#b45309" },
  "1yr": { bg: "#e0e7ff", text: "#4338ca" },
  "3yr": { bg: "#dbeafe", text: "#1d4ed8" },
  "5yr": { bg: "#dbeafe", text: "#1d4ed8" },
  "10yr": { bg: "#f3e8ff", text: "#7c3aed" },
  "20yr": { bg: "#fef3c7", text: "#b45309" },
  "30yr": { bg: "#dcfce7", text: "#166534" },
};

const defaultBadge = { bg: "#f4f4f5", text: "#71717a" };

// Extended node data to include selection state and branch info
interface ExtendedNodeData extends LifeNodeData {
  isSelected?: boolean;
  isBranchPoint?: boolean;
  isAlternative?: boolean;
}

// Simple plain node component - now clickable
function SimpleNode({ data }: { data: ExtendedNodeData }) {
  const colors = sentimentColors[data.sentiment] || sentimentColors.neutral;
  const badge = timeframeBadgeColors[data.timeframe] || defaultBadge;

  // Purple styling for branch/alternative nodes
  const borderColor = data.isAlternative ? "#9333ea" : data.isBranchPoint ? "#7c3aed" : colors.border;
  const bgColor = data.isAlternative ? "#faf5ff" : colors.bg;

  return (
    <div
      style={{
        border: `2px solid ${borderColor}`,
        backgroundColor: bgColor,
        borderRadius: "8px",
        padding: "12px",
        minWidth: "160px",
        maxWidth: "220px",
        position: "relative",
        boxShadow: data.isSelected
          ? "0 0 0 3px rgba(147, 51, 234, 0.4), 0 4px 12px rgba(0,0,0,0.15)"
          : "0 2px 8px rgba(0,0,0,0.08)",
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#71717a", width: 8, height: 8 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "#71717a", width: 8, height: 8 }}
      />
      {/* Branch point indicator */}
      {data.isBranchPoint && (
        <span
          style={{
            position: "absolute",
            top: "-10px",
            left: "-10px",
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            backgroundColor: "#9333ea",
            color: "white",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          &#x21C4;
        </span>
      )}
      <span
        style={{
          position: "absolute",
          top: "-10px",
          right: "8px",
          fontSize: "11px",
          padding: "2px 8px",
          borderRadius: "9999px",
          backgroundColor: badge.bg,
          color: badge.text,
          fontWeight: 500,
        }}
      >
        {data.timeframe}
      </span>
      {data.probability !== undefined && (
        <span
          style={{
            position: "absolute",
            top: "-10px",
            left: data.isBranchPoint ? "14px" : "8px",
            fontSize: "11px",
            padding: "2px 8px",
            borderRadius: "9999px",
            backgroundColor: "#f4f4f5",
            color: "#71717a",
            fontWeight: 500,
          }}
        >
          {data.probability}%
        </span>
      )}
      <p
        style={{
          fontWeight: 600,
          fontSize: "13px",
          marginBottom: "4px",
          color: "#18181b",
        }}
      >
        {data.title}
      </p>
      <p style={{ fontSize: "11px", color: "#71717a", margin: 0 }}>
        {data.description}
      </p>
    </div>
  );
}

const nodeTypes = { lifeNode: SimpleNode };

// Left-to-right layout function using dagre
function getLayoutedElements(
  nodes: Node[],
  edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 100 }); // TB = Top to Bottom

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 200, height: 100 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 100,
        y: nodeWithPosition.y - 50,
      },
    };
  });

  // Simple gray edges
  const styledEdges = edges.map((edge) => ({
    ...edge,
    style: { stroke: '#a1a1aa', strokeWidth: 2 },
  }));

  return { nodes: layoutedNodes, edges: styledEdges };
}

// Convert tree to ReactFlow format
function treeToFlow(
  node: LifeNodeData,
  parentId?: string
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  nodes.push({
    id: node.id,
    type: "lifeNode",
    position: { x: 0, y: 0 },
    data: node,
  });

  if (parentId) {
    edges.push({
      id: `${parentId}-${node.id}`,
      source: parentId,
      target: node.id,
      style: { stroke: "#a1a1aa", strokeWidth: 2 },
    });
  }

  if (node.children) {
    node.children.forEach((child) => {
      const childFlow = treeToFlow(child, node.id);
      nodes.push(...childFlow.nodes);
      edges.push(...childFlow.edges);
    });
  }

  return { nodes, edges };
}

// Generate session ID
function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sessionId = localStorage.getItem("tidb-demo-session");
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem("tidb-demo-session", sessionId);
  }
  return sessionId;
}

export default function LifeTree() {
  const [decision, setDecision] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<LifeNodeData | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // TiDB Branching state
  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [currentTimeline, setCurrentTimeline] = useState<Timeline | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [showBranchModal, setShowBranchModal] = useState(false);

  // Node selection for "Explore Alternative"
  const [selectedNode, setSelectedNode] = useState<LifeNodeData | null>(null);
  const [showExploreModal, setShowExploreModal] = useState(false);
  const [isExploringAlternative, setIsExploringAlternative] = useState(false);

  // Track branch points (nodes that have alternative branches)
  const [branchPoints, setBranchPoints] = useState<Set<string>>(new Set());

  // Fullscreen mode
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Load timelines on mount
  useEffect(() => {
    loadTimelines();
  }, []);

  const loadTimelines = async () => {
    try {
      const sessionId = getSessionId();
      const response = await fetch("/api/timelines", {
        headers: { "x-session-id": sessionId },
      });
      const result = await response.json();
      if (result.success) {
        setTimelines(result.timelines);
      }
    } catch (err) {
      console.error("Failed to load timelines:", err);
    }
  };

  // Load a specific timeline's tree data
  const loadTimeline = async (timeline: Timeline) => {
    try {
      const response = await fetch(`/api/timelines/${timeline.id}`);
      const result = await response.json();
      if (result.success && result.timeline.treeData) {
        setTreeData(result.timeline.treeData);
        setCurrentTimeline({
          ...timeline,
          branched_from_node: result.timeline.branched_from_node,
        });

        // If this is a branch timeline, use the branch-aware rendering
        if (timeline.branch_id && result.timeline.branched_from_node) {
          const { nodes: flowNodes, edges: flowEdges } = treeToFlowWithBranchInfo(
            result.timeline.treeData,
            undefined,
            branchPoints,
            result.timeline.branched_from_node
          );
          const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            flowNodes,
            flowEdges
          );
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
        } else {
          // Regular timeline - use normal rendering
          const { nodes: flowNodes, edges: flowEdges } = treeToFlow(result.timeline.treeData);
          const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            flowNodes,
            flowEdges
          );
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
        }
      }
    } catch (err) {
      console.error("Failed to load timeline:", err);
      setError("Failed to load timeline");
    }
  };

  const handleGenerate = useCallback(async () => {
    if (!decision.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to generate");
      }

      setTreeData(result.data);

      // Convert to ReactFlow format with top-down layout
      const { nodes: flowNodes, edges: flowEdges } = treeToFlow(result.data);
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        flowNodes,
        flowEdges
      );
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }, [decision, setNodes, setEdges]);

  // Save to TiDB (main cluster)
  const handleSaveToMain = async () => {
    if (!treeData) return;

    setIsSaving(true);
    try {
      const sessionId = getSessionId();
      const response = await fetch("/api/timelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          name: `Main: ${decision.slice(0, 50)}...`,
          treeData,
          createBranch: false,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setCurrentTimeline(result.timeline);
        await loadTimelines();
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  // Create a TiDB branch for "what-if" exploration
  const handleCreateBranch = async () => {
    if (!treeData || !branchName.trim()) return;

    setIsCreatingBranch(true);
    try {
      const sessionId = getSessionId();
      const response = await fetch("/api/timelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          name: branchName,
          treeData,
          createBranch: true, // This triggers TiDB branch creation!
          parentTimelineId: currentTimeline?.id,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setCurrentTimeline(result.timeline);
        setShowBranchModal(false);
        setBranchName("");
        await loadTimelines();
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create branch");
    } finally {
      setIsCreatingBranch(false);
    }
  };

  // Handle node click - show explore alternative option
  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    const nodeData = node.data as LifeNodeData;
    // Don't allow branching from the root node
    if (nodeData.id === "root") return;

    setSelectedNode(nodeData);
    setShowExploreModal(true);
  }, []);

  // Find node in tree by ID
  const findNodeById = (tree: LifeNodeData, id: string): LifeNodeData | null => {
    if (tree.id === id) return tree;
    if (tree.children) {
      for (const child of tree.children) {
        const found = findNodeById(child, id);
        if (found) return found;
      }
    }
    return null;
  };

  // Replace subtree at a specific node ID
  const replaceSubtreeAtNode = (
    tree: LifeNodeData,
    nodeId: string,
    newChildren: LifeNodeData[]
  ): LifeNodeData => {
    if (tree.id === nodeId) {
      return { ...tree, children: newChildren };
    }
    if (tree.children) {
      return {
        ...tree,
        children: tree.children.map((child) =>
          replaceSubtreeAtNode(child, nodeId, newChildren)
        ),
      };
    }
    return tree;
  };

  // "Explore Alternative" - Creates TiDB branch and regenerates subtree
  const handleExploreAlternative = async () => {
    if (!selectedNode || !treeData || !decision) return;

    setIsExploringAlternative(true);
    setError(null);

    try {
      // Step 1: Generate alternative subtree using AI
      const generateResponse = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: `What if "${selectedNode.title}" had a different outcome? Original decision: ${decision}`,
          branchFrom: {
            title: selectedNode.title,
            description: selectedNode.description,
            timeframe: selectedNode.timeframe,
          },
        }),
      });

      const generateResult = await generateResponse.json();
      if (!generateResult.success) {
        throw new Error(generateResult.error || "Failed to generate alternative");
      }

      // Step 2: Build new tree with alternative subtree
      const alternativeChildren = generateResult.data.children || [];
      const newTree = replaceSubtreeAtNode(
        JSON.parse(JSON.stringify(treeData)), // Deep clone
        selectedNode.id,
        alternativeChildren
      );

      // Step 3: Create TiDB branch with the alternative tree
      const sessionId = getSessionId();
      const branchResponse = await fetch("/api/timelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          name: `Alt: ${selectedNode.title.slice(0, 30)}...`,
          treeData: newTree,
          createBranch: true,
          branchedFromNode: selectedNode.id,
        }),
      });

      const branchResult = await branchResponse.json();
      if (!branchResult.success) {
        throw new Error(branchResult.error || "Failed to create branch");
      }

      // Step 4: Mark this node as a branch point
      setBranchPoints((prev) => new Set([...prev, selectedNode.id]));

      // Step 5: Switch to the new branch and display the alternative tree
      setCurrentTimeline(branchResult.timeline);
      setTreeData(newTree);

      // Update ReactFlow with new tree (mark alternative nodes)
      const { nodes: flowNodes, edges: flowEdges } = treeToFlowWithBranchInfo(
        newTree,
        undefined,
        branchPoints,
        selectedNode.id
      );
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        flowNodes,
        flowEdges
      );
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);

      await loadTimelines();
      setShowExploreModal(false);
      setSelectedNode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to explore alternative");
    } finally {
      setIsExploringAlternative(false);
    }
  };

  // Convert tree to ReactFlow format with branch info
  function treeToFlowWithBranchInfo(
    node: LifeNodeData,
    parentId?: string,
    branchPointIds?: Set<string>,
    alternativeFromId?: string,
    inAlternativeSubtree?: boolean
  ): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const isBranchPoint = branchPointIds?.has(node.id) || false;
    // We're in an alternative subtree if:
    // 1. We've been passed the flag (for descendants)
    // 2. OR our parent is the branch point
    const isChildOfBranchPoint = parentId === alternativeFromId;
    const isInAlternativeSubtree = inAlternativeSubtree || isChildOfBranchPoint;

    nodes.push({
      id: node.id,
      type: "lifeNode",
      position: { x: 0, y: 0 },
      data: {
        ...node,
        isBranchPoint,
        isAlternative: isInAlternativeSubtree,
      },
    });

    if (parentId) {
      edges.push({
        id: `${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        style: {
          stroke: isInAlternativeSubtree ? "#9333ea" : "#a1a1aa",
          strokeWidth: 2,
        },
        animated: isInAlternativeSubtree, // Animated edges for alternative paths
      });
    }

    if (node.children) {
      node.children.forEach((child) => {
        const childFlow = treeToFlowWithBranchInfo(
          child,
          node.id,
          branchPointIds,
          alternativeFromId,
          isInAlternativeSubtree // Pass the flag to children
        );
        nodes.push(...childFlow.nodes);
        edges.push(...childFlow.edges);
      });
    }

    return { nodes, edges };
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/imgs/TiDB Logo.png"
              alt="TiDB"
              className="h-8 w-auto"
            />
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">
                Decision Tree
              </h1>
              <p className="text-sm text-zinc-500">
                Powered by TiDB Serverless Branching
              </p>
            </div>
          </div>

          {/* Current Branch Indicator */}
          {currentTimeline && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
              currentTimeline.branch_id
                ? "bg-purple-50 border border-purple-200"
                : "bg-emerald-50 border border-emerald-200"
            }`}>
              <div className={`w-2 h-2 rounded-full animate-pulse ${
                currentTimeline.branch_id ? "bg-purple-500" : "bg-emerald-500"
              }`} />
              <span className={`text-sm ${
                currentTimeline.branch_id ? "text-purple-700" : "text-emerald-700"
              }`}>
                {currentTimeline.branch_id ? "Alternative: " : "Main: "}
                {currentTimeline.name.slice(0, 30)}
              </span>
              {currentTimeline.branch_id && (
                <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">
                  TiDB Branch
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar - Timelines/Branches */}
        <aside className="w-64 border-r border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Saved Timelines
          </h2>

          {timelines.length === 0 ? (
            <p className="text-sm text-zinc-500 italic">No timelines yet</p>
          ) : (
            <ul className="space-y-2">
              {timelines.map((timeline) => (
                <li
                  key={timeline.id}
                  className={`p-2 rounded-lg cursor-pointer transition-colors ${
                    currentTimeline?.id === timeline.id
                      ? "bg-[#E8361E]/10 border border-[#E8361E]/30"
                      : "hover:bg-zinc-100"
                  }`}
                  onClick={() => loadTimeline(timeline)}
                >
                  <div className="flex items-center gap-2">
                    {timeline.branch_id ? (
                      <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
                      </svg>
                    )}
                    <span className="text-sm truncate">{timeline.name}</span>
                  </div>
                  {timeline.branch_id && (
                    <span className="text-xs text-purple-600 ml-6">TiDB Branch</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 pt-4 border-t border-zinc-200">
            <p className="text-xs text-zinc-500">
              Each branch creates an isolated TiDB database copy for exploring alternate scenarios.
            </p>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          {/* Input Section */}
          <div className="max-w-2xl mx-auto mb-6">
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              Describe your decision
            </label>
            <textarea
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              placeholder="e.g., Should I take the job at Company A ($150k) or Company B ($180k with stock options)?"
              className="w-full h-24 p-4 border border-zinc-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#E8361E] focus:border-transparent"
            />
            <div className="flex gap-3 mt-3">
              <button
                onClick={handleGenerate}
                disabled={isLoading || !decision.trim()}
                className="flex-1 py-2.5 px-4 bg-[#E8361E] text-white font-medium rounded-lg hover:bg-[#c92d18] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? "Generating..." : "Generate Tree"}
              </button>

              {treeData && (
                <>
                  <button
                    onClick={handleSaveToMain}
                    disabled={isSaving}
                    className="py-2.5 px-4 bg-zinc-800 text-white font-medium rounded-lg hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                  >
                    {isSaving ? "Saving..." : "Save to Main"}
                  </button>
                  <button
                    onClick={() => setShowBranchModal(true)}
                    className="py-2.5 px-4 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Create Branch
                  </button>
                </>
              )}
            </div>

            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Tree Visualization */}
          {treeData && (
            <div className={`${
              isFullscreen
                ? "fixed inset-0 z-50 bg-white"
                : "border border-zinc-200 rounded-lg bg-white overflow-hidden"
            }`}>
              {/* Header with fullscreen controls */}
              <div className={`flex items-center justify-between px-4 py-2 border-b ${
                currentTimeline?.branch_id
                  ? "bg-purple-50 border-purple-200"
                  : "bg-zinc-50 border-zinc-200"
              }`}>
                <div className="flex items-center gap-2">
                  {currentTimeline?.branch_id ? (
                    <>
                      <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span className="text-sm text-purple-700">
                        Viewing alternative timeline - nodes in purple show different outcomes
                      </span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                      </svg>
                      <span className="text-sm text-zinc-500">
                        Click any node (except root) to explore alternatives
                      </span>
                    </>
                  )}
                </div>

                {/* Fullscreen toggle button */}
                <div className="flex items-center gap-2">
                  {isFullscreen && (
                    <span className="text-xs text-zinc-400">Press ESC to exit</span>
                  )}
                  <button
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className={`p-2 rounded-lg transition-colors ${
                      isFullscreen
                        ? "bg-zinc-200 hover:bg-zinc-300 text-zinc-700"
                        : "hover:bg-zinc-100 text-zinc-500"
                    }`}
                    title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  >
                    {isFullscreen ? (
                      // X icon for close
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      // Expand icon
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className={isFullscreen ? "h-[calc(100vh-52px)]" : "h-[600px]"}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onNodeClick={handleNodeClick}
                  nodeTypes={nodeTypes}
                  fitView={false}
                  defaultViewport={{ x: 150, y: 10, zoom: 1 }}
                  minZoom={0.3}
                  maxZoom={1.5}
                >
                  <Background color="#e4e4e7" gap={20} />
                  <Controls />
                </ReactFlow>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!treeData && !isLoading && (
            <div className="text-center py-16 text-zinc-500">
              <div className="w-16 h-16 mx-auto mb-4 bg-zinc-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-lg font-medium">No decision tree yet</p>
              <p className="text-sm">Enter a decision above to generate your tree</p>
            </div>
          )}
        </main>
      </div>

      {/* Branch Modal */}
      {showBranchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold text-zinc-900 mb-2">
              Create TiDB Branch
            </h3>
            <p className="text-sm text-zinc-500 mb-4">
              This creates an isolated database branch to explore a &quot;what-if&quot; scenario without affecting your main timeline.
            </p>
            <input
              type="text"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="e.g., What if I negotiate higher salary?"
              className="w-full p-3 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowBranchModal(false)}
                className="flex-1 py-2 px-4 border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBranch}
                disabled={isCreatingBranch || !branchName.trim()}
                className="flex-1 py-2 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {isCreatingBranch ? "Creating..." : "Create Branch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explore Alternative Modal */}
      {showExploreModal && selectedNode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">
                  Explore Alternative
                </h3>
                <p className="text-sm text-zinc-500">
                  Create a TiDB branch with different outcomes
                </p>
              </div>
            </div>

            <div className="bg-zinc-50 rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-zinc-700 mb-1">Selected Node:</p>
              <p className="text-base font-semibold text-zinc-900">{selectedNode.title}</p>
              <p className="text-sm text-zinc-500">{selectedNode.description}</p>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-purple-700">
                <strong>What happens:</strong> This will create a TiDB database branch and use AI to regenerate alternative outcomes from this point. You&apos;ll see a completely different future path!
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowExploreModal(false);
                  setSelectedNode(null);
                }}
                className="flex-1 py-2.5 px-4 border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExploreAlternative}
                disabled={isExploringAlternative}
                className="flex-1 py-2.5 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {isExploringAlternative ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating Branch...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Explore Alternative
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white px-6 py-3 text-center text-sm text-zinc-500">
        Powered by TiDB Serverless Branching + Claude AI
      </footer>
    </div>
  );
}
