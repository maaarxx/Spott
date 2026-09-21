import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export async function POST() {
  try {
    const supabase = createAdminClient();
    // Delete registrations, event_category, and events if any
    await supabase.from("registrations").delete().neq("event_id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("event_category").delete().neq("event_id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("events").delete().neq("event_id", "00000000-0000-0000-0000-000000000000");
    return NextResponse.json({ success: true, message: "All events data cleared" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
