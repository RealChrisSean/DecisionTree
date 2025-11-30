import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";

interface TreeRow extends RowDataPacket {
  id: string;
  decision: string;
  tree_data: string;
  created_at: Date;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const connection = await pool.getConnection();

    const [rows] = await connection.execute<TreeRow[]>(
      "SELECT * FROM trees WHERE id = ?",
      [id]
    );

    connection.release();

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Tree not found" },
        { status: 404 }
      );
    }

    const tree = rows[0];
    return NextResponse.json({
      success: true,
      data: {
        id: tree.id,
        decision: tree.decision,
        tree_data: typeof tree.tree_data === "string"
          ? JSON.parse(tree.tree_data)
          : tree.tree_data,
        created_at: tree.created_at,
      },
    });
  } catch (error) {
    console.error("Fetch tree error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch tree" },
      { status: 500 }
    );
  }
}
