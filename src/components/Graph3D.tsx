"use client";

import { useRef, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";

// Dynamic import - react-force-graph-3d uses WebGL
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-zinc-900">
      <div className="text-zinc-400">Loading 3D visualization...</div>
    </div>
  ),
});

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

interface GraphNode {
  id: string;
  name: string;
  description: string;
  timeframe: TimeFrame;
  sentiment: Sentiment;
  probability?: number;
  val: number; // Node size
  color: string;
}

interface GraphLink {
  source: string;
  target: string;
  color: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// Sentiment to color mapping (glowing colors)
const sentimentColors: Record<Sentiment, string> = {
  positive: "#00ff88", // Bright green
  neutral: "#6366f1", // Indigo
  negative: "#ff4444", // Red
};

// Convert tree to graph format
function treeToGraph(node: LifeNodeData, parentId?: string): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  // Determine node size based on depth (root is bigger)
  const isRoot = !parentId;
  const nodeSize = isRoot ? 20 : 10;

  nodes.push({
    id: node.id,
    name: node.title,
    description: node.description,
    timeframe: node.timeframe,
    sentiment: node.sentiment,
    probability: node.probability,
    val: nodeSize,
    color: sentimentColors[node.sentiment] || sentimentColors.neutral,
  });

  if (parentId) {
    links.push({
      source: parentId,
      target: node.id,
      color: sentimentColors[node.sentiment] || "#666",
    });
  }

  if (node.children) {
    node.children.forEach((child) => {
      const childGraph = treeToGraph(child, node.id);
      nodes.push(...childGraph.nodes);
      links.push(...childGraph.links);
    });
  }

  return { nodes, links };
}

interface Graph3DProps {
  treeData: LifeNodeData | null;
  onNodeClick?: (node: LifeNodeData) => void;
}

export default function Graph3D({ treeData, onNodeClick }: Graph3DProps) {
  const fgRef = useRef<any>();

  // Convert tree to graph format
  const graphData = useMemo<GraphData>(() => {
    if (!treeData) {
      return { nodes: [], links: [] };
    }
    return treeToGraph(treeData);
  }, [treeData]);

  // Auto-rotate and zoom to fit
  useEffect(() => {
    if (fgRef.current && graphData.nodes.length > 0) {
      // Zoom to fit
      setTimeout(() => {
        fgRef.current?.zoomToFit(400, 100);
      }, 500);

      // Enable auto-rotation
      const controls = fgRef.current.controls();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.5;
      }
    }
  }, [graphData]);

  // Custom node rendering with glow effect
  const nodeThreeObject = useCallback((node: any) => {
    // Using Three.js directly for custom rendering
    const THREE = require("three");

    // Create glowing sphere
    const geometry = new THREE.SphereGeometry(node.val / 2, 32, 32);
    const material = new THREE.MeshBasicMaterial({
      color: node.color,
      transparent: true,
      opacity: 0.9,
    });
    const sphere = new THREE.Mesh(geometry, material);

    // Add outer glow
    const glowGeometry = new THREE.SphereGeometry(node.val / 2 + 2, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: node.color,
      transparent: true,
      opacity: 0.2,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    sphere.add(glow);

    // Add text label
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = 512;
    canvas.height = 128;

    if (context) {
      context.fillStyle = "rgba(0, 0, 0, 0.7)";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.font = "bold 32px Arial";
      context.fillStyle = "#ffffff";
      context.textAlign = "center";
      context.textBaseline = "middle";

      // Truncate long text
      const text = node.name.length > 25 ? node.name.slice(0, 22) + "..." : node.name;
      context.fillText(text, canvas.width / 2, canvas.height / 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(40, 10, 1);
    sprite.position.set(0, node.val / 2 + 8, 0);
    sphere.add(sprite);

    return sphere;
  }, []);

  // Node click handler
  const handleNodeClick = useCallback((node: any) => {
    if (onNodeClick && node) {
      onNodeClick({
        id: node.id,
        title: node.name,
        description: node.description,
        timeframe: node.timeframe,
        sentiment: node.sentiment,
        probability: node.probability,
      });
    }

    // Zoom to node
    if (fgRef.current) {
      const distance = 150;
      const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
      fgRef.current.cameraPosition(
        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
        node,
        1000
      );
    }
  }, [onNodeClick]);

  if (!treeData) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-900 rounded-lg">
        <div className="text-zinc-500 text-center">
          <div className="text-4xl mb-4">🌐</div>
          <div>Generate a decision tree to see the 3D visualization</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-zinc-900 rounded-lg overflow-hidden">
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        linkColor={(link: any) => link.color}
        linkWidth={2}
        linkOpacity={0.6}
        linkCurvature={0.2}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleWidth={3}
        linkDirectionalParticleColor={(link: any) => link.color}
        backgroundColor="#09090b"
        onNodeClick={handleNodeClick}
        enableNodeDrag={false}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        warmupTicks={50}
        cooldownTicks={100}
      />
    </div>
  );
}
