import { notFound } from "next/navigation";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import SharedTree from "./SharedTree";

interface TreeRow extends RowDataPacket {
  id: string;
  decision: string;
  tree_data: string;
  created_at: Date;
}

async function getTree(id: string) {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute<TreeRow[]>(
      "SELECT * FROM trees WHERE id = ?",
      [id]
    );
    connection.release();

    if (rows.length === 0) return null;

    const tree = rows[0];
    return {
      id: tree.id,
      decision: tree.decision,
      tree_data:
        typeof tree.tree_data === "string"
          ? JSON.parse(tree.tree_data)
          : tree.tree_data,
      created_at: tree.created_at,
    };
  } catch {
    return null;
  }
}

function countPaths(node: { children?: unknown[] }): number {
  if (!node.children || node.children.length === 0) return 1;
  return node.children.reduce((sum: number, child) => sum + countPaths(child as { children?: unknown[] }), 0);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tree = await getTree(id);

  if (!tree) {
    return { title: "Tree not found" };
  }

  const pathCount = countPaths(tree.tree_data);
  const title = tree.tree_data?.title || tree.decision;
  const description = tree.tree_data?.description || `Explore parallel futures for: "${tree.decision}"`;

  // Build OG image URL with query params
  const ogImageUrl = `/api/og/${id}?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}&paths=${pathCount}&timeframe=30yr`;

  return {
    title: `${tree.decision} | TiDB Decision Tree`,
    description: `Explore decision outcomes: "${tree.decision}"`,
    openGraph: {
      title: `${tree.decision} | TiDB Decision Tree`,
      description: `Explore decision outcomes: "${tree.decision}"`,
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `Life path visualization for: ${tree.decision}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${tree.decision} | TiDB Decision Tree`,
      description: `Explore decision outcomes: "${tree.decision}"`,
      images: [ogImageUrl],
    },
  };
}

export default async function SharedTreePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tree = await getTree(id);

  if (!tree) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <a href="/" className="text-xl font-bold text-zinc-900 dark:text-zinc-100 hover:text-blue-600 transition-colors">
              TiDB Decision Tree
            </a>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Shared life path exploration
            </p>
          </div>
          <a
            href="/"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Create yours
          </a>
        </div>
      </header>
      <main className="w-[90%] mx-auto py-8">
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Someone explored: <strong>&quot;{tree.decision}&quot;</strong>
          </p>
        </div>
        <SharedTree treeData={tree.tree_data} />
      </main>
    </div>
  );
}
