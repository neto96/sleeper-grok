import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
import { i as string, n as number, r as object } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/fetch.functions-CfI3iz30.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var inputSchema = object({
	leagueId: string().trim().min(4, "Enter a Sleeper league ID.").regex(/^[0-9]+$/, "League ID should be numbers only."),
	myRosterId: number().int().positive().optional()
});
var fetchLeagueRosters_createServerFn_handler = createServerRpc({
	id: "2a7a4cbd77f64a30163487037060d9c2afec4cd8afc9c2f0b5bf16c402244afa",
	name: "fetchLeagueRosters",
	filename: "src/lib/sleeper/fetch.functions.ts"
}, (opts) => fetchLeagueRosters.__executeServer(opts));
var fetchLeagueRosters = createServerFn({ method: "POST" }).validator(inputSchema).handler(fetchLeagueRosters_createServerFn_handler, async ({ data }) => {
	const { loadLeagueSnapshot } = await import("./sleeper.server-mvwewmkQ.mjs");
	return loadLeagueSnapshot(data.leagueId, data.myRosterId ?? 3);
});
//#endregion
export { fetchLeagueRosters_createServerFn_handler };
