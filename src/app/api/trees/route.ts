import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

function generateId(length = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { decision, tree_data } = body;

    if (!decision || !tree_data) {
      return NextResponse.json(
        { success: false, error: "Missing decision or tree_data" },
        { status: 400 }
      );
    }

    const id = generateId();
    const connection = await pool.getConnection();

    await connection.execute(
      "INSERT INTO trees (id, decision, tree_data) VALUES (?, ?, ?)",
      [id, decision, JSON.stringify(tree_data)]
    );

    connection.release();

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("Save tree error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save tree" },
      { status: 500 }
    );
  }
}
