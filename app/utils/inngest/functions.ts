//app\utils\inngest\functions.ts
import { inngest } from "./client";
import { prisma } from "../db";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const handleJobExpiration = inngest.createFunction(
  { id: "job-expiration" },
  { event: "job/created" },
  async ({ event, step }) => {
    const { jobId, expirationDays } = event.data;

    // Wait for the specified duration
    await step.sleep("wait-for-expiration", `${expirationDays}d`);

    // Update job status to expired
    await step.run("update-job-status", async () => {
      await prisma.jobPost.update({
        where: { id: jobId },
        data: { status: "EXPIRED" },
      });
    });

    return { jobId, message: "Job marked as expired" };
  }
);

export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "test/hello.world" },
  async ({ event, step }) => {
    await step.sleep("wait-a-moment", "1s");
    return { message: `Hello ${event.data.email}!` };
  }
);

export const sendPeriodicJobListings = inngest.createFunction(
  { id: "send-periodic-job-listings" },
  { event: "jobseeker/created" },
  async ({ event, step }) => {
    const { userId, email } = event.data;

    const totalDays = 30;
    const intervalDays = 2;
    let currentDay = 0;

    while (currentDay < totalDays) {
      await step.sleep("wait-interval", `${intervalDays}d`);
      currentDay += intervalDays;

      const recentJobs = await prisma.jobPost.findMany({
        where: {
          status: "ACTIVE",
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
        include: {
          company: {
            select: {
              name: true,
            },
          },
        },
      });

      if (recentJobs.length > 0) {
        await step.run("send-email", async () => {
          const jobListingsHtml = recentJobs
            .map(
              (job) => `
                <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #eee; border-radius: 5px; background-color: #f9f9f9;">
                  <h3 style="margin: 0; font-size: 18px; color: #333;">${
                    job.jobTitle
                  }</h3>
                  <p style="margin: 5px 0; font-size: 14px; color: #555;">${
                    job.company.name
                  } · ${job.location}</p>
                   <p style="margin: 5px 0; font-size: 14px; color: #007BFF;">
                    $${(job.salaryFrom ?? "N/A").toLocaleString()} - $${(
                job.salaryTo ?? "N/A"
              ).toLocaleString()}
                  </p>
                </div>`
            )
            .join("");

          await resend.emails.send({
            from: "Nextjs Job Board <onboarding@resend.dev>",
            to: [email],
            subject: "Your Weekly Job Listings",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border: 1px solid #ddd; border-radius: 5px;">
                  <h2 style="text-align: center; color: #333;">Latest Job Opportunities</h2>
                  ${jobListingsHtml}
                  <div style="margin-top: 30px; text-align: center;">
                    <a href="${process.env.NEXT_PUBLIC_URL}"style="background-color: #007BFF; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px;">
         View all jobs
                    </a>
                  </div>
                </div>`,
          });
        });
      }
    }
    return { userId, message: "Completed 30 day job listing notications" };
  }
);
