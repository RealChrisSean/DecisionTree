import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Azure AI Foundry client
const anthropic = new Anthropic({
  apiKey: process.env.AZURE_AI_API_KEY,
  baseURL: process.env.AZURE_AI_ENDPOINT,
});

const systemPrompt = `You are generating personalized loading messages for a life path simulator. The user is waiting while their decision tree is being generated.

Generate exactly 8 short, engaging loading messages that are SPECIFIC to their decision/scenario. Each message should:
- Reference specific details from their input (names, numbers, companies, etc.)
- Feel like the AI is actively analyzing their unique situation
- Be encouraging but not cheesy
- Be 5-12 words max

Output a JSON array of 8 objects with this structure:
[
  { "icon": "emoji", "text": "Main message text", "highlight": "Key insight (optional)" },
  ...
]

Icons should be relevant emojis like: 🧠 📊 💰 🚀 🔮 ⚖️ 🎯 📈 💡 ⏰ 🎲 🏆

Examples for a job comparison between "Anthropic $380K" vs "TiDB $218K":
[
  { "icon": "💰", "text": "Analyzing the $162K salary gap:", "highlight": "Anthropic vs TiDB" },
  { "icon": "🚀", "text": "Modeling Anthropic's AI dominance trajectory..." },
  { "icon": "📈", "text": "Calculating equity upside:", "highlight": "Startup vs established" },
  { "icon": "🔮", "text": "Projecting your net worth at TiDB in 10 years..." }
]

Return ONLY the JSON array, no markdown.`;

export async function POST(request: NextRequest) {
  try {
    const { decision, templateId, formValues } = await request.json();

    if (!decision) {
      return NextResponse.json(
        { success: false, error: "Decision is required" },
        { status: 400 }
      );
    }

    // Build context from form values if available
    let contextDetails = "";
    if (formValues && Object.keys(formValues).length > 0) {
      contextDetails = "\n\nForm details:\n" + Object.entries(formValues)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join("\n");
    }

    const message = await anthropic.messages.create({
      model: process.env.AZURE_AI_MODEL || "claude-sonnet-4-5",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Generate 8 personalized loading messages for this decision:\n\n"${decision}"${contextDetails}\n\nTemplate type: ${templateId || "freeform"}`,
        },
      ],
      system: systemPrompt,
    });

    const textContent = message.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response");
    }

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

    const insights = JSON.parse(jsonText);

    return NextResponse.json({
      success: true,
      insights,
    });
  } catch (error) {
    console.error("Loading messages error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate loading messages" },
      { status: 500 }
    );
  }
}
