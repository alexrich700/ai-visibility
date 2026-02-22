import { db } from "../server/db";
import { checkResults, monitoringClients } from "../shared/schema";
import { eq, isNull, or, and } from "drizzle-orm";
import { detectMentionRank } from "../server/services/scan-analytics";

async function backfillRanks() {
  const clients = await db
    .select({ id: monitoringClients.id, businessName: monitoringClients.businessName })
    .from(monitoringClients);

  let totalUpdated = 0;
  for (const client of clients) {
    const results = await db
      .select({
        id: checkResults.id,
        chatgptResponse: checkResults.chatgptResponse,
        googleAIResponse: checkResults.googleAIResponse,
        chatgptFound: checkResults.chatgptFound,
        googleAIFound: checkResults.googleAIFound,
        chatgptRank: checkResults.chatgptRank,
        googleAIRank: checkResults.googleAIRank,
      })
      .from(checkResults)
      .where(
        and(
          eq(checkResults.clientId, client.id),
          or(isNull(checkResults.chatgptRank), isNull(checkResults.googleAIRank))
        )
      );

    let clientUpdated = 0;
    for (const result of results) {
      const newChatgptRank = result.chatgptFound
        ? detectMentionRank(result.chatgptResponse, client.businessName)
        : null;
      const newGoogleAIRank = result.googleAIFound
        ? detectMentionRank(result.googleAIResponse, client.businessName)
        : null;

      if (newChatgptRank !== result.chatgptRank || newGoogleAIRank !== result.googleAIRank) {
        await db
          .update(checkResults)
          .set({ chatgptRank: newChatgptRank, googleAIRank: newGoogleAIRank })
          .where(eq(checkResults.id, result.id));
        clientUpdated++;
      }
    }
    if (clientUpdated > 0) {
      console.log(`Client ${client.id} "${client.businessName}": updated ${clientUpdated}/${results.length}`);
      totalUpdated += clientUpdated;
    }
  }

  console.log(`Total updated: ${totalUpdated}`);
  process.exit(0);
}

backfillRanks().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
