import { hasPlayerGymLink } from "@fitplay/db";
import { readAccountSession } from "@/lib/auth";
import { resultsAccountLinks, type ResultsAccount } from "@/lib/fitrunner-v2/results-account";

/**
 * Reads fitplay_session on the server and returns who may see Dashboard and History.
 * No cookie, a bad token, a suspended account, or a failed lookup returns null.
 * Role and gym seat come from the account record, not from a browser flag.
 */
export async function resultsAccountForViewer(): Promise<ResultsAccount | null> {
  try {
    const session = await readAccountSession();
    if (!session?.record?.id) return null;
    let gymLinked = false;
    try {
      gymLinked = await hasPlayerGymLink(session.record.id);
    } catch {
      gymLinked = false;
    }
    return resultsAccountLinks({
      signedIn: true,
      role: session.record.role,
      gymLinked,
    });
  } catch {
    return null;
  }
}
