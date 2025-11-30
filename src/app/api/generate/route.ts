import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, getClientIP } from "@/lib/rateLimit";

// Azure AI Foundry client
const anthropic = new Anthropic({
  apiKey: process.env.AZURE_AI_API_KEY,
  baseURL: process.env.AZURE_AI_ENDPOINT,
});

// Rate limit: 5 requests per minute per IP
const RATE_LIMIT_CONFIG = {
  windowMs: 60000,
  maxRequests: 5,
};

// Explore mode: Step-by-step journey, generates only 2 immediate options
const explorePrompt = `You are an interactive life path guide. The user is starting a step-by-step journey exploring their decision.

This is the INITIAL decision point. Generate the starting node and 2 immediate options.

CRITICAL - EXTRACT AND PRESERVE FACTS:
- The user's decision may contain SPECIFIC FACTS (numbers, valuations, amounts, dates, company names)
- Extract these facts and incorporate them into your response
- If the user says "Anthropic valued at $300B" → reference that $300B valuation
- If they mention specific salary, settlement amount, investment → use those exact numbers
- These facts will need to be maintained throughout the entire journey

Output a JSON object with this EXACT structure:
{
  "id": "root",
  "title": "The decision point (5-7 words)",
  "description": "Brief context (under 80 chars)",
  "timeframe": "Now",
  "sentiment": "neutral",
  "children": [
    {
      "id": "option-a",
      "title": "First choice (5-7 words)",
      "description": "What this path means (under 80 chars)",
      "timeframe": "1yr",
      "sentiment": "positive" | "neutral" | "negative",
      "probability": 55
    },
    {
      "id": "option-b",
      "title": "Alternative choice (5-7 words)",
      "description": "What this path means (under 80 chars)",
      "timeframe": "1yr",
      "sentiment": "positive" | "neutral" | "negative",
      "probability": 45
    }
  ]
}

CRITICAL - Timeframe format rules:
- The root node MUST have timeframe: "Now" (exactly this string)
- Children MUST have timeframe: "1yr" (exactly this string)
- Valid timeframes are ONLY: "Now", "1yr", "3yr", "5yr", "10yr", "20yr", "30yr"
- Do NOT use "30 years", "1 year", "Year 1", etc. - use EXACTLY the formats above

Rules:
- Generate exactly 2 options (children) - no more, no less
- NO nested children - the user will choose, then you generate the next step
- Keep titles short (5-7 words)
- Keep descriptions under 80 characters
- Make each option feel like a real, meaningful choice
- Probabilities should sum to 100
- Options should represent genuinely different paths, not just good vs bad

Return ONLY the JSON object, no markdown code blocks.`;

// Explore mode continuation: User made a choice, generate next options
const exploreNextPrompt = `You are an interactive life path guide. The user has made a choice in their journey.

You will receive:
1. Their original decision/scenario
2. The path they just chose (including its timeframe)
3. Their journey history so far

Generate the NEXT decision point with 2 new options based on where their choice leads.

CRITICAL - MAINTAIN FACTUAL CONSISTENCY:
- The user's original decision may contain SPECIFIC FACTS (numbers, valuations, amounts, dates, names)
- You MUST preserve these facts throughout the entire journey
- If the user said "company valued at $300B" → use $300B (or realistic growth from it) in future nodes
- If the user mentioned specific salary, settlement, investment amount → reference those exact numbers
- Never contradict facts established in earlier steps
- Build on previous context - each step should feel like a continuation, not a restart

CRITICAL - Timeframe progression:
The ONLY valid timeframes are: "Now", "1yr", "3yr", "5yr", "10yr", "20yr", "30yr"
Progress to the NEXT timeframe based on the chosen node's timeframe:
- If chosen node was "1yr" → new node should be "3yr", children should be "5yr"
- If chosen node was "3yr" → new node should be "5yr", children should be "10yr"
- If chosen node was "5yr" → new node should be "10yr", children should be "20yr"
- If chosen node was "10yr" → new node should be "20yr", children should be "30yr"
- If chosen node was "20yr" → new node should be "30yr", children should be empty []

Output a JSON object with this EXACT structure:
{
  "id": "<unique-id-based-on-step>",
  "title": "Next decision point (5-7 words)",
  "description": "What happens now (under 80 chars)",
  "timeframe": "<see progression above>",
  "sentiment": "positive" | "neutral" | "negative",
  "children": [
    {
      "id": "option-a",
      "title": "First choice (5-7 words)",
      "description": "What this path means (under 80 chars)",
      "timeframe": "<next timeframe after parent>",
      "sentiment": "positive" | "neutral" | "negative",
      "probability": 50
    },
    {
      "id": "option-b",
      "title": "Alternative choice (5-7 words)",
      "description": "What this path means (under 80 chars)",
      "timeframe": "<next timeframe after parent>",
      "sentiment": "positive" | "neutral" | "negative",
      "probability": 50
    }
  ]
}

Rules:
- Do NOT use "30 years", "1 year", "Year 1", etc. - use EXACTLY: "Now", "1yr", "3yr", "5yr", "10yr", "20yr", "30yr"
- The new decision point should be a CONSEQUENCE of their previous choice
- Generate exactly 2 options (children) - no more, no less
- NO nested children
- If the new node is "30yr", set children to empty array [] (journey complete)
- Build a coherent story - each step should connect to their journey

Return ONLY the JSON object, no markdown code blocks.`;

const branchPrompt = `You are a life path simulator. The user has an existing life path tree and wants to explore a "what if" scenario from a specific point.

You will receive:
1. The current node they're branching from (title, description, timeframe)
2. What they want to explore next

Generate ONLY the new children for this node - the continuation of the story based on what they want to explore.

Output a JSON object with this structure:
{
  "children": [
    {
      "id": "branch-a",
      "title": "First possibility (5-7 words)",
      "description": "What happens in this scenario (under 80 chars)",
      "timeframe": "<next timeframe>",
      "sentiment": "positive" | "neutral" | "negative",
      "probability": 55,
      "children": [
        {
          "id": "branch-a-outcome",
          "title": "Where this leads",
          "description": "The outcome of this path",
          "timeframe": "<final timeframe>",
          "sentiment": "positive" | "neutral" | "negative",
          "probability": 100
        }
      ]
    },
    {
      "id": "branch-b",
      "title": "Alternative possibility",
      "description": "What happens if things go differently",
      "timeframe": "<next timeframe>",
      "sentiment": "positive" | "neutral" | "negative",
      "probability": 45,
      "children": [...]
    }
  ]
}

Timeframe progression: 5yr → 10yr → 20yr (use the next appropriate timeframe based on current)

Rules:
- Generate 2 different paths from this point
- Each path should have 1-2 levels of children
- Keep titles short (5-7 words)
- Keep descriptions under 80 characters
- Make outcomes feel realistic and connected to the scenario
- Include "probability" (1-100) on every node - sibling probabilities should sum to 100

Return ONLY the JSON object, no markdown code blocks.`;

const systemPrompt = `You are an expert life path simulator and decision analyst. Given a decision someone is facing, generate a branching tree of possible futures.

CRITICAL - DEEPLY UNDERSTAND THE SCENARIO:
1. PARSE the user's situation carefully. They may describe:
   - Legal situations (lawsuits, settlements, violations like FMLA, wrongful termination)
   - Financial specifics (exact dollar amounts, settlements, legal fees)
   - Employment scenarios (PIPs, layoffs, negotiations, severance)
   - Multiple conditional outcomes (if X happens, then Y; if not, then Z)
   - Evidence they have, leverage they hold, risks they face

2. EXTRACT KEY DECISION POINTS:
   - What are the TWO main paths they're considering?
   - What are the best/worst outcomes for each path?
   - What specific numbers or outcomes did they mention?

3. USE THEIR EXACT DETAILS:
   - If they say "win $500k" - use $500K in that outcome
   - If they mention "FMLA violations" - reference that specifically
   - If they say "get PIP'd" - include that in the pessimistic path
   - Mirror their language and specific situation

4. BE REALISTIC about outcomes:
   - Legal cases: consider legal fees, time, emotional toll, counter-suits
   - Employment: consider references, industry reputation, future opportunities
   - Financial: consider taxes, fees, opportunity costs

5. If information is MISSING, make reasonable assumptions and STATE THEM CLEARLY.

Output a JSON object with this exact structure (5yr → 10yr → 20yr → 30yr):
{
  "id": "root",
  "title": "The decision (short title)",
  "description": "Brief description of the decision",
  "timeframe": "5yr",
  "sentiment": "neutral",
  "children": [
    {
      "id": "path-a",
      "title": "Option A title",
      "description": "What happens if they choose this path",
      "timeframe": "5yr",
      "sentiment": "neutral",
      "probability": 50,
      "children": [
        {
          "id": "path-a-good",
          "title": "Optimistic 10yr outcome",
          "description": "Best case scenario for this path",
          "timeframe": "10yr",
          "sentiment": "positive",
          "probability": 40,
          "children": [
            {
              "id": "path-a-good-20yr",
              "title": "20 year outcome",
              "description": "Where this leads after 20 years",
              "timeframe": "20yr",
              "sentiment": "positive" | "neutral",
              "probability": 100,
              "children": [
                {
                  "id": "path-a-good-30yr",
                  "title": "30 year outcome",
                  "description": "Long-term legacy and life situation",
                  "timeframe": "30yr",
                  "sentiment": "positive" | "neutral",
                  "probability": 100
                }
              ]
            }
          ]
        },
        {
          "id": "path-a-bad",
          "title": "Pessimistic 10yr outcome",
          "description": "What if things don't go as planned",
          "timeframe": "10yr",
          "sentiment": "negative",
          "probability": 60,
          "children": [
            {
              "id": "path-a-bad-20yr",
              "title": "20 year outcome",
              "description": "Where this leads after 20 years",
              "timeframe": "20yr",
              "sentiment": "neutral" | "negative",
              "probability": 100,
              "children": [
                {
                  "id": "path-a-bad-30yr",
                  "title": "30 year outcome",
                  "description": "Long-term legacy and life situation",
                  "timeframe": "30yr",
                  "sentiment": "neutral" | "negative",
                  "probability": 100
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "path-b",
      "title": "Option B title",
      "description": "What happens if they choose this path",
      "timeframe": "5yr",
      "sentiment": "neutral",
      "probability": 50,
      "children": [
        // Same structure: TWO 10yr outcomes (good and bad), each with 20yr and 30yr children, all with probability
      ]
    }
  ]
}

PROBABILITY RULES:
- Each node MUST have a "probability" field (integer 1-100)
- Sibling nodes' probabilities should sum to 100 (e.g., if path-a is 60%, path-b is 40%)
- Base probabilities on realistic assessment of the scenario
- For optimistic vs pessimistic 10yr outcomes, consider the person's specific situation
- Higher risk paths = lower probability of positive outcomes
- More stable paths = higher probability consistency

Rules:
- Generate exactly 2 main branches based on the user's core decision
- IMPORTANT: Each 5yr branch splits into TWO different 10yr outcomes:
  - One OPTIMISTIC outcome (things go well)
  - One PESSIMISTIC outcome (things don't go as planned)
- Each 10yr outcome leads to ONE 20yr outcome, which leads to ONE 30yr outcome
- 30yr outcomes should reflect: retirement readiness, net worth, family situation, health, life satisfaction
- This creates 4 total end states at 30 years (2 per main branch)

SCENARIO-SPECIFIC GUIDANCE:

MORTGAGE DECISIONS:
- Calculate actual monthly payments (principal + interest + PMI if <20% down)
- Consider: interest rate differences (even 0.5% matters over 30 years), closing costs ($5-15k typical)
- PMI: ~0.5-1% of loan annually until 20% equity
- Refinancing: costs $3-6k, worth it if rate drops 0.75%+ and staying 3+ years
- Extra payments: show how extra $X/month affects payoff time and total interest saved
- Compare renting vs buying: include opportunity cost of down payment invested instead
- Property taxes (~1-2% of home value), insurance, maintenance (~1% annually)

INVESTING DECISIONS:
- Use realistic returns: S&P 500 ~10% historical (7% inflation-adjusted)
- Compound growth: show actual dollar amounts at 5, 10, 20 years
- 401k match: "free money" - always max employer match first
- Tax implications: 401k/IRA (tax-deferred) vs Roth (tax-free growth) vs brokerage (capital gains)
- Risk levels: bonds ~4-5%, index funds ~7-10%, individual stocks ~varies wildly
- Emergency fund: 3-6 months expenses before aggressive investing
- Debt payoff vs investing: compare interest rate on debt vs expected returns

JOB/CAREER DECISIONS:
- Total compensation breakdown: base salary, bonus (% and likelihood), RSUs/options (vesting schedule), 401k match
- Equity: calculate value at different company valuations, consider liquidity risk
- Benefits value: health insurance ($5-20k/year value), PTO, parental leave, remote work
- Career trajectory: title progression, skill development, resume impact
- Company factors: funding stage (startup risk), profitability, industry trends, layoff history
- Work-life balance: hours expected, on-call, travel, flexibility
- Location: cost of living adjustment, commute time/cost, relocation packages
- Golden handcuffs: unvested equity, pension, deferred comp

LEGAL DECISIONS:
- Settlement amounts, legal fees (~30-40% contingency)
- Time to resolution (1-3 years typical), counter-suit risks
- Emotional toll, career impact, reference implications

RELATIONSHIP/LIFE DECISIONS:
- Support systems, living situations, co-parenting logistics
- Financial entanglement, shared assets/debts

EDUCATION/MBA DECISIONS:
- Calculate ROI: (expected salary increase × years working) vs total cost (tuition + opportunity cost)
- Opportunity cost: 2 years of lost salary if full-time ($150-300k for professionals)
- Network value: varies by program ranking and industry connections
- Career pivots: MBA helps most for consulting, finance, general management transitions
- Time to ROI: typically 4-7 years post-graduation
- Part-time vs full-time trade-offs: slower progression but maintain income

RENT VS BUY:
- Monthly cost comparison: rent vs (mortgage + taxes + insurance + maintenance + opportunity cost of down payment)
- Break-even timeline: typically 5-7 years (use 5% rule: multiply home price by 5% = annual cost of ownership)
- Down payment alternative: show what that money would grow to if invested
- Mobility premium: renters can relocate freely, buyers face 6-10% selling costs
- Forced savings: equity building vs discipline to invest rent savings
- Local market factors: rent/price ratio, appreciation trends, rent control

STARTUP/BUSINESS DECISIONS:
- Runway calculation: savings ÷ monthly burn rate = months of runway
- Success rates: ~10% of startups succeed, ~40% fail completely
- Opportunity cost: lost salary, benefits, career momentum
- Bootstrap vs fundraise: control vs growth speed trade-offs
- Exit scenarios: acquisition, IPO, profitable lifestyle business, shutdown
- Side hustle approach: slower growth but maintains income security

FORMATTING:
- USE THE USER'S SPECIFIC NUMBERS (settlements, salaries, timeframes, etc.)
- Keep titles short (5-7 words max)
- Keep descriptions to 1 SHORT sentence (under 80 characters)
- Make the outcomes feel REALISTIC and grounded in the user's specific situation
- Reference their specific evidence, leverage, or circumstances
- Include concrete numbers/percentages where possible (e.g., "$450K net worth" not just "wealthy")
- Each path should tell a coherent STORY - the 30yr outcome should clearly follow from the 5yr choice

Return ONLY the JSON object, no markdown code blocks, no explanation.`;

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientIP = getClientIP(request);
    const rateLimitResult = rateLimit(`generate:${clientIP}`, RATE_LIMIT_CONFIG);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Rate limit exceeded. Try again in ${Math.ceil(rateLimitResult.resetIn / 1000)} seconds.`,
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rateLimitResult.resetIn / 1000)),
          },
        }
      );
    }

    const { decision, templateId, branchFrom, mode, journeyHistory, chosenNode } = await request.json();

    if (!decision) {
      return NextResponse.json(
        { success: false, error: "Decision is required" },
        { status: 400 }
      );
    }

    // Determine the mode and build appropriate prompt
    const isExploreMode = mode === 'explore';
    const isExploreNext = isExploreMode && journeyHistory && journeyHistory.length > 0 && chosenNode;
    const isBranching = branchFrom && branchFrom.title && !isExploreMode;

    let userMessage: string;
    let systemMessage: string;

    if (isExploreNext) {
      // Explore mode: continuing the journey
      const historyText = journeyHistory.map((node: { title: string; description: string; timeframe: string }, i: number) =>
        `Step ${i + 1}: "${node.title}" - ${node.description} (${node.timeframe})`
      ).join('\n');

      userMessage = `Original decision: "${decision}"

The user chose: "${chosenNode.title}" - ${chosenNode.description} (Timeframe: ${chosenNode.timeframe})

Journey so far:
${historyText}

Generate the next decision point based on their choice.`;
      systemMessage = exploreNextPrompt;
    } else if (isExploreMode) {
      // Explore mode: initial decision
      userMessage = `Start an interactive journey for this decision: "${decision}"${templateId ? ` (Template: ${templateId})` : ""}

Generate the first decision point with 2 options to choose from.`;
      systemMessage = explorePrompt;
    } else if (isBranching) {
      userMessage = `Current node: "${branchFrom.title}" - ${branchFrom.description} (Timeframe: ${branchFrom.timeframe})

The user wants to explore: ${decision}

Generate the new branches from this point.`;
      systemMessage = branchPrompt;
    } else {
      // Predict mode: full tree
      userMessage = `Generate a life path tree for this decision: "${decision}"${templateId ? ` (Template: ${templateId})` : ""}`;
      systemMessage = systemPrompt;
    }

    const message = await anthropic.messages.create({
      model: process.env.AZURE_AI_MODEL || "claude-sonnet-4-5",
      max_tokens: isExploreMode ? 1024 : 2048,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
      system: systemMessage,
    });

    // Extract text content from response
    const textContent = message.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Parse the JSON response - strip markdown code blocks if present
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

    const treeData = JSON.parse(jsonText);

    return NextResponse.json({
      success: true,
      data: treeData,
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
        total_tokens: message.usage.input_tokens + message.usage.output_tokens,
      },
    });
  } catch (error) {
    console.error("Generate error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate life paths" },
      { status: 500 }
    );
  }
}
