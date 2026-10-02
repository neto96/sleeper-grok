import { i as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { r as require_jsx_runtime, t as useMutation } from "../_libs/react+tanstack__react-query.mjs";
import { i as MY_ROSTER_STORAGE_KEY, n as FANTASY_POSITIONS, o as SLEEPER_AVATAR, r as LEAGUE_ID_STORAGE_KEY, t as DEFAULT_LEAGUE_ID } from "./constants-DPyzQQN_.mjs";
import { a as Download, c as Check, i as FileJson, n as RefreshCw, o as Copy, r as LoaderCircle, s as ChevronDown } from "../_libs/lucide-react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { n as Route, r as fetchLeagueRosters } from "./router-C2EXFW6S.mjs";
import { a as initials, d as snapshotJson, i as formatRecord, r as formatPoints, t as applyMyRoster } from "./format-E4LyuNse.mjs";
import { n as clsx, t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { t as Slot } from "../_libs/radix-ui__react-slot.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-CKGz9d1a.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function ActivityPanel({ snapshot }) {
	const weeks = [...new Set(snapshot.matchups.map((game) => game.week))].sort((a, b) => b - a);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-6 grid gap-4 lg:grid-cols-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "rounded-xl bg-card p-4 shadow-border",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-xl font-semibold tracking-tight",
					children: "Matchups"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm text-muted-foreground",
					children: "Current week and the two before it."
				}),
				weeks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-4 text-sm text-muted-foreground",
					children: "No matchups returned."
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-4 space-y-5",
					children: weeks.map((week) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
						className: "text-xs font-medium uppercase tracking-wide text-muted-foreground",
						children: ["Week ", week]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "mt-2 space-y-2",
						children: snapshot.matchups.filter((game) => game.week === week).map((game) => {
							const [a, b] = game.teams;
							if (!a || !b) return null;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "text-sm",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: a.rosterId === snapshot.myRosterId ? "text-accent" : "",
										children: a.teamName
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "tabular-nums text-muted-foreground",
										children: [" ", formatPoints(a.points)]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-muted-foreground",
										children: " vs "
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: b.rosterId === snapshot.myRosterId ? "text-accent" : "",
										children: b.teamName
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "tabular-nums text-muted-foreground",
										children: [" ", formatPoints(b.points)]
									})
								]
							}, game.matchupId);
						})
					})] }, week))
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "rounded-xl bg-card p-4 shadow-border",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-xl font-semibold tracking-tight",
					children: "Recent transactions"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm text-muted-foreground",
					children: "Adds, drops, and waivers from the last three weeks."
				}),
				snapshot.transactions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-4 text-sm text-muted-foreground",
					children: "No transactions returned."
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-4 space-y-3",
					children: snapshot.transactions.slice(0, 40).map((tx, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "text-sm",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-muted-foreground",
								children: [
									"Week ",
									tx.week,
									" · ",
									tx.type.replaceAll("_", " "),
									tx.status && tx.status !== "complete" ? ` · ${tx.status}` : ""
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-0.5 font-medium",
								children: tx.teamNames.join(" / ") || "Unknown team"
							}),
							tx.adds.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-0.5 text-foreground",
								children: ["Add ", tx.adds.map((player) => player.name).join(", ")]
							}) : null,
							tx.drops.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-muted-foreground",
								children: ["Drop ", tx.drops.map((player) => player.name).join(", ")]
							}) : null
						]
					}, `${tx.created}-${tx.type}-${index}`))
				})
			]
		})]
	});
}
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
var badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tracking-wide", {
	variants: { variant: {
		default: "bg-muted text-muted-foreground",
		accent: "bg-accent/15 text-accent",
		solid: "bg-primary text-primary-foreground",
		injury: "bg-destructive/15 text-destructive"
	} },
	defaultVariants: { variant: "default" }
});
function Badge({ className, variant, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn(badgeVariants({ variant }), className),
		...props
	});
}
function PlayerRow({ player, dim }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
		className: cn("grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-baseline gap-2 py-1.5 text-sm", dim && "text-muted-foreground"),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "font-medium tabular-nums text-muted-foreground",
				children: player.slot
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "min-w-0 truncate text-foreground",
				children: [player.name, player.injuryStatus ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
					variant: "injury",
					className: "ml-2 align-middle",
					children: player.injuryStatus
				}) : null]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "tabular-nums text-muted-foreground",
				children: [player.position, player.nflTeam ? ` · ${player.nflTeam}` : " · FA"]
			})
		]
	});
}
function ExtraList({ label, players }) {
	if (players.length === 0) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-xs font-medium uppercase tracking-wide text-muted-foreground",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "mt-1 divide-y divide-border/80",
			children: players.map((player) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlayerRow, {
				player,
				dim: true
			}, player.playerId))
		})]
	});
}
function RosterCard({ team, rank, mine, onSetMine }) {
	const [open, setOpen] = (0, import_react.useState)(Boolean(mine));
	const avatar = team.avatar ? `${SLEEPER_AVATAR}/${team.avatar}` : null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: cn("flex min-w-0 flex-col overflow-hidden rounded-xl bg-card p-4 shadow-border", mine && "shadow-[0_0_0_1px_var(--color-accent)]"),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex items-start gap-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted",
						children: avatar ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src: avatar,
							alt: "",
							className: "size-full object-cover outline outline-1 -outline-offset-1 outline-foreground/10"
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "flex size-full items-center justify-center font-display text-lg tracking-wide text-muted-foreground",
							children: initials(team.teamName)
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-center gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "tabular-nums text-xs text-muted-foreground",
									children: rank
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "truncate font-display text-xl font-semibold leading-tight tracking-tight text-balance",
									children: team.teamName
								}),
								mine ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
									variant: "accent",
									children: "Your team"
								}) : null
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-0.5 truncate text-sm text-muted-foreground",
							children: [
								team.ownerName,
								team.isCommissioner ? " · commissioner" : "",
								` · waiver ${team.waiverPosition}`
							]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "text-right",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-display text-lg tabular-nums leading-none",
							children: formatRecord(team)
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 text-xs tabular-nums text-muted-foreground",
							children: [formatPoints(team.pointsFor), " PF"]
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-4 divide-y divide-border/80",
				children: team.starters.map((player) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlayerRow, { player }, `${player.slot}-${player.playerId}`))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "mt-3 flex h-11 items-center justify-between rounded-md bg-muted px-3 text-sm text-muted-foreground transition-[color,background-color] duration-150 hover:text-foreground",
				"aria-expanded": open,
				onClick: () => setOpen((value) => !value),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Bench · ", team.bench.length] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: cn("size-4 transition-transform duration-150", open && "rotate-180") })]
			}),
			open ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-1 divide-y divide-border/80 px-1",
				children: team.bench.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					className: "py-2 text-sm text-muted-foreground",
					children: "No bench players"
				}) : team.bench.map((player) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlayerRow, {
					player,
					dim: true
				}, player.playerId))
			}) : null,
			open ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExtraList, {
				label: "IR / Reserve",
				players: team.reserve
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExtraList, {
				label: "Taxi",
				players: team.taxi
			})] }) : null,
			!mine && onSetMine ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: "mt-3 h-11 rounded-md text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
				onClick: onSetMine,
				children: "Set as my team"
			}) : null
		]
	});
}
var buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,box-shadow,transform,opacity] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-40 enabled:active:scale-96 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0", {
	variants: {
		variant: {
			default: "bg-primary text-primary-foreground hover:bg-primary/90",
			secondary: "bg-muted text-foreground shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-foreground)_10%,transparent)] hover:bg-muted/80",
			outline: "bg-transparent text-foreground shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-foreground)_14%,transparent)] hover:bg-muted",
			ghost: "text-muted-foreground hover:bg-muted hover:text-foreground"
		},
		size: {
			default: "h-11 px-4",
			sm: "h-9 px-3 text-xs",
			lg: "h-12 px-5",
			icon: "size-11"
		}
	},
	defaultVariants: {
		variant: "default",
		size: "default"
	}
});
function Button({ className, variant, size, asChild = false, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(asChild ? Slot : "button", {
		className: cn(buttonVariants({
			variant,
			size
		}), className),
		...props
	});
}
function Input({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
		className: cn("h-11 w-full rounded-md bg-muted px-3 text-sm text-foreground shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-foreground)_12%,transparent)] placeholder:text-muted-foreground/70 outline-none transition-[box-shadow] duration-150 focus-visible:shadow-[0_0_0_2px_var(--color-ring)]", className),
		...props
	});
}
function Skeleton({ className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cn("animate-pulse rounded-md bg-muted", className) });
}
function WaiverPanel({ snapshot }) {
	const [position, setPosition] = (0, import_react.useState)("RB");
	const players = snapshot.waiverByPosition[position] ?? [];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-6 grid gap-4 lg:grid-cols-[minmax(0,16rem)_1fr]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "rounded-xl bg-card p-4 shadow-border",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-xl font-semibold tracking-tight",
					children: "Waiver order"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-1 text-sm text-muted-foreground",
					children: [snapshot.waiverSystem, ". FAAB is ignored."]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
					className: "mt-4 space-y-2",
					children: snapshot.waiverOrder.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-baseline justify-between gap-3 text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "min-w-0 truncate",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "mr-2 tabular-nums text-muted-foreground",
								children: [row.waiverPosition, "."]
							}), row.teamName]
						}), row.rosterId === snapshot.myRosterId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
							variant: "accent",
							children: "You"
						}) : null]
					}, row.rosterId))
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "rounded-xl bg-card p-4 shadow-border",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-xl font-semibold tracking-tight",
					children: "Free agents"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm text-muted-foreground",
					children: "Unrostered players, ranked by Sleeper search rank. Top 30 per position."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-4 flex flex-wrap gap-1 rounded-lg bg-muted p-1",
					children: FANTASY_POSITIONS.map((pos) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => setPosition(pos),
						className: cn("h-10 min-w-11 flex-1 rounded-md px-3 text-sm font-medium transition-[background-color,color] duration-150", position === pos ? "bg-card text-foreground shadow-border" : "text-muted-foreground hover:text-foreground"),
						children: pos
					}, pos))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-4 divide-y divide-border/80",
					children: players.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
						className: "py-3 text-sm text-muted-foreground",
						children: "None found."
					}) : players.map((player) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-baseline justify-between gap-3 py-2 text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "min-w-0 truncate",
							children: [player.name, player.injuryStatus ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
								variant: "injury",
								className: "ml-2 align-middle",
								children: player.injuryStatus
							}) : null]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "shrink-0 tabular-nums text-muted-foreground",
							children: player.nflTeam ?? "FA"
						})]
					}, player.playerId))
				})
			]
		})]
	});
}
async function copyText(text) {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		try {
			const area = document.createElement("textarea");
			area.value = text;
			area.setAttribute("readonly", "");
			area.style.position = "fixed";
			area.style.left = "-9999px";
			document.body.appendChild(area);
			area.select();
			const ok = document.execCommand("copy");
			area.remove();
			return ok;
		} catch {
			return false;
		}
	}
}
function downloadFile(filename, contents, mime) {
	const blob = new Blob([contents], { type: mime });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
function downloadMarkdown(filename, contents) {
	downloadFile(filename, contents, "text/markdown;charset=utf-8");
}
function downloadJson(filename, data) {
	downloadFile(filename, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
}
var TABS = [
	["rosters", "Rosters"],
	["waivers", "Waivers"],
	["activity", "Activity"],
	["markdown", "Markdown"]
];
function readStoredLeagueId() {
	if (typeof window === "undefined") return DEFAULT_LEAGUE_ID;
	return window.localStorage.getItem("roster-brief:league-id") || "1389736505374691328";
}
function readStoredMyRoster() {
	if (typeof window === "undefined") return 3;
	const raw = window.localStorage.getItem(MY_ROSTER_STORAGE_KEY);
	const parsed = raw ? Number(raw) : 3;
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
}
function errorMessage(error) {
	if (error instanceof Error && error.message) return error.message;
	return "Could not reach Sleeper. Try again.";
}
function formatFetchedAt(iso) {
	try {
		return new Intl.DateTimeFormat(void 0, {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit"
		}).format(new Date(iso));
	} catch {
		return iso;
	}
}
function RosterApp({ initialSnapshot }) {
	const [leagueId, setLeagueId] = (0, import_react.useState)(DEFAULT_LEAGUE_ID);
	const [myRosterId, setMyRosterId] = (0, import_react.useState)(initialSnapshot.myRosterId);
	const [tab, setTab] = (0, import_react.useState)("rosters");
	const [snapshot, setSnapshot] = (0, import_react.useState)(initialSnapshot);
	const [copied, setCopied] = (0, import_react.useState)(false);
	const fetchMutation = useMutation({
		mutationFn: (input) => fetchLeagueRosters({ data: input }),
		onSuccess: (data) => {
			setSnapshot(data);
			setMyRosterId(data.myRosterId);
			window.localStorage.setItem(LEAGUE_ID_STORAGE_KEY, data.leagueId);
			window.localStorage.setItem(MY_ROSTER_STORAGE_KEY, String(data.myRosterId));
		},
		onError: (error) => {
			toast.error(errorMessage(error));
		}
	});
	(0, import_react.useEffect)(() => {
		const storedLeague = readStoredLeagueId();
		const storedMine = readStoredMyRoster();
		setLeagueId(storedLeague);
		setMyRosterId(storedMine);
		if (storedLeague !== initialSnapshot.leagueId) fetchMutation.mutate({
			leagueId: storedLeague,
			myRosterId: storedMine
		});
		else if (storedMine !== initialSnapshot.myRosterId) setSnapshot((current) => current ? applyMyRoster(current, storedMine) : current);
	}, []);
	const loading = fetchMutation.isPending && !snapshot;
	const refreshing = fetchMutation.isPending && Boolean(snapshot);
	const myTeam = snapshot?.teams.find((team) => team.rosterId === myRosterId);
	const otherTeams = snapshot?.teams.filter((team) => team.rosterId !== myRosterId) ?? [];
	function setMine(rosterId) {
		setMyRosterId(rosterId);
		window.localStorage.setItem(MY_ROSTER_STORAGE_KEY, String(rosterId));
		setSnapshot((current) => current ? applyMyRoster(current, rosterId) : current);
	}
	async function handleCopy() {
		if (!snapshot) return;
		if (await copyText(snapshot.markdown)) {
			setCopied(true);
			toast.success("Markdown copied");
			window.setTimeout(() => setCopied(false), 1600);
		} else {
			setTab("markdown");
			toast.error("Copy blocked — open the Markdown tab and copy it there.");
		}
	}
	function handleDownload() {
		if (!snapshot) return;
		downloadMarkdown(snapshot.filename, snapshot.markdown);
		toast.success("Markdown file saved");
	}
	function handleJson() {
		if (!snapshot) return;
		downloadJson(snapshot.jsonFilename, snapshotJson(snapshot));
		toast.success("JSON snapshot saved");
	}
	function handleFetch(event) {
		event?.preventDefault();
		fetchMutation.mutate({
			leagueId: leagueId.trim(),
			myRosterId
		});
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-svh bg-background text-foreground",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-1 bg-accent" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto min-w-0 max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pb-12",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "max-w-3xl",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs font-medium uppercase tracking-[0.18em] text-accent",
							children: "Sleeper · Snapshot v2"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "mt-2 font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl",
							children: snapshot?.leagueName ?? "Nuevo León Football League"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 max-w-xl text-pretty text-muted-foreground",
							children: "Live rosters, waiver order, free agents, matchups, and recent moves — exported as Markdown you can attach to an LLM."
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit: handleFetch,
					className: "mt-8 flex min-w-0 flex-col gap-3 rounded-xl bg-card p-4 shadow-border sm:flex-row sm:items-end",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "min-w-0 flex-1 text-xs font-medium text-muted-foreground",
							children: ["League ID", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								value: leagueId,
								onChange: (event) => setLeagueId(event.target.value),
								inputMode: "numeric",
								autoComplete: "off",
								spellCheck: false,
								className: "mt-1.5 font-mono",
								"aria-label": "Sleeper league ID"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "min-w-0 flex-1 text-xs font-medium text-muted-foreground",
							children: ["My team", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
								value: myRosterId,
								onChange: (event) => setMine(Number(event.target.value)),
								className: "mt-1.5 h-11 w-full rounded-md bg-muted px-3 text-sm text-foreground shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-foreground)_12%,transparent)] outline-none transition-[box-shadow] duration-150 focus-visible:shadow-[0_0_0_2px_var(--color-ring)]",
								"aria-label": "My team",
								children: (snapshot?.teams ?? []).map((team) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: team.rosterId,
									children: team.teamName
								}, team.rosterId))
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							type: "submit",
							disabled: fetchMutation.isPending,
							className: "sm:w-44",
							children: [fetchMutation.isPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, {}), snapshot ? "Refresh" : "Fetch"]
						})
					]
				}),
				snapshot ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-6 flex flex-wrap items-center gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
							variant: "accent",
							children: snapshot.scoring
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { children: snapshot.waiverSystem }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Badge, { children: ["Season ", snapshot.season] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Badge, { children: ["NFL week ", snapshot.week] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Badge, { children: [snapshot.teams.length, " teams"] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-xs text-muted-foreground",
							children: [
								"Updated ",
								formatFetchedAt(snapshot.fetchedAt),
								refreshing ? " · refreshing" : ""
							]
						})
					]
				}) : null,
				snapshot ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "sticky top-0 z-20 -mx-4 mt-6 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-xl sm:border",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid min-w-0 grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-4",
							children: TABS.map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => setTab(id),
								className: cn("h-10 min-w-0 rounded-md px-2 text-sm font-medium transition-[background-color,color] duration-150 sm:px-4", tab === id ? "bg-card text-foreground shadow-border" : "text-muted-foreground hover:text-foreground"),
								children: label
							}, id))
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid min-w-0 grid-cols-2 gap-2 sm:flex",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									type: "button",
									variant: "secondary",
									onClick: handleCopy,
									disabled: !snapshot,
									children: [copied ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, {}), copied ? "Copied" : "Copy .md"]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									type: "button",
									onClick: handleDownload,
									disabled: !snapshot,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, {}), "Save .md"]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									type: "button",
									variant: "outline",
									onClick: handleJson,
									disabled: !snapshot,
									className: "col-span-2 sm:col-span-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileJson, {}), "Save JSON"]
								})
							]
						})]
					})
				}) : null,
				loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-8",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mb-4 text-sm text-muted-foreground",
						children: "Fetching rosters, waivers, and recent activity from Sleeper…"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoadingGrid, {})]
				}) : null,
				fetchMutation.isError && !snapshot ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-10 max-w-md text-sm text-destructive",
					children: errorMessage(fetchMutation.error)
				}) : null,
				snapshot && tab === "rosters" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-6 min-w-0 space-y-4",
					children: [myTeam ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RosterCard, {
						team: myTeam,
						rank: (snapshot.teams.findIndex((team) => team.rosterId === myTeam.rosterId) ?? 0) + 1,
						mine: true
					}, myTeam.rosterId) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid min-w-0 gap-4 md:grid-cols-2",
						children: otherTeams.map((team) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RosterCard, {
							team,
							rank: (snapshot.teams.findIndex((row) => row.rosterId === team.rosterId) ?? 0) + 1,
							onSetMine: () => setMine(team.rosterId)
						}, team.rosterId))
					})]
				}) : null,
				snapshot && tab === "waivers" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WaiverPanel, { snapshot }) : null,
				snapshot && tab === "activity" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActivityPanel, { snapshot }) : null,
				snapshot && tab === "markdown" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "mt-6",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-3 flex items-baseline justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "font-display text-2xl font-semibold tracking-tight",
								children: "Attach this file"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "truncate font-mono text-xs text-muted-foreground",
								children: snapshot.filename
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mb-4 max-w-2xl text-sm text-pretty text-muted-foreground",
							children: "Your team, standings, waiver order, free agents, matchups, and transactions — ready for a chat. Download the .md or copy the text below."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
							className: "max-h-[70vh] overflow-auto rounded-xl bg-card p-4 font-mono text-xs leading-relaxed text-foreground shadow-border sm:text-sm",
							children: snapshot.markdown
						})
					]
				}) : null
			]
		})]
	});
}
function LoadingGrid() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid gap-4 md:grid-cols-2",
		children: Array.from({ length: 6 }).map((_, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "rounded-xl bg-card p-4 shadow-border",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex gap-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "size-12 rounded-lg" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex-1 space-y-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-5 w-2/3" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-3 w-1/3" })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-5 w-10" })
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 space-y-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-4 w-full" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-4 w-5/6" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-4 w-full" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-4 w-2/3" })
				]
			})]
		}, index))
	});
}
function Home() {
	const initialSnapshot = Route.useLoaderData();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RosterApp, { initialSnapshot });
}
//#endregion
export { Home as component };
