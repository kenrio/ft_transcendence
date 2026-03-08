import { useState, useEffect, useRef } from "react";
import { createWebSocket } from "../api/wsClient";
import { useNavigate, useParams } from "react-router-dom";

import { authApi } from "../api/authApi";
import { gameApi } from "../api/gameApi";
import {
	type Player,
	WebSocketMessageType,
	ROUND_DURATION,
	GameMode,
} from "../types/room";
import { type GameDetails, type GameRoomMember } from "../types/game";
import Timer from "../components/game/Timer";
import Canvas, { type DrawData } from "../components/game/Canvas";
import ScoreBoard from "../components/game/ScoreBoard";
import ChatMessages, { type Message } from "../components/game/ChatMessages";
import ChatInput from "../components/game/ChatInput";
import { GameRole } from "../types/user";
import { ApiError } from "../api/apiClient";
import { LogoNavbar } from "../components/LogoNavbar";

const Game = () => {
	const { id } = useParams<{ id?: string }>(); // URLパラメータ取得
	const navigate = useNavigate();

	const [currentUserId, setCurrentUserId] = useState<number | null>(null);
	const currentUserIdRef = useRef<number | null>(null);
	const [currentUserName, setCurrentUserName] = useState<string | null>(null);
	const [players, setPlayers] = useState<Player[]>([]);
	const [isDrawer, setIsDrawer] = useState(false);
	const [isSpectator, setIsSpectator] = useState(false);
	const [currentWord, setCurrentWord] = useState<string | null>(null);
	const [gameMode, setGameMode] = useState<
		(typeof GameMode)[keyof typeof GameMode] | null
	>(null);

	const [socket, setSocket] = useState<WebSocket | null>(null);
	const [messages, setMessages] = useState<Message[]>([]); // メッセージデータ
	const [drawData, setDrawData] = useState<DrawData | null>(null); // 描画データ
	const [clearTrigger, setClearTrigger] = useState(0); // キャンバスクリア処理
	const [timeLeft, setTimeLeft] = useState(ROUND_DURATION); // setTimeLeftでtimeLeftを更新する

	const socketRef = useRef<WebSocket | null>(null);
	const reconnectAttemptRef = useRef(0);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const pendingScoresRef = useRef<Record<number, number> | null>(null);

	useEffect(() => {
		const fetchUser = async () => {
			try {
				const user = await authApi.me();
				setCurrentUserId(user.id);
				currentUserIdRef.current = user.id;
				setCurrentUserName(user.name);
			} catch (error) {
				console.error("❌ Failed to get user:", error);
				navigate("/login");
			}
		};

		fetchUser();
	}, [navigate]);

	useEffect(() => {
		if (!currentUserId || !id) return;

		let cancelConnect: (() => void) | null = null;

		const connect = () => {
			let cancelled = false;

			const ws = createWebSocket();

			ws.onopen = () => {
				console.log("✅ WebSocket connected");

				reconnectAttemptRef.current = 0;
				ws.send(
					JSON.stringify({
						type: WebSocketMessageType.JOIN,
						userId: currentUserId,
						roomId: id,
					}),
				);

				checkAndStartRound(ws);
			};

			ws.onmessage = event => {
				try {
					const data = JSON.parse(event.data);

					if (data.type === WebSocketMessageType.CHAT) {
						const newMessage: Message = {
							id: data.id,
							sender: data.sender,
							text: data.text,
							timestamp: new Date(data.timestamp),
						};
						setMessages(prev => [...prev, newMessage]);
					} else if (data.type === WebSocketMessageType.DRAW) {
						setDrawData({
							x: data.x,
							y: data.y,
							color: data.color,
							lineWidth: data.lineWidth,
							isStart: data.isStart,
						});
					} else if (data.type === WebSocketMessageType.DRAW_END) {
						setDrawData(null);
					} else if (data.type === WebSocketMessageType.CLEAR) {
						setClearTrigger(prev => prev + 1);
					} else if (data.type === WebSocketMessageType.TIMER) {
						setTimeLeft(data.timeLeft);
					} else if (
						data.type === WebSocketMessageType.ROUND_STARTED
					) {
						updateRoundState(data.word, data.drawerId);
					} else if (data.type === WebSocketMessageType.ROUND_END) {
						if (data.isGameOver) {
							// Result画面へ遷移
							navigate(`/result/${id}`);
							// alert("ゲーム終了！");
						} else {
							// Prepare画面へ遷移
							navigate(`/prepare/${id}`);
						}
					} else if (
						data.type === WebSocketMessageType.CORRECT_ANSWER
					) {
						const systemMessage: Message = {
							id: crypto.randomUUID(),
							sender: "system",
							text: `🥳 ${data.sender}が正解しました！`,
							timestamp: new Date(),
						};
						setMessages(prev => [...prev, systemMessage]);

						if (data.scores) {
							setPlayers(prev =>
								prev.map(p => ({
									...p,
									score: data.scores[p.id] ?? p.score,
								})),
							);
						}
					} else if (data.type === WebSocketMessageType.NEXT_WORD) {
						setCurrentWord(data.word);
					} else if (data.type === WebSocketMessageType.SKIPPED) {
						if (data.scores) {
							setPlayers(prev =>
								prev.map(p => ({
									...p,
									score: data.scores[p.id] ?? p.score,
								})),
							);
						}

						const systemMessage: Message = {
							id: crypto.randomUUID(),
							sender: "system",
							text: "⏩ お題がスキップされました",
							timestamp: new Date(),
						};
						setMessages(prev => [...prev, systemMessage]);

						setClearTrigger(prev => prev + 1);
					} else if (
						data.type === WebSocketMessageType.CURRENT_SCORES
					) {
						pendingScoresRef.current = data.scores;
						console.log("⚠️ Received CURRENT_SCORES:", data.scores);
						setPlayers(prev => {
							console.log("⚠️ Current players:", prev);
							if (prev.length === 0) return prev;
							return prev.map(p => ({
								...p,
								score: data.scores[p.id] ?? p.score,
							}));
						});
					} else if (
						data.type === WebSocketMessageType.ERROR &&
						data.message === "Room has finished"
					) {
						navigate("/");
					}
				} catch (error) {
					console.error("❌ Failed to parse message:", error);
				}
			};

			ws.onerror = error => {
				console.error("❌ WebSocket error: ", error);
			};

			ws.onclose = () => {
				console.log("🔌 WebSocket disconnected");
				if (cancelled) return;

				const attempt = reconnectAttemptRef.current;
				reconnectAttemptRef.current += 1;
				const delay = Math.min(1000 * Math.pow(2, attempt), 10000);

				reconnectTimeoutRef.current = setTimeout(() => {
					reconnectTimeoutRef.current = null;
					cancelConnect = connect();
				}, delay);
			};

			// eslint-disable-next-line react-hooks/set-state-in-effect
			setSocket(ws);
			socketRef.current = ws;

			return () => {
				cancelled = true;
			};
		};

		cancelConnect = connect();

		return () => {
			cancelConnect?.();
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
				reconnectTimeoutRef.current = null;
			}
			if (socketRef.current) {
				socketRef.current.close();
				socketRef.current = null;
				setSocket(null);
			}
		};
	}, [currentUserId, id, navigate]);

	const updateRoundState = (word: string, drawerId: number) => {
		setCurrentWord(word);
		setIsDrawer(drawerId === currentUserIdRef.current);
		setPlayers(prev =>
			prev.map(p => ({
				...p,
				isDrawing: p.id === drawerId,
			})),
		);
	};

	const checkAndStartRound = async (socket: WebSocket) => {
		if (!id) return;

		try {
			const roomData: GameDetails = await gameApi.getGameRoomDetails(
				Number(id),
			);
			if (!roomData || !roomData) return;

			setGameMode(roomData.game_mode);

			const playerData: Player[] = roomData.members
				.filter(m => m.role === GameRole.PLAYER)
				.map((m: GameRoomMember) => ({
					id: m.user_id,
					name: m.user.name,
					score: m.score,
					isDrawing: false,
				}));

			setPlayers(playerData);

			if (pendingScoresRef.current) {
				const scores = pendingScoresRef.current;
				setPlayers(prev =>
					prev.map(p => ({
						...p,
						score: scores[p.id] ?? p.score,
					})),
				);
				pendingScoresRef.current = null;
			}

			const currentRound = roomData.rounds?.find(
				r => r.started_at !== null && r.ended_time === null,
			);

			if (currentRound) {
				setIsDrawer(
					currentRound.drawer_id === currentUserIdRef.current,
				);
				setPlayers(prev =>
					prev.map(p => ({
						...p,
						isDrawing: p.id === currentRound.drawer_id,
					})),
				);
			}
			const allReady = roomData.members
				.filter((m: GameRoomMember) => m.role === GameRole.PLAYER)
				.every((m: GameRoomMember) => m.is_ready);

			const currentMember = roomData.members.find(
				m => m.user_id === currentUserIdRef.current,
			);
			setIsSpectator(currentMember?.role === GameRole.SPECTATOR);

			if (allReady && socket.readyState === WebSocket.OPEN) {
				socket.send(
					JSON.stringify({
						type: WebSocketMessageType.ROUND_START,
					}),
				);
			}
		} catch (error) {
			if (
				error instanceof ApiError &&
				(error.status === 403 || error.status === 404)
			) {
				navigate("/");
				return;
			}
			console.error("❌ Failed to check room status: ", error);
		}
	};

	const handleSendMessage = (text: string) => {
		if (!socket || socket.readyState !== WebSocket.OPEN) {
			console.error("❌ WebSocket not connected");
			return;
		}

		if (!currentUserName) {
			console.error("❌ User name not found");
			return;
		}

		const message = {
			type: WebSocketMessageType.CHAT,
			id: crypto.randomUUID(),
			sender: currentUserName,
			text: text,
			timestamp: new Date().toISOString(),
		};

		socket.send(JSON.stringify(message));
	};

	return (
		<div className="min-h-screen flex flex-col">
			<LogoNavbar />

			<div className="w-full max-w-3xl md:max-w-7xl px-6 py-6 mx-auto">
				<div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
					{/* 左カラム: 残り時間, キャンバス */}
					<div className="space-y-4 order-1">
						<Timer totalTime={ROUND_DURATION} timeLeft={timeLeft} />
						<Canvas
							socket={socket}
							drawData={drawData}
							clearTrigger={clearTrigger}
							isDrawer={isDrawer}
							currentWord={currentWord}
							gameMode={gameMode}
						/>
					</div>

					{/* 右カラム: スコアボード, コメント*/}
					<div className="space-y-4 order-2">
						<ScoreBoard players={players} />

						<div
							className="rounded-lg p-4 flex flex-col gap-2"
							style={{ backgroundColor: "#fffde7" }}
						>
							<p
								className="text-sm font-bold"
								style={{ color: "#5bad55" }}
							>
								コメント
							</p>
							{currentUserName && (
								<ChatMessages
									messages={messages}
									currentUserName={currentUserName}
								/>
							)}
							<ChatInput
								onSendMessage={handleSendMessage}
								disabled={isSpectator}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default Game;
