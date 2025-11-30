"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type TimeFrame = "5yr" | "10yr" | "20yr" | "30yr";
type Sentiment = "positive" | "neutral" | "negative";

interface LifeNodeData {
  id: string;
  title: string;
  description: string;
  timeframe: TimeFrame;
  sentiment: Sentiment;
  children?: LifeNodeData[];
}

const sentimentColors: Record<Sentiment, { border: string; bg: string }> = {
  positive: { border: "#4ade80", bg: "#f0fdf4" },
  neutral: { border: "#a1a1aa", bg: "#fafafa" },
  negative: { border: "#f87171", bg: "#fef2f2" },
};

const timeframeBadgeColors: Record<TimeFrame, { bg: string; text: string }> = {
  "5yr": { bg: "#dbeafe", text: "#1d4ed8" },
  "10yr": { bg: "#f3e8ff", text: "#7c3aed" },
  "20yr": { bg: "#fef3c7", text: "#b45309" },
  "30yr": { bg: "#dcfce7", text: "#166534" },
};

function LifePathNode({ data }: { data: LifeNodeData & { onSelect: (node: LifeNodeData, e: React.MouseEvent) => void } }) {
  const colors = sentimentColors[data.sentiment];
  const badge = timeframeBadgeColors[data.timeframe];
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onClick={(e) => data.onSelect(data, e)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        border: `2px solid ${isHovered ? "#3b82f6" : colors.border}`,
        backgroundColor: colors.bg,
        borderRadius: "8px",
        padding: "16px",
        minWidth: "200px",
        maxWidth: "260px",
        cursor: "pointer",
        position: "relative",
        transform: isHovered ? "scale(1.03)" : "scale(1)",
        boxShadow: isHovered ? "0 8px 25px rgba(59, 130, 246, 0.25)" : "0 2px 8px rgba(0,0,0,0.08)",
        transition: "all 0.15s ease-out",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "#71717a", width: 8, height: 8 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "#71717a", width: 8, height: 8 }}
      />
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
        {data.timeframe === "5yr" ? "5 years" : data.timeframe === "10yr" ? "10 years" : data.timeframe === "20yr" ? "20 years" : "30 years"}
      </span>
      <h3 style={{ fontWeight: 600, color: "#18181b", marginTop: "4px", fontSize: "14px" }}>
        {data.title}
      </h3>
      <p style={{ fontSize: "12px", color: "#52525b", marginTop: "4px", lineHeight: 1.4 }}>
        {data.description}
      </p>
    </div>
  );
}

const nodeTypes = {
  lifePath: LifePathNode,
};

function treeToFlow(
  tree: LifeNodeData,
  onSelect: (node: LifeNodeData, e: React.MouseEvent) => void
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  function traverse(node: LifeNodeData, parentId?: string) {
    nodes.push({
      id: node.id,
      type: "lifePath",
      data: { ...node, onSelect },
      position: { x: 0, y: 0 },
    });

    if (parentId) {
      edges.push({
        id: `${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        type: "default",
        animated: false,
        style: { stroke: "#71717a", strokeWidth: 3 },
      });
    }

    if (node.children) {
      node.children.forEach((child) => traverse(child, node.id));
    }
  }

  traverse(tree);
  return { nodes, edges };
}

function getLayoutedElements(nodes: Node[], edges: Edge[], direction = "LR") {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 60, ranksep: 100 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 260, height: 120 });
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
        x: nodeWithPosition.x - 130,
        y: nodeWithPosition.y - 50,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

const timeframeBadge: Record<TimeFrame, string> = {
  "5yr": "bg-blue-100 text-blue-700",
  "10yr": "bg-purple-100 text-purple-700",
  "20yr": "bg-amber-100 text-amber-700",
  "30yr": "bg-green-100 text-green-700",
};

export default function SharedTree({ treeData }: { treeData: LifeNodeData }) {
  const [selectedNode, setSelectedNode] = useState<LifeNodeData | null>(null);
  const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 });
  const [panelSize, setPanelSize] = useState({ width: 384, height: 280 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const MIN_WIDTH = 280;
  const MAX_WIDTH = 384;
  const MIN_HEIGHT = 200;
  const MAX_HEIGHT = 280;

  const handlePanelMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    if ((e.target as HTMLElement).dataset.resize) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - panelPosition.x,
      y: e.clientY - panelPosition.y,
    });
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    setDragOffset({
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      let newX = e.clientX - dragOffset.x;
      let newY = e.clientY - dragOffset.y;
      // Keep on screen
      newX = Math.max(0, Math.min(newX, window.innerWidth - panelSize.width));
      newY = Math.max(0, Math.min(newY, window.innerHeight - panelSize.height));
      setPanelPosition({ x: newX, y: newY });
    } else if (isResizing) {
      const deltaX = dragOffset.x - e.clientX;
      const deltaY = dragOffset.y - e.clientY;

      setPanelSize(prev => ({
        width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, prev.width + deltaX)),
        height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, prev.height + deltaY)),
      }));

      setDragOffset({ x: e.clientX, y: e.clientY });
    }
  }, [isDragging, isResizing, dragOffset, panelSize]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  const handleNodeSelect = useCallback((node: LifeNodeData, e: React.MouseEvent) => {
    setSelectedNode(node);
    // Position panel near the click, offset to the right so it doesn't cover the node
    const offsetX = 280; // offset to the right of the node
    const offsetY = -50; // slightly above center
    let x = e.clientX + offsetX;
    let y = e.clientY + offsetY;
    // Keep panel on screen
    if (x + panelSize.width > window.innerWidth - 16) {
      x = e.clientX - panelSize.width - 40; // flip to left side
    }
    if (y + panelSize.height > window.innerHeight - 16) {
      y = window.innerHeight - panelSize.height - 16;
    }
    if (y < 16) {
      y = 16;
    }
    setPanelPosition({ x, y });
  }, [panelSize]);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const { nodes, edges } = treeToFlow(treeData, handleNodeSelect);
    return getLayoutedElements(nodes, edges);
  }, [treeData, handleNodeSelect]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className="w-full">
      <div className="h-[85vh] w-full rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-50 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={1.5}
        >
          <Background color="#e4e4e7" gap={20} />
          <Controls />
        </ReactFlow>

        {/* CTA inside the tree container */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-lg"
          >
            Create your own decision tree
          </a>
        </div>
      </div>

      {selectedNode && (
        <div
          onMouseDown={handlePanelMouseDown}
          style={{
            left: panelPosition.x,
            top: panelPosition.y,
            width: panelSize.width,
            height: panelSize.height,
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
          className="fixed bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6 z-50 select-none overflow-auto"
        >
          {/* Resize handle */}
          <div
            data-resize="true"
            onMouseDown={handleResizeMouseDown}
            className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize"
            style={{
              background: 'linear-gradient(135deg, #a1a1aa 2px, transparent 2px, transparent 4px, #a1a1aa 4px, #a1a1aa 6px, transparent 6px)',
              backgroundSize: '6px 6px',
              borderTopLeftRadius: '12px',
            }}
          />
          <div className="flex justify-between items-start mb-3">
            <span className={`text-xs px-2 py-1 rounded-full ${timeframeBadge[selectedNode.timeframe]}`}>
              {selectedNode.timeframe === "5yr" ? "5 years" : selectedNode.timeframe === "10yr" ? "10 years" : selectedNode.timeframe === "20yr" ? "20 years" : "30 years"}
            </span>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              ✕
            </button>
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {selectedNode.title}
          </h3>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            {selectedNode.description}
          </p>
          {selectedNode.children && (
            <p className="text-sm text-zinc-500 mt-4">
              {selectedNode.children.length} possible outcome{selectedNode.children.length > 1 ? "s" : ""}
            </p>
          )}
          <a
            href={`/?context=${encodeURIComponent(`Starting from: ${selectedNode.title}. ${selectedNode.description}`)}`}
            className="mt-4 block w-full py-2 text-sm font-medium text-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
          >
            Fork from here
          </a>
        </div>
      )}
    </div>
  );
}
