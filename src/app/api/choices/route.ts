import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

interface ChoiceRow extends RowDataPacket {
  tree_decision: string;
  node_id: string;
  choice_count: number;
}

// GET - Fetch aggregate choice data for a decision
export async function GET(request: NextRequest) {
  const decision = request.nextUrl.searchParams.get("decision");

  if (!decision) {
    return NextResponse.json(
      { success: false, error: "Decision is required" },
      { status: 400 }
    );
  }

  try {
    const connection = await pool.getConnection();

    // Get all choices for this decision type
    const [rows] = await connection.execute<ChoiceRow[]>(
      `SELECT node_id, choice_count
       FROM choices
       WHERE tree_decision = ?`,
      [decision]
    );

    // Get total choices for this decision
    const [totalRows] = await connection.execute<RowDataPacket[]>(
      `SELECT SUM(choice_count) as total
       FROM choices
       WHERE tree_decision = ?`,
      [decision]
    );

    connection.release();

    const total = totalRows[0]?.total || 0;
    const choicesByNode: Record<string, { count: number; percentage: number }> = {};

    for (const row of rows) {
      choicesByNode[row.node_id] = {
        count: row.choice_count,
        percentage: total > 0 ? Math.round((row.choice_count / total) * 100) : 0,
      };
    }

    return NextResponse.json({
      success: true,
      total,
      choices: choicesByNode,
    });
  } catch (error: unknown) {
    // Return empty choices if table doesn't exist yet
    const err = error as { code?: string };
    if (err.code === "ER_NO_SUCH_TABLE") {
      return NextResponse.json({
        success: true,
        total: 0,
        choices: {},
      });
    }
    console.error("Failed to fetch choices:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch choices" },
      { status: 500 }
    );
  }
}

// POST - Record a choice (when user clicks to explore a path)
export async function POST(request: NextRequest) {
  try {
    const { decision, nodeId, nodeTitle } = await request.json();

    if (!decision || !nodeId) {
      return NextResponse.json(
        { success: false, error: "Decision and nodeId are required" },
        { status: 400 }
      );
    }

    // Normalize the decision to group similar trees together
    // Take first 100 chars to create a category
    const normalizedDecision = decision.substring(0, 100).toLowerCase().trim();

    const connection = await pool.getConnection();

    // Upsert: increment count if exists, insert if not
    await connection.execute<ResultSetHeader>(
      `INSERT INTO choices (tree_decision, node_id, node_title, choice_count)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         choice_count = choice_count + 1,
         node_title = VALUES(node_title)`,
      [normalizedDecision, nodeId, nodeTitle || nodeId]
    );

    connection.release();

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Failed to record choice:", error);
    return NextResponse.json(
      { success: false, error: "Failed to record choice" },
      { status: 500 }
    );
  }
}
