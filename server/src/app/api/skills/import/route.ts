import { NextResponse } from 'next/server';
import { getDbClient } from '../../../../../../src/db/client';
import { importGitHubSkill } from '../../../../../../src/core/skill-importer';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { url, userId } = body;

        // Note: In a real app we would use getServerSession from next-auth to authenticate the userId.
        // For the sake of this prompt/scope and keeping it aligned with existing local flows, we take it from the body.
        if (!url || !userId) {
            return NextResponse.json({ error: 'Missing url or userId' }, { status: 400 });
        }

        const db = getDbClient();
        const skill = await importGitHubSkill(url, userId, db as any);

        return NextResponse.json({
            success: true,
            skill: {
                name: skill.name,
                version: skill.version,
                source: 'github',
                ref: url
            }
        });

    } catch (error: any) {
        return NextResponse.json(
            { error: error.message },
            { status: error.message.includes('Invalid GitHub URL') || error.message.includes('Invalid skill format') || error.message.includes('already exists') || error.message.includes('allowed_domains') ? 400 : 500 }
        );
    }
}
