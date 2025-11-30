import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

interface HistoryRow extends RowDataPacket {
  id: string;
  session_id: string;
  decision: string;
  tree_data: string;
  created_at: Date;
}

// GET - Fetch decision history for a session
export async function GET(request: NextRequest) {
  const sessionId = request.headers.get("x-session-id");

  if (!sessionId) {
    return NextResponse.json(
      { success: false, error: "Session ID required" },
      { status: 400 }
    );
  }

  try {
    const connection = await pool.getConnection();

    const [rows] = await connection.execute<HistoryRow[]>(
      `SELECT id, decision, tree_data, created_at
       FROM decision_history
       WHERE session_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [sessionId]
    );

    connection.release();

    const history = rows.map((row) => ({
      id: row.id,
      decision: row.decision,
      treeData: typeof row.tree_data === "string" ? JSON.parse(row.tree_data) : row.tree_data,
      createdAt: row.created_at,
    }));

    return NextResponse.json({
      success: true,
      history,
    });
  } catch (error: unknown) {
    // Return empty history if table doesn't exist yet
    const err = error as { code?: string };
    if (err.code === "ER_NO_SUCH_TABLE") {
      return NextResponse.json({
        success: true,
        history: [],
      });
    }
    console.error("Failed to fetch history:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}

// POST - Save a decision to history
export async function POST(request: NextRequest) {
  const sessionId = request.headers.get("x-session-id");

  if (!sessionId) {
    return NextResponse.json(
      { success: false, error: "Session ID required" },
      { status: 400 }
    );
  }

  try {
    const { decision, treeData } = await request.json();

    if (!decision || !treeData) {
      return NextResponse.json(
        { success: false, error: "Decision and tree data are required" },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID().substring(0, 16);
    const connection = await pool.getConnection();

    // Check if this exact decision already exists for this session
    const [existing] = await connection.execute<HistoryRow[]>(
      `SELECT id FROM decision_history
       WHERE session_id = ? AND decision = ?
       LIMIT 1`,
      [sessionId, decision]
    );

    if (existing.length > 0) {
      // Update existing entry
      await connection.execute(
        `UPDATE decision_history
         SET tree_data = ?, created_at = NOW()
         WHERE id = ?`,
        [JSON.stringify(treeData), existing[0].id]
      );
      connection.release();

      return NextResponse.json({
        success: true,
        id: existing[0].id,
        updated: true,
      });
    }

    // Insert new entry
    await connection.execute<ResultSetHeader>(
      `INSERT INTO decision_history (id, session_id, decision, tree_data)
       VALUES (?, ?, ?, ?)`,
      [id, sessionId, decision, JSON.stringify(treeData)]
    );

    connection.release();

    return NextResponse.json({
      success: true,
      id,
      updated: false,
    });
  } catch (error) {
    console.error("Failed to save history:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save history" },
      { status: 500 }
    );
  }
}

// DELETE - Remove a decision from history
export async function DELETE(request: NextRequest) {
  const sessionId = request.headers.get("x-session-id");
  const historyId = request.nextUrl.searchParams.get("id");

  if (!sessionId || !historyId) {
    return NextResponse.json(
      { success: false, error: "Session ID and history ID required" },
      { status: 400 }
    );
  }

  try {
    const connection = await pool.getConnection();

    await connection.execute(
      `DELETE FROM decision_history
       WHERE id = ? AND session_id = ?`,
      [historyId, sessionId]
    );

    connection.release();

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Failed to delete history:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete history" },
      { status: 500 }
    );
  }
}
