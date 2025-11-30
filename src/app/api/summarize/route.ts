import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, getClientIP } from "@/lib/rateLimit";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Rate limit: 10 requests per minute per IP (more lenient since it's cheaper)
const RATE_LIMIT_CONFIG = {
  windowMs: 60000,
  maxRequests: 10,
};

const systemPrompt = `You are an insightful life coach analyzing decision trees. Given a tree of possible life outcomes, provide a concise summary of the key tradeoffs and insights.

Your response should be structured as JSON with:
{
  "keyInsight": "One sentence capturing the most important realization",
  "tradeoffs": [
    {
      "factor": "short name (e.g., 'Risk vs Stability')",
      "description": "1-2 sentence explanation"
    }
  ],
  "recommendation": "A balanced, non-prescriptive observation about what the analysis reveals"
}

Keep it brief - max 3 tradeoffs. Focus on actionable insights, not platitudes.
Return ONLY the JSON object, no markdown.`;

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientIP = getClientIP(request);
    const rateLimitResult = rateLimit(`summarize:${clientIP}`, RATE_LIMIT_CONFIG);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Rate limit exceeded. Try again in ${Math.ceil(rateLimitResult.resetIn / 1000)} seconds.`,
        },
        { status: 429 }
      );
    }

    const { treeData } = await request.json();

    if (!treeData) {
      return NextResponse.json(
        { success: false, error: "Tree data is required" },
        { status: 400 }
      );
    }

    // Flatten tree to text for analysis
    function flattenTree(node: { title: string; description: string; sentiment: string; timeframe: string; children?: unknown[] }, depth = 0): string {
      let result = `${"  ".repeat(depth)}[${node.timeframe}] ${node.title}: ${node.description} (${node.sentiment})\n`;
      if (node.children) {
        for (const child of node.children) {
          result += flattenTree(child as typeof node, depth + 1);
        }
      }
      return result;
    }

    const treeText = flattenTree(treeData);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Analyze this decision tree and provide key insights:\n\n${treeText}`,
        },
      ],
      system: systemPrompt,
    });

    const textContent = message.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Parse JSON response
    let jsonText = textContent.text.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith("```")) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    const summary = JSON.parse(jsonText);

    return NextResponse.json({
      success: true,
      summary,
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
      },
    });
  } catch (error) {
    console.error("Summarize error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate summary" },
      { status: 500 }
    );
  }
}
