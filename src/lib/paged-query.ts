import type { PostgrestError } from "@supabase/supabase-js";
/** Supabase's default response cap must not silently truncate trade statistics. */
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>) {
  const rows: T[] = []; const size=1000;
  for (let from=0; ; from+=size) {
    const result=await page(from,from+size-1);
    if (result.error) return { data:null,error:result.error };
    const batch=result.data??[]; rows.push(...batch);
    if (batch.length<size) return { data:rows,error:null };
  }
}
