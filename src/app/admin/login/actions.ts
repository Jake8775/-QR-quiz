"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(email: string, password: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: true };
  }

  // Server Action response carries Set-Cookie synchronously, so the
  // immediately-following redirect is guaranteed to see the new session
  // server-side. Doing this client-side via supabase.auth.signInWithPassword
  // writes the cookie asynchronously and races with navigation.
  redirect("/admin");
}
