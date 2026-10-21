import type { Audience } from "@/lib/db/store";
import type { DirectoryUser } from "@/lib/users/types";

export type Recipient = { userId: string; email: string };

/**
 * Design §10: drafts go to Reviewers (to the Admins when there are no Reviewers); everything else to the Admins.
 * People without a role never get email; people who turned it off are left out. Each address gets one email.
 */
export function recipientsFor(audience: Audience, users: DirectoryUser[], emailOff: Set<string>): Recipient[] {
  const withRole = (role: "admin" | "reviewer") => users.filter((user) => user.role === role && user.email.trim() !== "");
  const reviewers = withRole("reviewer");
  const people = audience === "reviewers" && reviewers.length > 0 ? reviewers : withRole("admin");
  const seen = new Set<string>();
  return people
    .filter((user) => !emailOff.has(user.id))
    .flatMap((user) => {
      const email = user.email.trim().toLowerCase();
      if (seen.has(email)) return [];
      seen.add(email);
      return [{ userId: user.id, email }];
    });
}
