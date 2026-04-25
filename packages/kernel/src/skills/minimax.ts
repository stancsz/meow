import { Skill } from "./index.ts";

/**
 * MiniMax Multimodal Skill
 * 
 * Provides access to MiniMax's multimodal capabilities via the mmx-cli.
 * Requires mmx-cli to be installed and authenticated.
 */
export const minimax: Skill = {
  name: "minimax",
  description: "Multimodal superpowers from MiniMax (Image, Video, Speech, Music, Search, Vision)",
  
  systemPromptContribution: `
You have MiniMax Multimodal Superpowers. Use the following commands via the 'shell' tool if you need to generate media or perform web searches:

1. **Web Search**:
   mmx search query "your question"
   (Use this for real-time information and deep research)

2. **Image Generation**:
   mmx image generate --prompt "detailed description" --output image.png
   (Use for visual creation)

3. **Video Generation**:
   mmx video generate --prompt "scene description" --output video.mp4
   (High-fidelity video synthesis)

4. **Speech Synthesis**:
   mmx speech synthesize --text "message" --output audio.mp3
   (Convert text to lifelike audio)

5. **Music Generation**:
   mmx music generate --prompt "style and content" --output track.mp3
   (Generate original music tracks)

6. **Image Understanding (Vision)**:
   mmx vision describe --image path/to/image.jpg
   (Analyze and explain imagery)

7. **Quota Management**:
   mmx quota show
   (Check remaining balance and limits)

Always use --non-interactive and --output json flags for machine-readable results when possible.
  `.trim(),

  tools: [
    {
      name: "mmx_search",
      description: "Perform a deep web search using MiniMax Search.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query." }
        },
        required: ["query"]
      },
      handler: async (args: any) => {
        return `Execute: mmx search query "${args.query}" --non-interactive --output json`;
      }
    },
    {
      name: "mmx_image",
      description: "Generate a high-quality image from a prompt.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Detailed visual description." },
          output: { type: "string", description: "Output filename (e.g., image.png)." }
        },
        required: ["prompt", "output"]
      },
      handler: async (args: any) => {
        return `Execute: mmx image generate --prompt "${args.prompt}" --output ${args.output} --non-interactive`;
      }
    },
    {
      name: "mmx_video",
      description: "Generate a high-fidelity video from a prompt.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Scene and action description." },
          output: { type: "string", description: "Output filename (e.g., video.mp4)." }
        },
        required: ["prompt", "output"]
      },
      handler: async (args: any) => {
        return `Execute: mmx video generate --prompt "${args.prompt}" --output ${args.output} --non-interactive`;
      }
    },
    {
      name: "mmx_vision",
      description: "Analyze and describe an image using MiniMax Vision.",
      parameters: {
        type: "object",
        properties: {
          imagePath: { type: "string", description: "Path to the image file." }
        },
        required: ["imagePath"]
      },
      handler: async (args: any) => {
        return `Execute: mmx vision describe --image ${args.imagePath} --non-interactive --output json`;
      }
    }
  ]
};
