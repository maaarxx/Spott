import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { errorMessage } from '@/lib/error-message';

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('categories')
      .select('category_id, category_name')
      .order('category_name');

    if (error) throw error;

    return NextResponse.json({ success: true, categories: data });
  } catch (err: unknown) {
    console.warn("Categories query failed, using fallback:", errorMessage(err));
    const defaultCategories = [
      { category_id: "1", category_name: "Music" },
      { category_id: "2", category_name: "Food" },
      { category_id: "3", category_name: "Workshop" },
      { category_id: "4", category_name: "Sports" },
      { category_id: "5", category_name: "Community" }
    ];
    return NextResponse.json({ success: true, categories: defaultCategories });
  }
}
