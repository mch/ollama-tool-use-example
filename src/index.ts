import { Ollama } from "ollama";
import type { ChatRequest, Message, Tool, ToolCall } from "ollama";

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
            description:
                "Get the current weather for a location. If the location is not specified, use the 'default' location.",
            parameters: {
                type: "object",
                properties: {
                    location: {
                        type: "string",
                        description:
                            "The location to get the weather for, e.g. San Francisco, CA",
                    },
                    format: {
                        type: "string",
                        description:
                            "The format to return the weather in, e.g. 'celsius' or 'fahrenheit'",
                        enum: ["celsius", "fahrenheit"],
                    },
                },
                required: ["location", "format"],
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
    const models = await ollama.list();
    console.log(`Available models:`);
    console.log(models.models.map((m) => m.name));

    const request: ChatRequest & { stream?: false | undefined } = {
        model: "qwen2.5-coder:latest",
        tools,
        stream: false,
        messages: [
            {
                role: Role.User,
                content: "What time is it?",
            },
        ],
    };
    console.log(
        `Sending request with messages:\n${JSON.stringify(request.messages)}`,
    );
    let response = await ollama.chat(request);
    console.log(`Got response:`);
    console.log(JSON.stringify(response, null, 2));

    // Copy the response into the context for the next request
    request.messages?.push(response.message);

    // Execute the tool and add the response to the context
    const toolResults = processToolCalls(response.message.tool_calls);
    request.messages?.push(...toolResults);

    console.log(
        `Sending request with messages:\n${JSON.stringify(request.messages)}`,
    );
    response = await ollama.chat(request);
    console.log(`Got response:`);
    console.log(JSON.stringify(response, null, 2));
    request.messages?.push({
        role: "user",
        content:
            "No, tell me the time informally, as if we are in the same room together.",
    });
    response = await ollama.chat(request);
    console.log(`Got response:`);
    console.log(JSON.stringify(response, null, 2));
    request.messages?.push({
        role: "user",
        content: "What's the weather forecast for today?",
    });
    response = await ollama.chat(request);
    console.log(`Got response:`);
    console.log(JSON.stringify(response, null, 2));
}

main();

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
