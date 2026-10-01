import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { success: false, error: 'Bulk clearing of Supabase event data is disabled to protect existing records.' },
    { status: 410 }
  );
}
