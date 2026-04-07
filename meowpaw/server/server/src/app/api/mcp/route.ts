import { NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import os from 'os'

interface MCPServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

function getMCPDir(): string {
  return path.join(os.homedir(), '.meow')
}

function getMCPConfigPath(): string {
  return path.join(getMCPDir(), 'mcp.json')
}

export async function GET() {
  try {
    const configPath = getMCPConfigPath()
    if (!existsSync(configPath)) {
      return NextResponse.json({ servers: [] })
    }
    const content = await readFile(configPath, 'utf-8')
    const config = JSON.parse(content)
    return NextResponse.json({ servers: config.servers || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { servers }: { servers: MCPServer[] } = await request.json()
    const configDir = getMCPDir()
    const configPath = getMCPConfigPath()

    if (!existsSync(configDir)) {
      await mkdir(configDir, { recursive: true })
    }

    const config = { servers: servers || [] }
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
