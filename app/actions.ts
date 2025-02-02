"use server";

import { z } from "zod";
import { requireUser } from "./utils/hooks";
import { companySchema } from "./utils/zodSchemas";
import { prisma } from "./utils/db";
import { redirect } from "next/navigation";

export async function createCompany(data: z.infer<typeof companySchema>) {
  const user = await requireUser();
  const validatedData = companySchema.parse(data);

  console.log(validatedData);

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      onboardingCompleted: true,
      userType: "COMPANY",
      Company: {
        create: {
          ...validatedData,
        },
      },
    },
  });

  return redirect("/");
}
