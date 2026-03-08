import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { gameApi } from "../api/gameApi";
import { GameRole } from "../types/user";
import { type GameDetails, type GameRoomMember } from "../types/game";
import { roomApi } from "../api/roomApi";
import { authApi } from "../api/authApi";
import { createWebSocket } from "../api/wsClient";
import { WebSocketMessageType } from "../types/room";
import { ApiError } from "../api/apiClient";
import { LogoNavbar } from "../components/LogoNavbar";

const Result = () => {
	const { id } = useParams();
	const navigate = useNavigate();

	const [players, setPlayers] = useState<{ name: string; score: number }[]>(
		[],
	);
	const [currentUserId, setCurrentUserId] = useState<number | null>(null);
	const [newRoomId, setNewRoomId] = useState<number | null>(null);
	const [rematchToken, setRematchToken] = useState<string | null>(null);

	const socketRef = useRef<WebSocket | null>(null);

	useEffect(() => {
		const fetchUser = async () => {
			try {
				const user = await authApi.me();
				setCurrentUserId(user.id);
			} catch (error) {
				console.error("Failed to get user:", error);
				navigate("/login");
			}
		};

		fetchUser();
	}, [navigate]);

	useEffect(() => {
		if (!id || !currentUserId) return;

		const ws = createWebSocket();
		socketRef.current = ws;

		ws.onopen = () => {
			ws.send(
				JSON.stringify({
					type: WebSocketMessageType.JOIN,
					userId: currentUserId,
					roomId: id,
				}),
			);
		};

		ws.onmessage = event => {
			try {
				const data = JSON.parse(event.data);
				if (data.type === WebSocketMessageType.REMATCH_CREATED) {
					setNewRoomId(data.newRoomId);
					setRematchToken(data.token);
				}
				if (
					data.type === WebSocketMessageType.ERROR &&
					data.message === "Room has finished"
				) {
					navigate("/");
				}
			} catch (error) {
				console.log("Failed to parse message:", error);
			}
		};

		return () => {
			ws.close();
			socketRef.current = null;
		};
	}, [id, currentUserId, navigate]);

	useEffect(() => {
		const fetchResult = async () => {
			if (!id) return;

			try {
				// APIからデータ取得
				const roomData: GameDetails = await gameApi.getGameRoomDetails(
					Number(id),
				);

				// PLAYERだけ絞り込み
				const playerData = roomData.members
					.filter(m => m.role === GameRole.PLAYER)
					.map((m: GameRoomMember) => ({
						name: m.user.name,
						score: m.score,
					}))
					// スコア降順ソート
					.sort((a, b) => b.score - a.score);

				// setPlayersに保存
				setPlayers(playerData);
			} catch (error) {
				if (
					error instanceof ApiError &&
					(error.status === 403 || error.status === 404)
				) {
					navigate("/");
					return;
				}
				console.error("Failed to fetch result:", error);
			}
		};

		fetchResult();
	}, [id, navigate]);

	return (
		<div
			className="min-h-screen flex flex-col"
			style={{ backgroundColor: "#87ceeb" }}
		>
			<LogoNavbar />

			<div className="flex-1 flex flex-col items-center p-6">
				<div className="w-full max-w-3xl flex flex-col gap-6">
					{/* 見出し */}
					<h1
						className="text-3xl font-black text-center"
						style={{ color: "#6d4c41" }}
					>
						🏆 結果発表
					</h1>

					{/* プレイヤーランキング */}
					<div
						className="rounded-lg p-6 flex flex-col gap-3"
						style={{ backgroundColor: "#fffde7" }}
					>
						<p
							className="text-sm font-bold"
							style={{ color: "#5bad55" }}
						>
							ランキング
						</p>
						<div className="flex flex-col gap-2">
							{players.map((player, index) => (
								<div
									key={player.name}
									className="flex items-center justify-between px-3 py-3 rounded-md"
									style={{ backgroundColor: "#f4d59c" }}
								>
									<div className="flex items-center gap-3">
										<span
											className="text-lg font-bold w-10"
											style={{ color: "#6d4c41" }}
										>
											{index + 1}位
										</span>
										<span
											className="text-base font-medium"
											style={{ color: "#6d4c41" }}
										>
											{player.name}
										</span>
									</div>
									<span
										className="font-bold tabular-nums"
										style={{ color: "#6d4c41" }}
									>
										{player.score}pt
									</span>
								</div>
							))}
						</div>
					</div>

					{/* ボタン */}
					<div className="flex gap-4">
						<button
							className="flex-1 py-3 rounded-xl font-bold text-white cursor-pointer"
							style={{ backgroundColor: "#5bad55" }}
							onMouseEnter={e =>
								(e.currentTarget.style.backgroundColor =
									"#4e9b49")
							}
							onMouseLeave={e =>
								(e.currentTarget.style.backgroundColor =
									"#5bad55")
							}
							onClick={async () => {
								socketRef.current?.close();
								await roomApi.leaveResult(Number(id));
								navigate("/");
							}}
						>
							ホームに戻る
						</button>
						<button
							className="flex-1 py-3 rounded-xl font-bold cursor-pointer"
							style={{
								backgroundColor: "#ffbf47",
								color: "#6d4c41",
							}}
							onMouseEnter={e =>
								(e.currentTarget.style.backgroundColor =
									"#ffa726")
							}
							onMouseLeave={e =>
								(e.currentTarget.style.backgroundColor =
									"#ffbf47")
							}
							onClick={async () => {
								if (!currentUserId) return;
								if (newRoomId && rematchToken) {
									socketRef.current?.close();
									await roomApi.joinRoomByToken(rematchToken);
									await roomApi.leaveResult(Number(id));
									navigate(`/waiting/${newRoomId}`);
								} else {
									const newRoom =
										await roomApi.createRoom(currentUserId);
									socketRef.current?.send(
										JSON.stringify({
											type: WebSocketMessageType.REMATCH_CREATED,
											newRoomId: newRoom.id,
											token: newRoom.invitation_token,
										}),
									);
									socketRef.current?.close();
									await roomApi.leaveResult(Number(id));
									navigate(`/waiting/${newRoom.id}`);
								}
							}}
						>
							{newRoomId ? "再戦ルームに参加" : "もう一度遊ぶ"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default Result;
