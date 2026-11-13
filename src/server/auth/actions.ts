"use server";

import { redirect } from "next/navigation";
import { signOut } from "./login";

export async function logoutAction(): Promise<void> {
  await signOut();
  redirect("/login");
}
