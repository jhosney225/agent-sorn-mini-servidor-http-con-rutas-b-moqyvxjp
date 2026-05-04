
```javascript
import Anthropic from "@anthropic-ai/sdk";
import http from "http";
import url from "url";

const client = new Anthropic();

// Conversational state for multi-turn interactions
let conversationHistory = [];

// Define tools that Claude can use
const tools = [
  {
    name: "get_server_status",
    description:
      "Get the current status of the HTTP server including uptime and active routes",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_route_info",
    description: "Get information about available HTTP routes and their methods",
    input_schema: {
      type: "object",
      properties: {
        route: {
          type: "string",
          description:
            "The specific route to get information about (e.g., '/api/health', '/data')",
        },
      },
      required: ["route"],
    },
  },
  {
    name: "process_request_with_ai",
    description:
      "Use AI to intelligently process and respond to HTTP requests with contextual information",
    input_schema: {
      type: "object",
      properties: {
        request_type: {
          type: "string",
          enum: ["GET", "POST", "PUT", "DELETE"],
          description: "The HTTP method type",
        },
        path: {
          type: "string",
          description: "The requested path",
        },
        data: {
          type: "string",
          description: "Any data associated with the request",
        },
      },
      required: ["request_type", "path"],
    },
  },
];

// Server statistics
const serverStats = {
  startTime: new Date(),
  requestCount: 0,
  routes: {
    "/": "GET - Homepage",
    "/api/health": "GET - Server health check",
    "/api/time": "GET - Current server time",
    "/api/echo": "POST - Echo back sent data",
    "/data": "GET - Sample data endpoint",
  },
};

// Tool implementations
function executeToolCall(toolName, toolInput) {
  switch (toolName) {
    case "get_server_status": {
      const uptime = Math.floor(
        (new Date() - serverStats.startTime) / 1000
      );
      return JSON.stringify({
        status: "running",
        uptime_seconds: uptime,
        total_requests: serverStats.requestCount,
        timestamp: new Date().toISOString(),
      });
    }

    case "get_route_info": {
      const route = toolInput.route;
      if (route in serverStats.routes) {
        return JSON.stringify({
          route: route,
          description: serverStats.routes[route],
          available: true,
        });
      }
      return JSON.stringify({
        route: route,
        available: false,
        available_routes: serverStats.routes,
      });
    }

    case "process_request_with_ai": {
      const { request_type, path, data } = toolInput;
      let response = {
        method: request_type,
        path: path,
        processed: true,
        timestamp: new Date().toISOString(),
      };

      if (request_type === "GET" && path === "/") {
        response.message = "Welcome to the AI-powered HTTP server";
        response.available_endpoints = serverStats.routes;
      } else if (request_type === "GET" && path === "/api/health") {
        response.health = "OK";
        response.uptime_seconds = Math.floor(
          (new Date() - serverStats.startTime) / 1000
        );
      } else if (request_type === "GET" && path === "/api/time") {
        response.server_time = new Date().toISOString();
        response.unix_timestamp = Date.now();
      } else if (request_type === "POST" && path === "/api/echo") {
        response.echo = data || "No data provided";
        response.message = "Data echoed back successfully";
      } else if (request_type === "GET" && path === "/data") {
        response.data = {
          users: [
            { id: 1, name: "Alice", skill: "agriculture" },
            { id: 2, name: "Bob", skill: "construction" },
            { id: 3, name: "Charlie", skill: "commerce" },
          ],
          sample_skills: ["agriculture", "construction", "commerce"],
        };
      }

      return JSON.stringify(response);
    }

    default:
      return JSON.stringify({ error: "Unknown tool" });
  }
}

// Main conversation with Claude
async function processWithClaude(userMessage) {
  // Add user message to conversation history
  conversationHistory.push({
    role: "user",
    content: userMessage,
  });

  let response;
  let toolResults = [];

  // Agentic loop - continue until Claude stops wanting to use tools
  while (true) {
    response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      system: `You are a helpful HTTP server assistant. You help process and respond to HTTP requests using available tools. 
      Be concise and provide useful information about the server and its routes. When processing requests, use the available tools to get accurate information.`,
      tools: tools,
      messages: conversationHistory,
    });

    // Check if we're done (no more tool use)
    if (response.stop_reason === "end_turn") {
      break;
    }

    // Process tool calls if any
    if (response.stop_reason === "tool_use") {
      const assistantMessage = {
        role: "assistant",
        content: response.content,
      };
      conversationHistory.push(assistantMessage);

      const toolUseBlocks = response.content.filter(
        (block) => block.type === "tool_use