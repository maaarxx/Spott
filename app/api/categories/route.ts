import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { errorMessage } from '@/lib/error-message';

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('categories')
      .select('category_id, category_name')
      .order('category_name');

    if (error) throw error;

    return NextResponse.json({ success: true, categories: data });
  } catch (err: unknown) {
    console.error("Failed to load categories from Supabase:", errorMessage(err));
    return NextResponse.json(
      { success: false, error: "Could not load categories from the database." },
      { status: 503 }
    );
  }
}
