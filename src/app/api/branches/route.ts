import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const TIDB_API_BASE = "https://serverless.tidbapi.com";

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
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (initialResponse.status !== 401) {
    return initialResponse;
  }

  // Parse WWW-Authenticate header for digest auth
  const wwwAuth = initialResponse.headers.get("WWW-Authenticate");
  if (!wwwAuth) {
    throw new Error("No WWW-Authenticate header in response");
  }

  // Extract digest auth parameters
  const realm = wwwAuth.match(/realm="([^"]+)"/)?.[1] || "";
  const nonce = wwwAuth.match(/nonce="([^"]+)"/)?.[1] || "";
  const qop = wwwAuth.match(/qop="([^"]+)"/)?.[1] || "auth";

  // Generate client nonce and response
  const nc = "00000001";
  const cnonce = crypto.randomBytes(8).toString("hex");

  // Calculate HA1: MD5(username:realm:password)
  const ha1 = crypto
    .createHash("md5")
    .update(`${publicKey}:${realm}:${privateKey}`)
    .digest("hex");

  // Calculate HA2: MD5(method:uri)
  const uri = path;
  const ha2 = crypto.createHash("md5").update(`${method}:${uri}`).digest("hex");

  // Calculate response: MD5(HA1:nonce:nc:cnonce:qop:HA2)
  const response = crypto
    .createHash("md5")
    .update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    .digest("hex");

  // Build Authorization header
  const authHeader = `Digest username="${publicKey}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;

  // Make authenticated request
  return fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// POST - Create a new branch
export async function POST(request: NextRequest) {
  try {
    const { branchName, parentTimestamp } = await request.json();
    const clusterId = process.env.TIDB_CLOUD_CLUSTER_ID;

    if (!clusterId) {
      return NextResponse.json(
        { success: false, error: "Cluster ID not configured" },
        { status: 500 }
      );
    }

    if (!branchName) {
      return NextResponse.json(
        { success: false, error: "Branch name is required" },
        { status: 400 }
      );
    }

    const payload: { displayName: string; parentTimestamp?: string } = {
      displayName: branchName,
    };

    // Optional: create branch from specific point in time
    if (parentTimestamp) {
      payload.parentTimestamp = parentTimestamp;
    }

    const response = await tidbCloudFetch(
      "POST",
      `/v1beta1/clusters/${clusterId}/branches`,
      payload
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("TiDB Cloud API error:", errorText);
      return NextResponse.json(
        { success: false, error: `Failed to create branch: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      branch: data,
    });
  } catch (error) {
    console.error("Create branch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create branch" },
      { status: 500 }
    );
  }
}

// GET - List all branches
export async function GET() {
  try {
    const clusterId = process.env.TIDB_CLOUD_CLUSTER_ID;

    if (!clusterId) {
      return NextResponse.json(
        { success: false, error: "Cluster ID not configured" },
        { status: 500 }
      );
    }

    const response = await tidbCloudFetch(
      "GET",
      `/v1beta1/clusters/${clusterId}/branches`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("TiDB Cloud API error:", errorText);
      return NextResponse.json(
        { success: false, error: `Failed to list branches: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      branches: data.branches || [],
    });
  } catch (error) {
    console.error("List branches error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list branches" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a branch
export async function DELETE(request: NextRequest) {
  try {
    const { branchId } = await request.json();
    const clusterId = process.env.TIDB_CLOUD_CLUSTER_ID;

    if (!clusterId) {
      return NextResponse.json(
        { success: false, error: "Cluster ID not configured" },
        { status: 500 }
      );
    }

    if (!branchId) {
      return NextResponse.json(
        { success: false, error: "Branch ID is required" },
        { status: 400 }
      );
    }

    const response = await tidbCloudFetch(
      "DELETE",
      `/v1beta1/clusters/${clusterId}/branches/${branchId}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("TiDB Cloud API error:", errorText);
      return NextResponse.json(
        { success: false, error: `Failed to delete branch: ${response.status}` },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Branch deleted successfully",
    });
  } catch (error) {
    console.error("Delete branch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete branch" },
      { status: 500 }
    );
  }
}
