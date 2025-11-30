import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function POST() {
  try {
    const connection = await pool.getConnection();

    // Main trees table (for sharing)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS trees (
        id VARCHAR(8) PRIMARY KEY,
        decision TEXT NOT NULL,
        tree_data JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Timelines table - tracks user sessions and their branches
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS timelines (
        id VARCHAR(32) PRIMARY KEY,
        session_id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        parent_timeline_id VARCHAR(32),
        branch_id VARCHAR(64),
        branch_host VARCHAR(255),
        tree_data JSON NOT NULL,
        branched_from_node VARCHAR(64),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_session (session_id)
      )
    `);

    // Notes table - stores user notes and reactions on nodes
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS notes (
        id VARCHAR(36) PRIMARY KEY,
        session_id VARCHAR(64) NOT NULL,
        tree_id VARCHAR(32) NOT NULL,
        node_id VARCHAR(64) NOT NULL,
        note_text TEXT,
        reaction VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_session_node (session_id, node_id),
        INDEX idx_tree (tree_id)
      )
    `);

    // Choices table - anonymous aggregate data on what paths people explore
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS choices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tree_decision VARCHAR(100) NOT NULL,
        node_id VARCHAR(64) NOT NULL,
        node_title VARCHAR(255),
        choice_count INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_choice (tree_decision, node_id),
        INDEX idx_decision (tree_decision)
      )
    `);

    // Decision history table - stores past decisions for each session
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS decision_history (
        id VARCHAR(16) PRIMARY KEY,
        session_id VARCHAR(64) NOT NULL,
        decision TEXT NOT NULL,
        tree_data JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_session (session_id),
        INDEX idx_created (created_at)
      )
    `);

    connection.release();

    return NextResponse.json({ success: true, message: "Database initialized" });
  } catch (error) {
    console.error("Database init error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to initialize database" },
      { status: 500 }
    );
  }
}
