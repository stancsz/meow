// This endpoint is deprecated and redirects to the existing /api/keys endpoint
// which has full KMS integration and proper user isolation.

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    // Redirect to the existing keys API
    return NextResponse.redirect(new URL('/api/keys', req.url));
}

export async function POST(req: NextRequest) {
    // Redirect to the existing keys API with POST method preserved
    return NextResponse.redirect(new URL('/api/keys', req.url), 307);
}

export async function DELETE(req: NextRequest) {
    // Redirect to the existing keys API with DELETE method preserved
    return NextResponse.redirect(new URL('/api/keys', req.url), 307);
}
