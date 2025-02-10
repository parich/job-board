"use server";

import { z } from "zod";
import { requireUser } from "./utils/hooks";
import { companySchema, jobSchema, jobSeekerSchema } from "./utils/zodSchemas";
import { prisma } from "./utils/db";
import { redirect } from "next/navigation";
import arcjet, { detectBot, shield } from "./utils/arcjet";
import { request } from "@arcjet/next";
import { stripe } from "./utils/stripe";
import { jobListingDurationPricing } from "./utils/pricingTiers";
import { inngest } from "./utils/inngest/client";
import { revalidatePath } from "next/cache";

const aj = arcjet
  .withRule(
    shield({
      mode: "LIVE",
    })
  )
  .withRule(
    detectBot({
      mode: "LIVE",
      allow: [],
    })
  );
export async function createCompany(data: z.infer<typeof companySchema>) {
  const user = await requireUser();
  // Access the request object so Arcjet can analyze it
  const req = await request();
  // Call Arcjet protect
  const decision = await aj.protect(req);
  if (decision.isDenied()) {
    throw new Error("Forbidden");
  }
  const validatedData = companySchema.parse(data);
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

export async function createJobSeeker(data: z.infer<typeof jobSeekerSchema>) {
  const user = await requireUser();
  // Access the request object so Arcjet can analyze it
  const req = await request();
  // Call Arcjet protect
  const decision = await aj.protect(req);
  if (decision.isDenied()) {
    throw new Error("Forbidden");
  }
  const validatedData = jobSeekerSchema.parse(data);
  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      onboardingCompleted: true,
      userType: "JOB_SEEKER",
      JobSeeker: {
        create: {
          ...validatedData,
        },
      },
    },
  });
  return redirect("/");
}

export async function createJob(data: z.infer<typeof jobSchema>) {
  const user = await requireUser();
  // Access the request object so Arcjet can analyze it
  const req = await request();
  // Call Arcjet protect
  const decision = await aj.protect(req);
  if (decision.isDenied()) {
    throw new Error("Forbidden");
  }
  const validatedData = jobSchema.parse(data);
  // Check if user is a company
  const company = await prisma.company.findUnique({
    where: {
      userId: user.id,
    },
    select: {
      id: true,
      user: {
        select: {
          stripeCustomerId: true,
        },
      },
    },
  });
  if (!company?.id) {
    return redirect("/");
  }

  let stripeCustomerId = company.user.stripeCustomerId;

  if (!stripeCustomerId) {
    // Create a new Stripe customer
    const customer = await stripe.customers.create({
      email: user.email!,
      name: user.name || undefined,
    });
    stripeCustomerId = customer.id;
    // Update user with Stripe customer ID
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customer.id },
    });
  }

  // Create a new job listing
  const jobPost = await prisma.jobPost.create({
    data: {
      companyId: company.id,
      jobDescription: validatedData.jobDescription,
      jobTitle: validatedData.jobTitle,
      employmentType: validatedData.employmentType,
      location: validatedData.location,
      salaryFrom: validatedData.salaryFrom,
      salaryTo: validatedData.salaryTo,
      listingDuration: validatedData.listingDuration,
      benefits: validatedData.benefits,
    },
    select: {
      id: true,
    },
  });

  // Trigger the job expiration function
  await inngest.send({
    name: "job/created",
    data: {
      jobId: jobPost.id,
      expirationDays: validatedData.listingDuration,
    },
  });

  // Get price from pricing tiers based on duration
  const pricingTier = jobListingDurationPricing.find(
    (tier) => tier.days === validatedData.listingDuration
  );

  if (!pricingTier) {
    throw new Error("Invalid listing duration selected");
  }

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    line_items: [
      {
        price_data: {
          product_data: {
            name: `Job listing - ${pricingTier.description} Day`,
            description: pricingTier.description,
            images: [
              "https://0x1obqnibx.ufs.sh/f/3jbEuwbaGqfuMchJvntCY9vXLSAPIQ63Mw4Nzt0UlDfoeF8j",
            ],
          },
          currency: "usd",
          unit_amount: pricingTier.price * 100,
        },
        quantity: 1,
      },
    ],
    metadata: {
      jobId: jobPost.id,
    },
    mode: "payment",
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment/success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment/cancel`,
  });
  return redirect(session.url as string);
}

export async function saveJobPost(jobId: string) {
  const user = await requireUser();
  await prisma.savedJobPost.create({
    data: {
      jobId: jobId,
      userId: user.id as string,
    },
  });
  revalidatePath(`/job/${jobId}`);
}

export async function unsaveJobPost(savedJobPostId: string) {
  const user = await requireUser();
  const data = await prisma.savedJobPost.delete({
    where: {
      id: savedJobPostId,
      userId: user.id as string,
    },
    select: {
      jobId: true,
    },
  });
  revalidatePath(`/job/${data.jobId}`);
}
