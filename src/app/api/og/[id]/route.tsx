import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import pool from "@/lib/db";

export const runtime = "edge";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // For edge runtime, we need to fetch tree data via internal API or use simplified approach
  // Since we can't use mysql2 in edge, we'll parse the ID to extract info or use query params
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") || "Life Path Decision";
  const description = searchParams.get("description") || "Explore parallel futures";
  const paths = parseInt(searchParams.get("paths") || "2");
  const timeframe = searchParams.get("timeframe") || "30yr";

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0a0a0a",
          padding: "60px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              fontSize: "32px",
              fontWeight: "bold",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <span style={{ fontSize: "40px" }}>🌳</span>
            TiDB Decision Tree
          </div>
        </div>

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flex: 1,
            gap: "60px",
          }}
        >
          {/* Left side - Title and description */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              justifyContent: "center",
            }}
          >
            <h1
              style={{
                fontSize: "56px",
                fontWeight: "bold",
                color: "#fff",
                lineHeight: 1.1,
                margin: 0,
                marginBottom: "24px",
              }}
            >
              {title.length > 60 ? title.slice(0, 60) + "..." : title}
            </h1>
            <p
              style={{
                fontSize: "24px",
                color: "#a1a1aa",
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              {description.length > 120
                ? description.slice(0, 120) + "..."
                : description}
            </p>
          </div>

          {/* Right side - Visual tree representation */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: "400px",
            }}
          >
            {/* Simplified tree visualization */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "20px",
              }}
            >
              {/* Root node */}
              <div
                style={{
                  display: "flex",
                  width: "180px",
                  height: "60px",
                  backgroundColor: "#18181b",
                  borderRadius: "12px",
                  border: "2px solid #3b82f6",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ color: "#fff", fontSize: "14px", fontWeight: 600 }}>
                  Your Decision
                </span>
              </div>

              {/* Connector lines */}
              <div
                style={{
                  display: "flex",
                  width: "200px",
                  height: "40px",
                  justifyContent: "space-between",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    width: "2px",
                    height: "40px",
                    backgroundColor: "#4ade80",
                    marginLeft: "40px",
                  }}
                />
                <div
                  style={{
                    width: "2px",
                    height: "40px",
                    backgroundColor: "#f87171",
                    marginRight: "40px",
                  }}
                />
              </div>

              {/* Branch nodes */}
              <div
                style={{
                  display: "flex",
                  gap: "20px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: "120px",
                    height: "50px",
                    backgroundColor: "#18181b",
                    borderRadius: "10px",
                    border: "2px solid #4ade80",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span style={{ color: "#4ade80", fontSize: "12px", fontWeight: 600 }}>
                    Path A
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    width: "120px",
                    height: "50px",
                    backgroundColor: "#18181b",
                    borderRadius: "10px",
                    border: "2px solid #f87171",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span style={{ color: "#f87171", fontSize: "12px", fontWeight: 600 }}>
                    Path B
                  </span>
                </div>
              </div>

              {/* More branches indicator */}
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  marginTop: "10px",
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    backgroundColor: "#4ade80",
                    borderRadius: "50%",
                  }}
                />
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    backgroundColor: "#fbbf24",
                    borderRadius: "50%",
                  }}
                />
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    backgroundColor: "#f87171",
                    borderRadius: "50%",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "40px",
            paddingTop: "20px",
            borderTop: "1px solid #27272a",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "#a1a1aa",
                fontSize: "18px",
              }}
            >
              <span style={{ color: "#3b82f6" }}>⏱</span>
              {timeframe === "30yr" ? "30 Year" : timeframe} Simulation
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "#a1a1aa",
                fontSize: "18px",
              }}
            >
              <span style={{ color: "#4ade80" }}>🌿</span>
              {paths} Paths to Explore
            </div>
          </div>
          <div
            style={{
              fontSize: "18px",
              color: "#71717a",
            }}
          >
            tidb.cloud
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
