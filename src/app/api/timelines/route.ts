import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import crypto from "crypto";
import mysql from "mysql2/promise";
import fs from "fs";

const TIDB_API_BASE = "https://serverless.tidbapi.com";

function generateId(length = 16): string {
  return crypto.randomBytes(length).toString("hex").slice(0, length);
}

// TiDB Cloud API uses HTTP Digest Authentication
async function tidbCloudFetch(
  method: string,
  path: string,
  body?: object
): Promise<Response> {
  const publicKey = process.env.TIDB_CLOUD_PUBLIC_KEY;
  const privateKey = process.env.TIDB_CLOUD_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    throw new Error("TiDB Cloud API keys not configured");
  }

  const url = `${TIDB_API_BASE}${path}`;

  // First request to get the WWW-Authenticate header
  const initialResponse = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (initialResponse.status !== 401) {
    return initialResponse;
  }

  const wwwAuth = initialResponse.headers.get("WWW-Authenticate");
  if (!wwwAuth) {
    throw new Error("No WWW-Authenticate header in response");
  }

  const realm = wwwAuth.match(/realm="([^"]+)"/)?.[1] || "";
  const nonce = wwwAuth.match(/nonce="([^"]+)"/)?.[1] || "";
  const qop = wwwAuth.match(/qop="([^"]+)"/)?.[1] || "auth";

  const nc = "00000001";
  const cnonce = crypto.randomBytes(8).toString("hex");

  const ha1 = crypto
    .createHash("md5")
    .update(`${publicKey}:${realm}:${privateKey}`)
    .digest("hex");

  const uri = path;
  const ha2 = crypto.createHash("md5").update(`${method}:${uri}`).digest("hex");

  const response = crypto
    .createHash("md5")
    .update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    .digest("hex");

  const authHeader = `Digest username="${publicKey}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;

  return fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

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

// GET - List timelines for a session
export async function GET(request: NextRequest) {
  try {
    const sessionId = request.headers.get("x-session-id");
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "Session ID required" },
        { status: 400 }
      );
    }

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      "SELECT id, name, branch_id, branch_host, branched_from_node, created_at FROM timelines WHERE session_id = ? ORDER BY created_at ASC",
      [sessionId]
    );
    connection.release();

    return NextResponse.json({ success: true, timelines: rows });
  } catch (error) {
    console.error("List timelines error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list timelines" },
      { status: 500 }
    );
  }
}

// POST - Create a new timeline (with optional TiDB branch)
export async function POST(request: NextRequest) {
  try {
    const {
      sessionId,
      name,
      treeData,
      parentTimelineId,
      branchedFromNode,
      createBranch,
    } = await request.json();

    if (!sessionId || !name || !treeData) {
      return NextResponse.json(
        { success: false, error: "sessionId, name, and treeData are required" },
        { status: 400 }
      );
    }

    const timelineId = generateId();
    let branchId = null;
    let branchHost = null;

    // Create TiDB branch if requested
    if (createBranch) {
      const clusterId = process.env.TIDB_CLOUD_CLUSTER_ID;
      if (clusterId) {
        try {
          const branchName = `timeline-${timelineId}`;
          const branchResponse = await tidbCloudFetch(
            "POST",
            `/v1beta1/clusters/${clusterId}/branches`,
            { displayName: branchName }
          );

          if (branchResponse.ok) {
            const branchData = await branchResponse.json();
            branchId = branchData.branchId || branchData.name;

            // Get branch details to find the host
            // The branch needs time to be ready, so we store the ID for now
            // In a production app, you'd poll until the branch is ACTIVE
            console.log("TiDB branch created:", branchId);

            // Try to get branch endpoints
            const detailsResponse = await tidbCloudFetch(
              "GET",
              `/v1beta1/clusters/${clusterId}/branches/${branchId}`
            );
            if (detailsResponse.ok) {
              const details = await detailsResponse.json();
              branchHost = details.endpoints?.[0]?.host;
              console.log("Branch host:", branchHost);
            }
          } else {
            const errorText = await branchResponse.text();
            console.warn("Failed to create TiDB branch:", errorText);
          }
        } catch (branchError) {
          console.warn("TiDB branch creation error:", branchError);
          // Continue without branch - fallback to main cluster
        }
      }
    }

    // Save timeline to database
    const connection = await pool.getConnection();
    await connection.execute(
      `INSERT INTO timelines (id, session_id, name, parent_timeline_id, branch_id, branch_host, tree_data, branched_from_node)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        timelineId,
        sessionId,
        name,
        parentTimelineId || null,
        branchId,
        branchHost,
        JSON.stringify(treeData),
        branchedFromNode || null,
      ]
    );
    connection.release();

    // If we have a branch host, copy the timelines table to the branch
    if (branchHost) {
      try {
        const branchConn = await getBranchConnection(branchHost);
        // The branch already has the data (copy-on-write), so we just need to add the new timeline
        await branchConn.execute(
          `INSERT INTO timelines (id, session_id, name, parent_timeline_id, branch_id, branch_host, tree_data, branched_from_node)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE tree_data = VALUES(tree_data)`,
          [
            timelineId,
            sessionId,
            name,
            parentTimelineId || null,
            branchId,
            branchHost,
            JSON.stringify(treeData),
            branchedFromNode || null,
          ]
        );
        await branchConn.end();
        console.log("Data saved to branch");
      } catch (branchDbError) {
        console.warn("Failed to write to branch (may still be initializing):", branchDbError);
      }
    }

    return NextResponse.json({
      success: true,
      timeline: {
        id: timelineId,
        name,
        branchId,
        branchHost,
        hasBranch: !!branchId,
      },
    });
  } catch (error) {
    console.error("Create timeline error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create timeline" },
      { status: 500 }
    );
  }
}
