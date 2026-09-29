import { NextResponse } from "next/server";
import { createAdminClient, getAuthenticatedRole } from "@/lib/supabase-server";

export async function POST() {
  try {
    const account = await getAuthenticatedRole();
    if (account?.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    const supabase = createAdminClient();
    // Delete registrations, event_category, and events if any
    await supabase.from("registrations").delete().neq("event_id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("event_category").delete().neq("event_id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("events").delete().neq("event_id", "00000000-0000-0000-0000-000000000000");
    return NextResponse.json({ success: true, message: "All events data cleared" });
  } catch {
    return NextResponse.json({ success: false, error: 'Unable to clear event data' }, { status: 500 });
  }
}
