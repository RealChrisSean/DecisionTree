import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import mysql from "mysql2/promise";
import fs from "fs";

// Create a connection to a specific TiDB branch
async function getBranchConnection(branchHost: string) {
  return mysql.createConnection({
    host: branchHost,
    port: Number(process.env.TIDB_PORT) || 4000,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: {
      ca: fs.readFileSync(process.env.TIDB_SSL_CA || "/etc/ssl/cert.pem"),
    },
  });
}

// GET - Fetch a specific timeline (from branch if available)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // First get timeline metadata from main cluster
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      "SELECT * FROM timelines WHERE id = ?",
      [id]
    );
    connection.release();

    const timelines = rows as Array<{
      id: string;
      session_id: string;
      name: string;
      branch_id: string | null;
      branch_host: string | null;
      tree_data: string;
      branched_from_node: string | null;
      created_at: Date;
    }>;

    if (timelines.length === 0) {
      return NextResponse.json(
        { success: false, error: "Timeline not found" },
        { status: 404 }
      );
    }

    const timeline = timelines[0];
    let treeData = timeline.tree_data;
    let source = "main";

    // If timeline has a branch, try to fetch from branch for latest data
    if (timeline.branch_host) {
      try {
        const branchConn = await getBranchConnection(timeline.branch_host);
        const [branchRows] = await branchConn.execute(
          "SELECT tree_data FROM timelines WHERE id = ?",
          [id]
        );
        await branchConn.end();

        const branchTimelines = branchRows as Array<{ tree_data: string }>;
        if (branchTimelines.length > 0) {
          treeData = branchTimelines[0].tree_data;
          source = "branch";
        }
      } catch (branchError) {
        console.warn("Failed to fetch from branch, using main:", branchError);
        // Fallback to main cluster data
      }
    }

    return NextResponse.json({
      success: true,
      timeline: {
        id: timeline.id,
        name: timeline.name,
        branchId: timeline.branch_id,
        branchHost: timeline.branch_host,
        treeData: typeof treeData === "string" ? JSON.parse(treeData) : treeData,
        branchedFromNode: timeline.branched_from_node,
        createdAt: timeline.created_at,
        source,
      },
    });
  } catch (error) {
    console.error("Get timeline error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get timeline" },
      { status: 500 }
    );
  }
}

// PUT - Update a timeline's tree data (writes to branch if available)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { treeData } = await request.json();

    if (!treeData) {
      return NextResponse.json(
        { success: false, error: "treeData is required" },
        { status: 400 }
      );
    }

    // Get timeline to check for branch
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      "SELECT branch_host FROM timelines WHERE id = ?",
      [id]
    );

    const timelines = rows as Array<{ branch_host: string | null }>;
    if (timelines.length === 0) {
      connection.release();
      return NextResponse.json(
        { success: false, error: "Timeline not found" },
        { status: 404 }
      );
    }

    const branchHost = timelines[0].branch_host;
    let writtenTo = "main";

    // Update in main cluster
    await connection.execute(
      "UPDATE timelines SET tree_data = ? WHERE id = ?",
      [JSON.stringify(treeData), id]
    );
    connection.release();

    // If has branch, also update there
    if (branchHost) {
      try {
        const branchConn = await getBranchConnection(branchHost);
        await branchConn.execute(
          "UPDATE timelines SET tree_data = ? WHERE id = ?",
          [JSON.stringify(treeData), id]
        );
        await branchConn.end();
        writtenTo = "both";
      } catch (branchError) {
        console.warn("Failed to write to branch:", branchError);
        writtenTo = "main-only";
      }
    }

    return NextResponse.json({
      success: true,
      writtenTo,
    });
  } catch (error) {
    console.error("Update timeline error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update timeline" },
      { status: 500 }
    );
  }
}
