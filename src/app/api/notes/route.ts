import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

interface NoteRow extends RowDataPacket {
  id: string;
  session_id: string;
  tree_id: string;
  node_id: string;
  note_text: string;
  reaction: string | null;
  created_at: Date;
  updated_at: Date;
}

// Reaction options
const VALID_REACTIONS = [
  "excited",
  "hopeful",
  "worried",
  "uncertain",
  "confident",
  "scared",
  "neutral",
] as const;

// GET - Fetch notes for a tree/session
export async function GET(request: NextRequest) {
  const sessionId = request.headers.get("x-session-id");
  const treeId = request.nextUrl.searchParams.get("treeId");

  if (!sessionId) {
    return NextResponse.json(
      { success: false, error: "Session ID required" },
      { status: 400 }
    );
  }

  let connection;
  try {
    connection = await pool.getConnection();

    let query = "SELECT * FROM notes WHERE session_id = ?";
    const params: string[] = [sessionId];

    if (treeId) {
      query += " AND tree_id = ?";
      params.push(treeId);
    }

    query += " ORDER BY created_at DESC";

    const [rows] = await connection.execute<NoteRow[]>(query, params);

    // Group notes by node_id for easier access
    const notesByNode: Record<string, { note: string; reaction: string | null; id: string }> = {};
    for (const row of rows) {
      notesByNode[row.node_id] = {
        id: row.id,
        note: row.note_text,
        reaction: row.reaction,
      };
    }

    return NextResponse.json({
      success: true,
      notes: notesByNode,
    });
  } catch (error: unknown) {
    // Return empty notes if table doesn't exist yet
    const err = error as { code?: string };
    if (err.code === "ER_NO_SUCH_TABLE") {
      return NextResponse.json({
        success: true,
        notes: {},
      });
    }
    console.error("Failed to fetch notes:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch notes" },
      { status: 500 }
    );
  } finally {
    if (connection) connection.release();
  }
}

// POST - Create or update a note
export async function POST(request: NextRequest) {
  const sessionId = request.headers.get("x-session-id");

  if (!sessionId) {
    return NextResponse.json(
      { success: false, error: "Session ID required" },
      { status: 400 }
    );
  }

  try {
    const { treeId, nodeId, note, reaction } = await request.json();

    if (!nodeId) {
      return NextResponse.json(
        { success: false, error: "Node ID is required" },
        { status: 400 }
      );
    }

    // Validate reaction if provided
    if (reaction && !VALID_REACTIONS.includes(reaction)) {
      return NextResponse.json(
        { success: false, error: "Invalid reaction" },
        { status: 400 }
      );
    }

    // Limit note length
    if (note && note.length > 500) {
      return NextResponse.json(
        { success: false, error: "Note too long (max 500 chars)" },
        { status: 400 }
      );
    }

    const connection = await pool.getConnection();

    // Check if note already exists for this node
    const [existing] = await connection.execute<NoteRow[]>(
      "SELECT id FROM notes WHERE session_id = ? AND node_id = ?",
      [sessionId, nodeId]
    );

    const id = existing.length > 0 ? existing[0].id : crypto.randomUUID();
    const treeIdValue = treeId || "default";

    if (existing.length > 0) {
      // Update existing note
      await connection.execute(
        "UPDATE notes SET note_text = ?, reaction = ?, updated_at = NOW() WHERE id = ?",
        [note || "", reaction || null, id]
      );
    } else {
      // Create new note
      await connection.execute<ResultSetHeader>(
        "INSERT INTO notes (id, session_id, tree_id, node_id, note_text, reaction) VALUES (?, ?, ?, ?, ?, ?)",
        [id, sessionId, treeIdValue, nodeId, note || "", reaction || null]
      );
    }

    connection.release();

    return NextResponse.json({
      success: true,
      note: {
        id,
        nodeId,
        note: note || "",
        reaction: reaction || null,
      },
    });
  } catch (error) {
    console.error("Failed to save note:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save note" },
      { status: 500 }
    );
  }
}

// DELETE - Remove a note
export async function DELETE(request: NextRequest) {
  const sessionId = request.headers.get("x-session-id");
  const noteId = request.nextUrl.searchParams.get("id");

  if (!sessionId || !noteId) {
    return NextResponse.json(
      { success: false, error: "Session ID and note ID required" },
      { status: 400 }
    );
  }

  try {
    const connection = await pool.getConnection();

    await connection.execute(
      "DELETE FROM notes WHERE id = ? AND session_id = ?",
      [noteId, sessionId]
    );

    connection.release();

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Failed to delete note:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete note" },
      { status: 500 }
    );
  }
}
