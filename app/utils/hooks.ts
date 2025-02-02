import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/app/utils/auth";
import { prisma } from "./db";

export async function requireUser() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return session.user;
}
