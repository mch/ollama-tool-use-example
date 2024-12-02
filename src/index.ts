import { Ollama } from "ollama";
import type {
    ChatRequest,
    ChatResponse,
    Message,
    Tool,
    ToolCall,
} from "ollama";

enum Role {
    System = "system",
    User = "user",
    Assistant = "assistant",
    Tool = "tool",
}

const toolFunctions: any = {
    get_current_weather: {
        f: (args: any) => {
            return `It is sunny and snowing in ${args.location}, with a temperature of 32 ${args.format}`;
        },
    },
    get_current_time: {
        f: (args: any) => {
            const timestamp = new Date();
            return JSON.stringify({
                timestamp: timestamp.valueOf(),
                timeString: timestamp.toTimeString(),
                dateString: timestamp.toDateString(),
                timezoneOffset: timestamp.getTimezoneOffset(),
                dayOfWeek: timestamp.getDay(),
                dayOfMonth: timestamp.getDate(),
                hours: timestamp.getHours(),
                minutes: timestamp.getMinutes(),
                seconds: timestamp.getSeconds(),
            });
        },
    },
};

const tools: Tool[] = [
    {
        type: "function",
        function: {
            name: "get_current_weather",
            description: "Get the current weather",
            parameters: {
                type: "object",
                properties: {
                    format: {
                        type: "string",
                        description:
                            "The format to return the weather in, e.g. 'celsius' or 'fahrenheit'",
                        enum: ["celsius", "fahrenheit"],
                    },
                },
                required: ["format"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_current_time",
            description: "Get the current time for a location",
            parameters: {
                type: "object",
                properties: {
                    location: {
                        type: "string",
                        description:
                            "The optional location to get the time for, e.g. San Francisco, CA",
                    },
                },
                required: [],
            },
        },
    },
];

async function main() {
    const ollama = new Ollama({
        host: "http://makani.local:11434",
    });
    // const models = await ollama.list();
    // console.log(`Available models:`);
    // console.log(models.models.map((m) => m.name));

    const request: ChatRequest & { stream?: false | undefined } = {
        model: "qwen2.5-coder:latest",
        tools,
        stream: false,
        messages: [],
    };

    const userMessages = [
        "What time is it?",
        "No, tell me the time informally, as if we are in the same room together.",
        "What's the weather forecast for today?",
    ];

    for (const userMsg of userMessages) {
        request.messages?.push({ role: "user", content: userMsg });
        const strMsgs = request.messages?.map(
            (m) =>
                `- ${m.role}: ${m.content || JSON.stringify(m.tool_calls)}\n`,
        );
        console.log(`Sending request with messages:\n${strMsgs}`);
        let response = await ollama.chat(request);
        logResponse(response);

        // Copy the response into the context for the next request
        request.messages?.push(response.message);

        if (response.message.tool_calls) {
            // Execute the tool and add the response to the context
            const toolResults = processToolCalls(response.message.tool_calls);
            request.messages?.push(...toolResults);

            // Roundtrip the tool result so the LLM can answer the original question
            response = await ollama.chat(request);
            logResponse(response);
            request.messages?.push(response.message);
        }
    }
}

main();

function logResponse(response: ChatResponse) {
    console.log("Response: ", JSON.stringify(response.message, null, 2));
}

function processToolCalls(tool_calls: ToolCall[] = []): Message[] {
    const messages: Message[] = [];
    for (const call of tool_calls ?? []) {
        console.log(
            `Calling function ${call.function.name} with args ${call.function.arguments}`,
        );
        if (call.function.name in toolFunctions) {
            const f = toolFunctions[call.function.name].f;
            const functionResult = f(call.function.arguments);
            console.log(`function result: ${functionResult}`);
            messages?.push({
                role: Role.Tool,
                content: functionResult,
            });
        }
    }
    return messages;
}
